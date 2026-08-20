// §18.4–§18.13 Diplomacy — the political layer. One valuation engine drives
// the AI's answers, its proactive offers, AND AI-to-AI politics; the verbs
// (war/peace/pacts/denounce/mediate/vassalize) are state operations on top.
// Menace/Honor are global player reputations; Tolerance and the trust floor
// are DERIVED gates (never stored). Standing is pairwise (standing.js).
//
// Reuses: §15 factionStanding, §15.5 private-encounter delivery (proposals
// arrive as encounters), Fog vision/mapData (intel deal items). No dice —
// the AI-to-AI engine is deterministic thresholds, so it never perturbs the
// contest RNG stream.
import { CONFIG } from "./config.js";
import { FACTIONS, MINOR_FACTIONS, factionDef, LOCATIONS, CHIPS } from "./content.js";
import { emit, registerEventHook } from "./events.js";
import { getStanding, adjustStanding, setStanding, standingTier } from "./standing.js";
import { bfsDistances, reinforcementRoute } from "./board.js";
import { holdsLocation } from "./control.js";
import {
  revealRegion, applySharedVision, recomputeVisibilityFor, isUnitVisibleTo,
} from "./visibility.js";
import { recomputeResearch } from "./stats.js";
import { recomputeVp } from "./victory.js";

// --- state ----------------------------------------------------------
export function ensureDiplomacy(state) {
  if (!state.diplomacy) {
    state.diplomacy = {
      agreements: [], // live deals + typed agreements (see §6.2 for the type tag)
      pacts: [], // { a, b } unordered alliances
      wars: [], // { a, b, since, unitsLost, locationsLost, contestsWon } war-states
      coalitions: [], // { target, members:[] } against a player
      vassals: {}, // vassalFid -> lordId
      resentment: {}, // vassalFid -> number
      threatScores: {}, // pid -> number
      recognition: {}, // pid -> number (cached)
      giftCounter: {}, // §1.2 — { fromPid: { toPid: gifts-in-window } }
      pendingCalls: [], // AI→human pact-call inbox: { id, from, target, since, expiresOnRound }
      standingBaselines: {}, // earned drift targets: { a: { b: -cap..+cap } }
      recognizedEver: {}, // summit VP bookkeeping: { pid: [fids that ever backed pid] }
    };
  }
  if (!state.diplomacy.giftCounter) state.diplomacy.giftCounter = {};
  if (!state.diplomacy.pendingCalls) state.diplomacy.pendingCalls = [];
  if (!state.diplomacy.standingBaselines) state.diplomacy.standingBaselines = {};
  if (!state.diplomacy.recognizedEver) state.diplomacy.recognizedEver = {};
  if (!state.diplomacy.truces) state.diplomacy.truces = {};
  if (!state.diplomacy.pendingWarnings) state.diplomacy.pendingWarnings = [];
  for (const p of Object.values(state.players)) {
    if (p.menace == null) p.menace = 0;
    if (p.honor == null) p.honor = CONFIG.diplomacy.honor.start;
  }
  installDiplomacyListeners(state);
  return state.diplomacy;
}

// §6.2 state-maintenance listeners — keep the war records honest by reacting
// to combat events on the bus. Registered ONCE (a guard on the diplomacy
// object), so repeated ensureDiplomacy calls don't stack handlers.
function installDiplomacyListeners(state) {
  if (state.diplomacy._listenersInstalled) return;
  state.diplomacy._listenersInstalled = true;

  // A destroyed unit counts as a loss for its owner in the war it was fighting.
  registerEventHook(state, "unit_destroyed", (st, p) => {
    const victim = p.owner;
    const killerOwner = p.killer ? st.units[p.killer]?.owner : null;
    let war = killerOwner ? findWar(st, victim, killerOwner) : null;
    if (!war) war = (st.diplomacy.wars || []).find((w) => w.a === victim || w.b === victim);
    if (war) war.unitsLost[victim] = (war.unitsLost[victim] || 0) + 1;
  });
  // A captured Location counts as a loss for its prior controller.
  registerEventHook(state, "location_captured", (st, p) => {
    const war = findWar(st, p.from, p.controller);
    if (war && p.from) war.locationsLost[p.from] = (war.locationsLost[p.from] || 0) + 1;
  });
  // A won contest credits the winner in the relevant war.
  registerEventHook(state, "contest_won", (st, p) => {
    const winner = p.player;
    const war = (st.diplomacy.wars || []).find((w) => w.a === winner || w.b === winner);
    if (war) war.contestsWon[winner] = (war.contestsWon[winner] || 0) + 1;
  });
  // Open-borders enforcement — a unit ending its move inside another faction's
  // territory pays the trespass penalty (unless open borders / war / own land).
  registerEventHook(state, "unit_moved", (st, p) => onTrespass(st, p));
}

// Open borders is a PERMIT, not a wall: you may always move into a faction's
// territory (so conquest is possible), but moving through its ZoC WITHOUT an
// open-borders agreement is trespassing — the owner's relations toward you
// take a hit, softened when you're already on good terms. Open borders (a
// pact default or a standalone agreement) waives it; an active war makes it
// moot (you're already enemies).
// Does this unit trespass in `owner`'s territory at all? (Shared by the
// move hook and the per-turn presence sweep.)
function unitTrespasses(state, unit, owner, hex) {
  const mover = unit.owner;
  if (!owner || owner === mover) return false;     // neutral ground or your own land
  // Never a trespasser in a place you hold. A besieged city's hex could
  // fall into a neighbour's ZoC and cite its own garrison at home
  // (playtest 2026-08-15) — the ZoC anchor fixes the cause, this is the
  // belt-and-braces guard.
  const loc = state.locations[hex];
  if (loc && holdsLocation(loc, mover)) return false;
  if (atWar(state, mover, owner)) return false;    // already at war — penalty is moot
  if (hasOpenBorders(state, mover, owner)) return false; // permission granted
  // Safe Conduct (chip `safeConduct`): forged papers — no citation.
  if (unit.chips.some((c) => !state.chips[c]?.disabled && CHIPS[state.chips[c]?.chipId]?.safeConduct)) return false;
  // Nobody cites an intrusion nobody noticed. This was the one place ZoC and
  // Vision were fused (rail doc Part 0): a citation fired purely off the
  // destination sitting in a foreign ZoC, so slipping through forest — which
  // conceals precisely so that it hides you — still got you a formal warning
  // from a faction that could not see you.
  //
  // `isUnitVisibleTo` is the same concealment-aware check the rest of the game
  // uses, so cover, stealth chips and Detection all keep the meaning they have
  // everywhere else: cover hides you from an owner without Detection, and
  // Detection sees through it.
  if (!isUnitVisibleTo(state, owner, unit)) return false;
  return true;
}

// One citation per (mover, owner) pair per round, walking a Civ-style
// escalation ladder on Neutral-or-better ground: consecutive rounds of
// presence go warning → −1 → −2/round (leaving for a round resets the
// streak). Distrustful hosts (below Neutral) skip the courtesy and cite
// at the full rate (+Menace) immediately.
function citeTrespass(state, mover, owner, hex) {
  const rec = state.diplomacy.trespassRecord = state.diplomacy.trespassRecord || {};
  const key = `${mover}|${owner}`;
  const r = rec[key];
  if (r && r.lastRound === state.round) return; // already cited this round
  const streak = r && r.lastRound === state.round - 1 ? r.streak + 1 : 1;
  rec[key] = { streak, lastRound: state.round };
  const tr = D().trespass;
  const rel = getStanding(state, owner, mover);
  let standingHit, repHit;
  if (rel >= D().tiers.neutral) {
    const ladder = tr.escalation;
    standingHit = ladder[Math.min(streak - 1, ladder.length - 1)];
    repHit = 0;
  } else {
    standingHit = tr.standingPenalty;
    repHit = tr.reputationPenalty;
  }
  if (standingHit) adjustStanding(state, owner, mover, -standingHit, "trespass");
  if (repHit) adjustMenace(state, mover, repHit, "trespass");
  emit(state, "territory_trespassed", {
    mover, owner, hex, standingHit, repHit, streak, warning: standingHit === 0 && repHit === 0,
  });
}

function onTrespass(state, payload) {
  const unit = state.units[payload.unit];
  if (!unit) return;
  const owner = state.world?.zoc?.[payload.to];
  if (!unitTrespasses(state, unit, owner, payload.to)) return;
  citeTrespass(state, unit.owner, owner, payload.to);
}

// Presence sweep — "the effects get worse if you continue to stay". Called
// from startTurn: any of `pid`'s units still parked in foreign ZoC keeps
// the citation streak alive even though no unit_moved fired this turn.
export function sweepTrespass(state, pid) {
  if (!state.diplomacy) return;
  const zoc = state.world?.zoc || {};
  for (const unit of Object.values(state.units)) {
    if (unit.owner !== pid) continue;
    const owner = zoc[unit.node];
    if (!unitTrespasses(state, unit, owner, unit.node)) continue;
    citeTrespass(state, pid, owner, unit.node);
  }
}

// §6.2 — the active war record between two factions, or null.
export function findWar(state, a, b) {
  return state.diplomacy?.wars.find(
    (w) => (w.a === a && w.b === b) || (w.a === b && w.b === a),
  ) || null;
}

// All faction ids in play (majors + seeded minors are all `players`).
export function factionIds(state) {
  return [...state.turnOrder];
}

// --- relationship queries -------------------------------------------
const D = () => CONFIG.diplomacy;

// --- Standing baselines ----------------------------------------------
// History leaves a mark: drift pulls a↔b Standing toward an EARNED per-pair
// baseline instead of zero. Honored pact calls raise the caller's baseline
// toward the honorer; betrayal (broken pacts/promises, surprise attacks)
// lowers the victim's toward the traitor; long unbroken pacts warm both.
// Capped to ±baseline.cap so no relationship is beyond politics.
export function getBaseline(state, a, b) {
  return state.diplomacy?.standingBaselines?.[a]?.[b] || 0;
}

export function adjustBaseline(state, a, b, delta, cause) {
  if (!a || !b || a === b || !delta) return getBaseline(state, a, b);
  const bl = state.diplomacy.standingBaselines = state.diplomacy.standingBaselines || {};
  bl[a] = bl[a] || {};
  const cap = D().baseline.cap;
  const next = Math.max(-cap, Math.min(cap, (bl[a][b] || 0) + delta));
  if (next === (bl[a][b] || 0)) return next;
  bl[a][b] = next;
  emit(state, "standing_baseline_changed", { faction: a, toward: b, value: next, delta, cause });
  return next;
}

export function arePacted(state, a, b) {
  return state.diplomacy.pacts.some((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a));
}
export function atWar(state, a, b) {
  return state.diplomacy.wars.some((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a));
}
export function vassalLord(state, fid) {
  return state.diplomacy.vassals[fid] || null;
}
export function vassalsOf(state, lord) {
  return Object.keys(state.diplomacy.vassals).filter((v) => state.diplomacy.vassals[v] === lord);
}
export function coalitionAgainst(state, pid) {
  return state.diplomacy.coalitions.find((c) => c.target === pid) || null;
}

// --- derived gates (§18.5) ------------------------------------------
// Tolerance: how much Menace `observer` accepts in `toward` before refusing
// to deepen — rises with the observer's aggression and its Standing toward
// the subject (a deep ally buys latitude a stranger never grants).
export function tolerance(state, observerFid, towardPid) {
  const t = D().tolerance;
  const def = factionDef(observerFid) || {};
  return t.base + getStanding(state, observerFid, towardPid) * t.perStanding + (def.aggression || 0.5) * t.aggressionScale;
}

// Trust floor: the minimum Honor `observer` requires to deepen — a
// high-trust faction demands a cleaner record; liars hit a wall.
export function trustFloor(state, observerFid) {
  const tf = D().trustFloor;
  const def = factionDef(observerFid) || {};
  return tf.base + (def.trust || 0.5) * tf.distrustScale;
}

export function menaceOf(state, pid) { return state.players[pid]?.menace || 0; }
export function honorOf(state, pid) {
  const h = state.players[pid]?.honor;
  return h == null ? CONFIG.diplomacy.honor.start : h;
}

// Reputation gates a relationship can pass (§18.8 hard gates).
export function passesRepGates(state, observerFid, subjectPid) {
  if (!state.players[subjectPid]) return true; // subject is a non-player faction — no Menace/Honor
  return menaceOf(state, subjectPid) <= tolerance(state, observerFid, subjectPid)
    && honorOf(state, subjectPid) >= trustFloor(state, observerFid);
}

// --- just war (grievances + formal denouncement) ---------------------
// Declaring war "the proper way" must not brand you a villain. A war of
// `a` on `b` is JUSTIFIED when a formally denounced b beforehand (declared
// intent the whole board heard) or b wronged a (broken pact/promise,
// surprise attack) inside the grievance window. Fighting a justified war
// generates no Menace for the justified side.
function recordGrievance(state, victim, offender, kind) {
  if (!victim || !offender || victim === offender) return;
  const gr = state.diplomacy.grievances = state.diplomacy.grievances || {};
  gr[victim] = gr[victim] || {};
  gr[victim][offender] = { kind, round: state.round };
}

export function warJustification(state, a, b) {
  const jw = D().justWar;
  const den = state.diplomacy?.denouncements?.[a]?.[b];
  if (den != null && state.round - den <= jw.denounceWindowRounds) return "denounced";
  const gr = state.diplomacy?.grievances?.[a]?.[b];
  if (gr && state.round - gr.round <= jw.grievanceWindowRounds) return gr.kind;
  return null;
}

// Is `pid`'s side of its war with `other` justified? (Reads the war record,
// so justification is judged at declaration time, not retroactively.)
export function warIsJustified(state, pid, other) {
  const war = findWar(state, pid, other);
  return !!war?.justified?.includes(pid);
}

// --- Menace / Honor (§18.5) -----------------------------------------
export function adjustMenace(state, pid, amount, cause) {
  const p = state.players[pid];
  if (!p || !amount) return;
  const m = D().menace;
  p.menace = Math.max(m.min, Math.min(m.max, (p.menace || 0) + amount));
  emit(state, "menace_changed", { player: pid, value: p.menace, delta: amount, cause });
}

export function adjustHonor(state, pid, amount, cause) {
  const p = state.players[pid];
  if (!p || !amount) return;
  const h = D().honor;
  p.honor = Math.max(h.min, Math.min(h.max, honorOf(state, pid) + amount));
  emit(state, "honor_changed", { player: pid, value: p.honor, delta: amount, cause });
}

// §18.5 — Menace swing for an attack, scored relative to the TARGET's
// temperament: bullying a peaceful faction raises it; checking a warlord
// lowers it. Called on contest resolution (contest.js).
export function menaceFromAttack(state, attackerPid, targetFid) {
  if (!state.players[attackerPid]) return;
  // A justified war is fought clean: no Menace for the righteous side.
  if (warIsJustified(state, attackerPid, targetFid)) return;
  const tDef = factionDef(targetFid) || { aggression: 0.5 };
  // Checking a warlord soothes your reputation a LITTLE — clamped at −1 so
  // attacking aggressive factions can't launder a bully's Menace away (the
  // playtest human dropped 5 → 0 Menace purely by attacking Grand Lakers).
  const delta = Math.max(-1, Math.round(D().menace.base * (0.5 - (tDef.aggression ?? 0.5)) * 2));
  if (delta) adjustMenace(state, attackerPid, delta, `attack:${targetFid}`);
}

// --- power / threat (§18.8) -----------------------------------------
export function powerOf(state, fid) {
  const c = D().coalition;
  let territory = 0, strength = 0;
  for (const loc of Object.values(state.locations)) if (loc.controller === fid) territory += 1;
  for (const u of Object.values(state.units)) if (u.owner === fid) strength += u.strength;
  const vp = state.players[fid]?.vp || 0;
  return c.vpWeight * vp + c.territoryWeight * territory + 0.5 * strength;
}

// Lead over the rest of the board (mean of the others).
export function powerLead(state, fid) {
  const others = factionIds(state).filter((f) => f !== fid);
  if (!others.length) return 0;
  const mine = powerOf(state, fid);
  const mean = others.reduce((s, f) => s + powerOf(state, f), 0) / others.length;
  return mine - mean;
}

// §18.8 threat(player) = wM·Menace + wP·max(0, powerLead).
export function threatScore(state, pid) {
  const c = D().coalition;
  return c.wM * menaceOf(state, pid) + c.wP * Math.max(0, powerLead(state, pid));
}

// --- locality (§18.4.1 scope:"local") --------------------------------
function controlledHexes(state, fid) {
  return Object.values(state.locations).filter((l) => l.controller === fid).map((l) => l.hexId);
}

// Two factions are "neighbours" if any of their Locations sit within the
// locality radius. A landless faction falls back to its associatedMajor.
export function areNeighbours(state, a, b) {
  const r = D().ai.localityRadius;
  let ha = controlledHexes(state, a);
  let hb = controlledHexes(state, b);
  if (!ha.length) { const m = factionDef(a)?.associatedMajor; if (m) { if (m === b) return true; ha = controlledHexes(state, m); } }
  if (!hb.length) { const m = factionDef(b)?.associatedMajor; if (m) { if (m === a) return true; hb = controlledHexes(state, m); } }
  if (!ha.length || !hb.length) return false;
  for (const x of ha) {
    const dist = bfsDistances(state.board.adjacency, x);
    for (const y of hb) if ((dist[y] ?? Infinity) <= r) return true;
  }
  return false;
}

// May `a` engage `b` diplomatically/militarily given scope? A local faction
// only engages neighbours; globals engage anyone.
export function mayEngage(state, a, b) {
  const aLocal = factionDef(a)?.scope === "local";
  const bLocal = factionDef(b)?.scope === "local";
  if (aLocal && !areNeighbours(state, a, b)) return false;
  if (bLocal && !areNeighbours(state, a, b)) return false;
  return true;
}

// --- deal valuation (§18.6 / §18.8) ---------------------------------
// Subjective value of one Item to `fid` (positive = good to receive).
// How many rounds a flow runs for. A deal flow always carries a term (the
// builder supplies one and applyDeal stamps a default if it somehow doesn't);
// a flow with no term is engine-made and perpetual — today only vassal
// tribute, which ends when the vassalage does.
export function flowRounds(flow) {
  return flow?.rounds || D().flow.perpetualHorizon;
}

// How long a standing promise binds for, and what that multiplies its worth
// by. Square-rooted so a promise twice as long is worth ~1.4x, not 2x — the
// far end of a long promise is the least believable part of it.
export function promiseRounds(promise) {
  return promise?.rounds || D().flow.defaultRounds;
}
function promiseTermScale(promise) {
  return Math.sqrt(promiseRounds(promise) / D().flow.defaultRounds);
}

// What an alliance itself is worth to `fid` right now — the value of the
// `pact` deal item. A faction that would accept a bare pact offer values it
// highly; one that would refuse still prices it above zero if it likes you,
// so a pact can be the sweetener in a larger deal without being free.
function pactAppetite(state, fid, other) {
  if (!other || arePacted(state, fid, other)) return 0;
  const def = factionDef(fid) || {};
  const social = def.sociability ?? 0.5;
  if (aiAcceptsPact(state, fid, other)) return 5 + social * 4;
  // Below the bar, but not worthless: it is still an alliance being offered.
  if (!mayEngage(state, fid, other) || atWar(state, fid, other)) return 0;
  const shortfall = D().pactStandingReq - getStanding(state, fid, other);
  return Math.max(0, (5 + social * 4) - shortfall);
}

export function valueOfItem(state, fid, item, ctx = {}) {
  if (!item) return 0;
  if (item.resource) return item.resource.amount || 0;
  // A stream is worth its rate times its TERM. This used to be a flat "×3"
  // against a flow that never expired, so 4 scrap a turn forever priced at
  // 12 — buy it once, collect it for the rest of the game.
  if (item.flow) return (item.flow.amountPerTurn || 0) * flowRounds(item.flow);
  if (item.research) return (item.research.amount || 0) * 2;
  if (item.chip) return 4; // generic gear value
  if (item.intel) return item.intel.kind === "mapData" ? 3 : 2;
  if (item.promise) {
    const def = factionDef(fid) || {};
    // A promise with a term is worth more the longer it binds, but not
    // linearly — the far end of a long promise is worth less than the near
    // end, because anything can happen by then. `termScale` is 1.0 at the
    // default term and grows/shrinks with the square root of the ratio.
    const termScale = promiseTermScale(item.promise);
    switch (item.promise.kind) {
      // Enacted on the spot rather than promised, so no term applies.
      case "pact": return pactAppetite(state, fid, ctx.other);
      case "peace": return atWar(state, fid, ctx.other) ? 6 : 1;
      case "openBorders": return 1 + (def.sociability || 0.5) * 2;
      case "joinWar": return wantsDead(state, fid, item.promise.target) ? 5 : 0;
      // Standing promises — these bind for a term and are enforced.
      case "nonAggression": return (2 + (1 - (def.aggression || 0.5)) * 3) * termScale;
      case "dontAlly": return 1 * termScale;
      case "tribute": return 4 * termScale; // receiving tribute is good
      default: return 1;
    }
  }
  return 0;
}

function wantsDead(state, fid, target) {
  return getStanding(state, fid, target) <= D().tiers.wary || atWar(state, fid, target);
}

// Net value of a whole deal to `fid` as the RECEIVER side (get − give) plus
// the relationship bias. Used by both AI answers and AI offer-generation.
export function dealValue(state, fid, deal) {
  const other = deal.proposer === fid ? deal.recipient : deal.proposer;
  const ctx = { other };
  // For `fid`, "get" = the items flowing TO fid, "give" = items FROM fid.
  const iAmProposer = deal.proposer === fid;
  const get = iAmProposer ? deal.get : deal.give;
  const give = iAmProposer ? deal.give : deal.get;
  let v = 0;
  for (const it of get || []) v += valueOfItem(state, fid, it, ctx);
  for (const it of give || []) v -= valueOfItem(state, fid, it, ctx);
  v += getStanding(state, fid, other) * D().ai.relationshipBiasPerStanding;
  return v;
}

// Would `fid` accept `deal`? Net value ≥ 0 AND hard gates (§18.8).
export function wouldAccept(state, fid, deal) {
  const other = deal.proposer === fid ? deal.recipient : deal.proposer;
  // Hard gate: a pact / deep promise needs the proposer past rep gates.
  const hasDeepPromise = [...(deal.give || []), ...(deal.get || [])].some(
    (it) => it.promise && ["pact", "nonAggression", "openBorders", "tribute"].includes(it.promise.kind),
  );
  if (hasDeepPromise && !passesRepGates(state, fid, other)) return false;
  // Hard gate: conflicting agreements — won't ally a sworn enemy's friend.
  for (const it of [...(deal.give || []), ...(deal.get || [])]) {
    if (it.promise?.kind === "joinWar" && arePacted(state, fid, it.promise.target)) return false;
    if (it.promise?.kind === "peace" && vassalLord(state, fid) && atWar(state, vassalLord(state, fid), other)) return false;
  }
  return dealValue(state, fid, deal) >= 0;
}

// Promise kinds that are ACTS, not undertakings: striking the deal performs
// them there and then, so they leave a pact / an open border / a peace behind
// rather than a piece of paper somebody might later dishonour.
const ENACTED_PROMISES = new Set(["pact", "peace", "openBorders", "joinWar"]);

// Perform the enacted half of a struck deal. `from` is the party making the
// promise; `to` is the party it is made to.
function enactPromise(state, from, to, promise, cause) {
  switch (promise.kind) {
    case "pact":
      formPact(state, from, to, cause);
      return;
    case "peace":
      makePeace(state, from, to, cause);
      return;
    case "openBorders":
      // The promiser opens THEIR territory to the other party. One-directional,
      // exactly like the standalone verb — granting is not receiving.
      if (!standaloneOpenBorders(state, from, to)) {
        state.diplomacy.agreements.push({
          id: `ob-${from}-${to}-${state.round}`, type: "open-borders",
          a: from, b: to, since: state.round,
        });
        emit(state, "open_borders_toggled", { agreement: `ob-${from}-${to}`, on: true });
      }
      return;
    case "joinWar":
      // "I will fight X with you" is settled by fighting X, now.
      if (promise.target && !atWar(state, from, promise.target)) {
        declareWar(state, from, promise.target, "deal-joinwar");
      }
      return;
    default:
  }
}

// --- applying a struck deal (§18.6 atomic) --------------------------
export function applyDeal(state, deal, cause = "deal") {
  // transfer each side's items
  transferItems(state, deal.proposer, deal.recipient, deal.give);
  transferItems(state, deal.recipient, deal.proposer, deal.get);
  // …then perform the promises that are acts. Before this, a deal could be
  // struck on "I offer you an alliance and open borders" and leave neither
  // behind: the terms were recorded on an agreement nothing ever read.
  for (const it of deal.give || []) {
    if (it.promise && ENACTED_PROMISES.has(it.promise.kind)) {
      enactPromise(state, deal.proposer, deal.recipient, it.promise, cause);
    }
  }
  for (const it of deal.get || []) {
    if (it.promise && ENACTED_PROMISES.has(it.promise.kind)) {
      enactPromise(state, deal.recipient, deal.proposer, it.promise, cause);
    }
  }
  // register live agreement if it carries flows/promises (§6.2 type tag).
  // Only flows and STANDING promises go on the record. An enacted promise
  // has already happened; keeping it as a live term would let it be
  // "broken" twice, and would make an alliance look like an IOU.
  const promises = [...(deal.give || []), ...(deal.get || [])].filter(
    (it) => it.flow || (it.promise && !ENACTED_PROMISES.has(it.promise.kind)),
  );
  if (promises.length) {
    // Every flow a deal creates is term-limited. A flow that arrived without
    // one takes the default rather than becoming perpetual — the perpetual
    // case is reserved for agreements the engine makes itself (vassal
    // tribute), and a deal must never be able to mint one.
    for (const it of promises) {
      if (it.flow && !it.flow.rounds) it.flow.rounds = D().flow.defaultRounds;
      if (it.promise && !it.promise.rounds) it.promise.rounds = D().flow.defaultRounds;
    }
    const term = Math.max(
      ...promises.map((it) => (it.flow ? it.flow.rounds : promiseRounds(it.promise))),
      0,
    );
    state.diplomacy.agreements.push({
      id: `agr${state.diplomacy.agreements.length + 1}`,
      type: "deal-promise",
      proposer: deal.proposer, recipient: deal.recipient,
      give: deal.give || [], get: deal.get || [], round: state.round,
      // The LAST round this is live, not the first round it isn't:
      // runFlows fires at round-end, after state.round has already advanced,
      // so a deal struck in round R first pays in R+1. Expiring at
      // `R + term` exclusive would pay term−1 times and quietly shortchange
      // whatever the players agreed.
      expiresOnRound: state.round + term,
    });
  }
  // §1.2 — a gift warms Standing with diminishing returns; any other deal
  // warms both ways at the flat rate.
  if (cause === "gift") {
    applyGiftStanding(state, deal);
  } else {
    adjustStanding(state, deal.proposer, deal.recipient, 2, cause);
    adjustStanding(state, deal.recipient, deal.proposer, 2, cause);
  }
  emit(state, "deal_struck", { proposer: deal.proposer, recipient: deal.recipient, cause });
}

// §1.2/§6.9 — gift Standing with sliding-window diminishing returns. The n-th
// gift from→to in the window grants floor(baseGain / (n + 1)); the counter
// increments here and decays −1 each round-end (runDiplomacyRound). A 3-round
// quiet spell fully refreshes the rate.
function applyGiftStanding(state, deal) {
  const fromPid = deal.proposer, toPid = deal.recipient;
  const scrapAmount = (deal.give || []).reduce(
    (s, it) => s + (it.resource?.resource === "scrap" ? (it.resource.amount || 0) : 0), 0,
  );
  const n = state.diplomacy.giftCounter[fromPid]?.[toPid] || 0;
  // Counted scrap is capped — courtship is a campaign of gifts, not one
  // bribe. A gift generous enough to land (≥2 Standing) also warms the
  // BASELINE, so drift stops erasing a patron's generosity (the playtest
  // gift bought +2 Standing and drift ate it within two rounds).
  const counted = Math.min(scrapAmount, D().gift.maxScrapPerGift);
  const baseGain = counted * D().ai.giftStandingPerScrap;
  const actualGain = Math.floor(baseGain / (n + 1));
  if (actualGain) adjustStanding(state, toPid, fromPid, actualGain, "gift");
  if (actualGain >= 2) adjustBaseline(state, toPid, fromPid, D().gift.baselineWarmth, "gift");
  state.diplomacy.giftCounter[fromPid] = state.diplomacy.giftCounter[fromPid] || {};
  state.diplomacy.giftCounter[fromPid][toPid] = n + 1;
}

function transferItems(state, from, to, items) {
  for (const it of items || []) {
    if (it.resource) {
      const fp = state.players[from], tp = state.players[to];
      const amt = Math.min(it.resource.amount || 0, fp?.resource ?? Infinity);
      if (fp) fp.resource = Math.max(0, (fp.resource || 0) - amt);
      if (tp) tp.resource = (tp.resource || 0) + amt;
    } else if (it.research) {
      const tp = state.players[to];
      if (tp) tp.permanentResearch = (tp.permanentResearch || 0) + (it.research.amount || 0);
    } else if (it.intel) {
      // §18.6/§19.9 — intel delivers Fog vision/mapData of the giver's area.
      const giverHexes = [...(state.visibility?.[from]?.explored || [])];
      if (giverHexes.length) revealRegion(state, to, giverHexes);
    }
    // flows + promises are tracked in the live agreement (applied per round)
  }
}

// --- the verbs (§18.7) ----------------------------------------------
export function declareWar(state, a, b, cause = "declared") {
  if (atWar(state, a, b)) return;
  // declaring war on a pacted faction breaks the pact (Honor ding).
  if (arePacted(state, a, b)) breakPact(state, a, b, "war-on-ally");
  // Just-war check at declaration time. A rebellion is always justified
  // for the rebel; otherwise a prior denouncement or a fresh grievance
  // makes the declarer's side righteous (no Menace from fighting it).
  const justified = [];
  if (cause === "rebellion" || warJustification(state, a, b)) justified.push(a);
  if (warJustification(state, b, a)) justified.push(b);
  // §6.2 — war record tracks losses for the §1.5 exhaustion model.
  state.diplomacy.wars.push({ a, b, since: state.round, justified, unitsLost: {}, locationsLost: {}, contestsWon: {} });
  setStanding(state, a, b, D().tiers.hostile, cause);
  setStanding(state, b, a, D().tiers.hostile, cause);
  // Voluntary coalition membership: taking up arms against a faction the
  // board has risen against makes you part of the rising (the human's only
  // road in — coalitions never conscript them).
  const coal = coalitionAgainst(state, b);
  if (coal && a !== coal.target && !coal.members.includes(a)) coal.members.push(a);
  // The declaration itself is an act the board judges. A war you earned the
  // right to costs nothing to open; one you simply wanted marks you before
  // a single shot. (Previously the confirm dialog promised this and nothing
  // charged it, so declaring was free and only fighting was scored.)
  if (!justified.includes(a) && D().menace.declareUnjustified) {
    adjustMenace(state, a, D().menace.declareUnjustified, `declare:${b}`);
  }
  emit(state, "war_declared", { a, b, cause, justified });
}

// A truce between a and b is live (peace is binding for a window), or null.
export function truceBetween(state, a, b) {
  const t = state.diplomacy?.truces?.[truceKey(a, b)];
  if (!t) return null;
  return state.round < t.until ? t : null;
}
const truceKey = (a, b) => [a, b].sort().join("|");

export function makePeace(state, a, b, cause = "peace") {
  const before = state.diplomacy.wars.length;
  state.diplomacy.wars = state.diplomacy.wars.filter(
    (w) => !((w.a === a && w.b === b) || (w.a === b && w.b === a)),
  );
  if (state.diplomacy.wars.length !== before) {
    adjustStanding(state, a, b, 3, cause);
    adjustStanding(state, b, a, 3, cause);
    // Peace is a PROMISE: lift both sides clear of contempt and shut
    // hostilities for a window. Without this, peace left Standing at the
    // Wary line and the AI's combat loop re-declared war the next turn.
    const tc = D().truce;
    if (getStanding(state, a, b) < tc.standingFloor) setStanding(state, a, b, tc.standingFloor, "truce");
    if (getStanding(state, b, a) < tc.standingFloor) setStanding(state, b, a, tc.standingFloor, "truce");
    state.diplomacy.truces = state.diplomacy.truces || {};
    state.diplomacy.truces[truceKey(a, b)] = { a, b, since: state.round, until: state.round + tc.rounds };
    emit(state, "peace_made", { a, b, cause, truceUntil: state.round + tc.rounds });
  }
}

// The typed §6.2 pact agreement (carries visionShare / openBorders), or null.
export function findPactAgreement(state, a, b) {
  return state.diplomacy.agreements.find(
    (agr) => agr.type === "pact" && ((agr.a === a && agr.b === b) || (agr.a === b && agr.b === a)),
  ) || null;
}

// A live `dontAlly` promise by `a` naming `b` — the promise that was
// previously sellable, priceable, and completely unenforced. Returns the
// agreement so a caller can name it when it blocks something.
export function dontAllyPledge(state, a, b) {
  return (state.diplomacy?.agreements || []).find((agr) => {
    if (agr.type !== "deal-promise") return false;
    if (agr.expiresOnRound != null && state.round > agr.expiresOnRound) return false;
    const mine = agr.proposer === a ? agr.give : agr.recipient === a ? agr.get : null;
    return !!mine?.some((it) => it.promise?.kind === "dontAlly" && it.promise.target === b);
  }) || null;
}

export function formPact(state, a, b, cause = "pact") {
  if (arePacted(state, a, b)) return false;
  // Either side may have promised a third party it would not ally this one.
  // Honouring it is the default; breaking it is a deliberate act that runs
  // through breakPromiseIfAny, not something formPact does by accident.
  if (dontAllyPledge(state, a, b) || dontAllyPledge(state, b, a)) return false;
  makePeace(state, a, b, "pact-peace");
  state.diplomacy.pacts.push({ a, b, since: state.round });
  // §1.9/§1.10 — a pact carries a typed agreement with the auto-share defaults
  // (allied vision + open borders), toggled later without dissolving the pact.
  if (!findPactAgreement(state, a, b)) {
    state.diplomacy.agreements.push({
      id: `pact-${a}-${b}-${state.round}`,
      type: "pact", a, b, since: state.round,
      visionShare: D().vision.sharedPactDefault,
      openBorders: D().borders.pactDefault,
    });
  }
  setStanding(state, a, b, Math.max(getStanding(state, a, b), D().tiers.allied), cause);
  setStanding(state, b, a, Math.max(getStanding(state, b, a), D().tiers.allied), cause);
  emit(state, "pact_formed", { a, b, cause });
  applySharedVision(state); // §1.9 — pool visible sets immediately on formation
  return true;
}

export function breakPact(state, a, b, cause = "broken") {
  const before = state.diplomacy.pacts.length;
  state.diplomacy.pacts = state.diplomacy.pacts.filter(
    (p) => !((p.a === a && p.b === b) || (p.a === b && p.b === a)),
  );
  if (state.diplomacy.pacts.length !== before) {
    // tear down the typed pact agreement (vision/borders) along with the pact.
    state.diplomacy.agreements = state.diplomacy.agreements.filter(
      (agr) => !(agr.type === "pact" && ((agr.a === a && agr.b === b) || (agr.a === b && agr.b === a))),
    );
    // breaking your word is the canonical Honor-dinging event (global).
    if (state.players[a]) adjustHonor(state, a, -D().honor.breakLoss, "pact-broken");
    adjustStanding(state, b, a, -6, cause);
    adjustBaseline(state, b, a, -D().baseline.pactBrokenLoss, "pact-broken"); // the victim remembers
    recordGrievance(state, b, a, "pact-broken"); // …and may rightfully answer in kind
    emit(state, "pact_broken", { a, b, cause });
  }
}

// --- §6.7 open-borders contract -------------------------------------
// Does `transitingFid` have passage through `ownerFid`'s territory? True for a
// standalone open-borders agreement, or a pact with openBorders on. THE
// MOVEMENT-BLOCKADE SYSTEM IMPORTS THIS to short-circuit its blockade rule;
// the contract is: any active agreement granting transitingFid passage → true.
export function hasOpenBorders(state, transitingFid, ownerFid) {
  for (const agr of state.diplomacy?.agreements || []) {
    const matches =
      (agr.a === transitingFid && agr.b === ownerFid) ||
      (agr.a === ownerFid && agr.b === transitingFid);
    if (!matches) continue;
    if (agr.type === "open-borders") return true;
    if (agr.type === "pact" && agr.openBorders) return true;
  }
  return false;
}

// Standalone open-borders agreement between a and b (not the pact flag), or null.
function standaloneOpenBorders(state, a, b) {
  return state.diplomacy.agreements.find(
    (agr) => agr.type === "open-borders" && ((agr.a === a && agr.b === b) || (agr.a === b && agr.b === a)),
  ) || null;
}

// --- §1.8 pact-call evaluation --------------------------------------
// Would `ally` honor `caller`'s call into war with `target`? Hard refuses
// first, then a soft score modulated by the ally's aggression dial.
export function evaluatePactCall(state, ally, caller, target) {
  if (arePacted(state, ally, target)) return { honor: false, reason: "pacted with target" };
  if (vassalLord(state, target) === ally) return { honor: false, reason: "target is my vassal" };
  if (!mayEngage(state, ally, target)) return { honor: false, reason: "out of scope" };
  const pc = D().pactCall;
  const hostilityToTarget = -getStanding(state, ally, target); // higher = more hostile
  const loyaltyToCaller = getStanding(state, ally, caller); // higher = more loyal
  const targetPowerRatio = powerOf(state, target) / Math.max(1, powerOf(state, ally));
  let score = hostilityToTarget * pc.hostilityWeight
            + loyaltyToCaller * pc.loyaltyWeight
            - targetPowerRatio * pc.targetPowerWeight;
  // aggression bias is applied AFTER the score sum (§1.8).
  const agg = factionDef(ally)?.aggression ?? 0.5;
  if (agg >= 0.6) score += pc.aggressionScoreBias;
  else if (agg <= 0.4) score -= pc.aggressionScoreBias;
  return { honor: score >= pc.acceptScoreThreshold, score };
}

// --- §1.8 incoming pact-call inbox (AI → human) ---------------------
// The HUMAN can't be auto-evaluated — they decide. So an AI ally calling the
// human into its war does NOT resolve synchronously: it enqueues a pending
// call the player answers via the `respond-pact-call` verb. (AI→AI calls still
// resolve immediately via evaluatePactCall / resolvePactCall.)
function queueHumanPactCalls(state) {
  const human = state.humanFactionId;
  if (!human) return; // headless / all-AI game has no inbox
  const pc = D().pactCall;
  state.diplomacy.pendingCalls = state.diplomacy.pendingCalls || [];
  for (const caller of factionIds(state)) {
    if (caller === human || !arePacted(state, caller, human)) continue; // must be your ally
    // a war the caller is in whose target the human isn't already fighting/allied with
    const war = state.diplomacy.wars.find((w) => {
      const t = w.a === caller ? w.b : w.b === caller ? w.a : null;
      return t && t !== human && !atWar(state, human, t) && !arePacted(state, human, t);
    });
    if (!war) continue;
    const target = war.a === caller ? war.b : war.a;
    if (state.diplomacy.pendingCalls.some((c) => c.from === caller && c.target === target)) continue;
    state.diplomacy.pendingCalls.push({
      id: `call-${caller}-${target}-${state.round}`,
      from: caller, target, since: state.round, expiresOnRound: state.round + pc.callExpiryRounds,
    });
    emit(state, "pact_call_requested", { caller, ally: human, target });
  }
}

// Precursor warnings — the AI telegraphs trouble to the human BEFORE it
// acts, Civ-style, so there's room to maneuver out of the threat:
//  · a faction whose regard for the human has sunk to Wary sends word
//    (the herald flavors it by temperament — a warlord threatens, a
//    pacifist pleads);
//  · the board murmurs when the human's threat score nears the coalition
//    threshold.
// Each warning repeats only after `warnings.cooldownRounds`, and only
// while the condition still holds.
// Why this faction is unhappy — the concrete, checkable grievance behind
// the warning, so the envoy can name it instead of grumbling vaguely.
function warningReason(state, f, human) {
  if (menaceOf(state, human) > tolerance(state, f, human)) return "menace";
  if (honorOf(state, human) < trustFloor(state, f)) return "honor";
  const rec = state.diplomacy.trespassRecord?.[`${human}|${f}`];
  if (rec && state.round - rec.lastRound <= 1) return "trespass";
  if (getBaseline(state, f, human) < 0) return "betrayal";
  return "standing";
}

function queueHumanWarnings(state) {
  const human = state.humanFactionId;
  if (!human) return;
  const w = D().warnings;
  const warned = state.diplomacy.warned = state.diplomacy.warned || {};
  const queue = state.diplomacy.pendingWarnings = state.diplomacy.pendingWarnings || [];
  const due = (key) => warned[key] == null || state.round - warned[key] >= w.cooldownRounds;
  for (const f of factionIds(state)) {
    if (f === human || atWar(state, f, human) || arePacted(state, f, human)) continue;
    const s = getStanding(state, f, human);
    if (s <= D().tiers.wary && s > D().tiers.hostile && due(`war|${f}`)) {
      warned[`war|${f}`] = state.round;
      const reason = warningReason(state, f, human);
      const payload = {
        from: f, to: human, kind: "war", standing: s, reason,
        temperament: factionDef(f)?.temperament || null,
      };
      // The envoy waits at the door: an audience the player answers.
      queue.push({ id: `warn-${f}-${state.round}`, round: state.round, ...payload });
      emit(state, "diplomatic_warning", payload);
    }
  }
  const t = threatScore(state, human);
  if (t >= D().coalition.threshold * w.coalitionFraction
    && !coalitionAgainst(state, human) && due("coalition")) {
    warned.coalition = state.round;
    const payload = { from: null, to: human, kind: "coalition", threat: Math.round(t * 10) / 10 };
    queue.push({ id: `warn-coalition-${state.round}`, round: state.round, ...payload });
    emit(state, "diplomatic_warning", payload);
  }
}

// Drop inbox calls the player let lapse (no penalty — silence isn't a refusal).
function expirePactCalls(state) {
  const calls = state.diplomacy.pendingCalls;
  if (!calls?.length) return;
  state.diplomacy.pendingCalls = calls.filter((c) => state.round <= c.expiresOnRound);
}

// --- §1.5 war exhaustion + peace acceptance --------------------------
// Higher score = more eager for peace (I'm losing, and it's dragging on).
export function warExhaustion(state, fid, opponent) {
  const war = findWar(state, fid, opponent);
  if (!war) return 0;
  const w = D().war;
  const duration = state.round - war.since;
  return duration
    + (war.unitsLost[fid] || 0) * w.unitLossWeight
    + (war.locationsLost[fid] || 0) * w.locationLossWeight
    - (war.unitsLost[opponent] || 0) * 0.5
    - (war.locationsLost[opponent] || 0) * 1.0;
}

// Would `ai` accept `suer`'s peace proposal (war exhaustion + side terms +
// a warmth bonus)? `sideTerms` is a deal object (suer = proposer).
export function aiAcceptsPeace(state, ai, suer, sideTerms) {
  const exhaustion = warExhaustion(state, ai, suer);
  const sideValue = sideTerms ? dealValue(state, ai, sideTerms) : 0;
  const standing = getStanding(state, ai, suer);
  const standingBoost = standing >= D().tiers.neutral ? D().suePeace.standingBoost : 0;
  return (exhaustion + sideValue + standingBoost) >= D().suePeace.acceptThreshold;
}

// --- §1.4 demand tribute --------------------------------------------
// Gate: the demander must outweigh the target by `minPowerRatio`.
export function canDemandTribute(state, demander, target) {
  return powerOf(state, demander) >= powerOf(state, target) * D().demandTribute.minPowerRatio;
}

// Does `target` cave to `demander`'s tribute demand? Power gap vs. the target's
// bravery (aggression), then an affordability check on the demanded items.
export function caveOnDemand(state, target, demander, terms) {
  const dt = D().demandTribute;
  const caveScore = powerOf(state, demander) / Math.max(1, powerOf(state, target))
    - dt.caveBaseRatio
    - (factionDef(target)?.aggression ?? 0.5) * dt.braveryScale;
  if (caveScore < 0) return false;
  const tp = state.players[target];
  for (const it of terms || []) {
    if (it.resource?.resource === "scrap" && (tp?.resource || 0) < (it.resource.amount || 0)) return false;
  }
  return true;
}

// Lower a→b Standing by `n` whole tiers (used by tribute refusal escalation).
function dropStandingTiers(state, a, b, n) {
  const order = ["hostile", "wary", "neutral", "friendly", "allied"];
  const idx = Math.max(0, order.indexOf(standingTier(getStanding(state, a, b))) - n);
  setStanding(state, a, b, Math.min(getStanding(state, a, b), D().tiers[order[idx]]), "tribute-refused");
}

// --- passage and interruption ----------------------------------------
// Both of these used to live in movement.js, but neither is about movement:
// they are the two diplomacy questions the map keeps asking. Keeping them here
// lets diplomacy answer them for itself (trade routes below) without importing
// movement.js, which imports this file. movement.js re-exports both, so every
// mover still finds them where it always did.

// May `a`'s units move freely THROUGH `b`'s units / Locations? True for the
// same faction, an alliance (pact or vassalage either way), or MUTUAL Friendly+
// Standing. Neutral/wary/hostile all block, so a single unit can hold a pass.
export function passesFreely(state, a, b) {
  if (!a || !b || a === b) return true;
  if (arePacted(state, a, b)) return true;
  if (vassalLord(state, a) === b || vassalLord(state, b) === a) return true;
  const need = D().tiers.friendly;
  return getStanding(state, a, b) >= need && getStanding(state, b, a) >= need;
}

// Does something hostile to `ownerId` sit on this hex, cutting a road or rail
// line that runs through it? The rail doc uses one definition of "cut" in four
// places now — rail's line-cut check (§2.1), blockade construction supply
// (§3.1), blockade funding (§3.4) and trading-pact routes — so it is defined
// once, here.
//
// Ground truth today, matching movementBlockers. Part 1 of the rail doc would
// additionally require the blocker to have DETECTED the faction whose line it
// is cutting; that is not built, and this is the single place it would change.
// `parties` is who the line belongs to — one faction for a supply line, two for
// a trading pact's route. A THIRD party cuts it if any party cannot pass them
// freely; the parties themselves never cut their own line, which matters for a
// pact: b's garrison sitting in b's own capital is the far end of the route,
// not an interruption of it.
export function routeCutter(state, parties) {
  const party = new Set([].concat(parties));
  const severs = (fid) =>
    !party.has(fid) && [...party].some((p) => !passesFreely(state, p, fid));
  return (hexId) => {
    for (const u of Object.values(state.units)) {
      if (u.node === hexId && severs(u.owner)) return true;
    }
    const b = state.world?.blockades?.[hexId];
    return !!(b?.done && severs(b.owner));
  };
}

export function supplyCutter(state, ownerId) {
  return routeCutter(state, [ownerId]);
}

// §1.6 — the Standing half of the open-borders gate, exported so the UI can
// grey the verb out with the SAME answer the engine will give instead of
// offering it and then refusing.
//
// Open borders is a two-way agreement, not a grant you hand over, so it needs
// Friendly+ in BOTH directions. Reporting that as "need Friendly+ standing"
// was actively misleading: the drawer only shows their regard for you, so a
// player looking at a Friendly card was told they needed the thing they could
// see they already had. The reason now names the side that is short and the
// numbers, because the failing direction is the one you cannot see.
export function openBordersStanding(state, a, b) {
  const need = D().tiers.friendly;
  const mine = getStanding(state, a, b);
  const theirs = getStanding(state, b, a);
  if (mine >= need && theirs >= need) return { ok: true, mine, theirs, need };
  const short = mine < need
    ? `your regard for them is ${mine >= 0 ? "+" : ""}${mine}`
    : `their regard for you is ${theirs >= 0 ? "+" : ""}${theirs}`;
  return {
    ok: false, mine, theirs, need,
    reason: `open borders runs both ways and needs ${need >= 0 ? "+" : ""}${need} each way — ${short}`,
  };
}

// --- rail doc §2.3 rail access --------------------------------------
// Rail has no owner of its own: the track is pre-collapse, and whoever holds a
// station controls what runs through it. This is the agreement the rail doc
// flagged as "not yet named, specified, or scoped" — running rights over
// somebody else's line.
//
// It is deliberately a LOWER bar than open borders. Open borders is the right
// to march an army across a neighbour's fields; running rights are commerce —
// your freight moves through their yard on their track. Neutral-or-better, one
// direction at a time, and it grants nothing but the rail.
//
// Pacts include it implicitly: allies ride each other's lines without a
// separate negotiation. MOVEMENT IMPORTS THIS (via the re-export in
// movement.js) to widen unitRailEdges, and tradeRouteOpen uses it below.
export function hasRailAccess(state, riderFid, ownerFid) {
  if (riderFid === ownerFid) return true;
  if (arePacted(state, riderFid, ownerFid)) return true;
  for (const agr of state.diplomacy?.agreements || []) {
    if (agr.type !== "rail-access") continue;
    // Directional: `a` granted `b` running rights over a's stations.
    if (agr.a === ownerFid && agr.b === riderFid) return true;
  }
  return false;
}

// The standing gate for granting running rights. One-directional, so unlike
// open borders it only asks about the grantor's regard for the rider.
export function railAccessStanding(state, owner, rider) {
  const need = D().tiers.neutral;
  const mine = getStanding(state, owner, rider);
  if (mine >= need) return { ok: true, mine, need };
  return {
    ok: false, mine, need,
    reason: `running rights need ${need >= 0 ? "+" : ""}${need} regard — yours for them is ${mine >= 0 ? "+" : ""}${mine}`,
  };
}

// The standalone rail-access grant from `owner` to `rider`, or null.
function standaloneRailAccess(state, owner, rider) {
  return state.diplomacy.agreements.find(
    (agr) => agr.type === "rail-access" && agr.a === owner && agr.b === rider,
  ) || null;
}

// May `parties` run freight over this link? Every station on it has to be open
// to at least one of them: unheld track is nobody's to close, your own is
// yours, and anyone else's needs running rights.
export function railLinkOpenTo(state, link, parties) {
  for (const station of [link.a, link.b]) {
    const holder = state.locations[station]?.controller;
    if (!holder) continue;
    if (parties.some((p) => p === holder || hasRailAccess(state, p, holder))) continue;
    return false;
  }
  return true;
}

// --- §1.3 trading pact ----------------------------------------------
// The Capital hex a faction controls (carries the `capital` chip), or null.
function capitalHexOf(state, fid) {
  for (const loc of Object.values(state.locations)) {
    if (loc.controller === fid && (loc.chips || []).some((c) => state.chips[c]?.chipId === "capital")) return loc.hexId;
  }
  return null;
}
// Is there a trade route between two capitals? Two ways to have one, and they
// are genuinely different roads:
//
//   overland   `reinforcementRoute` — a corridor of friendly/neutral ground,
//              which an enemy ZoC can wall off.
//   rail       the pre-collapse trunk line. Rail is generated as a spanning
//              tree over the CAPITALS (board.js assignRails), which makes it
//              literally the trade artery between them — it would be strange
//              for a pact to collapse for want of a footpath while a railway
//              runs between the two cities.
//
// Rail is not free: a line is a real sequence of hexes (rail doc §2.1), so a
// hostile third party parked anywhere along it cuts that link, and a cut can
// isolate a capital even though the track still exists. That is what makes
// railed trade worth attacking rather than a free pass.
//
// `isCut` is injected by the caller so this module stays clear of movement.js.
// `parties` are the two factions the route is for: a link is only usable if
// its stations are open to one of them (rail doc §2.3 running rights).
function railRouteBetween(state, capA, capB, isCut, parties) {
  const links = state.board?.rails;
  if (!links || !links.length) return false;
  const seen = new Set([capA]);
  const queue = [capA];
  while (queue.length) {
    const cur = queue.shift();
    if (cur === capB) return true;
    for (const link of links) {
      const far = link.a === cur ? link.b : link.b === cur ? link.a : null;
      if (far === null || seen.has(far)) continue;
      if (link.path.some((h) => isCut(h))) continue; // this line is severed
      // A third party's stations close the line unless they have granted one
      // of the two running rights. Without this a pact could route its trade
      // through the yards of a faction that wants nothing to do with either.
      if (parties && !railLinkOpenTo(state, link, parties)) continue;
      seen.add(far);
      queue.push(far);
    }
  }
  return false;
}

// The trade route between `a` and `b`, overland or by rail.
function tradeRouteOpen(state, a, b) {
  const capA = capitalHexOf(state, a);
  const capB = capitalHexOf(state, b);
  if (!capA || !capB) return false;
  if (reinforcementRoute(state, a, capB)) return true;
  return railRouteBetween(state, capA, capB, routeCutter(state, [a, b]), [a, b]);
}

function tradingPactBetween(state, a, b) {
  return state.diplomacy.agreements.find(
    (agr) => agr.type === "trading-pact" && ((agr.a === a && agr.b === b) || (agr.a === b && agr.b === a)),
  ) || null;
}
function grantResearchFloor(state, fid, amount) {
  const p = state.players[fid];
  if (p) p.permanentResearch = Math.max(0, (p.permanentResearch || 0) + amount);
}

// Form a Trading Pact between a and b: both need a Capital with a clear
// capital-to-capital route (reusing `reinforcementRoute`), Neutral+ both ways,
// not at war, rep gates clear. Grants +1 permanent Research FLOOR to each.
export function formTradingPact(state, a, b) {
  if (a === b) return { ok: false, reason: "can't trade with yourself" };
  if (atWar(state, a, b)) return { ok: false, reason: "at war with them" };
  if (tradingPactBetween(state, a, b)) return { ok: false, reason: "trading pact already exists" };
  if (getStanding(state, a, b) < D().tiers.neutral || getStanding(state, b, a) < D().tiers.neutral)
    return { ok: false, reason: "standing too low (need Neutral+)" };
  if (!passesRepGates(state, a, b) || !passesRepGates(state, b, a))
    return { ok: false, reason: "reputation gates fail" };
  const capA = capitalHexOf(state, a), capB = capitalHexOf(state, b);
  if (!capA || !capB) return { ok: false, reason: "both parties need a Capital" };
  if (!tradeRouteOpen(state, a, b))
    return { ok: false, reason: "no clear route between capitals — by road or by rail" };
  state.diplomacy.agreements.push({
    id: `trade-${a}-${b}-${state.round}`,
    type: "trading-pact", a, b, partyA: a, partyB: b,
    suspended: false, suspendedRounds: 0, since: state.round,
  });
  const floor = D().tradingPact.permanentResearchOnFormation;
  grantResearchFloor(state, a, floor);
  grantResearchFloor(state, b, floor);
  recomputeResearch(state); // re-band Tech Level off the new Research floor
  adjustStanding(state, a, b, 2, "trading-pact");
  adjustStanding(state, b, a, 2, "trading-pact");
  emit(state, "trading_pact_formed", { partyA: a, partyB: b });
  return { ok: true, partyA: a, partyB: b };
}

// §6.5 step 2 — re-validate every trading pact's route at round-end, drive the
// suspend/resume/dissolve cycle, and pay the per-round scrap while it runs.
function tradingPactRoundCheck(state) {
  const grace = D().tradingPact.suspendGraceRounds;
  const sp = D().tradingPact.scrapPerUpkeep;
  const survivors = [];
  for (const agr of state.diplomacy.agreements) {
    if (agr.type !== "trading-pact") { survivors.push(agr); continue; }
    const clear = tradeRouteOpen(state, agr.a, agr.b);
    if (!clear) {
      if (!agr.suspended) { agr.suspended = true; emit(state, "trading_pact_suspended", { agreement: agr.id, reason: "route-severed" }); }
      agr.suspendedRounds = (agr.suspendedRounds || 0) + 1;
      if (agr.suspendedRounds >= grace) {
        // Force of circumstance — no Honor penalty. Remove the Research floor.
        const floor = D().tradingPact.permanentResearchOnFormation;
        grantResearchFloor(state, agr.a, -floor);
        grantResearchFloor(state, agr.b, -floor);
        recomputeResearch(state);
        emit(state, "trading_pact_dissolved", { agreement: agr.id, reason: "route-severed" });
        continue; // dropped (not a survivor)
      }
    } else {
      if (agr.suspended) { agr.suspended = false; agr.suspendedRounds = 0; emit(state, "trading_pact_resumed", { agreement: agr.id }); }
      // The economic bump: +scrap to each party (engine-paid, not a transfer).
      if (state.players[agr.a]) state.players[agr.a].resource = (state.players[agr.a].resource || 0) + sp;
      if (state.players[agr.b]) state.players[agr.b].resource = (state.players[agr.b].resource || 0) + sp;
    }
    survivors.push(agr);
  }
  state.diplomacy.agreements = survivors;
}

// Voluntarily dissolve a trading pact (UI). After ≥1 full round: no Honor hit,
// Research floor removed both sides. Same round as formation: prevented.
export function dissolveTradingPact(state, a, b, cause = "voluntary") {
  const agr = tradingPactBetween(state, a, b);
  if (!agr) return { ok: false, reason: "no trading pact" };
  if (agr.since === state.round) return { ok: false, reason: "can't cancel the round it formed" };
  const floor = D().tradingPact.permanentResearchOnFormation;
  grantResearchFloor(state, agr.a, -floor);
  grantResearchFloor(state, agr.b, -floor);
  recomputeResearch(state);
  state.diplomacy.agreements = state.diplomacy.agreements.filter((x) => x !== agr);
  emit(state, "trading_pact_dissolved", { agreement: agr.id, reason: cause });
  return { ok: true };
}

// §6.5 step 1 — decay each gift counter by 1 per round-end; emit only on the
// transition to 0 (so a quiet spell refreshes the gain rate without spam).
function giftCounterDecay(state) {
  const gc = state.diplomacy.giftCounter || {};
  for (const from of Object.keys(gc)) {
    for (const to of Object.keys(gc[from])) {
      const v = (gc[from][to] || 0) - 1;
      if (v <= 0) { delete gc[from][to]; emit(state, "gift_counter_decayed", { fromPid: from, toPid: to, value: 0 }); }
      else gc[from][to] = v;
    }
    if (!Object.keys(gc[from]).length) delete gc[from];
  }
}

// §18.7 pact call — `caller` asks `ally` into its war with `target`.
// Honoring commits ally to war + builds the alliance; declining costs
// Standing with caller + a global Honor ding. Returns true if honored.
// (Used by the content-effect path; the AI decision now flows through
// evaluatePactCall when `honored` is left undefined.)
export function resolvePactCall(state, caller, ally, target, honored) {
  if (honored == null) honored = evaluatePactCall(state, ally, caller, target).honor;
  emit(state, "pact_called", { caller, ally, target, honored });
  if (honored) {
    declareWar(state, ally, target, "pact-call");
    adjustStanding(state, caller, ally, 3, "pact-honored");
    adjustBaseline(state, caller, ally, D().baseline.pactHonoredGain, "pact-honored");
    if (state.players[ally]) adjustHonor(state, ally, D().honor.keepGain, "pact-honored");
  } else {
    adjustStanding(state, caller, ally, -5, "pact-declined");
    if (state.players[ally]) adjustHonor(state, ally, -D().honor.breakLoss, "pact-declined");
  }
  return honored;
}

// §18.7 Denounce — shift faction↔faction Standing around the denounced.
// Also the formal FIRST STEP of a just war: a denouncement on record
// justifies a later declaration inside the window (no Menace from it).
// Has `denouncer` already spent a denouncement on `target` too recently to
// spend another? Exported so the UI can grey the verb and say when it clears
// rather than letting the player fire a no-op.
export function denounceCooldown(state, denouncer, target) {
  const at = state.diplomacy?.denouncements?.[denouncer]?.[target];
  if (at == null) return 0;
  const left = D().justWar.denounceCooldownRounds - (state.round - at);
  return left > 0 ? left : 0;
}

export function denounce(state, denouncer, target) {
  // A denouncement on the record already does its work for
  // justWar.denounceWindowRounds; re-stamping it every round was how a
  // permanent pretext against the whole board cost nothing.
  if (denounceCooldown(state, denouncer, target) > 0) return false;
  const dn = state.diplomacy.denouncements = state.diplomacy.denouncements || {};
  dn[denouncer] = dn[denouncer] || {};
  dn[denouncer][target] = state.round;
  // The Honor cost the verb has always claimed and never charged.
  if (state.players[denouncer]) adjustHonor(state, denouncer, -D().honor.denounceLoss, "denounce");
  adjustStanding(state, denouncer, target, -3, "denounce");
  for (const f of factionIds(state)) {
    if (f === denouncer || f === target) continue;
    if (arePacted(state, f, target)) adjustStanding(state, f, denouncer, -2, "denounce-friend");
    else if (atWar(state, f, target) || getStanding(state, f, target) <= D().tiers.wary)
      adjustStanding(state, f, denouncer, +2, "denounce-enemy");
  }
  emit(state, "denounced", { denouncer, target });
  return true;
}

// §18.7 Mediate — broker peace between two OTHER warring factions. A
// mediated pair goes on cooldown: the playtest log shows one faction
// re-mediating the same feud every round, farming +2 Honor and +3
// Standing per cycle while the war it "resolved" reignited on schedule.
export function mediate(state, mediator, a, b) {
  if (!atWar(state, a, b)) return false;
  const md = state.diplomacy.mediations = state.diplomacy.mediations || {};
  const key = [a, b].sort().join("|");
  const cd = D().ai.mediateCooldownRounds;
  if (md[key] != null && state.round - md[key] < cd) return false;
  // both weigh war exhaustion + the mediator's Honor/Standing (deterministic).
  const willing = (f) => honorOf(state, mediator) >= trustFloor(state, f) - 2;
  if (!willing(a) || !willing(b)) return false;
  md[key] = state.round;
  makePeace(state, a, b, "mediated");
  adjustStanding(state, a, mediator, 3, "mediator");
  adjustStanding(state, b, mediator, 3, "mediator");
  if (state.players[mediator]) adjustHonor(state, mediator, D().honor.mediateGain, "mediator");
  emit(state, "mediated", { mediator, a, b });
  return true;
}

// §18.9 Vassalize — subordinate `vassal` to `lord` (a formal sub-state).
export function vassalize(state, lord, vassal, cause = "vassalized") {
  if (vassalLord(state, vassal) === lord) return false;
  // a vassal cannot keep a pact with the lord's enemies
  state.diplomacy.vassals[vassal] = lord;
  state.diplomacy.resentment[vassal] = 0;
  makePeace(state, lord, vassal, "vassal-peace");
  if (!arePacted(state, lord, vassal)) state.diplomacy.pacts.push({ a: lord, b: vassal, since: state.round, vassal: true });
  setStanding(state, vassal, lord, D().standingMax, cause); // locked high
  setStanding(state, lord, vassal, Math.max(getStanding(state, lord, vassal), D().tiers.friendly), cause);
  // register the tribute flow
  state.diplomacy.agreements.push({
    id: `vassal-${vassal}`, type: "tribute-flow", proposer: vassal, recipient: lord, vassalTribute: vassal,
    give: [{ flow: { resource: "scrap", amountPerTurn: D().vassal.tributeScrap } }], get: [], round: state.round,
  });
  emit(state, "vassal_established", { lord, vassal, cause });
  return true;
}

export function releaseVassal(state, vassal, cause = "released") {
  const lord = vassalLord(state, vassal);
  if (!lord) return;
  delete state.diplomacy.vassals[vassal];
  delete state.diplomacy.resentment[vassal];
  state.diplomacy.pacts = state.diplomacy.pacts.filter((p) => !(p.vassal && ((p.a === lord && p.b === vassal) || (p.a === vassal && p.b === lord))));
  state.diplomacy.agreements = state.diplomacy.agreements.filter((a) => a.vassalTribute !== vassal);
  // A rebellion means something: the rebel won't re-submit to this lord for
  // a while (the playtest log shows a vassal rebelling and being re-taken by
  // the same lord IN THE SAME ROUND — a revolving door, not a rising).
  if (cause === "rebellion") {
    state.diplomacy.rebellions = state.diplomacy.rebellions || {};
    state.diplomacy.rebellions[vassal] = { lord, round: state.round };
  }
  emit(state, "vassal_rebelled", { lord, vassal, cause });
}

// Break a tracked promise of one of `kinds` between a→b, if present:
// remove the agreement, ding the breaker's Honor, crash Standing.
function breakPromiseIfAny(state, a, b, kinds) {
  let broke = false;
  state.diplomacy.agreements = state.diplomacy.agreements.filter((agr) => {
    const pair = (agr.proposer === a && agr.recipient === b) || (agr.proposer === b && agr.recipient === a);
    if (!pair) return true;
    const hit = [...(agr.give || []), ...(agr.get || [])].some((it) => it.promise && kinds.includes(it.promise.kind));
    if (hit) { broke = true; return false; }
    return true;
  });
  if (broke) {
    if (state.players[a]) adjustHonor(state, a, -D().honor.breakLoss, "promise-broken");
    adjustStanding(state, b, a, -6, "promise-broken");
    adjustBaseline(state, b, a, -D().baseline.pactBrokenLoss, "promise-broken");
    recordGrievance(state, b, a, "promise-broken");
  }
  return broke;
}

// §18.5/§18.7 — combat feeds the political layer. On any attack, the
// attacker takes a Menace swing scored vs the target's temperament; an
// attack on an ally or non-aggression partner breaks that word (Honor ding);
// and an attack that isn't already a war establishes the war-state.
export function onAttack(state, attackerPid, targetFid) {
  if (!targetFid || attackerPid === targetFid) return;
  ensureDiplomacy(state);
  // Striking through a live truce is treachery on top of everything else:
  // the truce dies, the breaker's Honor and Menace pay for it, and the
  // victim earns a grievance (their answering war will be justified).
  const truce = truceBetween(state, attackerPid, targetFid);
  if (truce) {
    delete state.diplomacy.truces[truceKey(attackerPid, targetFid)];
    const tc = D().truce;
    if (state.players[attackerPid]) adjustHonor(state, attackerPid, -tc.breakHonorLoss, "truce-broken");
    adjustMenace(state, attackerPid, tc.breakMenace, "truce-broken");
    recordGrievance(state, targetFid, attackerPid, "truce-broken");
    emit(state, "truce_broken", { breaker: attackerPid, victim: targetFid });
  }
  // §1.1/§6.8 — a "treacherous strike": attacking before any war exists costs
  // a steep Honor toll, ONCE per war-initiation (this check must run before
  // declareWar below establishes the war record). Stacks with any pact-break.
  const wasAtWar = atWar(state, attackerPid, targetFid);
  if (!wasAtWar && state.players[attackerPid]) {
    state.players[attackerPid].honor = Math.max(
      D().honor.min,
      honorOf(state, attackerPid) - D().honor.surpriseAttackLoss,
    );
    emit(state, "surprise_attack_honor_lost", {
      attacker: attackerPid, target: targetFid, amount: D().honor.surpriseAttackLoss,
    });
    adjustBaseline(state, targetFid, attackerPid, -D().baseline.surpriseAttackLoss, "surprise-attack");
    recordGrievance(state, targetFid, attackerPid, "surprise-attack");
  }
  if (arePacted(state, attackerPid, targetFid)) breakPact(state, attackerPid, targetFid, "attacked-ally");
  breakPromiseIfAny(state, attackerPid, targetFid, ["nonAggression", "peace"]);
  if (!atWar(state, attackerPid, targetFid)) declareWar(state, attackerPid, targetFid, "attack");
  menaceFromAttack(state, attackerPid, targetFid);
}

// --- Recognition victory (§18.10) -----------------------------------
// Recognition weight a faction lends `pid`: Vassal=2, Allied=1, but 0 if it
// is in a coalition against pid. Gated by Menace<Tolerance & Honor>floor.
export function recognitionScore(state, pid) {
  const rc = D().recognition;
  const coal = coalitionAgainst(state, pid);
  let total = 0;
  const contributors = [];
  for (const f of factionIds(state)) {
    if (f === pid) continue;
    if (coal && coal.members.includes(f)) continue; // contributes nothing
    if (!passesRepGates(state, f, pid)) continue; // Menace/Honor gate
    if (vassalLord(state, f) === pid) { total += rc.vassalWeight; contributors.push(f); }
    else if (arePacted(state, f, pid) && standingTier(getStanding(state, f, pid)) === "allied") {
      total += rc.alliedWeight; contributors.push(f);
    }
  }
  return { total, contributors };
}

export function recognitionMet(state, pid) {
  if (!state.players[pid]) return false;
  return recognitionScore(state, pid).total >= D().recognition.threshold;
}

// Win-condition gate — sets winnerId on a met Recognition (parallel to the
// VP-12 path). Called from the round-end pipeline + after deals/vassalage.
// Also pays the SUMMIT dividend: the first time each faction EVER backs a
// major, that major banks summitVp — so diplomacy feeds the same VP race
// conquest does instead of being all-or-nothing at the threshold. Once per
// backer per game (kept in recognizedEver; losing and re-winning a backer
// doesn't pay twice). The VP winner check is inline — turn.js imports this
// module, so awardVp can't be imported here without a cycle.
export function checkRecognitionVictory(state) {
  if (state.winnerId) return;
  // Recognition can be switched off at setup. The score still moves and the
  // Hall of Powers still shows the path — it just no longer ends the game,
  // and the summit VP below keeps paying, since that is scoring rather than
  // winning.
  const recognitionWins = state.rules?.victory?.recognition !== false;
  const rc = D().recognition;
  for (const pid of factionIds(state)) {
    const sc = recognitionScore(state, pid);
    if (state.diplomacy.recognition[pid] !== sc.total) {
      state.diplomacy.recognition[pid] = sc.total;
      emit(state, "recognition_changed", { player: pid, value: sc.total, contributors: sc.contributors });
    }
    const p = state.players[pid];
    if (rc.summitVp && p && factionDef(pid)?.tier === "major") {
      const ever = state.diplomacy.recognizedEver[pid] = state.diplomacy.recognizedEver[pid] || [];
      for (const backer of sc.contributors) {
        if (ever.includes(backer)) continue;
        ever.push(backer);
        // Banked, not held — a summit you were granted stays granted.
        p.bankedVp = (p.bankedVp || 0) + rc.summitVp;
        emit(state, "recognition_summit", { player: pid, backer, vp: rc.summitVp });
        recomputeVp(state);
        if (state.winnerId) return;
      }
    }
    if (recognitionWins && sc.total >= rc.threshold) { state.winnerId = pid; return; }
  }
}

// --- coalitions (§18.8) ---------------------------------------------
// Playtest lesson (R7 of the 2026-08-13 log): a coalition must never
// CONSCRIPT — the old version drafted the human (declared war on their
// behalf) and force-pacted every member at Allied 8, which minted free
// summit VP and left a permanent alliance web after the threat passed.
// Now: the human is never auto-enrolled (they can JOIN by declaring war
// on the target — see declareWar), members make peace and warm slightly
// ("common cause") but form NO pacts, and a faction already targeted by
// a coalition can't be drafted into another.
function recomputeCoalitions(state) {
  const c = D().coalition;
  for (const pid of factionIds(state)) {
    const score = threatScore(state, pid);
    state.diplomacy.threatScores[pid] = score;
    const existing = coalitionAgainst(state, pid);
    const cooling = state.diplomacy.coalitionCooldown?.[pid];
    const onCooldown = cooling != null && state.round - cooling < c.reformCooldownRounds;
    if (score >= c.threshold && !existing && !onCooldown) {
      const members = factionIds(state).filter((f) =>
        f !== pid
        && f !== state.humanFactionId // never conscript the player
        && vassalLord(state, f) !== pid && !arePacted(state, f, pid)
        && !truceBetween(state, f, pid) // a faction under truce keeps its word
        && !coalitionAgainst(state, f) // a hunted faction can't be drafted
        && mayEngage(state, f, pid));
      if (members.length >= 2) {
        state.diplomacy.coalitions.push({ target: pid, members, since: state.round });
        for (const m of members) {
          adjustStanding(state, m, pid, -c.standingHit, "coalition");
          declareWar(state, m, pid, "coalition");
          // members bury their quarrels for the duration — no pacts minted
          for (const n of members) {
            if (n === m) continue;
            if (atWar(state, m, n)) makePeace(state, m, n, "common-cause");
            adjustStanding(state, m, n, 1, "common-cause");
          }
        }
        emit(state, "coalition_formed", { target: pid, members });
      }
    } else if (existing && score <= c.dissolve
      && state.round - (existing.since ?? state.round) >= c.minRounds) {
      state.diplomacy.coalitions = state.diplomacy.coalitions.filter((x) => x !== existing);
      for (const m of existing.members) makePeace(state, m, pid, "coalition-dissolved");
      state.diplomacy.coalitionCooldown = state.diplomacy.coalitionCooldown || {};
      state.diplomacy.coalitionCooldown[pid] = state.round;
      emit(state, "coalition_dissolved", { target: pid });
    }
  }
}

// --- vassal tick (§18.9) --------------------------------------------
function vassalTick(state) {
  const v = D().vassal;
  for (const vassal of Object.keys(state.diplomacy.vassals)) {
    const lord = state.diplomacy.vassals[vassal];
    // tribute flow
    const lp = state.players[lord], vp = state.players[vassal];
    if (vp && lp) {
      const paid = Math.min(v.tributeScrap, vp.resource || 0);
      if (paid > 0) { vp.resource -= paid; lp.resource = (lp.resource || 0) + paid; emit(state, "tribute_paid", { lord, vassal, amount: paid }); }
    }
    // resentment: base + lord weakness (lord weaker than vassal raises it)
    const ratio = powerOf(state, lord) / Math.max(1, powerOf(state, vassal));
    let dr = v.resentmentPerRound + (ratio < 1 ? v.lordWeaknessScale : 0);
    // lord's Honor abuse raises resentment
    if (state.players[lord] && honorOf(state, lord) < 0) dr += 1;
    state.diplomacy.resentment[vassal] = (state.diplomacy.resentment[vassal] || 0) + dr;
    if (state.diplomacy.resentment[vassal] >= v.rebellionThreshold) {
      releaseVassal(state, vassal, "rebellion");
      declareWar(state, vassal, lord, "rebellion");
      // a freed vassal may immediately join a coalition against its old lord
    }
  }
}

// --- Standing drift (§18.5) -----------------------------------------
// Unreinforced Standing fades toward the pair's earned BASELINE (not zero):
// a betrayed faction settles back into distrust; a proven ally stays warm
// enough that one quiet stretch doesn't reset the relationship.
function driftStanding(state) {
  const d = D();
  for (const a of factionIds(state)) {
    for (const b of factionIds(state)) {
      if (a === b) continue;
      if (vassalLord(state, a) === b) continue; // vassal standing locked
      if (arePacted(state, a, b) || atWar(state, a, b)) continue; // active relations don't fade
      const cur = getStanding(state, a, b);
      const target = getBaseline(state, a, b);
      if (cur === target) continue;
      const grudge = factionDef(a)?.grudge ?? 0.4;
      const step = Math.max(1, Math.round(d.driftPerRound * (1 - grudge * d.grudgeDriftScale * 0.5)));
      if (cur > target) setStanding(state, a, b, Math.max(target, cur - step), "drift");
      else setStanding(state, a, b, Math.min(target, cur + step), "drift");
    }
  }
}

// A pact that survives `tenureRounds` full rounds warms BOTH parties'
// baselines — old alliances don't fade back to strangers.
function pactTenureBaselines(state) {
  const bl = D().baseline;
  if (!bl.tenureRounds || !bl.tenureGain) return;
  for (const p of state.diplomacy.pacts) {
    const age = state.round - (p.since ?? state.round);
    if (age > 0 && age % bl.tenureRounds === 0) {
      adjustBaseline(state, p.a, p.b, bl.tenureGain, "pact-tenure");
      adjustBaseline(state, p.b, p.a, bl.tenureGain, "pact-tenure");
    }
  }
}

// Guest House (chip `standingDrift`): hospitality works against the §18.5
// fade — every faction the host is NOT at war with warms toward the host
// each round, capped at the Friendly tier (goodwill opens doors; it does
// not mint alliances on its own). Runs after driftStanding so the welcome
// outpaces the fade.
function guestHouseDrift(state) {
  const cap = CONFIG.diplomacy.tiers.friendly;
  for (const loc of Object.values(state.locations)) {
    if (!loc.controller) continue;
    let warmth = 0;
    for (const c of loc.chips) {
      if (state.chips[c]?.disabled) continue;
      warmth += CHIPS[state.chips[c]?.chipId]?.standingDrift || 0;
    }
    if (warmth <= 0) continue;
    const host = loc.controller;
    for (const other of factionIds(state)) {
      if (other === host || atWar(state, other, host)) continue;
      const cur = getStanding(state, other, host);
      if (cur >= cap) continue;
      setStanding(state, other, host, Math.min(cap, cur + warmth), "guest-house");
    }
  }
}

// --- AI-to-AI politics (§18.8) --------------------------------------
// Deterministic threshold machinery — factions form pacts with compatible,
// high-Standing neighbours, declare war on low-Standing ones per aggression,
// and a peacemaker mediates. Writes faction↔faction Standing + agreements.
function runAIPolitics(state) {
  const d = D();
  const ids = factionIds(state);
  for (const a of ids) {
    const aDef = factionDef(a) || {};
    const human = state.humanFactionId;
    for (const b of ids) {
      if (a === b || b === human) continue; // AI-to-AI only (human acts via the screen)
      if (a === human) continue;
      if (!mayEngage(state, a, b)) continue;
      if (vassalLord(state, a) === b || vassalLord(state, b) === a) continue;
      const s = getStanding(state, a, b);
      // form a pact: high mutual Standing + sociability + rep gates + compat
      if (!arePacted(state, a, b) && !atWar(state, a, b)
        && s >= d.pactStandingReq && getStanding(state, b, a) >= d.pactStandingReq
        && (aDef.sociability ?? 0.5) >= 0.4
        && passesRepGates(state, a, b) && passesRepGates(state, b, a)) {
        formPact(state, a, b, "ai-pact");
        continue;
      }
      // declare war: low Standing + aggression, and not already at war/pact
      // — and never through a live truce (peace holds for its window).
      if (!atWar(state, a, b) && !arePacted(state, a, b) && !truceBetween(state, a, b)
        && s <= d.ai.warGrudgeThreshold && (aDef.aggression ?? 0.5) >= 0.6) {
        declareWar(state, a, b, "ai-grudge");
        continue;
      }
    }
  }
  // a high-Honor, sociable faction tries to mediate one war it's outside of
  for (const m of ids) {
    if (m === state.humanFactionId) continue;
    const mDef = factionDef(m) || {};
    if ((mDef.sociability ?? 0) < 0.7 || honorOf(state, m) < 0) continue;
    const war = state.diplomacy.wars.find((w) => w.a !== m && w.b !== m && mayEngage(state, m, w.a) && mayEngage(state, m, w.b));
    if (war) mediate(state, m, war.a, war.b);
  }
}

// --- agreement upkeep: flows (trade routes / tribute) ----------------
function runFlows(state) {
  const expired = [];
  for (const agr of state.diplomacy.agreements) {
    if (agr.vassalTribute) continue; // tribute handled in vassalTick
    if (agr.expiresOnRound != null && state.round > agr.expiresOnRound) { expired.push(agr); continue; }
    for (const it of agr.give || []) applyFlow(state, agr.proposer, agr.recipient, it);
    for (const it of agr.get || []) applyFlow(state, agr.recipient, agr.proposer, it);
  }
  // An agreement that ran its full term was HONORED — the parties kept their
  // word to the end, which is exactly what Honor is for. That also gives the
  // stat a source other than punishment for the first time.
  for (const agr of expired) {
    state.diplomacy.agreements = state.diplomacy.agreements.filter((x) => x !== agr);
    for (const side of [agr.proposer, agr.recipient]) {
      if (state.players[side]) adjustHonor(state, side, D().honor.keepGain, "agreement-kept");
    }
    emit(state, "agreement_expired", { agreement: agr.id, proposer: agr.proposer, recipient: agr.recipient });
  }
}
function applyFlow(state, from, to, item) {
  if (!item.flow) return;
  const fp = state.players[from], tp = state.players[to];
  if (item.flow.resource === "scrap" && fp && tp) {
    const amt = Math.min(item.flow.amountPerTurn || 0, fp.resource || 0);
    fp.resource -= amt; tp.resource = (tp.resource || 0) + amt;
  }
}

// --- the round cadence (§18.12) -------------------------------------
// Runs once per round in the §15.12 rollover: decay Menace, drift Standing,
// pay flows, AI-to-AI politics, vassal tick, coalitions, then Recognition.
export function runDiplomacyRound(state) {
  ensureDiplomacy(state);
  // Menace decays with clean play / time.
  for (const pid of factionIds(state)) {
    if (state.players[pid]?.menace > 0) adjustMenace(state, pid, -D().menace.decayPerRound, "decay");
    if (D().honor.decayPerRound) {
      const h = honorOf(state, pid), tgt = D().honor.decayToward;
      if (h !== tgt) adjustHonor(state, pid, Math.sign(tgt - h) * D().honor.decayPerRound, "decay");
    }
  }
  pactTenureBaselines(state); // warm long-alliance baselines before the fade
  driftStanding(state);
  guestHouseDrift(state);
  runFlows(state);
  // diplomacy-spec.md §6.5 — gift-counter decay + trading-pact route check run
  // BEFORE the AI-to-AI politics step.
  giftCounterDecay(state);
  tradingPactRoundCheck(state);
  expirePactCalls(state);     // §1.8 — drop lapsed inbox calls
  queueHumanPactCalls(state); // §1.8 — AI allies call the human into their wars
  runAIPolitics(state);
  vassalTick(state);
  recomputeCoalitions(state);
  queueHumanWarnings(state); // after politics/coalitions — warn on settled state
  checkRecognitionVictory(state);
}

// --- seeding (§18.4.1 alliance variety) -----------------------------
// Default faction↔faction Standing = temperament compatibility +
// relationship type + a PER-SEED jitter, so alliances vary by game. Uses an
// ISOLATED rng (passed in) so the main contest stream is untouched. Local
// minors only seed standing with neighbours. Human rows start neutral.
export function seedStanding(state, rng) {
  const ids = factionIds(state);
  const human = state.humanFactionId;
  for (const a of ids) {
    if (a === human) continue;
    const aDef = factionDef(a) || {};
    for (const b of ids) {
      if (a === b || b === human) continue;
      const bDef = factionDef(b) || {};
      if (aDef.scope === "local" && !areNeighbours(state, a, b)) continue;
      // temperament compatibility: closer aggression/sociability → warmer
      const aggGap = Math.abs((aDef.aggression ?? 0.5) - (bDef.aggression ?? 0.5));
      let base = Math.round((0.4 - aggGap) * 6); // -? .. +2.4
      // relationship of a minor toward its associated major
      if (aDef.associatedMajor === b) {
        base += aDef.relationship === "kin" ? 5 : aDef.relationship === "rival" ? -6 : -2; // foil → wary
      }
      const jitter = rng ? rng.range(-D().seedJitter, D().seedJitter) : 0;
      setStanding(state, a, b, base + jitter, "seed");
    }
  }
}

// --- player / UI entry point (§18.7 verbs) --------------------------
// Single entry the Diplomacy screen calls (and which the AI's valuation
// answers). Diplomatic verbs are free of the Action budget — the cost is
// the scrap/Standing/Honor they move, not an Action. Returns {ok,...}.
export function performDiplomacy(state, pid, action, params = {}) {
  ensureDiplomacy(state);
  const f = params.faction;
  const r = (extra) => { checkRecognitionVictory(state); return { ok: true, ...extra }; };
  switch (action) {
    case "declare-war":
      declareWar(state, pid, f, "player");
      return r();
    // A bare ceasefire offer: no terms, so nothing sweetens it and the only
    // thing that can carry it is how much they want the war over.
    // `sue-for-peace` is the same ask WITH terms attached.
    //
    // This used to call makePeace() outright, with no check of any kind — a
    // warlord one round into a war it was winning ended it because you
    // pressed a button, and peace pays +3 Standing to both sides, so
    // "declare, take, make peace" came out ahead of never declaring.
    case "make-peace": {
      if (!atWar(state, pid, f)) return { ok: false, reason: "not at war with them" };
      if (!aiAcceptsPeace(state, f, pid, null)) {
        return { ok: true, accepted: false, reason: "they fight on" };
      }
      makePeace(state, pid, f, "player-peace");
      return r({ accepted: true });
    }
    case "gift": {
      const amount = Math.min(params.amount || 0, state.players[pid]?.resource || 0);
      if (amount <= 0) return { ok: false, reason: "no scrap to gift" };
      applyDeal(state, { proposer: pid, recipient: f, give: [{ resource: { resource: "scrap", amount } }], get: [] }, "gift");
      return r({ amount });
    }
    case "denounce":
      denounce(state, pid, f);
      return r();
    case "mediate":
      return mediate(state, pid, params.a, params.b) ? r() : { ok: false, reason: "they refuse mediation" };
    case "propose-pact": {
      if (!aiAcceptsPact(state, f, pid)) return { ok: true, accepted: false, reason: "they decline the pact" };
      formPact(state, pid, f, "player-pact");
      return r({ accepted: true });
    }
    case "propose-deal": {
      const deal = { proposer: pid, recipient: f, give: params.give || [], get: params.get || [] };
      if (!wouldAccept(state, f, deal)) return { ok: true, accepted: false, reason: "they decline the deal" };
      applyDeal(state, deal, "player-deal");
      return r({ accepted: true });
    }
    case "vassalize": {
      if (!aiAcceptsVassalage(state, f, pid)) return { ok: true, accepted: false, reason: "they refuse to submit" };
      vassalize(state, pid, f, "player-vassalize");
      return r({ accepted: true });
    }

    // §1.5 — sue for peace (deal-evaluated). Side terms are an optional give/get.
    case "sue-for-peace": {
      if (!atWar(state, pid, f)) return { ok: false, reason: "not at war with them" };
      const side = { proposer: pid, recipient: f, give: params.give || [], get: params.get || [] };
      if (!aiAcceptsPeace(state, f, pid, side)) return { ok: true, accepted: false, reason: "they fight on" };
      if ((side.give.length || side.get.length)) applyDeal(state, side, "sue-for-peace");
      makePeace(state, pid, f, "sue-for-peace");
      return r({ accepted: true });
    }

    // §1.4 — demand tribute. Power-gated; caves or escalates to war.
    case "demand-tribute": {
      if (!canDemandTribute(state, pid, f)) return { ok: false, reason: "not strong enough to coerce them" };
      // The drawer builds a give/get like every other deal pane and sends
      // the demand as `get`; only the engine's own callers use `terms`.
      // Reading `terms` alone meant every demand made from the UI asked for
      // the fallback amount — zero — and "succeeded" moving nothing.
      const terms = params.terms
        || (params.get?.length ? params.get : null)
        || [{ resource: { resource: "scrap", amount: params.amount || 0 } }];
      if (!terms.some((t) => (t.resource?.amount || 0) > 0 || t.chip || t.research || t.intel)) {
        return { ok: false, reason: "name something worth demanding" };
      }
      adjustMenace(state, pid, D().menace.base, "demand-tribute"); // the threat is hostile
      emit(state, "tribute_demanded", { demander: pid, target: f, terms });
      if (caveOnDemand(state, f, pid, terms)) {
        transferItems(state, f, pid, terms); // coerced — no Standing warmth
        emit(state, "tribute_caved", { demander: pid, target: f, terms });
        return r({ accepted: true, caved: true });
      }
      const esc = D().demandTribute.escalateOnRefusal;
      if (esc === "war") declareWar(state, pid, f, "tribute-refused");
      else dropStandingTiers(state, f, pid, D().demandTribute.refuseStandingDropTiers);
      emit(state, "tribute_refused", { demander: pid, target: f, escalation: esc });
      return r({ accepted: false, refused: true });
    }

    // §1.3 — form a Trading Pact (capital-to-capital route + Neutral+).
    case "trading-pact": {
      const res = formTradingPact(state, pid, f);
      return res.ok ? r(res) : res;
    }
    case "dissolve-trading-pact": {
      const res = dissolveTradingPact(state, pid, f, "player");
      return res.ok ? r(res) : res;
    }

    // §1.6 — start/stop a standalone open-borders agreement.
    case "set-open-borders": {
      const on = params.on !== false;
      if (on) {
        if (atWar(state, pid, f)) return { ok: false, reason: "at war with them" };
        const gate = openBordersStanding(state, pid, f);
        if (!gate.ok) return { ok: false, reason: gate.reason };
        if (!passesRepGates(state, pid, f) || !passesRepGates(state, f, pid))
          return { ok: false, reason: "reputation gates fail" };
        if (!standaloneOpenBorders(state, pid, f)) {
          state.diplomacy.agreements.push({ id: `ob-${pid}-${f}-${state.round}`, type: "open-borders", a: pid, b: f, since: state.round });
        }
        emit(state, "open_borders_toggled", { agreement: `ob-${pid}-${f}`, on: true });
        return r({ on: true });
      }
      state.diplomacy.agreements = state.diplomacy.agreements.filter(
        (agr) => !(agr.type === "open-borders" && ((agr.a === pid && agr.b === f) || (agr.a === f && agr.b === pid))),
      );
      emit(state, "open_borders_toggled", { agreement: `ob-${pid}-${f}`, on: false });
      return r({ on: false });
    }

    // Rail doc §2.3 — grant or revoke running rights over YOUR stations.
    // One-directional by design: you decide who rides your line, and that is a
    // different question from whether you may ride theirs. Revoking is free of
    // Standing cost while there is no formal treaty behind it — the offence is
    // in what they do next, not in closing your own yard.
    case "set-rail-access": {
      const on = params.on !== false;
      if (on) {
        if (atWar(state, pid, f)) return { ok: false, reason: "at war with them" };
        const gate = railAccessStanding(state, pid, f);
        if (!gate.ok) return { ok: false, reason: gate.reason };
        if (!passesRepGates(state, pid, f)) return { ok: false, reason: "reputation gates fail" };
        if (!standaloneRailAccess(state, pid, f)) {
          state.diplomacy.agreements.push({
            id: `ra-${pid}-${f}-${state.round}`, type: "rail-access",
            a: pid, b: f, since: state.round,
          });
        }
        emit(state, "rail_access_toggled", { grantor: pid, rider: f, on: true });
        return r({ on: true });
      }
      state.diplomacy.agreements = state.diplomacy.agreements.filter(
        (agr) => !(agr.type === "rail-access" && agr.a === pid && agr.b === f),
      );
      emit(state, "rail_access_toggled", { grantor: pid, rider: f, on: false });
      return r({ on: false });
    }

    // §1.9 — toggle a pact's allied-vision auto-share (Standing cost on off).
    case "toggle-allied-vision": {
      const agr = findPactAgreement(state, pid, f);
      if (!agr) return { ok: false, reason: "no pact with them" };
      const on = params.on !== false;
      agr.visionShare = on;
      adjustStanding(state, pid, f, on ? D().pact.toggleVisionStandingHit : -D().pact.toggleVisionStandingHit, "toggle-vision");
      if (state.visibility) recomputeVisibilityFor(state, [pid, f], { emitEvents: false });
      emit(state, "allied_vision_toggled", { agreement: agr.id, on });
      return r({ on });
    }

    // §1.10 — toggle a pact's open-borders auto-share (Standing cost on off).
    case "toggle-open-borders": {
      const agr = findPactAgreement(state, pid, f);
      if (!agr) return { ok: false, reason: "no pact with them" };
      const on = params.on !== false;
      agr.openBorders = on;
      adjustStanding(state, pid, f, on ? D().pact.toggleBordersStandingHit : -D().pact.toggleBordersStandingHit, "toggle-borders");
      emit(state, "open_borders_toggled", { agreement: agr.id, on });
      return r({ on });
    }

    // §1.8 — player-initiated pact call (ally evaluated via evaluatePactCall).
    case "pact-call": {
      const ally = params.ally, target = params.target;
      if (!arePacted(state, pid, ally)) return { ok: false, reason: "not pacted with that ally" };
      if (!atWar(state, pid, target)) return { ok: false, reason: "you're not at war with the target" };
      emit(state, "pact_call_requested", { caller: pid, ally, target });
      const { honor } = evaluatePactCall(state, ally, pid, target);
      if (honor) {
        declareWar(state, ally, target, "pact-call");
        adjustStanding(state, ally, pid, D().pactCall.honorGainOnHonor, "pact-honored");
        adjustBaseline(state, pid, ally, D().baseline.pactHonoredGain, "pact-honored");
        emit(state, "pact_call_honored", { caller: pid, ally, target });
        return r({ honored: true });
      }
      adjustStanding(state, pid, ally, -D().pactCall.declineStandingHit, "pact-declined");
      if (state.players[ally]) adjustHonor(state, ally, -D().honor.breakLoss, "pact-declined");
      emit(state, "pact_call_declined", { caller: pid, ally, target });
      return r({ honored: false });
    }

    // §1.8 — answer an AI ally's pact call from the inbox (accept / refuse).
    case "respond-pact-call": {
      const call = (state.diplomacy.pendingCalls || []).find((c) => c.id === params.callId);
      if (!call) return { ok: false, reason: "no such pending call" };
      const caller = call.from, target = call.target;
      state.diplomacy.pendingCalls = state.diplomacy.pendingCalls.filter((c) => c !== call);
      if (params.accept) {
        declareWar(state, pid, target, "pact-call");
        adjustStanding(state, pid, caller, D().pactCall.honorGainOnHonor, "pact-honored");
        adjustBaseline(state, caller, pid, D().baseline.pactHonoredGain, "pact-honored");
        emit(state, "pact_call_honored", { caller, ally: pid, target });
        return r({ honored: true });
      }
      adjustStanding(state, caller, pid, -D().pactCall.declineStandingHit, "pact-declined");
      if (state.players[pid]) adjustHonor(state, pid, -D().honor.breakLoss, "pact-declined");
      emit(state, "pact_call_declined", { caller, ally: pid, target });
      return r({ honored: false });
    }

    // Answer an envoy's warning (the Civ-style audience). "hear" costs
    // nothing, "placate" buys goodwill with scrap, "defy" tells them where
    // to put it — honest, and they take it badly.
    case "respond-warning": {
      const queue = state.diplomacy.pendingWarnings || [];
      const wn = queue.find((x) => x.id === params.warningId);
      if (!wn) return { ok: false, reason: "no such warning" };
      state.diplomacy.pendingWarnings = queue.filter((x) => x !== wn);
      const sender = wn.from;
      if (!sender) return r({ answered: params.answer || "hear" }); // board murmur — nothing to answer
      if (params.answer === "placate") {
        const amount = Math.min(params.amount || 0, state.players[pid]?.resource || 0);
        if (amount <= 0) return { ok: false, reason: "no scrap to offer" };
        applyDeal(state, {
          proposer: pid, recipient: sender,
          give: [{ resource: { resource: "scrap", amount } }], get: [],
        }, "gift");
        return r({ answered: "placate", amount });
      }
      if (params.answer === "defy") {
        adjustStanding(state, sender, pid, -D().warnings.defyStandingHit, "defied");
        return r({ answered: "defy" });
      }
      return r({ answered: "hear" });
    }

    // §1.7/§6.10 — voluntarily release a vassal (clemency).
    case "free-vassal": {
      const vassal = f;
      if (vassalLord(state, vassal) !== pid) return { ok: false, reason: "not your vassal" };
      state.diplomacy.agreements = state.diplomacy.agreements.filter((agr) => agr.vassalTribute !== vassal);
      delete state.diplomacy.vassals[vassal];
      delete state.diplomacy.resentment[vassal];
      state.players[pid].honor = Math.min(D().honor.max, honorOf(state, pid) + D().freeVassal.honorGain);
      setStanding(state, vassal, pid, D().freeVassal.standingToFriendly, "freed");
      for (const fid of factionIds(state)) {
        if (fid === pid || fid === vassal) continue;
        if (getStanding(state, fid, vassal) <= D().tiers.wary) {
          adjustStanding(state, fid, pid, -D().freeVassal.rivalCoolingTiers * 3, "freed-clemency");
        }
      }
      emit(state, "vassal_freed", { lord: pid, vassal });
      return r();
    }

    default:
      return { ok: false, reason: `unknown diplomacy action "${action}"` };
  }
}

// Would faction `f` accept a pact from `proposer`? Needs Friendly+ mutual
// Standing, rep gates, no conflicting war, and basic sociability.
export function aiAcceptsPact(state, f, proposer) {
  if (f === proposer || arePacted(state, f, proposer)) return false;
  if (!mayEngage(state, f, proposer)) return false;
  if (getStanding(state, f, proposer) < D().pactStandingReq) return false;
  if (!passesRepGates(state, f, proposer)) return false;
  // won't ally you if you're allied to its sworn enemy
  for (const enemy of factionIds(state)) {
    if (atWar(state, f, enemy) && arePacted(state, proposer, enemy)) return false;
  }
  return (factionDef(f)?.sociability ?? 0.5) >= 0.3;
}

// §18.9 — a faction accepts vassalage when subordination beats its
// alternatives. Two doors in:
//  · Submission — much weaker than the lord AND cornered (at war / very low
//    Standing). The conquest route; the only door for MAJOR factions.
//  · Patronage — a MINOR faction takes a protector it genuinely likes:
//    Friendly+ Standing, the lord is its best friend on the board, and the
//    lord's reputation passes its gates. This is the peaceful road to the
//    vassal weight Recognition needs — courtship, not coercion.
export function aiAcceptsVassalage(state, f, lord) {
  if (f === lord || vassalLord(state, f)) return false;
  if (!mayEngage(state, f, lord)) return false;
  // A recent rebel refuses its old lord until the cooldown clears.
  const reb = state.diplomacy?.rebellions?.[f];
  if (reb && reb.lord === lord && state.round - reb.round < D().vassal.rebellionCooldownRounds) return false;
  const ratio = powerOf(state, f) / Math.max(1, powerOf(state, lord));
  if (ratio > D().ai.vassalPowerRatio) return false;
  const cornered = atWar(state, lord, f) || getStanding(state, f, lord) <= D().tiers.wary;
  if (cornered) return true;
  if ((factionDef(f)?.tier || "major") === "major") return false;
  const s = getStanding(state, f, lord);
  if (s < D().tiers.friendly) return false;
  if (!passesRepGates(state, f, lord)) return false;
  // the lord must be this minor's top Standing on the board (ties count)
  return factionIds(state).every((o) => o === f || o === lord || getStanding(state, f, o) <= s);
}

export { standingTier, getStanding, adjustStanding };
