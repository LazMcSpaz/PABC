// Intrigue card effects. Two shapes supported:
//   INTRIGUE_EFFECTS[id] = (state, playerId, target) => newState
// or, for Immediate cards that fire reactively:
//   INTRIGUE_EFFECTS[id] = {
//     immediate: true,
//     trigger: "raid_declared_against",
//     effect: (state, defenderId, attackerId) => newState,
//   }
// See README "Intrigue Card Automation" notes.

export const INTRIGUE_EFFECTS = {};

export function playIntrigue(state, cardId, playerId, target) {
  const entry = INTRIGUE_EFFECTS[cardId];
  if (!entry) return state;
  if (typeof entry === "function") return entry(state, playerId, target);
  if (entry.immediate && typeof entry.effect === "function") {
    return entry.effect(state, playerId, target);
  }
  return state;
}
