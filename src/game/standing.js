// Faction-standing hooks (mechanical-spec §15.3). The engine adjusts
// the factionStanding matrix and the world counters in response to a
// small set of mechanical events — captures of affiliated locations
// and successful raids on a faction's units. Content authors layer
// further standing changes via the ADJUST_STANDING effect.
import { LOCATIONS } from "./content.js";
import { emit } from "./events.js";

const CAPTURE_PENALTY = 2;
const RAID_PENALTY = 1;

function adjust(state, faction, player, amount, cause) {
  if (!state.players[player]) return;
  state.factionStanding[faction] = state.factionStanding[faction] || {};
  const next = (state.factionStanding[faction][player] || 0) + amount;
  state.factionStanding[faction][player] = next;
  emit(state, "standing_changed", {
    faction, player, value: next, delta: amount, cause,
  });
}

// Called from contest.js captureLocation after location_captured emits.
// The captured location's affiliated faction (if any, and if not the
// captor itself) loses standing toward the new controller.
export function onLocationCaptured(state, hex, newController, oldController) {
  const loc = state.locations[hex];
  if (!loc) return;
  const aff = LOCATIONS[loc.locationId]?.affiliation;
  if (!aff || aff === newController) return;
  adjust(state, aff, newController, -CAPTURE_PENALTY, "location-captured");
}

// Called from contest.js resolveRaidWin. Increments the defender
// faction's recent-raid counter and decrements its standing toward
// the raider. Counters decay each round (see turn.js).
export function onRaidWon(state, raider, defendingUnit) {
  const defFaction = defendingUnit?.owner;
  if (!defFaction) return;
  state.world.raidCounts[defFaction] = (state.world.raidCounts[defFaction] || 0) + 1;
  adjust(state, defFaction, raider, -RAID_PENALTY, "raid-won");
}
