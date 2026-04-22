// Event card effects apply to all players simultaneously when the card is
// drawn. Pattern per README: EVENT_EFFECTS[id] = (state) => newState.
// See "Event Card Automation" in the README known-issues section.
export const EVENT_EFFECTS = {};

export function applyEvent(state, cardId) {
  const fn = EVENT_EFFECTS[cardId];
  return fn ? fn(state) : state;
}
