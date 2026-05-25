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
import { CHIPS, chipDefOf } from "./content.js";
import { emit } from "./events.js";
import { recomputeStats, recomputeResearch } from "./stats.js";
import { recomputeInfluence } from "./influence.js";
import { hasTechNode } from "./tech.js";

// §20.6 — the Tech Level a chip of `techLevel` T demands of the builder
// (the same §17.2 thresholds, applied to building). techLevel 1 → L1,
// 2 → L3, 3 → L5.
export function techLevelReqFor(chipTechLevel) {
  return CONFIG.economy.buildTechGate[chipTechLevel] || 1;
}

export function meetsTech(player, def) {
  return (player.techLevel || 1) >= techLevelReqFor(def.techLevel || 1);
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
// locked) count as fully integrated.
export function slotCapacity(loc) {
  const loy = loc.loyalty == null ? CONFIG.loyalty.ceiling : loc.loyalty;
  return loc.chipSlots + (loy >= CONFIG.economy.bonusSlotLoyalty ? 1 : 0);
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
  return Math.max(0, out);
}

// §20.6 build menu (DISPLAY CONTRACT) — the chips a player MAY build at this
// Location. Returns ONLY chips the player's Tech Level allows; each is tagged
// `locked` (true when Loyalty is short) with a human reason. Tech-forbidden
// chips are omitted entirely. Unit chips are included only as `unit`-kind
// (the caller checks for a stationed friendly unit + bay space).
export function buildableChips(state, loc) {
  const player = state.players[loc.controller];
  if (!player) return [];
  const out = [];
  for (const def of Object.values(CHIPS)) {
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
  if (!techOk) reasons.push(`needs Tech L${techLevelReqFor(next.techLevel || 1)}`);
  if (!loyOk) reasons.push(`needs Loyalty ${next.loyaltyReq}`);
  return {
    chipId: nextId,
    def: next,
    fromUid: chipUid,
    locked: !techOk || !loyOk,
    reason: reasons.join(", ") || null,
  };
}

// A friendly unit stationed at the Location with room for `slots` more bay,
// or null. Unit chips (§20.4) install into such a unit's Bay.
export function stationedUnitWithBay(state, loc, slots) {
  for (const u of Object.values(state.units)) {
    if (u.owner !== loc.controller || u.node !== loc.hexId) continue;
    if (slotsUsed(state, u.chips) + slots <= CONFIG.unit.baySlots) return u;
  }
  return null;
}

// Apply the guns/butter split for one Location at Upkeep (§20.3) and advance
// / complete its active build (§20.4 / §20.5). Returns the scrap banked.
function processLocationEconomy(state, loc) {
  const output = locationOutput(state, loc);
  loc.output = output; // cache the derived value for the HUD
  const ab = loc.activeBuild;
  // No active build → the whole Output banks as liquid scrap (construction
  // throughput has nowhere to go, so it is never wasted).
  if (!ab) return output;

  const f = Math.max(0, Math.min(1, loc.buildSlider ?? 0));
  const scrapGain = Math.floor((1 - f) * output);
  const buildGain = output - scrapGain; // conserve the total; build keeps the remainder
  loc.buildProgress = (loc.buildProgress || 0) + buildGain;
  completeBuildIfDone(state, loc);
  return scrapGain;
}

// §20.4 / §20.5 — install / upgrade once buildProgress clears the cost.
// Overflow carries to the next build (the active build is then cleared, so
// the carry sits as progress with no target until a new one is chosen).
export function completeBuildIfDone(state, loc) {
  const ab = loc.activeBuild;
  if (!ab) return false;
  if ((loc.buildProgress || 0) < ab.cost) return false;

  const overflow = (loc.buildProgress || 0) - ab.cost;
  const def = CHIPS[ab.chipId];

  if (ab.kind === "upgrade") {
    // Replace in place (§20.5): mutate the existing instance's chipId so the
    // slot/uid are preserved, then re-stamp it "newest" (move to the end of
    // its holder's list) so §6.3.3 capture destroys the freshest gear.
    const inst = state.chips[ab.targetChipUid];
    if (!inst) { loc.activeBuild = null; loc.buildProgress = 0; return false; }
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
        slotsUsed(state, u.chips) + (def.slots || 1) <= CONFIG.unit.baySlots
        ? u
        : stationedUnitWithBay(state, loc, def.slots || 1);
      if (!target) {
        // No friendly unit to arm — forfeit (the chip never lands).
        delete state.chips[uid];
        loc.activeBuild = null;
        loc.buildProgress = 0;
        return false;
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
  loc.buildProgress = overflow; // carry surplus toward the next build
  return true;
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
  for (const loc of Object.values(state.locations)) {
    if (loc.controller !== pid) continue;
    banked += processLocationEconomy(state, loc);
  }
  if (banked > 0) {
    state.players[pid].resource += banked;
    emit(state, "resource_gained", {
      player: pid, resource: "Resource", amount: banked, source: "output",
    });
  }
}

// §20.9 selective chip upkeep — sum the per-chip `upkeep` of every chip pid
// controls and charge it from banked scrap. Cheapest-first so a cash-strapped
// player keeps as many chips live as possible; any chip that can't be paid
// goes DORMANT (the §12.5 `disabled` flag suppresses its passives) and
// reactivates the moment its upkeep can be paid again. Never destroyed.
export function chargeChipUpkeep(state, pid) {
  const player = state.players[pid];
  const bearing = [];
  for (const loc of Object.values(state.locations)) {
    if (loc.controller !== pid) continue;
    for (const c of loc.chips) {
      const up = chipDefOf(state, c)?.upkeep || 0;
      if (up > 0) bearing.push({ uid: c, upkeep: up, holder: loc });
    }
  }
  for (const u of Object.values(state.units)) {
    if (u.owner !== pid) continue;
    for (const c of u.chips) {
      const up = chipDefOf(state, c)?.upkeep || 0;
      if (up > 0) bearing.push({ uid: c, upkeep: up, holder: u });
    }
  }
  if (!bearing.length) return;
  bearing.sort((a, b) => a.upkeep - b.upkeep);

  let changed = false;
  for (const b of bearing) {
    const inst = state.chips[b.uid];
    if (!inst) continue;
    if (player.resource >= b.upkeep) {
      player.resource -= b.upkeep;
      emit(state, "resource_spent", { player: pid, resource: "Resource", amount: -b.upkeep, source: "upkeep" });
      if (inst.disabled) {
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

// §20.8 — when a Location's Loyalty falls below the bonus-slot rung, the chip
// occupying that extra slot is at risk: ejected newest-first (mirroring the
// §17.3 LIFO peel) until the installed count fits the base capacity again.
// Ejected location chips are removed from the game.
export function enforceLoyaltySlotCap(state, pid) {
  let ejectedAny = false;
  for (const loc of Object.values(state.locations)) {
    if (loc.controller !== pid) continue;
    const cap = slotCapacity(loc);
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
