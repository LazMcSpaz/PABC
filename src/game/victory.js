// What a faction's holdings are worth, and whether that wins the game.
//
// VP is HELD, not banked (2026-08-16). A faction draws a Location's VP for
// exactly as long as it holds the place, and loses it the moment it does not.
// There is no capture bounty and no per-Upkeep dominion tick — the previous
// model paid a one-off bounty on first capture and then trickled VP for cities
// you held, which meant a board could be won by an early land-grab and then
// coasted on. Now the scoreboard IS the map: take a city and your total rises,
// lose it and your total falls.
//
// Loyalty scales it. A place is worth its full value while its people are
// with you — Loyalty OVER half the counter — and half that while they are
// not. Holding a city you have not settled is worth something, but not
// everything.
//
// Not everything is a settlement, so a faction's total is:
//
//     vp = bankedVp + settlementVp
//
// `bankedVp` is the accumulating half — recognition summits, encounter and
// quest grants, the alliance trickle. Those still only go up. Settlement VP
// is recomputed from the board and can go either way.
//
// A leaf-ish module: config, content, events and control (itself a leaf), so
// every layer that changes control can call recomputeVp without a cycle.
import { CONFIG } from "./config.js";
import { LOCATIONS, factionDef } from "./content.js";
import { emit } from "./events.js";
import { holdsLocation } from "./control.js";

// Is this Location's population with its holder? Capitals are inert — their
// Loyalty is locked at the ceiling and stored as null — so they always count
// as settled. "Over half" is strict: on an 8-point counter, 5 and up.
export function loyaltySettled(loc) {
  if (loc.loyalty == null) return true;
  return loc.loyalty > CONFIG.loyalty.ceiling / 2;
}

// What `fid` currently draws from one Location. Zero unless they hold it —
// outright OR by majority, the same bar the rest of the engine uses for
// "hold", so a besieged city still pays its holder something.
//
// The half share FLOORS, which means a 1-VP outpost held at low Loyalty is
// worth nothing at all. That is deliberate: the smallest holdings only score
// once you have actually settled them.
export function locationVp(state, loc, fid) {
  if (!holdsLocation(loc, fid)) return 0;
  const base = LOCATIONS[loc.locationId]?.vpReward || 0;
  return loyaltySettled(loc) ? base : Math.floor(base / 2);
}

export function settlementVp(state, fid) {
  let n = 0;
  for (const loc of Object.values(state.locations)) n += locationVp(state, loc, fid);
  return n;
}

// Recompute every faction's total from the board and bank, emit on any change,
// and latch a winner if one has crossed the threshold.
//
// Call this after ANYTHING that moves control or Loyalty. It is cheap (one
// pass over the Locations per faction) and idempotent, so calling it twice
// costs nothing and missing a call is the only real failure mode.
export function recomputeVp(state, { emitEvents = true } = {}) {
  for (const pid of Object.keys(state.players)) {
    const p = state.players[pid];
    if (!p) continue;
    const next = (p.bankedVp || 0) + settlementVp(state, pid);
    if (next === p.vp) continue;
    const from = p.vp;
    p.vp = next;
    if (emitEvents) emit(state, "vp_changed", { player: pid, from, to: next });
  }
  // Winner check runs after every total is current, so a simultaneous swing
  // cannot hand the game to whoever happened to be recomputed first.
  if (!state.winnerId) {
    for (const pid of state.turnOrder) {
      const p = state.players[pid];
      if (!p || factionDef(pid)?.tier !== "major") continue; // minors never win
      // Conquest can be switched off at setup. Doing so removes a way to END
      // the game, never a way to score — VP keeps accruing and the scoreboard
      // still reads, there is just no line to cross.
      if (state.rules?.victory?.conquest === false) break;
      if (p.vp >= CONFIG.vpThreshold) { state.winnerId = pid; break; }
    }
  }
}

// Add to the accumulating half (recognition, encounters, the alliance
// trickle), then re-total. The one entry point for VP that is NOT held.
export function bankVp(state, pid, amount, source) {
  const p = state.players[pid];
  if (!p || !amount) return;
  p.bankedVp = (p.bankedVp || 0) + amount;
  emit(state, "resource_gained", { player: pid, resource: "VP", amount, source });
  recomputeVp(state);
}
