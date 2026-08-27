// Demo AI — a deliberately flimsy rule-based opponent. Drives one full
// turn per call: loops `tryOneAction` until the player runs out of
// actions or the priority list dries up, then ends the turn. The engine
// already supplies headless defaults for sub-choices (encounter pick,
// reactive play, retreat hex), so the AI never has to touch ctx.interact.

import { performAction, recruitCapBonus } from "./actions.js";
import { endTurn } from "./turn.js";
import { activePlayerId } from "./targeting.js";
import { bfsDistances } from "./board.js";
import { unitReach } from "./movement.js";
import { LOCATIONS, CHIPS } from "./content.js";
import { CONFIG } from "./config.js";
import { buildableChips, slotCapacity, slotsUsed, stationedUnitWithBay, upgradeOption, effectiveBuildCost, chipsHeldBy, slotExpansionCost } from "./economy.js";
import { chipValue, upgradeValue } from "./chipValue.js";
import { isUnitVisibleTo } from "./visibility.js";
import { previewAttackerStrength, previewLocationContest } from "./contest.js";
import { assignTechNode } from "./stats.js";
import { hasTechNode, TECH_NODES, prereqMet } from "./tech.js";
import { postAt } from "./posts.js";
import { standingTier } from "./standing.js";
import { factionDef } from "./content.js";
import {
  factionIds, powerOf, arePacted, atWar, vassalLord, mayEngage, mayCourt,
  speakPosture, postureOf, postureStated, isCourting, eitherCourting, courtRounds,
  postureCitation, interestsOf, courtshipScore, swayIncome, swayOf, canSustainCourtship, courtingList,
  opsEnabled, exposableStrikes, powerLead,
  attackIsWorthIt, diplomaticPrice,
  getStanding, passesRepGates, formPact, vassalize, applyDeal, checkDominion,
  tableOffer, offersFor, warExhaustion,
  denounce, denounceWarrant, denounceCooldown, honorOf, grievanceWeight, wouldAccept,
  counterOffer, ultimatumsFor, answerUltimatum, aiComplies, unitsInTerritory, declareWar,
  performDiplomacy,
  aiAcceptsVassalage, truceBetween,
  occupationsBy, cedeBlocker, locationWorth,
  giftCost,
} from "./diplomacy.js";

const SAFETY_CAP = 16; // hard stop if priority loop ever spins

// Per-entity actions: the AI keeps acting while ANY of its assets (or a
// wildcard) can still pay for something. Interim until the AI overhaul
// turns this into per-asset policies.
function hasActionBudget(state, pid) {
  if (state.players[pid].actions.remaining > 0) return true;
  if (Object.values(state.units).some((u) => u.owner === pid && (u.actionsRemaining ?? 0) > 0)) return true;
  return Object.values(state.locations).some(
    (l) => l.controller === pid && (l.actionsRemaining ?? 0) > 0);
}

export function takeAITurn(state) {
  if (state.winnerId) return;
  const pid = activePlayerId(state);
  // §5 — SAY WHERE YOU STAND BEFORE YOU ACT ON IT. This hoist is the whole
  // telegraph argument; without it the argument is cosmetic.
  //
  // As the code stood, `takeAITurn` ran its action loop first, then
  // `manageEconomy`, then `manageDiplomacy` — and posture transitions computed
  // in `runDiplomacyRound` landed at ROUND END. So a faction attacked you and
  // only afterwards got to say anything about it. Every "wars come out of
  // nowhere" complaint in the playtest has that ordering underneath it.
  //
  // Speaking is cheap: it stamps `statedRound` and emits. What it buys is that
  // `postureStated` becomes true a round later, and the acts that matter are
  // gated on it (`statedBeforeActedRounds`).
  speakPosture(state, pid);
  // Spend any free Ability Point before acting, so the new node's effect is
  // live this turn.
  maybeAssignTech(state, pid);
  let guard = SAFETY_CAP;
  while (hasActionBudget(state, pid) && guard-- > 0 && !state.winnerId) {
    if (!tryOneAction(state, pid)) break;
  }
  // §20 — the AI runs its economy every turn regardless of the Action budget:
  // it sets each city's guns/butter slider and queues builds (units have
  // settled after the action loop, so unit-chip builds find their garrison).
  if (!state.winnerId) manageEconomy(state, pid);
  // §18.8 — the AI actively works the political layer (gifts, pacts,
  // vassalage). Without this the whole diplomacy layer is inert.
  if (!state.winnerId) manageDiplomacy(state, pid);
  if (!state.winnerId) endTurn(state);
}

// Exact win probability over both d6 rolls (defender wins ties, and skips
// its die entirely for a garrison-only Location defence — the §16 house
// rule `previewLocationContest` already flags via `defenderRollsDie`).
function winProbability(atkTotal, defTotal, defenderRollsDie = true) {
  let wins = 0, outcomes = 0;
  for (let a = 1; a <= 6; a++) {
    if (!defenderRollsDie) {
      outcomes++;
      if (atkTotal + a > defTotal) wins++;
      continue;
    }
    for (let d = 1; d <= 6; d++) {
      outcomes++;
      if (atkTotal + a > defTotal + d) wins++;
    }
  }
  return wins / outcomes;
}

// docs/ai-overhaul-plan.md item 4 — "contests are blind": don't pick a
// fight the dice say you'll probably lose. The bar drops as the faction's
// aggression dial rises (a warlord accepts worse odds than a cautious
// minor), floored at `contestWinProbMin` so even max aggression won't
// throw a unit away on a near-certain loss.
function acceptableOdds(state, pid, atkTotal, defTotal, defenderRollsDie) {
  const aggression = factionDef(pid)?.aggression ?? 0.5;
  const ai = CONFIG.ai;
  const threshold = Math.max(
    ai.contestWinProbMin,
    ai.contestWinProbBase - aggression * ai.contestWinProbAggressionScale,
  );
  return winProbability(atkTotal, defTotal, defenderRollsDie) >= threshold;
}

/**
 * How many units to commit, and which.
 *
 * Concentration is a presence bonus and Strength is a commitment cost, so the
 * marginal unit is not free but the ones held back are not wasted either — a
 * unit standing on the hex keeps giving +1 Concentration whether or not it
 * swings. That makes "how few can I win with" a real question rather than
 * "attack with everything".
 *
 * Worked, three Strength-4 units against a garrison of 10 (Concentration is
 * +2 throughout, because three bodies are on the hex either way):
 *
 *     commit 1 →  4 + 2 = 6,  needs a 5 or 6      33%
 *     commit 2 →  8 + 2 = 10, needs anything      100%
 *     commit 3 → 12 + 2 = 14, needs anything      100%  ← two actions wasted
 *
 * So it commits two and the third keeps its action. What that third unit then
 * does falls out of the ordinary turn loop rather than being decided here: it
 * comes round again, re-plans against the Location as it now stands, and
 * either attacks alone (if a 33% shot clears its faction's bar — a warlord's
 * does, a diplomat's does not) or gives up on this hex and moves somewhere it
 * matters more.
 *
 * The bar is `acceptableOdds`, the same one that decides whether to fight at
 * all. That is deliberate: it is already tuned and already scaled by the
 * faction's aggression, so a warlord commits fewer units to a given fight
 * than a cautious minor does, without a second set of numbers to keep in step
 * with the first.
 *
 * Returns `{ lead, support, chance }`, or null when even the whole stack
 * cannot clear the bar — the caller should not pick that fight.
 */
export function planContest(state, pid, hex, { target = null } = {}) {
  // Only units that can still act may be committed; each one spends its
  // action. Strongest first, so the minimum is reached with the fewest bodies.
  const available = ownUnits(state, pid)
    .filter((u) => u.node === hex && !isImmobilized(state, u) && (u.actionsRemaining ?? 0) >= 1)
    .sort((a, b) => b.strength - a.strength);
  if (!available.length) return null;

  // What the attack has to beat. A raid is resolved against the target's whole
  // side — runContest adds its stack's Strength and Concentration the same way
  // it adds ours — so pricing it at the target unit's bare Strength would walk
  // the AI straight into a relief column standing behind one token defender.
  const defence = target
    ? { value: previewAttackerStrength(state, hex, state.units[target]?.owner).total,
        defenderRollsDie: true }
    : previewLocationContest(state, hex, { attacker: pid });
  if (!defence) return null;

  for (let k = 1; k <= available.length; k++) {
    const committed = available.slice(0, k).map((u) => u.uid);
    const atk = previewAttackerStrength(state, hex, pid, { committed });
    if (!acceptableOdds(state, pid, atk.total, defence.value, defence.defenderRollsDie)) continue;
    // `atk.lead` is the strongest committed unit, and the one Concentration
    // was computed against — root the contest on it so the resolution counts
    // exactly what this plan priced.
    return {
      lead: atk.lead,
      support: committed.filter((uid) => uid !== atk.lead),
      chance: winProbability(atk.total, defence.value, defence.defenderRollsDie),
    };
  }
  return null;
}

// Casus belli — the blind combat loop only opens hostilities with a
// reason: an existing war, contempt (Wary-or-worse standing), or a
// warlike temperament. Pacted factions are never blind-attacked, and a
// pacifist no longer torpedoes its own courtships by wandering into a
// neutral neighbour's town and contesting it (the playtest log shows a
// 0.1-aggression diplomat faction declaring four wars this way).
function wouldFight(state, pid, ownerFid) {
  if (!ownerFid || ownerFid === pid) return true; // neutral garrisons are fair game
  if (arePacted(state, pid, ownerFid)) return false; // never blind-strike an ally
  if (atWar(state, pid, ownerFid)) return true;
  // A truce is a promise the AI keeps — this is what stopped the
  // peace-then-war-again churn every round (playtest 2026-08-15).
  if (truceBetween(state, pid, ownerFid)) return false;
  if (getStanding(state, pid, ownerFid) <= CONFIG.diplomacy.tiers.wary) return true;
  return (factionDef(pid)?.aggression ?? 0.5) >= CONFIG.diplomacy.ai.blindAttackAggressionMin;
}

// §8 — may this unit press the attack, and at what political price?
//
// The gate is deliberately NOT a veto. A veto with no alternative is what
// deadlocked the first draft: refuse the fight, the unit has nothing else to
// do, and the game runs out the clock (unresolved games went 2 -> 6 across the
// 15-seed suite). So there are three outcomes, not two:
//
//   worth the surprise      -> strike, and pay for it
//   worth it only DECLARED  -> declare first, then strike
//   worth neither           -> walk away
//
// The middle branch is the brief's actual point. Declaring does not save the
// Standing collapse — `declareWar` sets both sides hostile on either path —
// but it does save the 8 Honor and the grievance, against `declareUnjustified`
// of 2. That gap is the whole incentive to fight in the open.
function mayPressAttack(state, pid, hex, chance, victim = null) {
  const opts = victim ? { victim } : {};
  if (attackIsWorthIt(state, pid, hex, chance, opts)) return true;
  if (!attackIsWorthIt(state, pid, hex, chance, { ...opts, declared: true })) return false;
  const targets = victim
    ? [victim]
    : [state.locations?.[hex]?.controller].filter(Boolean);
  let declared = false;
  for (const t of targets) {
    if (!t || t === pid || atWar(state, pid, t)) continue;
    declareWar(state, pid, t, "declared");
    declared = true;
  }
  return declared;
}

// Returns true if the AI spent at least one Action (whether the action
// succeeded or not — failed actions don't decrement remaining, so the
// loop must give up if no priority matches a runnable action).
function tryOneAction(state, pid) {
  // 1. Contest where standing — but only when the odds are acceptable.
  for (const unit of ownUnits(state, pid)) {
    if (isImmobilized(state, unit)) continue;
    const loc = state.locations[unit.node];
    if (loc && !loc.sections.every((s) => s === pid)
      && wouldFight(state, pid, loc.controller)) {
      // Commit the fewest units that still clear this faction's odds bar,
      // and leave the rest their actions. The plan names the initiator, so
      // the loop's current `unit` may not be the one that swings — it is the
      // unit that brought us to this hex, not necessarily the strongest on it.
      //
      // The defender preview names the attacker so it applies the ally rule
      // the resolution will apply: the controller's allies defend with it,
      // minus anyone already fighting for us. An AI that estimated a bare
      // garrison and then walked into an allied stack would misjudge exactly
      // the fights this ruling creates.
      const plan = planContest(state, pid, unit.node);
      // §8 — and is it worth what it costs your name? The gate goes HERE, on
      // the contest decision, and deliberately not in `wouldFight`: that is
      // also the pathing predicate, so making it expensive would stop the AI
      // treating enemy Locations as goals at all and send its units off to
      // scout fog instead of pressuring anybody.
      if (plan && mayPressAttack(state, pid, unit.node, plan.chance)) {
        const r = performAction(state, "contest",
          { unit: plan.lead, coalition: plan.support });
        if (r.ok) return true;
      }
    }
    // §19.10 — only raid an enemy the AI can actually SEE. A concealed
    // enemy on this hex isn't targeted explicitly; if the AI contests the
    // Location instead it may blunder into them (a defender ambush) — fair
    // fog, no cheats.
    const enemyHere = Object.values(state.units).find(
      (u) => u.node === unit.node && u.owner !== pid && isUnitVisibleTo(state, pid, u),
    );
    if (enemyHere && (!loc || !loc.sections.includes("neutral"))
      && wouldFight(state, pid, enemyHere.owner)) {
      const plan = planContest(state, pid, unit.node, { target: enemyHere.uid });
      // §8 again, and this is the branch that mattered: a raid names its own
      // victim, who may not be the faction whose ground this is. Measured over
      // three games, 58 of 62 wars opened here — gating only the Location
      // contest above left the price rule reaching 9 attacks in total.
      if (plan && mayPressAttack(state, pid, unit.node, plan.chance, enemyHere.owner)) {
        const r = performAction(state, "contest", {
          unit: plan.lead, coalition: plan.support, target: enemyHere.uid,
        });
        if (r.ok) return true;
      }
    }
  }

  // 2. Move toward the nearest contestable Location
  for (const unit of ownUnits(state, pid)) {
    if (isImmobilized(state, unit)) continue;
    const target = pickMoveTarget(state, pid, unit);
    if (target) {
      const r = performAction(state, "move", { unit: unit.uid, to: target });
      if (r.ok) return true;
    }
  }

  // 3. Recruit — if controls a Training Grounds and below the cap
  if (tryRecruit(state, pid)) return true;

  // 4. Activate any controlled location with a free / cheap ability
  if (tryActivate(state, pid)) return true;

  // 5. §17.7 — deploy a Listening Post on a held frontier hex (low chance).
  if (tryBuildPost(state, pid)) return true;

  // 6. §17.5 Saboteurs — undermine a hostile rival's strongest Location.
  if (trySabotage(state, pid)) return true;

  return false;
}

// --- Tech Wheel allocation ---------------------------------------------
// Every node's mechanical effect is real — wired at its consumer site via
// hasTechNode(state, pid, "<node-id>") in contest.js/stats.js/board.js/
// turn.js/actions.js/economy.js/visibility.js/intel.js — TECH_NODES'
// `effect: {kind:"noop"}` on branch nodes is just unused leftover shape,
// not a gap (see docs/v0.3-roadmap.md). What WAS missing is a sensible
// allocation policy: this table scores which currently-assignable node is
// worth taking right now. It's small and hand-written rather than a
// generic effect→value table (docs/ai-overhaul-plan.md item 1, still open
// for chips/build-scoring) because the wheel is a fixed, engine-owned set
// of exactly 20 nodes that content authors never extend — enumerating
// them by id is the appropriately-sized solution here, not a smell.

// How many owned units are below Strength cap — feeds the Sustainment
// (heal) nodes.
function ownUnitsBelowCap(state, pid) {
  return ownUnits(state, pid).filter((u) => u.baseStrength < CONFIG.unit.baseStrengthCap).length;
}

// Fraction of the map this faction has explored — feeds the Vision nodes
// (an unexplored map makes more Vision/Detection worth more).
function exploredFraction(state, pid) {
  const vis = state.visibility?.[pid];
  const total = Object.keys(state.board.hexes).length || 1;
  return vis ? vis.explored.size / total : 1;
}

// Is a hostile/warring enemy unit standing on a Location this faction
// controls right now — feeds the Bastion (defense) nodes.
function underThreatAtHome(state, pid) {
  return Object.values(state.units).some((u) => {
    if (u.owner === pid) return false;
    const loc = state.locations[u.node];
    if (!loc || loc.controller !== pid) return false;
    return atWar(state, pid, u.owner) || standingTier(getStanding(state, pid, u.owner)) === "hostile";
  });
}

// Is this faction's banked scrap thin relative to what it has queued to
// build — feeds the Construction (cost) nodes.
function scrapScarce(state, pid) {
  const queued = Object.values(state.locations).filter((l) => l.controller === pid && l.activeBuild).length;
  return queued > 0 && (state.players[pid]?.resource || 0) < queued * 5;
}

// The highest Loyalty among Locations held by a hostile/warring rival —
// feeds Saboteurs (bigger target, more worth undermining).
function bestHostileLoyalty(state, pid) {
  let best = 0;
  for (const loc of Object.values(state.locations)) {
    const c = loc.controller;
    if (!c || c === pid) continue;
    const hostile = atWar(state, pid, c) || standingTier(getStanding(state, pid, c)) === "hostile";
    if (hostile) best = Math.max(best, loc.loyalty ?? 0);
  }
  return best;
}

// One situational-value function per node id. Flat ~1 is "generically
// useful, no special-cased reason to prefer or defer it right now."
const TECH_NODE_SCORE = {
  "mil-entry": () => 1.5, // any-contest-roll bonus is always live
  "mil-a1": (s, pid) => ((factionDef(pid)?.aggression ?? 0.5) > 0.5 ? 2 : 0.5),
  "mil-a2": (s, pid) => ((factionDef(pid)?.aggression ?? 0.5) > 0.5 ? 2 : 0.5),
  "mil-b1": (s, pid) => (underThreatAtHome(s, pid) ? 3 : 1),
  "mil-b2": (s, pid) => (underThreatAtHome(s, pid) ? 2.5 : 1),
  "log-entry": () => 1.2,
  "log-a1": (s, pid) => ((factionDef(pid)?.aggression ?? 0.5) > 0.5 ? 1.5 : 1),
  "log-a2": (s, pid) => (factionIds(s).some((f) => atWar(s, pid, f)) ? 2 : 0.5),
  "log-b1": (s, pid) => (ownUnitsBelowCap(s, pid) > 0 ? 1 + ownUnitsBelowCap(s, pid) * 0.4 : 0.5),
  "log-b2": (s, pid) => (ownUnitsBelowCap(s, pid) > 0 || scrapScarce(s, pid) ? 1.5 : 0.8),
  "eco-entry": () => 1.5,
  "eco-a1": (s, pid) => 1 + (scrapScarce(s, pid) ? 1 : 0),
  "eco-a2": () => 1,
  "eco-b1": (s, pid) => 1 + (scrapScarce(s, pid) ? 1.5 : 0),
  "eco-b2": () => 1,
  "int-entry": () => 1,
  "int-a1": (s, pid) => 1 + (1 - exploredFraction(s, pid)) * 2,
  "int-a2": (s, pid) => 1 + (1 - exploredFraction(s, pid)) * 1.5,
  // §12.3 — Spy Ring is no longer just two static readouts. It is the door to
  // Expose: without it (or a live Listening Post, or A1 with eyes on the
  // place) a faction has no way of learning what anybody does quietly, and the
  // whole intrigue branch is closed to it. Measured, every op the AI runs is a
  // spy-ring op — 8 of 8 across five games — so the node is now load-bearing
  // rather than flavour, and worth more when there is a political game on.
  "int-b1": (s, pid) => {
    const base = factionIds(s).length > 2 ? 1.5 : 1;
    return base + (CONFIG.ai.intrigue && CONFIG.sway.ops?.enabled ? 1 : 0);
  },
  "int-b2": (s, pid) => 0.3 + bestHostileLoyalty(s, pid) * 0.3,
};

// Additive identity fit (was an exclusive path/branch SELECTOR before —
// that's the bug: it locked a faction into one path for the whole game
// and never once picked Logistics). Now every path/branch gets a fair
// comparison; the dial just tilts the scale.
function techIdentityWeight(path, branch, dial) {
  let w = 0;
  if (path === "military" && (dial.victoryLean === "conquest" || (dial.aggression ?? 0.5) > 0.6)) w += 2;
  if (path === "intelligence" && (dial.victoryLean === "diplomacy" || dial.victoryLean === "diplomatic")) w += 2;
  if (branch === "a" && (dial.aggression ?? 0.5) > 0.6) w += 1;
  if (branch === "b" && (dial.aggression ?? 0.5) <= 0.6) w += 1;
  return w;
}

function techBranchOf(nodeId) {
  if (nodeId.endsWith("-a1") || nodeId.endsWith("-a2")) return "a";
  if (nodeId.endsWith("-b1") || nodeId.endsWith("-b2")) return "b";
  return null;
}

export function maybeAssignTech(state, pid) {
  const p = state.players[pid];
  if (((p.techLevel || 1) - 1) - (p.techWheel?.length || 0) <= 0) return; // no free point
  const dial = factionDef(pid) || {};
  let best = null, bestScore = -Infinity;
  for (const nodeId of Object.keys(TECH_NODES)) {
    if (p.techWheel.includes(nodeId)) continue;
    if (!prereqMet(state, pid, nodeId)) continue;
    const node = TECH_NODES[nodeId];
    const branch = techBranchOf(nodeId);
    let score = techIdentityWeight(node.path, branch, dial) + (TECH_NODE_SCORE[nodeId]?.(state, pid) ?? 1);
    // Mild nudge to finish a branch already started over cold-opening a
    // new path at an exact tie — favours coherent builds without hard-
    // gating diversification the way the old single-path lock-in did.
    if (node.prereq && p.techWheel.includes(node.prereq)) score += 0.5;
    if (score > bestScore) { bestScore = score; best = nodeId; }
  }
  if (best) assignTechNode(state, pid, best);
}

// §17.7 — low-probability Listening Post placement: drop a concealed Vision
// source on a non-Location hex the AI already occupies (frontier scouting).
function tryBuildPost(state, pid) {
  if (!hasTechNode(state, pid, "int-a2")) return false;
  if ((state.players[pid].resource || 0) < CONFIG.posts.buildCost) return false;
  if (state.rng.roll(6) > 1) return false; // ~1-in-6 per turn — keep it rare
  for (const u of ownUnits(state, pid)) {
    if (state.locations[u.node] || postAt(state, u.node)) continue;
    if (performAction(state, "build-post", { hex: u.node }).ok) return true;
  }
  return false;
}

// §17.5 Saboteurs — once per round, lower the Loyalty of a hostile rival's
// highest-Loyalty Location.
function trySabotage(state, pid) {
  if (!hasTechNode(state, pid, "int-b2")) return false;
  if (state.players[pid].sabotageUsedRound === state.round) return false;
  let best = null, bestLoy = -1;
  for (const loc of Object.values(state.locations)) {
    const c = loc.controller;
    if (!c || c === pid) continue;
    const hostile = atWar(state, pid, c) || standingTier(getStanding(state, pid, c)) === "hostile";
    if (!hostile) continue;
    if ((loc.loyalty ?? 0) > bestLoy) { bestLoy = loc.loyalty ?? 0; best = loc; }
  }
  if (!best) return false;
  return performAction(state, "sabotage", { at: best.hexId }).ok;
}

// --- helpers ----------------------------------------------------------

function ownUnits(state, pid) {
  return Object.values(state.units).filter((u) => u.owner === pid);
}

function isImmobilized(state, unit) {
  if (unit.immobilizedUntil == null) return false;
  const ord = state.round * state.turnOrder.length + state.activeIndex;
  return ord <= unit.immobilizedUntil;
}

// §19.10 — the AI plans on its OWN fog: it knows a Location is a target
// only once it has explored that hex (live controller while visible, else
// the possibly-stale memory snapshot). Locations it has never seen are
// unknown — it must scout to find them. No global-truth reads here.
function knownGoalHexes(state, pid) {
  const vis = state.visibility?.[pid];
  // §18.4.1 — a scope:"local" minor only pursues goals near its own turf.
  const local = factionDef(pid)?.scope === "local";
  const goals = [];
  for (const loc of Object.values(state.locations)) {
    const hex = loc.hexId;
    if (loc.controller === pid) continue;
    // Don't march on a town you wouldn't actually fight for — a pacifist
    // heading to a friendly city just to stall at the gates wastes turns
    // and racks up trespass citations on the way.
    if (loc.controller && !wouldFight(state, pid, loc.controller)) continue;
    if (local && !nearOwnTerritory(state, pid, hex)) continue;
    if (!vis) { goals.push(hex); continue; }
    if (vis.visible.has(hex)) goals.push(hex); // live truth
    else if (vis.explored.has(hex) && vis.memory[hex]?.location?.controller !== pid) goals.push(hex);
  }
  return goals;
}

// §18.4.1 — is `hex` within the locality radius of any of pid's Locations?
function nearOwnTerritory(state, pid, hex) {
  const r = CONFIG.diplomacy.ai.localityRadius;
  const own = Object.values(state.locations).filter((l) => l.controller === pid).map((l) => l.hexId);
  if (!own.length) return true; // landless — don't over-restrict
  for (const o of own) {
    const d = bfsDistances(state.board.adjacency, o)[hex];
    if (d !== undefined && d <= r) return true;
  }
  return false;
}

// Pick the single best faction to open a courtship with, and open it.
// Returns true when it spent the faction's initiative doing so.
//
// Bounded by `initiativesPerRound` on purpose. The measured pathology was
// never the act COUNT — `manageDiplomacy` already returns after one act, and
// the measured rate is 0.75/turn — it was that there is no reason to skip a
// turn, no rotation, and `runAIPolitics` runs outside the budget entirely.
// A courtship you are already running is not re-opened, so a faction working
// two relationships is spending two slots' worth of attention on them.
function courtSomebody(state, pid, others) {
  // `initiativesPerRound` caps ACTS per round, which is what it says: a
  // faction opens at most one conversation a turn. It is deliberately NOT a
  // cap on how many courtships run concurrently — that number is the BUDGET's
  // to decide, and conflating the two was measured and wrong. With one
  // concurrent courtship allowed, every faction spent at most 10 Sway against
  // an income of 6-23, nobody ever lapsed for want of capacity, and every
  // faction sat pinned at the ceiling wasting income. A currency nothing can
  // exhaust prices nothing.
  //
  // "One diplomatic mission in flight" as a BUDGET rather than a hard cap is
  // the whole point of §6.3: you can court two rivals at once if you are rich
  // and one if you are not, and the sequencing is the decision.
  if ((CONFIG.diplomacy.posture?.initiativesPerRound ?? 1) <= 0) return false;
  const running = others.filter((f) => isCourting(state, pid, f)).length;

  // §6.4 rule 3 — THE AI GETS AN EXPLICIT SWAY POLICY, not an implicit one.
  // An AI that cannot see its own political income cannot play this game, and
  // the failure is not subtle: courting on appetite alone means going
  // bankrupt, having `chargeSwayUpkeep` call every courtship off, and
  // re-opening the same one next round forever.
  //
  // …through the SHARED affordability rule, which the human's Court button and
  // `performDiplomacy("court")` also read. Two implementations of "can you
  // afford this" is how the asymmetric bar got in the first time.
  if (!canSustainCourtship(state, pid)) return false;

  let best = null, bestScore = 0;
  for (const f of others) {
    const sc = courtshipScore(state, pid, f);
    if (sc > bestScore) { bestScore = sc; best = f; }
  }
  if (!best) return false;
  return performDiplomacy(state, pid, "court", { faction: best }).ok === true;
}

// §6.4 — WHAT THE AI MAY SPEND ON GOODWILL, after its courtships are paid for.
//
// The AI's only Sway sink was courtship, and the pool was measured sitting at
// its ceiling 30% of all rounds — a currency nothing can exhaust prices
// nothing. The rule is the same one `canSustainCourtship` uses, and for the
// same reason: commitments first, surplus second. What is left after every
// running courtship's upkeep, less a round's reserve so a gift can never be
// the thing that calls a courtship off.
// §12.3 — THE SINK THE SURPLUS WAS WAITING FOR.
//
// The recorded phase-3 finding was that the political pool sits at its ceiling
// 30% of all rounds, and the note against it said the same thing every time:
// only one of the four sinks is live, wait for ops. This is ops.
//
// The policy is deliberately narrow. EXPOSE only — the AI publishes true
// things and does not lie. That is not squeamishness, it is the same
// discipline `denounceWarrant` already enforces: an accusation has to be
// grounded in something the target actually did, or the verb is a laundry.
// Forge and Fabricate are the PLAYER's to reach for, which is the right
// asymmetry for an intrigue branch — the AI can be caught out by them, and it
// answers with the machinery it already has.
function tryIntrigue(state, pid, others) {
  if (!CONFIG.ai.intrigue || !opsEnabled()) return false;
  const cost = CONFIG.sway.opCost;
  // Commitments first, exactly as `canSustainCourtship` does it: an op must
  // never be the thing that calls a running courtship off.
  const committed = courtingList(state, pid).length * CONFIG.sway.courtUpkeep;
  if (swayOf(state, pid) - committed < cost) return false;
  // Whose exposure helps most? The faction with the largest lead — Menace on
  // a runaway is what gives the rest of the board grounds to rise.
  let best = null, bestLead = 0;
  for (const f of others) {
    if (!exposableStrikes(state, f, pid).length) continue;
    const lead = powerLead(state, f);
    if (lead > bestLead || best == null) { bestLead = lead; best = f; }
  }
  if (!best) return false;
  return performDiplomacy(state, pid, "expose", { faction: best }).ok === true;
}

function giftBudget(state, pid) {
  const cfg = CONFIG.sway;
  const running = courtingList(state, pid).length;
  // A gift MUST NOT COST A COURTSHIP, which is not the same rule as "a gift
  // never happens while a courtship runs" — and the difference is the whole
  // fix. Measured, letting a gift eat into the pool took the ending mix from
  // 9 to 5 and unresolved from 1 to 6, because the pool emptied,
  // `chargeSwayUpkeep` called the running courtships off, and lapses per game
  // went 3.9 to 6.4. So the failure mode was always LAPSES, and the guard
  // that shipped — a flat `return 0` whenever anything was being courted —
  // treated the symptom by closing the branch entirely. Courtships do not
  // lapse on their own, so in practice the AI gifted approximately never.
  //
  // Commitments first, then surplus: reserve what every running courtship
  // will cost for the next `giftReserveRounds` upkeeps and gift only out of
  // what is left over after that. Set `giftReserveRounds` high to restore the
  // old refusal in all but name.
  const reserve = running * cfg.courtUpkeep * (CONFIG.ai.giftReserveRounds ?? 2);
  const surplus = swayOf(state, pid) - reserve
    - cfg.cap * (CONFIG.ai.giftAboveShareOfCap ?? 0.7);
  return Math.max(0, surplus);
}

// §18.8 — the AI works the political layer once per turn (free of Actions):
// vassalize a cornered weakling, form a pact with a warm compatible
// neighbour, or gift to warm a promising relationship. Bounded: one move.
export function manageDiplomacy(state, pid) {
  const me = factionDef(pid) || {};
  const human = state.humanFactionId;
  const others = factionIds(state).filter((f) => f !== pid);

  // 0) OPEN A COURTSHIP. §5's cadence fix, in the one place it belongs.
  //
  // A courtship is an ACT, not a mood that settles over the board: it is
  // chosen, one per faction per round, and from economy stage 5 it is paid for
  // every round it runs. Entering it as a per-round roll inside
  // `recomputePostures` was tried and measured — roughly every eligible pair
  // was Courting inside four rounds, which makes the posture meaningless and,
  // through `courtDriftExempt`, switches Standing drift off across the whole
  // board.
  //
  // This is a SELECTION rather than a scan: score every candidate and take the
  // argmax. The existing branch loop below is a fixed-order priority list where
  // the same faction is always served first and the HUMAN IS SERVED LAST, in
  // branch 8 — so adding cadence gates alone would make the AI approach the
  // player LESS, which is the one regression audit finding 7 explicitly warns
  // against. Argmax has no ordering to be starved by.
  if (courtSomebody(state, pid, others)) return;

  // 0b) …and if the courtships are paid for and the pool is still deep, spend
  //     it on what the board believes. See `tryIntrigue`: EXPOSE only, because
  //     an accusation has to be grounded in something the target actually did.
  if (tryIntrigue(state, pid, others)) return;

  // 1) Vassalize a much-weaker, cornered, engageable faction (the vassal
  //    runs through converting weak factions, §18.9). Lords only.
  if (!vassalLord(state, pid) && (me.victoryLean === "diplomacy" || (me.aggression ?? 0) >= 0.7)) {
    for (const f of others) {
      if (f === human || vassalLord(state, f)) continue;
      // aiAcceptsVassalage carries the full rulebook: power gate, cornered
      // submission, peaceful PATRONAGE for friendly minors, and the
      // post-rebellion cooldown (no more same-round re-vassalizing).
      if (aiAcceptsVassalage(state, f, pid)) {
        vassalize(state, pid, f, "ai-vassalize");
        checkDominion(state);
        return;
      }
    }
  }

  // 2) Settle with somebody you have wronged, BEFORE going shopping for new
  //    friends. A faction that gifts a stranger while owing its neighbour
  //    blood reads as having no memory — and the gift branch below fires
  //    every single turn for a diplomacy-lean faction, so anything under it
  //    was unreachable in practice. This is also the one road back for a
  //    faction that has burned its reputation.
  if ((me.aggression ?? 0.5) < 0.7) {
    for (const f of others) {
      // §15 — `mayCourt`, not `mayEngage`: making amends is an overture, and
      // the escape exists so a faction the win condition counts is reachable
      // by something other than an army.
      if (atWar(state, pid, f) || !mayCourt(state, pid, f)) continue;
      if (!grievanceWeight(state, f, pid)) continue;
      // Ask what it would take rather than guessing: counterOffer already
      // walks exactly this gap, and already clamps to what the payer holds.
      // Guessing the bare weight-times-rate landed a hair under whatever the
      // wronged party's standing bias asked for, so nobody ever settled.
      const bare = { proposer: pid, recipient: f, give: [], get: [{ settlement: true }] };
      const deal = wouldAccept(state, f, bare) ? bare : counterOffer(state, f, bare);
      if (!deal) continue;
      // The human is ASKED — taking compensation means giving up the
      // righteous war the grievance entitles them to, which is their call
      // to make. Between two AIs it lands on the spot; neither has an inbox.
      if (f === human) {
        if (offersFor(state, human).some((o) => o.from === pid)) continue;
        tableOffer(state, pid, human, deal, { kind: "deal", note: "They want the books closed." });
        return;
      }
      if (!wouldAccept(state, f, deal)) continue;
      applyDeal(state, deal, "ai-amends");
      return;
    }
  }

  // 2b) Say something about the war you are in, before going shopping for
  //     friends. See warTalk: the gift branch immediately below returns on
  //     every turn a sociable faction takes, which made every branch under
  //     it unreachable — including the one that ends the war.
  if (warTalk(state, pid, me)) return;

  // 3) Proactive pact with a warm, compatible, engageable faction; or a gift
  //    to warm one up (diplomacy-lean factions buy Standing toward a pact).
  if ((me.sociability ?? 0) >= 0.5) {
    for (const f of others) {
      if (arePacted(state, pid, f) || atWar(state, pid, f) || vassalLord(state, f) === pid) continue;
      // §15 — the ally door. Widening the WAR predicate here instead was
      // measured and reverted: it took unresolved games from 6 of 15 to 11.
      if (!mayCourt(state, pid, f)) continue;
      const sFwd = getStanding(state, pid, f), sBack = getStanding(state, f, pid);
      if (sFwd >= CONFIG.diplomacy.pactStandingReq && sBack >= CONFIG.diplomacy.pactStandingReq
        && passesRepGates(state, pid, f) && passesRepGates(state, f, pid)) {
        // Between two AIs an alliance is settled on the spot — neither has an
        // inbox to read. The human gets ASKED, because being handed an
        // alliance you never agreed to (which is what this used to do) is
        // not diplomacy happening to you, it is diplomacy bypassing you.
        if (f === human) {
          if (!offersFor(state, human).some((o) => o.from === pid && o.kind === "pact")) {
            tableOffer(state, pid, human, {
              give: [{ promise: { kind: "pact" } }], get: [],
            }, { kind: "pact" });
            return;
          }
        } else {
          formPact(state, pid, f, "ai-offer");
          checkDominion(state);
          return;
        }
      }
      // The gift that used to live here is now branch 4b, at the bottom of
      // the list. It is the only act in this pass that answers nothing, and
      // this pass is bounded to one act — see the note there.
    }
  }

  // 3b2) Make good on your own words. An ultimatum you let lapse costs Honor
  //      publicly, and it should: the AI checked it had the strength to mean
  //      it before issuing, so the only reason not to follow through is that
  //      nothing in the code ever made it. Left unfixed, every threat it
  //      issued became a bluff it called on itself.
  for (const u of ultimatumsFor(state, pid, { issuedBy: true })) {
    if (!u.defied || atWar(state, pid, u.to)) continue;
    declareWar(state, pid, u.to, "ultimatum-defied");
    return;
  }

  // 3c) Answer anything standing over you. Silence past the deadline is
  //     defiance, and defiance hands them a righteous war — so this is a
  //     decision, not a formality.
  for (const u of ultimatumsFor(state, pid)) {
    if (u.defied) continue;
    if (!aiComplies(state, pid, u)) continue;
    const res = answerUltimatum(state, pid, u.id, true);
    if (res.ok) return;
  }

  // 4) Say something about a faction that has earned it. A denouncement is
  //    now judged on whether there are grounds, which makes it the peaceful
  //    faction's real lever: a pacifist that cannot answer a tyrant with
  //    armies can answer with its reputation, gain Honor for it, and pull
  //    the board along. A warlord would rather just attack, so it doesn't
  //    bother.
  if ((me.aggression ?? 0.5) < 0.7 && honorOf(state, pid) > 0) {
    for (const f of others) {
      if (arePacted(state, pid, f) || vassalLord(state, f) === pid) continue;
      if (!mayEngage(state, pid, f)) continue;
      if (denounceCooldown(state, pid, f) > 0) continue;
      if (!denounceWarrant(state, pid, f)) continue;
      if (denounce(state, pid, f)) return;
    }
  }

  // 4b) LAST, AND THE POSITION IS THE POINT: warm somebody up.
  //
  // A gift is the only act in this whole pass that answers nothing. Every
  // other branch is a response to something already on the board — a debt, a
  // war, a threat standing over you, a faction that has earned to be named.
  // `manageDiplomacy` is bounded to ONE act, so whatever fires first silences
  // the rest, and discretionary spending has no business outranking a reply.
  //
  // This is the second time this exact hazard has bitten. The note at 2b
  // records the first: the gift branch sat above `warTalk` and returned on
  // every turn a sociable faction took, which made the branch that ENDS WARS
  // unreachable. Opening the branch up (below) walked straight back into it
  // from the other side — measured, a pacifist's Honor fell from 8.3 to 4.1,
  // because a gift now fired every turn and starved branch 4, and branch 4
  // is a peaceful faction's ONLY source of Honor. Worse, that Honor is what
  // `menace.declareOnCleanHands` prices its safety in, so the AI was buying
  // warmth with the armour that kept it alive.
  //
  // NO STANDING FLOOR, which is the other half of the fix. There used to be
  // one — `sFwd >= tiers.neutral` — and it was the single most expensive line
  // in the political layer: measured across a pacifist run, ten of sixteen
  // pairs sat BELOW Neutral (median -2), so the branch that exists to warm a
  // cold relationship refused to run on any relationship that was actually
  // cold. The recovery mechanism was gated on not needing recovery.
  //
  // Reaching somebody who despises you is a PRICE now rather than a refusal
  // (`sway.giftReparations`), so the budget is checked against what THIS gift
  // costs, not against the published rate — which is only what the easy cases
  // cost.
  //
  // The two older restraints stay, and both were measured. ONE POINT AT A
  // TIME: spending the whole surplus in one gift took the ending mix from 9
  // to 5 and unresolved from 1 to 5, because the pool emptied and
  // `chargeSwayUpkeep` called the running courtships off. ONLY A FACTION THAT
  // LEADS WITH DIPLOMACY: letting everybody gift did the same thing to the
  // board at large. And it goes through `performDiplomacy` — the same verb
  // the player presses — because the previous draft handed over 3 SCRAP via
  // `applyDeal`, which walked straight through the wall the Sway design rests
  // on: scrap buys what a faction HAS, Sway buys what a faction THINKS, and
  // nothing converts. The wall cannot hold at one faucet and not the other.
  if (me.victoryLean === "diplomacy" && (me.sociability ?? 0) >= 0.5) {
    for (const f of others) {
      if (arePacted(state, pid, f) || atWar(state, pid, f) || vassalLord(state, f) === pid) continue;
      if (!mayCourt(state, pid, f)) continue;
      if (getStanding(state, pid, f) >= CONFIG.diplomacy.pactStandingReq) continue;
      if (giftBudget(state, pid) < giftCost(state, pid, f, 1)) continue;
      if (performDiplomacy(state, pid, "gift", { faction: f, standing: 1 }).ok) return;
    }
  }

  // 5) …and if none of that fired, consider opening a conversation with the
  //    human. The audit's blunt finding was that across thirty rounds the AI
  //    approached the player exactly zero times: it had no way to propose,
  //    only to act. Now it has an inbox to put things in.
  if (human && pid !== human) {
    if (ultimatumToHuman(state, pid, me)) return;
    proposeToHuman(state, pid, me);
  }
}

// What `pid` would put to `other` about the war between them, or null if it
// has nothing to say yet. Written as terms rather than as an action so the
// same reasoning serves both audiences: the human, who gets an offer in an
// inbox to answer, and another AI, which has no inbox and settles on the
// spot — exactly the split the settle branch already makes.
export function warPeaceTerms(state, pid, other) {
  const sue = CONFIG.diplomacy.suePeace.acceptThreshold;

  // WINNING: name the price, and let it be the thing the war is actually
  // about. The AI had no way to say this at all — it could only fight on
  // until exhaustion turned it into a supplicant, so a war it was WINNING
  // had no diplomatic expression whatsoever. Asking for a homeland back is
  // the one ask that motivates itself: the occupation is already a standing
  // grievance, and giving the place back is already the only thing that
  // ends one.
  if (warExhaustion(state, other, pid) >= sue * 0.5
    && powerOf(state, pid) > powerOf(state, other)) {
    const want = occupationsBy(state, pid, other)
      .filter((o) => !cedeBlocker(state, other, o.at))
      .sort((a, b) => locationWorth(state, pid, b.at) - locationWorth(state, pid, a.at))[0];
    if (want) {
      return {
        give: [{ promise: { kind: "peace" } }],
        get: [{ location: { hexId: want.at } }],
        note: "Give it back and this ends.",
      };
    }
  }
  // LOSING: buy your way out before your army is gone. Ground first, and
  // specifically THEIR ground — a city of theirs that this faction is
  // squatting on is the cheapest thing it owns, because holding it is what
  // the war is costing it. Scrap only if it has no such card to play.
  if (warExhaustion(state, pid, other) < sue * 0.6) return null;
  const backDown = occupationsBy(state, other, pid)
    .filter((o) => !cedeBlocker(state, pid, o.at))
    .sort((a, b) => locationWorth(state, other, b.at) - locationWorth(state, other, a.at))[0];
  if (backDown) {
    return {
      give: [{ promise: { kind: "peace" } }, { location: { hexId: backDown.at } }],
      get: [],
      note: "They want this war over, and they know what it will cost.",
    };
  }
  const sweetener = Math.min(state.players[pid]?.resource || 0, 6);
  return {
    give: [{ promise: { kind: "peace" } }, ...(sweetener > 0 ? [{ resource: { resource: "scrap", amount: sweetener } }] : [])],
    get: [],
    note: "They want this war over.",
  };
}

// Everything `pid` has to say about the wars it is in. Lives above the
// courtship branch in manageDiplomacy for a reason that took a while to
// find: a sociable faction gifts a stranger three scrap on every turn it
// takes, and that branch RETURNS, so a faction losing a war it could end by
// talking never reached the part of its own turn where it would have said
// so. The settle branch was hoisted over the same obstacle in §1. Talking to
// the party you are actually fighting outranks courting a stranger, and the
// courting is still there, one branch down.
function warTalk(state, pid, me) {
  const human = state.humanFactionId;
  // The player's own seat never conducts diplomacy on its own account, even
  // if something drives manageDiplomacy for it: a faction that signs away
  // its own cities behind the player's back is not an AI, it is a bug.
  if (pid === human) return false;
  for (const other of factionIds(state)) {
    if (other === pid || !atWar(state, pid, other)) continue;
    if (!mayEngage(state, pid, other)) continue;
    if (other === human) {
      if (offersFor(state, human).some((o) => o.from === pid)) continue;
      // Same gate every other approach to the player passes through, so an
      // AI does not become chatty just because it is at war.
      if (state.rng.next() > (CONFIG.diplomacy.offers.aiProposeChance * (0.4 + (me.sociability ?? 0.5)))) continue;
      const terms = warPeaceTerms(state, pid, other);
      if (!terms) continue;
      tableOffer(state, pid, human, { give: terms.give, get: terms.get },
        { kind: "peace", note: terms.note });
      return true;
    }
    // Between two AIs there is no inbox to put anything in, so the terms
    // land or they do not — the same road the settle branch takes. Only the
    // LOSING side acts here: a demand for somebody's homeland is priced far
    // past what peace is worth, so the winning branch correctly comes to
    // nothing between two AIs, and an AI is never talked out of a city it
    // is winning by holding.
    const terms = warPeaceTerms(state, pid, other);
    if (!terms || !terms.give.some((it) => it.location)) continue;
    const deal = { proposer: pid, recipient: other, give: terms.give, get: terms.get };
    if (!wouldAccept(state, other, deal)) continue;
    applyDeal(state, deal, "ai-war-cession");
    return true;
  }
  return false;
}

// What this faction would like from the human, if anything. One offer at a
// time and only while it has nothing already pending with them, so the inbox
// stays a thing that happens rather than a thing that accumulates.
function proposeToHuman(state, pid, me) {
  const human = state.humanFactionId;
  if (!mayCourt(state, pid, human)) return; // §15 — an approach, not an attack
  if (offersFor(state, human).some((o) => o.from === pid)) return;
  const cfg = CONFIG.diplomacy.offers;
  const tiers = CONFIG.diplomacy.tiers;
  const s = getStanding(state, pid, human);
  const purse = state.players[pid]?.resource || 0;
  // Deterministic in the seed like every other AI decision — the RNG is the
  // game's, not Math.random, so a replayed game proposes identically.
  if (state.rng.next() > (cfg.aiProposeChance * (0.4 + (me.sociability ?? 0.5)))) return;

  if (atWar(state, pid, human)) return; // handled above, before the courtship
  // Warm but not allied: buy the alliance rather than wait for the numbers.
  if (s >= tiers.neutral && s < CONFIG.diplomacy.pactStandingReq && !arePacted(state, pid, human)
    && passesRepGates(state, pid, human)) {
    const sweetener = Math.min(purse, 4 + Math.round((me.sociability ?? 0.5) * 6));
    if (sweetener <= 0) return;
    tableOffer(state, pid, human, {
      give: [{ resource: { resource: "scrap", amount: sweetener } }, { promise: { kind: "pact" } }],
      get: [],
    }, { kind: "pact", note: "They are courting you." });
    return;
  }
  // Cold and cautious: a non-aggression pact is what you ask a neighbour you
  // do not trust and do not want to fight yet.
  if (s <= tiers.neutral && s > tiers.hostile && (me.aggression ?? 0.5) < 0.7) {
    tableOffer(state, pid, human, {
      give: [{ promise: { kind: "nonAggression", rounds: 6 } }],
      get: [{ promise: { kind: "nonAggression", rounds: 6 } }],
    }, { kind: "deal", note: "They would rather not find out." });
    return;
  }
  // Strong and unfriendly: name a price for leaving you alone.
  if ((me.aggression ?? 0.5) >= 0.6 && s < tiers.neutral
    && powerOf(state, pid) > powerOf(state, human) * 1.2) {
    tableOffer(state, pid, human, {
      give: [{ promise: { kind: "nonAggression", rounds: 5 } }],
      get: [{ flow: { resource: "scrap", amountPerTurn: 2, rounds: 5 } }],
    }, { kind: "deal", note: "It would be a shame if anything happened." });
  }
}

// "Stop, or else." What a faction reaches for when it is strong enough to
// mean it and has something concrete to be angry about — the step it used to
// have no way to take between grumbling through an envoy and simply
// attacking.
function ultimatumToHuman(state, pid, me) {
  const human = state.humanFactionId;
  if (!human || atWar(state, pid, human)) return false;
  if (ultimatumsFor(state, human).some((u) => u.from === pid)) return false;
  if (!mayEngage(state, pid, human)) return false;
  // You have to be able to back it up. Threatening from weakness is how a
  // faction ends up in the bluff branch, and the AI should not walk into it.
  if (powerOf(state, pid) < powerOf(state, human) * 1.25) return false;
  if ((me.aggression ?? 0.5) < 0.45) return false;
  // Something concrete first: their army in your fields.
  if (unitsInTerritory(state, human, pid).length) {
    return performDiplomacy(state, pid, "issue-ultimatum",
      { faction: human, demand: { kind: "withdraw" } }).ok;
  }
  // Otherwise the old-fashioned kind, with a clock on it.
  const purse = state.players[human]?.resource || 0;
  const ask = Math.min(CONFIG.diplomacy.ultimatum.maxScrap, Math.floor(purse * 0.3));
  if (ask < 3) return false;
  return performDiplomacy(state, pid, "issue-ultimatum",
    { faction: human, demand: { kind: "tribute", amount: ask } }).ok;
}

// Stale-intel hooks: hexes where the AI last saw an enemy (ghosts). It may
// commit toward these even though the foe has since moved — expected fog
// behavior (§19.10), not a bug.
function ghostHexes(state, pid) {
  const vis = state.visibility?.[pid];
  if (!vis) return [];
  const out = [];
  for (const hex in vis.memory) {
    if (!vis.visible.has(hex) && (vis.memory[hex].ghosts || []).length) out.push(hex);
  }
  return out;
}

// The frontier: the nearest reachable hex that is unexplored or borders the
// dark. Pulls the AI into the fog so it actually scouts.
function nearestFrontier(state, pid, reachable) {
  const vis = state.visibility?.[pid];
  if (!vis) return null;
  let best = null, bestD = Infinity;
  for (const [hex, d] of reachable) {
    const unexplored = !vis.explored.has(hex);
    const bordersDark = (state.board.adjacency[hex] || []).some((n) => !vis.explored.has(n));
    if ((unexplored || bordersDark) && d < bestD) { bestD = d; best = hex; }
  }
  return best;
}

function pickMoveTarget(state, pid, unit) {
  const dists = bfsDistances(state.board.adjacency, unit.node);
  // §16.2 — reachability respects terrain/roads and blockades; we still score
  // by hop distance, so filter the bfs map by what's actually reachable.
  const field = unitReach(state, unit);
  const reachable = Object.entries(dists)
    .filter(([hex, d]) => d > 0 && hex !== unit.node && hex in field);
  if (!reachable.length) return null;

  const goals = knownGoalHexes(state, pid);
  const ghosts = ghostHexes(state, pid);
  const targets = goals.length ? goals : ghosts; // chase ghosts only if no known goal

  // No known objective at all → scout into the dark.
  if (!targets.length) {
    return nearestFrontier(state, pid, reachable) || reachable[0][0];
  }

  // Score each reachable hex: prefer landing directly on a known goal
  // (favouring higher-VP targets — vpReward is static map data), else step
  // toward the nearest target.
  let best = null;
  let bestScore = -Infinity;
  for (const [hex, d] of reachable) {
    let score = 0;
    if (goals.includes(hex)) {
      const loc = state.locations[hex];
      const def = LOCATIONS[loc.locationId];
      score += 1000 + (def?.vpReward || 0) * 100;
    } else {
      let nearest = Infinity;
      for (const g of targets) {
        const gd = bfsDistances(state.board.adjacency, hex)[g];
        if (gd !== undefined && gd < nearest) nearest = gd;
      }
      score += -nearest * 10 - d;
    }
    if (score > bestScore) { bestScore = score; best = hex; }
  }
  // If stepping toward targets makes no progress, scout instead.
  return best ?? (nearestFrontier(state, pid, reachable) || reachable[0][0]);
}

// §20 — drive each city's economy: set its slider, queue a build into any
// free slot, and rush when flush with scrap. Runs once per turn, free of
// Actions (build/upgrade/rush/set-slider all cost 0).
// Exported as a TEST SEAM. A scripted policy that wants to isolate one part of
// the AI (say, a pacifist that never attacks) has to reuse the real economy
// and the real political pass, or it is measuring its own stand-in rather than
// the engine — see `scripts/probe-policies.mjs`.
export function manageEconomy(state, pid) {
  const player = state.players[pid];
  const cfg = CONFIG.ai;
  // THE WAR CHEST. What this loop will not spend. See the config comment: the
  // effect→value table broke the old economy by working — there is now always
  // something worth building, so the slider never falls back and the treasury
  // never refills by accident the way it used to.
  const chest = cfg.warChestUnits * CONFIG.unitRecruitCost;
  const flush = (player.resource || 0) >= chest;

  for (const loc of Object.values(state.locations)) {
    if (loc.controller !== pid) continue;

    if (!loc.activeBuild) pickBuild(state, pid, loc);

    // Build hard when the army is funded, lean when it is not. The old rule
    // was binary on "is anything queued", which is now always true.
    const wantSlider = loc.activeBuild
      ? (flush ? cfg.buildSliderBusy : cfg.buildSliderLean)
      : 0;
    if ((loc.buildSlider ?? 0) !== wantSlider) {
      performAction(state, "set-slider", { at: loc.hexId, value: wantSlider });
    }

    // Rushing is the fastest way to empty a treasury, so it wants more than a
    // full chest — it wants a chest it can afford to break into.
    if (loc.activeBuild && player.resource > chest + cfg.rushAbove) {
      performAction(state, "rush", { at: loc.hexId, amount: 3 });
    }
  }
}

// Choose what a city should build next — or what to UPGRADE.
//
// This used to score six of forty-two authored chip fields. Everything else —
// every movement chip, every vision chip, the whole blockade kit, the
// influence chips, the Loyalty chips — was worth exactly zero to the AI, and
// the playtest log has the consequence: three of six factions ended a
// 15-round game with an empty tech wheel and the Lakers on 36 unspent scrap.
// The table now lives in `chipValue.js` and the economy audit fails if a new
// authored field is missing from it.
//
// Two things are still decided HERE rather than in the table, because they
// need to know about the faction and not just the chip: the first
// recruit-unlocking chip is worth far more than the second, and an upgrade is
// worth its DELTA rather than its destination.
function pickBuild(state, pid, loc) {
  const options = buildableChips(state, loc).filter((o) => !o.locked);
  const haveRecruiting = recruitCapBonus(state, pid) > 0;
  // Is this ground contested? The influence and Loyalty terms in the table
  // swing hard on it — a Loyalty chip on a quiet interior city is worth a
  // fraction of the same chip on a border one point below the dominance bar.
  const ctx = { state, loc, contested: locationIsContested(state, pid, loc) };
  const holdings = chipsHeldBy(state, pid);
  const chipCount = holdings.length;
  // How many of each chipId this faction already holds — the input to the
  // repeat penalty below.
  const owned = {};
  for (const c of holdings) {
    const id = state.chips[c.uid]?.chipId;
    if (id) owned[id] = (owned[id] || 0) + 1;
  }
  // Value per scrap, not value. Two chips worth 3 and 4 are not ranked by
  // those numbers when one costs 3 and the other 7 — and neither the old
  // six-field table nor the first draft of the new one looked at price at all,
  // which is how a city came to prefer a 7-scrap stronghold to two factories.
  const perScrap = (def, raw) => {
    if (!CONFIG.ai.costAware) return raw;
    return raw / Math.max(1, effectiveBuildCost(state, pid, def));
  };
  const score = (def) => {
    let s = CONFIG.ai.valueTable
      ? chipValue(def, ctx)
      // The six-field table this replaced, kept reachable so the "before" of
      // this stage is a config flip rather than a branch revert.
      : (def.output || 0) * 3 + (def.research || 0) * 3 + (def.garrison || 0)
        + (def.strength || 0) - (def.upkeep || 0);
    // The first one opens recruiting at all; the second adds a slot to a
    // capacity nobody is against. Priced here because the table sees the chip
    // and not the faction.
    if ((def.unitCapBonus || 0) > 0 && !haveRecruiting) s += 5;
    // ECONOMY §8 — the count surcharge is a real per-round cost and the table
    // cannot see it, because it is a property of how many chips you already
    // hold and not of the chip. Priced on the same per-round axis as `upkeep`,
    // so an AI past its free allowance stops treating slots as free.
    const eco = CONFIG.economy;
    if (eco.perExtraChip && eco.freeChips != null && chipCount >= eco.freeChips) {
      s -= eco.perExtraChip * 2 * (CONFIG.ai.compoundingWeight ?? 1);
    }
    // The fifth workshop is not worth what the first was. See the config note:
    // without this the argmax loop builds one chip forever and 33 of 40
    // authored chips are never built at all.
    const repeat = CONFIG.ai.repeatDiminish;
    if (repeat && owned[def.id]) s /= 1 + owned[def.id] * repeat;
    return perScrap(def, s);
  };

  // Location chips into a free slot first.
  const locFits = options
    .filter((o) => o.def.kind === "location" && slotsUsed(state, loc.chips) + (o.def.slots || 1) <= slotCapacity(loc, state))
    .sort((a, b) => score(b.def) - score(a.def));

  // §20.5 — UPGRADING WAS NEVER ATTEMPTED. `chipUpgradesByAI` measured 0 across
  // the whole 15-seed suite: the AI built until the slots were full and then
  // stopped, so every tier-2 chip in the content set was human-only. An
  // upgrade is scored on the DELTA — an AI scoring the destination would rate
  // every upgrade above every fresh build, because an upgrade target is by
  // construction the better chip, and it would be paying full price for the gap.
  const upFits = [];
  for (const uid of (CONFIG.ai.upgrades ? loc.chips : [])) {
    const opt = upgradeOption(state, loc, uid);
    if (!opt || opt.locked) continue;
    const from = CHIPS[state.chips[uid]?.chipId];
    if (!from) continue;
    // An upgrade's price is the new chip's full cost, not the difference, so
    // its value-per-scrap is the delta over the whole bill.
    upFits.push({ uid, opt, gain: perScrap(opt.def, upgradeValue(from, opt.def, ctx)) });
  }
  upFits.sort((a, b) => b.gain - a.gain);

  const bestBuild = locFits.length ? score(locFits[0].def) : -Infinity;
  const bestUp = upFits.length ? upFits[0].gain : -Infinity;
  // A free slot is worth taking before a marginal upgrade — a slot filled is a
  // slot that keeps paying, while an upgrade consumes the one it replaces. So
  // the upgrade has to actually beat the build, not merely tie it.
  if (bestUp > bestBuild && bestUp > 0) {
    const r = performAction(state, "upgrade", { at: loc.hexId, chip: upFits[0].uid });
    if (r.ok) return true;
  }
  if (locFits.length && bestBuild > 0) {
    return performAction(state, "build", { at: loc.hexId, chipId: locFits[0].chipId }).ok;
  }

  // Otherwise arm a stationed friendly unit with a strength chip.
  const unitFits = options
    .filter((o) => o.def.kind === "unit" && stationedUnitWithBay(state, loc, o.def.slots || 1))
    .sort((a, b) => score(b.def) - score(a.def));
  if (unitFits.length) {
    return performAction(state, "build", { at: loc.hexId, chipId: unitFits[0].chipId }).ok;
  }
  // NOTHING FITS BECAUSE THERE IS NOWHERE TO PUT IT — buy room.
  //
  // This is the state the probe measures as slot-bound, and it is 58% of
  // faction-rounds: the city is full, so no price and no valuation matters.
  // Reached only after the build and upgrade paths have both declined, so
  // widening is what the AI does when it has run out of ways to use what it
  // has, rather than a thing it races to.
  //
  // Two guards, and both are about not buying room it cannot fill. The wall
  // has to be SLOTS and not the chip list — a city with nothing worth building
  // gains nothing from another slot — and the faction has to be able to pay
  // for the room and still have something left to put in it.
  const wall = options.some((o) => o.def.kind === "location");
  const cost = slotExpansionCost(loc);
  if (wall && cost != null && !locFits.length) {
    const cheapest = Math.min(...options
      .filter((o) => o.def.kind === "location")
      .map((o) => o.def.buildCost ?? o.def.cost ?? 0));
    if (state.players[pid].resource >= cost + cheapest) {
      const r = performAction(state, "expand-slots", { at: loc.hexId });
      if (r.ok) return true;
    }
  }

  // Nothing fits and nothing upgrades: fall back to the best chip going, even
  // one the table scores at zero. An empty slot earns nothing at all, and the
  // old loop reached this state and simply stopped.
  if (locFits.length) return performAction(state, "build", { at: loc.hexId, chipId: locFits[0].chipId }).ok;
  return false;
}

// Is somebody else's reach on this ground? Read from the influence field the
// engine already maintains, so "contested" means the same thing to the AI as
// the dashed ring means to the player.
function locationIsContested(state, pid, loc) {
  const zoc = state.world?.zoc;
  if (!zoc) return false;
  for (const n of [loc.hexId, ...(state.board.adjacency[loc.hexId] || [])]) {
    const o = zoc[n];
    if (o && o !== pid) return true;
  }
  return false;
}

function tryRecruit(state, pid) {
  const player = state.players[pid];
  if (player.resource < CONFIG.unitRecruitCost) return false;
  // The recruit-unlocking chip just needs to exist ANYWHERE the player
  // controls (validateRecruit checks it player-wide, not per-location) —
  // so try every controlled location, not just the one holding the chip.
  if (recruitCapBonus(state, pid) < 1) return false;
  for (const loc of Object.values(state.locations)) {
    if (loc.controller !== pid) continue;
    const r = performAction(state, "recruit", { at: loc.hexId });
    if (r.ok) return true;
  }
  return false;
}

function tryActivate(state, pid) {
  for (const loc of Object.values(state.locations)) {
    if (loc.controller !== pid) continue;
    if (!loc.abilityId) continue;
    const r = performAction(state, "activate", { location: loc.hexId });
    if (r.ok) return true;
  }
  return false;
}
