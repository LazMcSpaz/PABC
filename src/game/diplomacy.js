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
import { emit } from "./events.js";
import { getStanding, adjustStanding, setStanding, standingTier } from "./standing.js";
import { bfsDistances } from "./board.js";
import { revealRegion } from "./visibility.js";

// --- state ----------------------------------------------------------
export function ensureDiplomacy(state) {
  if (!state.diplomacy) {
    state.diplomacy = {
      agreements: [], // live deals (flows + promises): { id, a, b, give, get, promises:[] }
      pacts: [], // { a, b } unordered alliances
      wars: [], // { a, b } active war-states
      coalitions: [], // { target, members:[] } against a player
      vassals: {}, // vassalFid -> lordId
      resentment: {}, // vassalFid -> number
      threatScores: {}, // pid -> number
      recognition: {}, // pid -> number (cached)
    };
  }
  for (const p of Object.values(state.players)) {
    if (p.menace == null) p.menace = 0;
    if (p.honor == null) p.honor = CONFIG.diplomacy.honor.start;
  }
  return state.diplomacy;
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
  // register live agreement if it carries flows/promises
  const promises = [...(deal.give || []), ...(deal.get || [])].filter((it) => it.flow || it.promise);
  if (promises.length) {
    state.diplomacy.agreements.push({
      id: `agr${state.diplomacy.agreements.length + 1}`,
      proposer: deal.proposer, recipient: deal.recipient,
      give: deal.give || [], get: deal.get || [], round: state.round,
    });
  }
  // a deal warms Standing both ways
  adjustStanding(state, deal.proposer, deal.recipient, 2, cause);
  adjustStanding(state, deal.recipient, deal.proposer, 2, cause);
  emit(state, "deal_struck", { proposer: deal.proposer, recipient: deal.recipient, cause });
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
  state.diplomacy.wars.push({ a, b, since: state.round });
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

export function formPact(state, a, b, cause = "pact") {
  if (arePacted(state, a, b)) return false;
  makePeace(state, a, b, "pact-peace");
  state.diplomacy.pacts.push({ a, b, since: state.round });
  setStanding(state, a, b, Math.max(getStanding(state, a, b), D().tiers.allied), cause);
  setStanding(state, b, a, Math.max(getStanding(state, b, a), D().tiers.allied), cause);
  emit(state, "pact_formed", { a, b, cause });
  return true;
}

export function breakPact(state, a, b, cause = "broken") {
  const before = state.diplomacy.pacts.length;
  state.diplomacy.pacts = state.diplomacy.pacts.filter(
    (p) => !((p.a === a && p.b === b) || (p.a === b && p.b === a)),
  );
  if (state.diplomacy.pacts.length !== before) {
    // breaking your word is the canonical Honor-dinging event (global).
    if (state.players[a]) adjustHonor(state, a, -D().honor.breakLoss, "pact-broken");
    adjustStanding(state, b, a, -6, cause);
    emit(state, "pact_broken", { a, b, cause });
  }
}

// §18.7 pact call — `caller` asks `ally` into its war with `target`.
// Honoring commits ally to war + builds the alliance; declining costs
// Standing with caller + a global Honor ding. Returns true if honored.
export function resolvePactCall(state, caller, ally, target, honored) {
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
    id: `vassal-${vassal}`, proposer: vassal, recipient: lord, vassalTribute: vassal,
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
    if (sc.total >= D().recognition.threshold) { state.winnerId = pid; return; }
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
