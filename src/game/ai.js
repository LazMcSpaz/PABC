// Demo AI — a deliberately flimsy rule-based opponent. Drives one full
// turn per call: loops `tryOneAction` until the player runs out of
// actions or the priority list dries up, then ends the turn. The engine
// already supplies headless defaults for sub-choices (encounter pick,
// reactive play, retreat hex), so the AI never has to touch ctx.interact.

import { performAction } from "./actions.js";
import { endTurn } from "./turn.js";
import { activePlayerId } from "./targeting.js";
import { bfsDistances } from "./board.js";
import { unitReach } from "./movement.js";
import { LOCATIONS } from "./content.js";
import { CONFIG } from "./config.js";
import { buildableChips, slotCapacity, slotsUsed, stationedUnitWithBay } from "./economy.js";
import { isUnitVisibleTo } from "./visibility.js";
import { assignTechNode } from "./stats.js";
import { hasTechNode } from "./tech.js";
import { postAt } from "./posts.js";
import { standingTier } from "./standing.js";
import { factionDef } from "./content.js";
import {
  factionIds, powerOf, arePacted, atWar, vassalLord, mayEngage,
  getStanding, passesRepGates, formPact, vassalize, applyDeal, checkRecognitionVictory,
} from "./diplomacy.js";

const SAFETY_CAP = 10; // hard stop if priority loop ever spins

export function takeAITurn(state) {
  if (state.winnerId) return;
  const pid = activePlayerId(state);
  // Spend any free Ability Point before acting, so the new node's effect is
  // live this turn.
  maybeAssignTech(state, pid);
  let guard = SAFETY_CAP;
  while (
    state.players[pid].actions.remaining > 0 &&
    guard-- > 0 &&
    !state.winnerId
  ) {
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

// Returns true if the AI spent at least one Action (whether the action
// succeeded or not — failed actions don't decrement remaining, so the
// loop must give up if no priority matches a runnable action).
function tryOneAction(state, pid) {
  // 1. Contest where standing
  for (const unit of ownUnits(state, pid)) {
    if (isImmobilized(state, unit)) continue;
    const loc = state.locations[unit.node];
    if (loc && !loc.sections.every((s) => s === pid)) {
      const r = performAction(state, "contest", { unit: unit.uid });
      if (r.ok) return true;
    }
    // §19.10 — only raid an enemy the AI can actually SEE. A concealed
    // enemy on this hex isn't targeted explicitly; if the AI contests the
    // Location instead it may blunder into them (a defender ambush) — fair
    // fog, no cheats.
    const enemyHere = Object.values(state.units).find(
      (u) => u.node === unit.node && u.owner !== pid && isUnitVisibleTo(state, pid, u),
    );
    if (enemyHere && (!loc || !loc.sections.includes("neutral"))) {
      const r = performAction(state, "contest", {
        unit: unit.uid, target: enemyHere.uid,
      });
      if (r.ok) return true;
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

// AI overhaul plan replaces this — a hard-coded heuristic so the demo AI at
// least USES the tech wheel (the full effect→value table is the
// docs/ai-overhaul-plan.md overhaul, deliberately out of scope here).
function maybeAssignTech(state, pid) {
  const p = state.players[pid];
  if (((p.techLevel || 1) - 1) - (p.techWheel?.length || 0) <= 0) return; // no free point
  const me = factionDef(pid) || {};
  // Path by faction dial: conquest → Military, diplomacy → Intelligence,
  // otherwise Economy; aggressive factions still favour Military.
  let path = "economy";
  if (me.victoryLean === "conquest") path = "military";
  else if (me.victoryLean === "diplomacy" || me.victoryLean === "diplomatic") path = "intelligence";
  else if ((me.aggression ?? 0) > 0.6) path = "military";
  // Branch: A (Aggression / Vision / Maneuver / Industry) when aggressive,
  // else B (Bastion / Espionage / Sustainment / Construction).
  const branch = (me.aggression ?? 0) > 0.6 ? "a" : "b";
  const prefix = { military: "mil", logistics: "log", economy: "eco", intelligence: "int" }[path];
  // Fill the chosen branch shallow-to-deep; the first assignable node wins.
  for (const node of [`${prefix}-entry`, `${prefix}-${branch}1`, `${prefix}-${branch}2`]) {
    if (p.techWheel.includes(node)) continue;
    if (assignTechNode(state, pid, node).ok) return;
    break; // a deeper node's prereq isn't met yet — wait for the next point
  }
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

// §18.8 — the AI works the political layer once per turn (free of Actions):
// vassalize a cornered weakling, form a pact with a warm compatible
// neighbour, or gift to warm a promising relationship. Bounded: one move.
function manageDiplomacy(state, pid) {
  const me = factionDef(pid) || {};
  const human = state.humanFactionId;
  const others = factionIds(state).filter((f) => f !== pid);
  const tiers = CONFIG.diplomacy.tiers;
  const ai = CONFIG.diplomacy.ai;

  // 1) Vassalize a much-weaker, cornered, engageable faction (recognition
  //    runs through converting weak factions, §18.9). Lords only.
  if (!vassalLord(state, pid) && (me.victoryLean === "diplomacy" || (me.aggression ?? 0) >= 0.7)) {
    for (const f of others) {
      if (f === human || vassalLord(state, f) || !mayEngage(state, pid, f)) continue;
      const ratio = powerOf(state, f) / Math.max(1, powerOf(state, pid));
      // Subjugation follows a beating: only vassalize a faction you are at
      // war with (cornered), and only when it is much weaker (§18.9).
      const cornered = atWar(state, pid, f);
      if (ratio <= ai.vassalPowerRatio && cornered) {
        vassalize(state, pid, f, "ai-vassalize");
        checkRecognitionVictory(state);
        return;
      }
    }
  }

  // 2) Proactive pact with a warm, compatible, engageable faction; or a gift
  //    to warm one up (diplomacy-lean factions buy Standing toward a pact).
  if ((me.sociability ?? 0) >= 0.5) {
    for (const f of others) {
      if (arePacted(state, pid, f) || atWar(state, pid, f) || vassalLord(state, f) === pid) continue;
      if (!mayEngage(state, pid, f)) continue;
      const sFwd = getStanding(state, pid, f), sBack = getStanding(state, f, pid);
      if (sFwd >= CONFIG.diplomacy.pactStandingReq && sBack >= CONFIG.diplomacy.pactStandingReq
        && passesRepGates(state, pid, f) && passesRepGates(state, f, pid)) {
        formPact(state, pid, f, "ai-offer");
        checkRecognitionVictory(state);
        return;
      }
      if (me.victoryLean === "diplomacy" && (state.players[pid].resource || 0) >= 4
        && sFwd >= tiers.neutral && sFwd < CONFIG.diplomacy.pactStandingReq && f !== human) {
        applyDeal(state, { proposer: pid, recipient: f, give: [{ resource: { resource: "scrap", amount: 3 } }], get: [] }, "gift");
        return;
      }
    }
  }
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
function manageEconomy(state, pid) {
  const player = state.players[pid];
  for (const loc of Object.values(state.locations)) {
    if (loc.controller !== pid) continue;

    if (!loc.activeBuild) pickBuild(state, pid, loc);

    // Lean toward construction when something is queued, but keep banking a
    // share so the army still gets scrap for recruiting / reinforcing.
    const wantSlider = loc.activeBuild ? 0.7 : 0;
    if ((loc.buildSlider ?? 0) !== wantSlider) {
      performAction(state, "set-slider", { at: loc.hexId, value: wantSlider });
    }

    // Spend a flush treasury into local construction (rush a few points).
    if (loc.activeBuild && player.resource > 14) {
      performAction(state, "rush", { at: loc.hexId, amount: 3 });
    }
  }
}

// Choose what a city should build next: the highest-value buildable
// (Tech-allowed, Loyalty-unlocked, slot-fitting) chip. Prefers economy /
// research / a first Training Grounds; falls back to arming a stationed unit.
function pickBuild(state, pid, loc) {
  const options = buildableChips(state, loc).filter((o) => !o.locked);
  const haveTG = Object.values(state.locations).some(
    (l) => l.controller === pid && l.chips.some((c) => state.chips[c]?.chipId === "training-grounds"),
  );
  const score = (def) => {
    let s = (def.output || 0) * 3 + (def.research || 0) * 3 + (def.garrison || 0) + (def.strength || 0);
    if (def.id === "training-grounds" && !haveTG) s += 5;
    return s - (def.upkeep || 0); // mild aversion to upkeep when poor
  };

  // Location chips into a free slot first.
  const locFits = options
    .filter((o) => o.def.kind === "location" && slotsUsed(state, loc.chips) + (o.def.slots || 1) <= slotCapacity(loc, state))
    .sort((a, b) => score(b.def) - score(a.def));
  if (locFits.length) {
    return performAction(state, "build", { at: loc.hexId, chipId: locFits[0].chipId }).ok;
  }

  // Otherwise arm a stationed friendly unit with a strength chip.
  const unitFits = options
    .filter((o) => o.def.kind === "unit" && stationedUnitWithBay(state, loc, o.def.slots || 1))
    .sort((a, b) => score(b.def) - score(a.def));
  if (unitFits.length) {
    return performAction(state, "build", { at: loc.hexId, chipId: unitFits[0].chipId }).ok;
  }
  return false;
}

function tryRecruit(state, pid) {
  const player = state.players[pid];
  if (player.resource < CONFIG.unitRecruitCost) return false;
  for (const loc of Object.values(state.locations)) {
    if (loc.controller !== pid) continue;
    const hasTG = loc.chips.some((c) => state.chips[c]?.chipId === "training-grounds");
    if (!hasTG) continue;
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
