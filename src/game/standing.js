// Faction-standing hooks (mechanical-spec §15.3, extended for §18.4/§18.5).
// `state.factionStanding[A][B]` is A's pairwise Standing toward B, held for
// BOTH player↔faction AND faction↔faction pairs. The engine nudges it in
// response to mechanical events (captures, raids) and the diplomacy layer
// (deals, pacts, denouncements); content authors layer changes via the
// ADJUST_STANDING effect. Values are clamped to the §18.5 range.
import { LOCATIONS } from "./content.js";
import { emit } from "./events.js";
import { CONFIG } from "./config.js";

const CAPTURE_PENALTY = 2;
const RAID_PENALTY = 1;

// --- generalized pairwise Standing API (§18.5) -----------------------

export function getStanding(state, a, b) {
  return state.factionStanding?.[a]?.[b] || 0;
}

// Adjust A's Standing toward B by `amount`, clamped to the configured
// range, emitting standing_changed. Works for any pair (faction↔faction
// or faction↔player) — minors need not be in state.players.
export function adjustStanding(state, a, b, amount, cause) {
  if (!a || !b || a === b || !amount) return getStanding(state, a, b);
  state.factionStanding = state.factionStanding || {};
  state.factionStanding[a] = state.factionStanding[a] || {};
  const { standingMin, standingMax } = CONFIG.diplomacy;
  const next = Math.max(standingMin, Math.min(standingMax, getStanding(state, a, b) + amount));
  state.factionStanding[a][b] = next;
  emit(state, "standing_changed", { faction: a, player: b, value: next, delta: amount, cause });
  return next;
}

export function setStanding(state, a, b, value, cause) {
  state.factionStanding = state.factionStanding || {};
  state.factionStanding[a] = state.factionStanding[a] || {};
  const { standingMin, standingMax } = CONFIG.diplomacy;
  const next = Math.max(standingMin, Math.min(standingMax, value));
  state.factionStanding[a][b] = next;
  emit(state, "standing_changed", { faction: a, player: b, value: next, delta: null, cause });
  return next;
}

// §18.5 — classify a numeric Standing into a tier name.
export function standingTier(value) {
  const t = CONFIG.diplomacy.tiers;
  if (value >= t.allied) return "allied";
  if (value >= t.friendly) return "friendly";
  if (value >= t.neutral) return "neutral";
  if (value >= t.wary) return "wary";
  return "hostile";
}

// --- mechanical event hooks (§15.3) ----------------------------------

// Called from contest.js captureLocation after location_captured emits.
// The captured location's affiliated faction (if any, and if not the
// captor itself) loses standing toward the new controller.
export function onLocationCaptured(state, hex, newController, oldController) {
  const loc = state.locations[hex];
  if (!loc) return;
  const aff = LOCATIONS[loc.locationId]?.affiliation;
  if (!aff || aff === newController) return;
  adjustStanding(state, aff, newController, -CAPTURE_PENALTY, "location-captured");
}

// Called from contest.js resolveRaidWin. Increments the defender
// faction's recent-raid counter and decrements its standing toward
// the raider. Counters decay each round (see turn.js).
export function onRaidWon(state, raider, defendingUnit) {
  const defFaction = defendingUnit?.owner;
  if (!defFaction) return;
  state.world.raidCounts[defFaction] = (state.world.raidCounts[defFaction] || 0) + 1;
  adjustStanding(state, defFaction, raider, -RAID_PENALTY, "raid-won");
}
