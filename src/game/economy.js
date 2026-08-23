// §20 Economy & City Development — the chip system IS the economy. With the
// Market retired (§20.2), every controlled Location has an Output (§20.3)
// split by a guns/butter slider into banked scrap and local construction;
// chips are built into slots (§20.4) and upgraded in place (§20.5), gated by
// Tech Level × Loyalty (§20.6), with selective per-chip upkeep (§20.9).
//
// Shared helpers live here so the build gate is computed identically by the
// build action (actions.js), the Upkeep loop (turn.js), the capture path
// (contest.js), and the HUD exposures (engineAdapter.js).
import { CONFIG } from "./config.js";
import { CHIPS, CAPITAL, chipDefOf } from "./content.js";
import { emit } from "./events.js";
import { recomputeStats, recomputeResearch } from "./stats.js";
import { recomputeInfluence } from "./influence.js";
import { hasTechNode } from "./tech.js";
import { holderOf } from "./control.js";
import {
  resolveBlockadeSites, creditBlockade, blockadeDrainOn, ownedBlockades,
} from "./blockades.js";
import { supplyCutter, hexIsFull } from "./movement.js";
import { supplyDistanceFrom } from "./board.js";
import { makeUnit, nextMusterIndex } from "./setup.js";
import { factionDef } from "./content.js";
import { recomputeVisibility } from "./visibility.js";

// §20.6 — the Tech Level a chip of `techLevel` T demands of the builder
// (the same §17.2 thresholds, applied to building). techLevel 1 → L1,
// 2 → L3, 3 → L5.
// Economy brief §7.1 — the supply verdict for a purchase at `hexId`.
//
//   { delay: 0 }              arrives now: connected interior, or your last city
//   { delay: n }              paid now, arrives in n rounds
//   { refused: true, ... }    cut off entirely AND you hold somewhere else
//
// `supplyFreeHops` is what a connected empire looks like — see the measurement
// in its config comment. Past that, every hop is a round of convoy, which is
// the same rate `sweepReinforcements` already walks a field reinforcement at.
export function supplyVerdict(state, pid, hexId) {
  const cfg = CONFIG.economy;
  if (!cfg.supplyDelaysSpending) return { delay: 0 };
  const r = supplyDistanceFrom(state, pid, hexId);
  if (r.cut) {
    return { refused: true, reason: "cut off from the rest of your holdings — nothing can reach here" };
  }
  if (r.sole) return { delay: 0, sole: true }; // your last city is never starved by this rule
  return { delay: Math.max(0, (r.dist || 0) - (cfg.supplyFreeHops ?? 0)), dist: r.dist };
}

/**
 * Queue a purchase that has been paid for but has not arrived.
 *
 * Deliberately the same shape as `state.reinforcements`: paid up front, swept
 * at round end, delivered when its clock runs out. One model for "the scrap
 * left, the goods are on the road", so a player learns it once.
 */
export function queueDelivery(state, pid, kind, hexId, rounds, payload = {}) {
  state.deliveries = state.deliveries || [];
  const entry = {
    id: `dlv${state.deliveries.length + 1}-${state.round}`,
    owner: pid, kind, hex: hexId,
    arrivesOnRound: state.round + rounds,
    ...payload,
  };
  state.deliveries.push(entry);
  emit(state, "purchase_delayed", {
    player: pid, kind, hex: hexId, rounds, arrivesOnRound: entry.arrivesOnRound,
  });
  return entry;
}

/**
 * Round-end delivery sweep.
 *
 * A delivery whose destination has CHANGED HANDS is lost, not refunded: the
 * convoy arrived and somebody else was standing there. That is the same
 * contract `sweepReinforcements` applies when its target unit dies, and it is
 * what stops a besieged city being a free bank.
 */
export function sweepDeliveries(state) {
  if (!state.deliveries?.length) return;
  const keep = [];
  for (const d of state.deliveries) {
    if (state.round < d.arrivesOnRound) { keep.push(d); continue; }
    const loc = state.locations[d.hex];
    if (!loc || loc.controller !== d.owner) {
      emit(state, "purchase_lost", { player: d.owner, kind: d.kind, hex: d.hex });
      continue;
    }
    if (d.kind === "rush") {
      loc.buildProgress = (loc.buildProgress || 0) + d.points;
      bankBuildSurplus(state, loc.controller, completeBuildIfDone(state, loc));
    } else if (d.kind === "recruit") {
      if (hexIsFull(state, loc.hexId)) { keep.push(d); continue; } // wait for room
      const u = state.nextId("unit");
      state.units[u] = makeUnit(u, d.owner, loc.hexId,
        factionDef(d.owner)?.name || d.owner, nextMusterIndex(state, d.owner));
      emit(state, "unit_recruited", { unit: u, player: d.owner, hex: loc.hexId });
      recomputeVisibility(state, d.owner);
    }
    emit(state, "purchase_arrived", { player: d.owner, kind: d.kind, hex: d.hex });
  }
  state.deliveries = keep;
}

export function techLevelReqFor(chipTechLevel) {
  return CONFIG.economy.buildTechGate[chipTechLevel] || 1;
}

/**
 * What Tech Level this specific chip demands.
 *
 * The tier mapping is the default, but a chip may name its own requirement
 * with `techLevelReq` — needed because the tiers are coarse and one chip can
 * sit badly inside its band. The Advanced Lab is the case: it is a tier-2
 * chip, so the mapping asked for Tech L3, and it is also the building that
 * PRODUCES the research you climb with. Gating the research building behind
 * the level it helps you reach is a bootstrap you cannot pay for.
 */
export function techReqFor(def) {
  return def?.techLevelReq ?? techLevelReqFor(def?.techLevel || 1);
}

export function meetsTech(player, def) {
  return (player.techLevel || 1) >= techReqFor(def);
}

// §20.6 — does this city's current Loyalty clear the chip's rung? A Capital
// (inert, locked at the ceiling) always qualifies.
export function meetsLoyalty(loc, def) {
  const need = def.loyaltyReq || 0;
  if (need <= 0) return true;
  const loy = loc.loyalty == null ? CONFIG.loyalty.ceiling : loc.loyalty;
  return loy >= need;
}

// §20.6 — a Location's effective slot count: its base chipSlots plus the +1
// bonus slot once Loyalty reaches the bonus rung. Capitals (loyalty null /
// locked) count as fully integrated. `state` is optional (UI display paths
// omit it); pass it to apply the §17.5 Capital Works (eco-b2) bonus slot.
export function slotCapacity(loc, state) {
  const loy = loc.loyalty == null ? CONFIG.loyalty.ceiling : loc.loyalty;
  let cap = loc.chipSlots + (loy >= CONFIG.economy.bonusSlotLoyalty ? 1 : 0);
  // §17.5 Economy B2 (Capital Works): +1 chip slot at the holder's Capital.
  if (state && loc.controller && hasTechNode(state, loc.controller, "eco-b2") &&
      loc.chips.some((c) => state.chips[c]?.chipId === "capital")) {
    cap += 1;
  }
  return cap;
}

// §17.5 Economy B1 (Production Lines): a holder's chips cost 1 less to build
// (floor 1). Read wherever an effective buildCost is needed (build/upgrade).
export function effectiveBuildCost(state, pid, def) {
  const base = def.buildCost ?? def.cost ?? 0;
  if (base <= 0) return base;
  return hasTechNode(state, pid, "eco-b1") ? Math.max(1, base - 1) : base;
}

// Slots a chip-uid list occupies (Capital counts as 1). A dormant chip
// still occupies its slot.
export function slotsUsed(state, chipUids) {
  let n = 0;
  for (const c of chipUids) {
    const id = state.chips[c]?.chipId;
    n += id === "capital" ? 1 : CHIPS[id]?.slots ?? 1;
  }
  return n;
}

// §20.3 — a Location's Output: base production + the scrap yield of its
// installed (non-dormant) economy chips + the §17.5 Economy entry bonus
// (+1 scrap/held Location), routed through Output now that the flat
// collectProduction step is gone.
export function locationOutput(state, loc) {
  let out = loc.production || 0;
  for (const c of loc.chips) {
    if (state.chips[c]?.disabled) continue;
    out += chipDefOf(state, c)?.output || 0;
  }
  if (loc.controller && hasTechNode(state, loc.controller, "eco-entry")) out += 1;
  // §17.5 Economy A1 (Refineries): +1 more scrap/Location — ADDS to the entry.
  if (loc.controller && hasTechNode(state, loc.controller, "eco-a1")) out += 1;
  // §7.3 — a barricade on the doorstep. Applied last so the drain bites the
  // whole Output rather than only its base, and floored at 0 rather than going
  // negative: a strangled city produces nothing, it does not owe.
  out -= blockadeDrainOn(state, loc);
  return Math.max(0, out);
}

// §20.6 build menu (DISPLAY CONTRACT) — the chips a player MAY build at this
// Location. Returns ONLY chips the player's Tech Level allows; each is tagged
// `locked` (true when Loyalty is short) with a human reason. Tech-forbidden
// chips are omitted entirely. Unit chips are included only as `unit`-kind
// (the caller checks for a stationed friendly unit + bay space).
/** Does `pid` hold a capital chip anywhere on the board? */
export function hasCapital(state, pid) {
  return Object.values(state.locations).some(
    (l) => l.controller === pid
      && (l.chips || []).some((c) => state.chips[c]?.chipId === "capital"));
}

/**
 * May `pid` build a capital at `loc`? Only a faction that still holds ground
 * and has no seat left anywhere — so this is a recovery from losing your
 * capital, never a way to relocate one you still have.
 */
export function canRebuildCapital(state, loc) {
  return !!loc?.controller && !hasCapital(state, loc.controller);
}

export function buildableChips(state, loc) {
  const player = state.players[loc.controller];
  if (!player) return [];
  const out = [];
  // The Capital lives outside CHIPS (it is placed, not sold), so it is offered
  // here explicitly and only when the rebuild condition holds.
  if (canRebuildCapital(state, loc)) {
    const locked = !meetsLoyalty(loc, CAPITAL);
    out.push({ chipId: CAPITAL.id, def: CAPITAL, locked,
               reason: locked ? `needs Loyalty ${CAPITAL.loyaltyReq}` : null });
  }
  for (const def of Object.values(CHIPS)) {
    // Signature chips are faction-locked — invisible to everyone else,
    // including a captor browsing a captured Location's menu.
    if (def.faction && def.faction !== loc.controller) continue;
    // Reward chips are found, never built (docs/chip-set-v0.1.md).
    if (def.reward) continue;
    // Blockade chips install into a structure out on the road, not here.
    if (def.kind === "blockade") continue;
    if (!meetsTech(player, def)) continue; // Tech-forbidden → not shown at all
    const locked = !meetsLoyalty(loc, def);
    out.push({
      chipId: def.id,
      def,
      locked,
      reason: locked ? `needs Loyalty ${def.loyaltyReq}` : null,
    });
  }
  return out;
}

// §20.5 / §20.6 upgrade view (DISPLAY CONTRACT) — the next tier for an
// installed chip, ALWAYS returned if one exists (so the evolution path shows
// even early), with `locked` set if EITHER Tech Level or Loyalty is short.
// Returns null when the chip has no upgrade.
export function upgradeOption(state, loc, chipUid) {
  const def = chipDefOf(state, chipUid);
  const nextId = def?.upgradesTo;
  if (!nextId) return null;
  const next = CHIPS[nextId];
  if (!next) return null;
  const player = state.players[loc.controller];
  const techOk = player ? meetsTech(player, next) : false;
  const loyOk = meetsLoyalty(loc, next);
  const reasons = [];
  if (!techOk) reasons.push(`needs Tech L${techReqFor(next)}`);
  if (!loyOk) reasons.push(`needs Loyalty ${next.loyaltyReq}`);
  return {
    chipId: nextId,
    def: next,
    fromUid: chipUid,
    locked: !techOk || !loyOk,
    reason: reasons.join(", ") || null,
  };
}

// One-chip-per-stat rule (docs/chip-set-v0.1.md): does this unit already
// carry a chip of `statType`? Dormant chips still hold their slot AND
// their stat claim — dormancy is a payment lapse, not removal.
export function unitHasStatType(state, unit, statType) {
  if (!statType) return false;
  return unit.chips.some((c) => CHIPS[state.chips[c]?.chipId]?.statType === statType);
}

// A friendly unit stationed at the Location with room for `slots` more bay
// (and, when `statType` is given, no chip of that stat family already
// installed), or null. Unit chips (§20.4) install into such a unit's Bay.
export function stationedUnitWithBay(state, loc, slots, statType) {
  for (const u of Object.values(state.units)) {
    if (u.owner !== loc.controller || u.node !== loc.hexId) continue;
    if (statType && unitHasStatType(state, u, statType)) continue;
    if (slotsUsed(state, u.chips) + slots <= CONFIG.unit.baySlots) return u;
  }
  return null;
}

// Rail doc §2.2 — where this Location's idle build throughput is being sent, or
// null. Four gates, all from the doc:
//
//   * opt-in: `poolTarget` is set by the player, never inferred;
//   * DIRECT pairs only — A↔B and B↔C both railed does not let A feed C. Rail
//     would otherwise make every build in a large empire instant, and the
//     mechanic stops being legible as "these two cities share";
//   * §2.3 access — you may use a link only if you hold BOTH its stations;
//   * per-hex interruption — a line is track, so anyone parked on it cuts it.
//
// Returns `{ dest, cut }`; `cut` names the hex that severed it, so the caller
// can say what happened rather than silently pooling nothing.
function railPoolRecipient(state, loc) {
  const target = loc.poolTarget;
  if (!target || target === loc.hexId) return null;
  const dest = state.locations[target];
  const pid = loc.controller;
  if (!dest || !pid || dest.controller !== pid) return null;
  const link = (state.board.rails || []).find(
    (l) => (l.a === loc.hexId && l.b === target) || (l.b === loc.hexId && l.a === target),
  );
  if (!link) return null;
  const isCut = supplyCutter(state, pid);
  return { dest, cut: link.path.find((h) => isCut(h)) || null };
}

// Apply the guns/butter split for one Location at Upkeep (§20.3), advance /
// complete its active build (§20.4 / §20.5), pay for any blockade drawing on it
// (rail doc §3.4), and pool anything left down its rail link (§2.2). Returns
// the scrap banked.
//
// `sites` are the construction sites this Location funds — already filtered to
// ones with a live builder and an uncut road (blockades.js).
function processLocationEconomy(state, loc, { partial = false, sites = [] } = {}) {
  let output = locationOutput(state, loc);
  // A besieged city (majority held, not outright) still works — at reduced
  // capacity. Losing one section used to zero the place out entirely.
  if (partial) output = Math.floor(output * CONFIG.economy.partialOutputScale);
  loc.output = output; // cache the derived value for the HUD
  const ab = loc.activeBuild;

  // §2.2 — a settlement only pools while it has nothing of its own under
  // construction; its own build always claims its output first.
  const pool = railPoolRecipient(state, loc);
  if (pool?.cut) {
    // "no partial credit": a cut line pools NOTHING this turn, and the output
    // banks exactly as it would with no pact at all. Emitted because a build
    // that quietly stops arriving is indistinguishable from a bug.
    emit(state, "pool_interrupted", { from: loc.hexId, to: pool.dest.hexId, at: pool.cut });
  }
  const pooling = !!pool && !pool.cut && !ab;

  // Nothing to build, here or down the road or down the line → the whole Output
  // banks as liquid scrap (throughput has nowhere to go, so it is never wasted).
  if (!ab && !sites.length && !pooling) return output;

  const f = Math.max(0, Math.min(1, loc.buildSlider ?? CONFIG.economy.defaultSlider));
  const scrapGain = Math.floor((1 - f) * output);
  let buildGain = output - scrapGain; // conserve the total; build keeps the remainder
  // Works chip: flat extra build progress, outside the slider split (it's
  // labor, not Output). Only while something is actually under construction.
  for (const c of loc.chips) {
    if (state.chips[c]?.disabled) continue;
    buildGain += chipDefOf(state, c)?.buildRate || 0;
  }

  // §3.4 — who gets the build output when a city is building a chip AND
  // funding a blockade at the same time.
  //
  // The blockade wins by default: it is the answer to something happening on
  // the map right now, where a chip is an investment that keeps. A site can
  // only absorb ceil(cost/minTurns) per turn though (§3.1's floor), so the city
  // is never starved — the remainder flows straight on to its own build.
  //
  // `buildPriority: "chips"` flips it, and flips it hard: while a chip is under
  // construction it takes everything and the blockade waits until it is done.
  // That is the point of the toggle — a player who sets it has decided the
  // building matters more, and a half-measure would just make both slow.
  const chipsFirst = loc.buildPriority === "chips" && !!ab;
  if (!chipsFirst) {
    for (const s of sites) {
      if (buildGain <= 0) break;
      buildGain = creditBlockade(state, s.blockade, buildGain);
    }
  }

  // §2.2 — whatever the blockades did not take goes down the rail. After
  // blockade funding by the same reasoning as §3.4: a structure answering
  // something on the map outranks a gift to a neighbour.
  let surplus = 0;
  if (pooling && buildGain > 0) {
    pool.dest.buildProgress = (pool.dest.buildProgress || 0) + buildGain;
    emit(state, "production_pooled", {
      from: loc.hexId, to: pool.dest.hexId, amount: buildGain,
    });
    // The recipient is held by the same faction (§2.2 requires both stations),
    // so its surplus banks to the same player.
    surplus += completeBuildIfDone(state, pool.dest);
    buildGain = 0;
  }

  loc.buildProgress = (loc.buildProgress || 0) + buildGain;
  surplus += completeBuildIfDone(state, loc);
  // Surplus rides home with the butter half rather than as its own emit: at
  // Upkeep every Location's scrap is summed into one `resource_gained`.
  return scrapGain + surplus;
}

// §20.4 / §20.5 — install / upgrade once buildProgress clears the cost.
//
// RETURNS the number of build points left with nowhere to go, which the caller
// banks as scrap. Surplus used to carry on the Location as untargeted
// `buildProgress`: a settlement set to BUILD keeps producing after its build
// lands, and that surplus then sat invisible and worth nothing until the
// player happened to queue something else. Throughput is never wasted anywhere
// else in the economy — an idle settlement banks its whole Output — so it is
// not wasted here either.
//
// Two paths produce leftovers: overflow past a finished build, and a forfeited
// unit-chip build (no friendly unit on the hex to arm), which used to destroy
// every point sunk into it.
export function completeBuildIfDone(state, loc) {
  const ab = loc.activeBuild;
  if (!ab) return 0;
  if ((loc.buildProgress || 0) < ab.cost) return 0;

  const overflow = (loc.buildProgress || 0) - ab.cost;
  const def = CHIPS[ab.chipId];

  if (ab.kind === "upgrade") {
    // Replace in place (§20.5): mutate the existing instance's chipId so the
    // slot/uid are preserved, then re-stamp it "newest" (move to the end of
    // its holder's list) so §6.3.3 capture destroys the freshest gear.
    const inst = state.chips[ab.targetChipUid];
    if (!inst) {
      // The chip being upgraded is gone (destroyed, ejected, captured). Nothing
      // to install into, so the whole pile becomes scrap.
      const stranded = loc.buildProgress || 0;
      loc.activeBuild = null; loc.buildProgress = 0;
      return stranded;
    }
    inst.chipId = ab.chipId;
    if (ab.targetUnit && state.units[ab.targetUnit]) {
      const u = state.units[ab.targetUnit];
      restamp(u.chips, ab.targetChipUid);
      recomputeStats(state);
    } else {
      restamp(loc.chips, ab.targetChipUid);
      recomputeResearch(state);
    }
    emit(state, "chip_upgraded", { hex: loc.hexId, chip: ab.targetChipUid, chipId: ab.chipId });
  } else {
    // Fresh build (§20.4): create the instance and install it.
    const uid = state.nextId("chip");
    state.chips[uid] = { uid, chipId: ab.chipId };
    if (def?.kind === "unit") {
      const u = ab.targetUnit && state.units[ab.targetUnit];
      const target = u && u.node === loc.hexId && u.owner === loc.controller &&
        slotsUsed(state, u.chips) + (def.slots || 1) <= CONFIG.unit.baySlots &&
        !unitHasStatType(state, u, def.statType)
        ? u
        : stationedUnitWithBay(state, loc, def.slots || 1, def.statType);
      if (!target) {
        // No friendly unit to arm — the chip never lands. The work still
        // happened though, so it comes back as scrap rather than evaporating.
        delete state.chips[uid];
        const stranded = loc.buildProgress || 0;
        loc.activeBuild = null;
        loc.buildProgress = 0;
        return stranded;
      }
      target.chips.push(uid);
      recomputeStats(state);
      emit(state, "build_completed", { hex: loc.hexId, chip: uid, chipId: ab.chipId, unit: target.uid });
    } else {
      loc.chips.push(uid);
      recomputeResearch(state);
      recomputeInfluence(state); // §18.3 — a new Location chip can shift the field/ZoC
      emit(state, "build_completed", { hex: loc.hexId, chip: uid, chipId: ab.chipId });
    }
  }

  loc.activeBuild = null;
  loc.buildProgress = 0;
  return overflow; // banked as scrap by the caller
}

// Credit build points that had nowhere to go to `pid` as scrap. Its own event
// source so the feed says where the surplus came from rather than folding it
// into ordinary Output.
export function bankBuildSurplus(state, pid, amount) {
  if (!(amount > 0) || !state.players[pid]) return;
  state.players[pid].resource += amount;
  emit(state, "resource_gained", {
    player: pid, resource: "Resource", amount, source: "build-surplus",
  });
}

function restamp(list, uid) {
  const i = list.indexOf(uid);
  if (i >= 0) { list.splice(i, 1); list.push(uid); }
}

// §20.3 Upkeep step (REPLACES collectProduction) — for each Location pid
// fully holds, compute Output, bank the butter half, and advance/complete the
// active build. The gun half stays local as buildProgress.
export function applyOutputAndBuilds(state, pid) {
  let banked = 0;
  // Rail doc §3.4 — resolve blockade sites first (this is also where a site
  // whose builder walked off fails, and where a cut line stalls), then index
  // them by the settlement that pays so each Location funds its own.
  const bySettlement = new Map();
  for (const s of resolveBlockadeSites(state, pid, supplyCutter(state, pid))) {
    if (!bySettlement.has(s.settlement)) bySettlement.set(s.settlement, []);
    bySettlement.get(s.settlement).push(s);
  }
  for (const loc of Object.values(state.locations)) {
    const full = loc.controller === pid;
    // Majority holders keep a (reduced) economy — see control.js.
    if (!full && holderOf(loc) !== pid) continue;
    banked += processLocationEconomy(state, loc, {
      partial: !full,
      sites: bySettlement.get(loc.hexId) || [],
    });
  }
  if (banked > 0) {
    state.players[pid].resource += banked;
    emit(state, "resource_gained", {
      player: pid, resource: "Resource", amount: banked, source: "output",
    });
  }
  // §3.2 Toll Booth — a blockade's own income, emitted separately from city
  // Output so the log says where the scrap came from.
  const toll = 0; // §7.3 — a blockade drains its victim now; it pays nobody
  if (toll > 0) {
    state.players[pid].resource += toll;
    emit(state, "resource_gained", {
      player: pid, resource: "Resource", amount: toll, source: "toll",
    });
  }
}

// §20.9 selective chip upkeep — sum the per-chip `upkeep` of every chip pid
// controls and charge it from banked scrap. Cheapest-first so a cash-strapped
// player keeps as many chips live as possible; any chip that can't be paid
// goes DORMANT (the §12.5 `disabled` flag suppresses its passives) and
// reactivates the moment its upkeep can be paid again. Never destroyed.
// Every chip `pid` holds, in install order. `nextId` hands out monotonically
// increasing uids, so sorting on them is "oldest first" without a second
// timestamp to keep in sync.
export function chipsHeldBy(state, pid) {
  const all = [];
  for (const loc of Object.values(state.locations)) {
    if (loc.controller !== pid) continue;
    for (const c of loc.chips) all.push({ uid: c, holder: loc });
  }
  for (const u of Object.values(state.units)) {
    if (u.owner !== pid) continue;
    for (const c of u.chips) all.push({ uid: c, holder: u });
  }
  for (const b of ownedBlockades(state, pid)) {
    for (const c of b.chips || []) all.push({ uid: c, holder: b });
  }
  return all.sort((a, b) => String(a.uid).localeCompare(String(b.uid), undefined, { numeric: true }));
}

// ECONOMY §8 — what one chip actually costs its holder this round: its own
// authored `upkeep`, plus the count surcharge if it sits past the free
// allowance. Exported because the HUD quotes it, and a number the player is
// quoted that differs from the number they are charged is the oldest bug in
// this file.
export function chipUpkeepFor(state, pid, uid, index = null) {
  const cfg = CONFIG.economy;
  const base = chipDefOf(state, uid)?.upkeep || 0;
  if (!cfg.perExtraChip || cfg.freeChips == null) return base;
  const i = index == null
    ? chipsHeldBy(state, pid).findIndex((c) => c.uid === uid)
    : index;
  return base + (i >= cfg.freeChips ? cfg.perExtraChip : 0);
}

export function chargeChipUpkeep(state, pid) {
  const player = state.players[pid];
  const held = chipsHeldBy(state, pid);
  const bearing = [];
  held.forEach((c, i) => {
    const up = chipUpkeepFor(state, pid, c.uid, i);
    if (up > 0) bearing.push({ uid: c.uid, upkeep: up, holder: c.holder });
  });
  if (!bearing.length) return;
  bearing.sort((a, b) => a.upkeep - b.upkeep);

  let changed = false;
  for (const b of bearing) {
    const inst = state.chips[b.uid];
    if (!inst) continue;
    if (player.resource >= b.upkeep) {
      player.resource -= b.upkeep;
      emit(state, "resource_spent", { player: pid, resource: "Resource", amount: -b.upkeep, source: "upkeep" });
      // A Blacksite-suppressed chip stays dark even when its upkeep is
      // paid — sabotage outranks bookkeeping until the window passes.
      if (inst.disabled && inst.suppressedUntil == null) {
        inst.disabled = false;
        changed = true;
        emit(state, "chip_reactivated", { chip: b.uid, chipId: inst.chipId });
      }
    } else if (!inst.disabled) {
      inst.disabled = true;
      changed = true;
      emit(state, "chip_dormant", { chip: b.uid, chipId: inst.chipId });
    }
  }
  if (changed) { recomputeStats(state); recomputeResearch(state); }
}

// How many bay slots a unit's installed chips occupy. A 2-slot chip fills the
// bay on its own, which is the whole point of the "or a single double chip"
// clause — a Landship is as much of a supply burden as two ordinary upgrades.
export function unitSlotsUsed(state, u) {
  let n = 0;
  for (const c of u.chips || []) n += CHIPS[state.chips[c]?.chipId]?.slots ?? 1;
  return n;
}

// What one unit costs its owner each Upkeep: 1 normally, 2 once its bay is
// full. Read by the charge below and by the HUD, so the number a player is
// quoted and the number they are charged can never drift apart.
export function unitUpkeepFor(state, u) {
  const full = unitSlotsUsed(state, u) >= CONFIG.unit.baySlots;
  return full ? CONFIG.unit.upkeepFullyChipped : CONFIG.unit.upkeep;
}

// Standing armies eat. Charge every owned unit its Upkeep, cheapest-first so a
// broke player keeps as many units in the field as possible and the heavy kit
// is what goes hungry.
//
// Unaffordable → UNSUPPLIED, not destroyed: the unit holds its ground and
// still defends, but it cannot move or spend an action until it is paid again.
// Arrears are always recoverable, matching how dormancy works for chips, posts
// and blockades. This runs after `refreshMoveBudget` and the action refresh in
// startTurn, so zeroing those here is what actually strands the unit.
export function chargeUnitUpkeep(state, pid) {
  const player = state.players[pid];
  if (!player) return;
  const mine = Object.values(state.units).filter((u) => u.owner === pid);
  const dues = mine.map((u) => ({ u, due: unitUpkeepFor(state, u) }));
  // Cheapest first, then uid — deterministic, so the same units starve on a
  // replay of the same game.
  dues.sort((a, b) => a.due - b.due || String(a.u.uid).localeCompare(String(b.u.uid)));

  for (const { u, due } of dues) {
    const was = !u.unsupplied;
    if (player.resource >= due) {
      player.resource -= due;
      emit(state, "resource_spent", {
        player: pid, resource: "Resource", amount: -due, source: "unit-upkeep",
      });
      u.unsupplied = false;
      if (!was) emit(state, "unit_supplied", { owner: pid, unit: u.uid });
    } else {
      u.unsupplied = true;
      u.moveRemaining = 0;
      u.actionsRemaining = 0;
      if (was) emit(state, "unit_unsupplied", { owner: pid, unit: u.uid, due });
    }
  }
}

// §20.8 — when a Location's Loyalty falls below the bonus-slot rung, the chip
// occupying that extra slot is at risk: ejected newest-first (mirroring the
// §17.3 LIFO peel) until the installed count fits the base capacity again.
// Ejected location chips are removed from the game.
export function enforceLoyaltySlotCap(state, pid) {
  let ejectedAny = false;
  for (const loc of Object.values(state.locations)) {
    if (loc.controller !== pid) continue;
    const cap = slotCapacity(loc, state);
    let guard = loc.chips.length + 1;
    while (slotsUsed(state, loc.chips) > cap && guard-- > 0) {
      // newest-first, but never the Capital (it is inert/protected)
      let idx = -1;
      for (let i = loc.chips.length - 1; i >= 0; i--) {
        if (state.chips[loc.chips[i]]?.chipId !== "capital") { idx = i; break; }
      }
      if (idx < 0) break;
      const [ejected] = loc.chips.splice(idx, 1);
      const ejectedId = state.chips[ejected]?.chipId;
      state.removed.push(ejected);
      ejectedAny = true;
      emit(state, "chip_dormant", { chip: ejected, chipId: ejectedId, ejected: true, hex: loc.hexId });
    }
  }
  // Only resync Research if an eject actually changed the installed set — an
  // unconditional recompute would re-derive (and peel) a manually-set wheel.
  if (ejectedAny) { recomputeResearch(state); recomputeInfluence(state); }
}
