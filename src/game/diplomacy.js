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
import { FACTIONS, MINOR_FACTIONS, factionDef, LOCATIONS } from "./content.js";
import { emit, registerEventHook } from "./events.js";
import { getStanding, adjustStanding, setStanding, standingTier } from "./standing.js";
import { bfsDistances, reinforcementRoute } from "./board.js";
import { revealRegion, applySharedVision, recomputeVisibilityFor } from "./visibility.js";
import { recomputeResearch } from "./stats.js";

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
    };
  }
  if (!state.diplomacy.giftCounter) state.diplomacy.giftCounter = {};
  if (!state.diplomacy.pendingCalls) state.diplomacy.pendingCalls = [];
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
function onTrespass(state, payload) {
  const unit = state.units[payload.unit];
  if (!unit) return;
  const mover = unit.owner;
  const owner = state.world?.zoc?.[payload.to];
  if (!owner || owner === mover) return;          // neutral ground or your own land
  if (atWar(state, mover, owner)) return;          // already at war — penalty is moot
  if (hasOpenBorders(state, mover, owner)) return; // permission granted — free passage
  const tr = D().trespass;
  const soft = getStanding(state, owner, mover) >= D().tiers.friendly ? tr.goodTermsReduction : 0;
  // The relationship hit is the larger; the global-reputation (Menace) bump is
  // the smaller. Both soften on good terms (Menace can soften to nothing).
  const standingHit = Math.max(1, tr.standingPenalty - soft);
  const repHit = Math.max(0, tr.reputationPenalty - soft);
  adjustStanding(state, owner, mover, -standingHit, "trespass");
  if (repHit) adjustMenace(state, mover, repHit, "trespass");
  emit(state, "territory_trespassed", { mover, owner, hex: payload.to, standingHit, repHit });
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
  const tDef = factionDef(targetFid) || { aggression: 0.5 };
  const delta = Math.round(D().menace.base * (0.5 - (tDef.aggression ?? 0.5)) * 2);
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
export function valueOfItem(state, fid, item, ctx = {}) {
  if (!item) return 0;
  if (item.resource) return item.resource.amount || 0;
  if (item.flow) return (item.flow.amountPerTurn || 0) * 3; // a few turns of stream
  if (item.research) return (item.research.amount || 0) * 2;
  if (item.chip) return 4; // generic gear value
  if (item.intel) return item.intel.kind === "mapData" ? 3 : 2;
  if (item.promise) {
    const def = factionDef(fid) || {};
    switch (item.promise.kind) {
      case "peace": return atWar(state, fid, ctx.other) ? 6 : 1;
      case "nonAggression": return 2 + (1 - (def.aggression || 0.5)) * 3;
      case "openBorders": return 1 + (def.sociability || 0.5) * 2;
      case "joinWar": return wantsDead(state, fid, item.promise.target) ? 5 : 0;
      case "dontAlly": return 1;
      case "tribute": return 4; // receiving tribute is good
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
    (it) => it.promise && ["nonAggression", "openBorders", "tribute"].includes(it.promise.kind),
  );
  if (hasDeepPromise && !passesRepGates(state, fid, other)) return false;
  // Hard gate: conflicting agreements — won't ally a sworn enemy's friend.
  for (const it of [...(deal.give || []), ...(deal.get || [])]) {
    if (it.promise?.kind === "joinWar" && arePacted(state, fid, it.promise.target)) return false;
    if (it.promise?.kind === "peace" && vassalLord(state, fid) && atWar(state, vassalLord(state, fid), other)) return false;
  }
  return dealValue(state, fid, deal) >= 0;
}

// --- applying a struck deal (§18.6 atomic) --------------------------
export function applyDeal(state, deal, cause = "deal") {
  // transfer each side's items
  transferItems(state, deal.proposer, deal.recipient, deal.give);
  transferItems(state, deal.recipient, deal.proposer, deal.get);
  // register live agreement if it carries flows/promises (§6.2 type tag).
  const promises = [...(deal.give || []), ...(deal.get || [])].filter((it) => it.flow || it.promise);
  if (promises.length) {
    state.diplomacy.agreements.push({
      id: `agr${state.diplomacy.agreements.length + 1}`,
      type: "deal-promise",
      proposer: deal.proposer, recipient: deal.recipient,
      give: deal.give || [], get: deal.get || [], round: state.round,
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
  const baseGain = scrapAmount * D().ai.giftStandingPerScrap;
  const actualGain = Math.floor(baseGain / (n + 1));
  if (actualGain) adjustStanding(state, toPid, fromPid, actualGain, "gift");
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
  // §6.2 — war record tracks losses for the §1.5 exhaustion model.
  state.diplomacy.wars.push({ a, b, since: state.round, unitsLost: {}, locationsLost: {}, contestsWon: {} });
  setStanding(state, a, b, D().tiers.hostile, cause);
  setStanding(state, b, a, D().tiers.hostile, cause);
  emit(state, "war_declared", { a, b, cause });
}

export function makePeace(state, a, b, cause = "peace") {
  const before = state.diplomacy.wars.length;
  state.diplomacy.wars = state.diplomacy.wars.filter(
    (w) => !((w.a === a && w.b === b) || (w.a === b && w.b === a)),
  );
  if (state.diplomacy.wars.length !== before) {
    adjustStanding(state, a, b, 3, cause);
    adjustStanding(state, b, a, 3, cause);
    emit(state, "peace_made", { a, b, cause });
  }
}

// The typed §6.2 pact agreement (carries visionShare / openBorders), or null.
export function findPactAgreement(state, a, b) {
  return state.diplomacy.agreements.find(
    (agr) => agr.type === "pact" && ((agr.a === a && agr.b === b) || (agr.a === b && agr.b === a)),
  ) || null;
}

export function formPact(state, a, b, cause = "pact") {
  if (arePacted(state, a, b)) return false;
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

// --- §1.3 trading pact ----------------------------------------------
// The Capital hex a faction controls (carries the `capital` chip), or null.
function capitalHexOf(state, fid) {
  for (const loc of Object.values(state.locations)) {
    if (loc.controller === fid && (loc.chips || []).some((c) => state.chips[c]?.chipId === "capital")) return loc.hexId;
  }
  return null;
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
  if (!reinforcementRoute(state, a, capB)) return { ok: false, reason: "no clear route between capitals" };
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
    const capB = capitalHexOf(state, agr.b);
    const clear = !!(capB && reinforcementRoute(state, agr.a, capB));
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
    if (state.players[ally]) adjustHonor(state, ally, D().honor.keepGain, "pact-honored");
  } else {
    adjustStanding(state, caller, ally, -5, "pact-declined");
    if (state.players[ally]) adjustHonor(state, ally, -D().honor.breakLoss, "pact-declined");
  }
  return honored;
}

// §18.7 Denounce — shift faction↔faction Standing around the denounced.
export function denounce(state, denouncer, target) {
  adjustStanding(state, denouncer, target, -3, "denounce");
  for (const f of factionIds(state)) {
    if (f === denouncer || f === target) continue;
    if (arePacted(state, f, target)) adjustStanding(state, f, denouncer, -2, "denounce-friend");
    else if (atWar(state, f, target) || getStanding(state, f, target) <= D().tiers.wary)
      adjustStanding(state, f, denouncer, +2, "denounce-enemy");
  }
  emit(state, "denounced", { denouncer, target });
}

// §18.7 Mediate — broker peace between two OTHER warring factions.
export function mediate(state, mediator, a, b) {
  if (!atWar(state, a, b)) return false;
  // both weigh war exhaustion + the mediator's Honor/Standing (deterministic).
  const willing = (f) => honorOf(state, mediator) >= trustFloor(state, f) - 2;
  if (!willing(a) || !willing(b)) return false;
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
export function checkRecognitionVictory(state) {
  if (state.winnerId) return;
  for (const pid of factionIds(state)) {
    const sc = recognitionScore(state, pid);
    if (state.diplomacy.recognition[pid] !== sc.total) {
      state.diplomacy.recognition[pid] = sc.total;
      emit(state, "recognition_changed", { player: pid, value: sc.total, contributors: sc.contributors });
    }
    if (state.victory?.recognition !== false && sc.total >= D().recognition.threshold) { state.winnerId = pid; return; }
  }
}

// --- coalitions (§18.8) ---------------------------------------------
function recomputeCoalitions(state) {
  const c = D().coalition;
  for (const pid of factionIds(state)) {
    const score = threatScore(state, pid);
    state.diplomacy.threatScores[pid] = score;
    const existing = coalitionAgainst(state, pid);
    if (score >= c.threshold && !existing) {
      // form: eligible = not pid, not allied/vassal to pid, able to cooperate
      const members = factionIds(state).filter((f) =>
        f !== pid && vassalLord(state, f) !== pid && !arePacted(state, f, pid));
      if (members.length >= 2) {
        state.diplomacy.coalitions.push({ target: pid, members, since: state.round });
        for (const m of members) {
          adjustStanding(state, m, pid, -c.standingHit, "coalition");
          declareWar(state, m, pid, "coalition");
          // members ally each other
          for (const n of members) if (n !== m && !arePacted(state, m, n)) formPact(state, m, n, "coalition-bloc");
        }
        emit(state, "coalition_formed", { target: pid, members });
      }
    } else if (existing && score <= c.dissolve) {
      state.diplomacy.coalitions = state.diplomacy.coalitions.filter((x) => x !== existing);
      for (const m of existing.members) makePeace(state, m, pid, "coalition-dissolved");
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
function driftStanding(state) {
  const d = D();
  for (const a of factionIds(state)) {
    for (const b of factionIds(state)) {
      if (a === b) continue;
      if (vassalLord(state, a) === b) continue; // vassal standing locked
      if (arePacted(state, a, b) || atWar(state, a, b)) continue; // active relations don't fade
      const cur = getStanding(state, a, b);
      if (cur === 0) continue;
      const grudge = factionDef(a)?.grudge ?? 0.4;
      const step = Math.max(1, Math.round(d.driftPerRound * (1 - grudge * d.grudgeDriftScale * 0.5)));
      if (cur > 0) setStanding(state, a, b, Math.max(0, cur - step), "drift");
      else setStanding(state, a, b, Math.min(0, cur + step), "drift");
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
      if (!atWar(state, a, b) && !arePacted(state, a, b)
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
  for (const agr of state.diplomacy.agreements) {
    if (agr.vassalTribute) continue; // tribute handled in vassalTick
    for (const it of agr.give || []) applyFlow(state, agr.proposer, agr.recipient, it);
    for (const it of agr.get || []) applyFlow(state, agr.recipient, agr.proposer, it);
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
  driftStanding(state);
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
    case "make-peace":
      makePeace(state, pid, f, "player-peace");
      return r();
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
      const terms = params.terms || [{ resource: { resource: "scrap", amount: params.amount || 0 } }];
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
        if (getStanding(state, pid, f) < D().tiers.friendly || getStanding(state, f, pid) < D().tiers.friendly)
          return { ok: false, reason: "need Friendly+ standing" };
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
        emit(state, "pact_call_honored", { caller, ally: pid, target });
        return r({ honored: true });
      }
      adjustStanding(state, caller, pid, -D().pactCall.declineStandingHit, "pact-declined");
      if (state.players[pid]) adjustHonor(state, pid, -D().honor.breakLoss, "pact-declined");
      emit(state, "pact_call_declined", { caller, ally: pid, target });
      return r({ honored: false });
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
// alternatives: it is much weaker than the lord and cornered (at war / very
// low Standing), or has no better ally.
export function aiAcceptsVassalage(state, f, lord) {
  if (f === lord || vassalLord(state, f)) return false;
  if (!mayEngage(state, f, lord)) return false;
  const ratio = powerOf(state, f) / Math.max(1, powerOf(state, lord));
  const cornered = atWar(state, lord, f) || getStanding(state, f, lord) <= D().tiers.wary;
  return ratio <= D().ai.vassalPowerRatio && cornered;
}

export { standingTier, getStanding, adjustStanding };
