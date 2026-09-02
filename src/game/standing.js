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

// --- the Standing receipt (diplomacy brief §12.1) ---------------------
//
// Standing is the one number the win condition reads, and until now it was
// the only reputation measure with NO receipt at all: Menace and Honor both
// keep a `repLog` of causes, and the drawer renders them. A player who cannot
// see why a faction cooled on them cannot plan around it, which is the Civ IV
// lesson — a visible attitude breakdown is still called the series' best
// diplomacy fifteen years on.
//
// Kept per ORDERED pair, because Standing is pairwise and asymmetric: what
// Goldgrass holds against you is a different list from what you hold against
// Goldgrass.
//
// The magnitudes are kept here but are ESPIONAGE PRODUCT at the display layer
// (§12.2). Rendering signed deltas the way `repReceipts` does would hand the
// player a derivable running total for the one value the design says must be
// purchasable rather than readable, so `engineAdapter` renders the reasons
// ungated and the numbers behind Spy Ring.
const STANDING_LOG_MAX = 12;

// Causes that describe the arithmetic rather than an act. A receipt reading
// "unreinforced" every round would bury the acts that actually happened.
const UNRECORDED_CAUSES = new Set(["drift", "seed", "test"]);

export function recordStandingCause(state, a, b, delta, value, cause) {
  if (!delta || !cause || UNRECORDED_CAUSES.has(cause)) return;
  const dip = state.diplomacy;
  if (!dip) return; // pre-diplomacy fixtures: nothing to write into
  const log = (dip.standingLog ||= {});
  const row = (log[a] ||= {});
  const list = (row[b] ||= []);
  list.push({ cause, delta, value, round: state.round });
  if (list.length > STANDING_LOG_MAX) list.splice(0, list.length - STANDING_LOG_MAX);
}

// A's receipts toward B, newest first.
export function standingReceipts(state, a, b) {
  const list = state.diplomacy?.standingLog?.[a]?.[b] || [];
  return list.slice().reverse();
}

// Adjust A's Standing toward B by `amount`, clamped to the configured
// range, emitting standing_changed. Works for any pair (faction↔faction
// or faction↔player) — minors need not be in state.players.
export function adjustStanding(state, a, b, amount, cause) {
  if (!a || !b || a === b || !amount) return getStanding(state, a, b);
  state.factionStanding = state.factionStanding || {};
  state.factionStanding[a] = state.factionStanding[a] || {};
  const { standingMin, standingMax } = CONFIG.diplomacy;
  const prev = getStanding(state, a, b);
  const next = Math.max(standingMin, Math.min(standingMax, prev + amount));
  state.factionStanding[a][b] = next;
  // The CLAMPED movement, not the requested amount: a pair already pinned at
  // the ceiling should not accrue a receipt for an adjustment that did nothing.
  recordStandingCause(state, a, b, next - prev, next, cause);
  emit(state, "standing_changed", { faction: a, player: b, value: next, delta: amount, cause });
  return next;
}

export function setStanding(state, a, b, value, cause) {
  state.factionStanding = state.factionStanding || {};
  state.factionStanding[a] = state.factionStanding[a] || {};
  const { standingMin, standingMax } = CONFIG.diplomacy;
  const next = Math.max(standingMin, Math.min(standingMax, value));
  const moved = next - getStanding(state, a, b);
  state.factionStanding[a][b] = next;
  recordStandingCause(state, a, b, moved, next, cause);
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
