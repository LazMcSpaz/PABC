// What a faction actually wants right now — diplomacy brief §6.
//
// WHAT THIS REPLACES. `factionWants(def)` in `engineAdapter.js` is a six-case
// switch on temperament returning a fixed English string ("joint wars &
// targets"). It is display copy. Nothing reads it, no goal derives from it,
// and it does not vary with the board — the Lakers want "joint wars & targets"
// on round 1 with a full treasury and on round 40 besieged in their capital.
//
// WHAT IT BUYS. Three things, and the first is the reason posture works at all:
//
//   1. A posture's CONDITION writes itself from the top interest. One sentence
//      template per interest kind, no authored copy per faction. Without a
//      model of wants there is nothing for a posture to be about, and
//      "Courting you" without a stated condition is a mood, not a position.
//   2. The envoy can say WHY. `EnvoyModal` carries hand-written opener/closer
//      tables and an engine-authored `note` per branch; feeding the interest
//      in turns terms-without-an-argument into an argument. That is §2.1's
//      finding — legibility of MOTIVE is the whole ballgame — applied to the
//      one screen the player actually reads.
//   3. Personality in the price (§10). An item that serves a live interest is
//      worth a multiplier to that faction, so a grudge-holder overpays for
//      peace with its betrayer and a warlord overpays for `joinWar`.
//
// EVERYTHING HERE IS DERIVED. No authored state, no content migration, no new
// number for the player to learn. Every term reads something the engine
// already computes for another purpose, which is also what keeps the interests
// honest: they cannot drift away from the board, because they ARE the board.
//
// The precedent for the shape is `choicePolicy.js`'s `profileFor()`: a
// temperament base row bent by the faction's own dials. Ported rather than
// reinvented.
import { CONFIG } from "./config.js";
import { LOCATIONS, factionDef } from "./content.js";

const D = () => CONFIG.diplomacy;

// The kinds, in the order the brief lists them, with whether satisfying one
// COSTS the other party anything. That column is load-bearing: §7.3 says a
// condition the player satisfies by doing nothing must not pay Standing, or
// the courtship ladder becomes a faucet — "stay off my lawn" is free to obey
// and would otherwise mint Standing every round for changing nothing.
export const INTEREST_KINDS = {
  reclaim: { costly: true },   // a homeland of theirs somebody else holds
  redress: { costly: true },   // the top of the grievance ledger against you
  warHelp: { costly: true },   // a war they are losing
  routes:  { costly: true },   // a trade route that does not exist yet
  quiet:   { costly: false },  // your columns on their ground
  isolate: { costly: false },  // whoever's lead most threatens them
};

// Weights. Deliberately a flat table rather than per-faction tuning: the
// temperament dials below do the personalising, and a second layer of
// per-faction weights would be two knobs for one job.
const BASE_WEIGHT = {
  reclaim: 1.0,
  redress: 0.9,
  warHelp: 0.85,
  routes: 0.45,
  quiet: 0.55,
  isolate: 0.5,
};

// …bent by the faction's own dials, the way `profileFor()` bends its base row.
// A warlord cares more about a war it is in and less about a trade route; a
// pacifist is the mirror. `sociability` lifts routes because a faction that
// seeks pacts is a faction that wants the roads open.
function temperamentScale(def, kind) {
  const agg = def.aggression ?? 0.5;
  const soc = def.sociability ?? 0.5;
  switch (kind) {
    case "warHelp": return 0.6 + agg * 0.9;
    case "isolate": return 0.7 + agg * 0.5;
    case "quiet":   return 1.3 - agg * 0.5;   // a peaceable faction minds intruders more
    case "routes":  return 0.5 + soc * 1.1;
    case "reclaim": return 0.8 + agg * 0.5;
    case "redress": return 1.2 - agg * 0.4;   // a warlord takes it out of you instead
    default: return 1;
  }
}

/**
 * `pid`'s ranked wants, strongest first.
 *
 * Each entry is `{ kind, subject, weight, costly }`, where `subject` names the
 * thing the want is ABOUT — a hex, a faction, a grievance kind — so the
 * posture layer can render a sentence with a subject rather than a mood.
 *
 * Injected readers rather than imports: this module is a LEAF so `diplomacy.js`
 * can use it without a cycle (diplomacy already imports victory, standing,
 * control, board and influence, and interests needs several of diplomacy's own
 * queries). `registerInterestReaders` is called once from diplomacy.js.
 */
let R = null;
export function registerInterestReaders(readers) { R = readers; }

export function interestsOf(state, pid) {
  if (!R) return [];
  const def = factionDef(pid) || {};
  const out = [];
  const push = (kind, subject, strength, extra = {}) => {
    if (!(strength > 0)) return;
    out.push({
      kind,
      subject,
      weight: BASE_WEIGHT[kind] * temperamentScale(def, kind) * strength,
      costly: INTEREST_KINDS[kind].costly,
      ...extra,
    });
  };

  // reclaim — a Location whose authored affiliation is theirs, held by
  // somebody else. Already computed as a standing grievance by
  // `occupationsBy`, so this is the same fact the ledger and the denouncement
  // path read, not a second opinion about it.
  for (const other of R.factionIds(state)) {
    if (other === pid) continue;
    for (const occ of R.occupationsBy(state, pid, other)) {
      push("reclaim", occ.at, 1, { holder: other, locationId: occ.locationId });
    }
  }

  // redress — the top entry of the grievance ledger against each rival.
  // Weighted by the ledger's own severity so three small betrayals can
  // outweigh one large one, which is what the ledger was built for.
  for (const other of R.factionIds(state)) {
    if (other === pid) continue;
    const worst = R.worstGrievance(state, pid, other);
    if (!worst || worst.standing) continue; // occupations are `reclaim`, above
    // Normalised against ONE ORDINARY GRIEVANCE, not against the ledger's
    // capacity. `maxPerPair` is a count of ENTRIES (8), while `grievanceWeight`
    // sums SEVERITIES — dividing one by the other is a units error, and it
    // made a live betrayal weigh 0.25 while a missing trade route weighed 1.0.
    // A faction that has been wronged cares about that more than about a road.
    const w = R.grievanceWeight(state, pid, other);
    push("redress", other, Math.min(2, w / Math.max(1, D().grievance.defaultSeverity)),
      { grievance: worst.kind, round: worst.round, at: worst.at || null });
  }

  // warHelp — a live war, weighted by how badly it is going. War exhaustion is
  // already the engine's measure of "this is costing me", so a faction that is
  // winning does not beg for help and a faction that is losing asks loudest.
  for (const other of R.factionIds(state)) {
    if (other === pid || !R.atWar(state, pid, other)) continue;
    const ex = R.warExhaustion(state, pid, other);
    push("warHelp", other, 0.4 + Math.min(1.2, ex));
  }

  // routes — a trading-pact-eligible neighbour with no live route. Partly
  // costly: agreeing costs the other party a signature and a route to protect,
  // but nothing they hold.
  for (const other of R.factionIds(state)) {
    if (other === pid || R.atWar(state, pid, other)) continue;
    if (!R.mayCourt(state, pid, other)) continue;
    if (R.tradingPactBetween(state, pid, other)) continue;
    if (!R.tradeRouteOpen(state, pid, other)) continue; // no road, no want
    push("routes", other, 1);
  }

  // quiet — their units in your territory. NOT costly: leaving is something
  // the other party does by not acting, and §7.3 is explicit that a condition
  // satisfied by doing nothing must pay no Standing.
  for (const other of R.factionIds(state)) {
    if (other === pid) continue;
    const n = R.unitsInTerritory(state, other, pid).length;
    if (!n) continue;
    push("quiet", other, Math.min(1.5, 0.5 + n * 0.35), { units: n });
  }

  // isolate — whose lead most threatens them. Also not costly: "do not ally
  // the leader" asks the other party to refrain, not to hand anything over.
  {
    let worst = null, worstScore = 0;
    for (const other of R.factionIds(state)) {
      if (other === pid || state.players[other]?.eliminated) continue;
      const t = R.threatScore(state, other);
      if (t > worstScore) { worstScore = t; worst = other; }
    }
    if (worst && worstScore >= D().coalition.threshold * 0.5) {
      push("isolate", worst, Math.min(1.4, worstScore / D().coalition.threshold));
    }
  }

  out.sort((a, b) => b.weight - a.weight);
  return out;
}

// The single want that most defines `pid`'s stance toward `other`, or null.
// A posture is a position toward SOMEBODY, so it needs the strongest interest
// that actually involves them — the board-wide top want is the wrong sentence
// to say to a faction it has nothing to do with.
export function interestToward(state, pid, other) {
  for (const it of interestsOf(state, pid)) {
    if (it.subject === other || it.holder === other) return it;
  }
  return null;
}

// Does `item` serve one of `fid`'s live interests, and by how much? Returns a
// MULTIPLIER for `valueOfItem` (1 = no bearing). This is audit tier-3 item 11,
// parked since 2026-08-19 waiting on the AI overhaul — it does not need to
// wait, because the interests are derived and the hook is one line.
//
// Capped, and deliberately modest: personality in the price should tilt a
// negotiation, not let a warlord be talked into anything with the word "war"
// in it.
export function interestMultiplier(state, fid, item, other) {
  if (!R || !item) return 1;
  const wants = interestsOf(state, fid);
  if (!wants.length) return 1;
  const top = wants[0].weight || 1;
  let best = 0;

  const consider = (kind, matches) => {
    for (const w of wants) {
      if (w.kind !== kind) continue;
      if (matches && !matches(w)) continue;
      best = Math.max(best, w.weight / top);
    }
  };

  // A city they call theirs, coming back.
  if (item.location) consider("reclaim", (w) => w.subject === item.location.hexId);
  // Clearing the books IS redress.
  if (item.settlement) consider("redress", (w) => w.subject === other);
  // Somebody joining their war, against the faction they are fighting.
  if (item.promise?.kind === "joinWar") consider("warHelp", (w) => w.subject === item.promise.target);
  // Peace with the faction they are losing to is the other half of warHelp.
  if (item.promise?.kind === "peace") consider("warHelp", (w) => w.subject === other);
  // Not allying the runaway is exactly `isolate`.
  if (item.promise?.kind === "dontAlly") consider("isolate", (w) => w.subject === item.promise.target);
  // Open borders and non-aggression both answer `quiet`.
  if (item.promise?.kind === "nonAggression" || item.promise?.kind === "openBorders") {
    consider("quiet", (w) => w.subject === other);
  }

  const cfg = D().interests || {};
  const scale = cfg.priceMultiplier ?? 0.6;
  return 1 + best * scale;
}
