// src/engine/stateHelpers.js
// Tiny shared helpers used across every engine module. Kept dependency-free
// so any engine file can import without circular-import risk.

// Returns a new state with `updater(player)` applied to the player matching
// `playerId`. Other players and top-level fields are preserved by reference.
export function updatePlayer(state, playerId, updater) {
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? updater(p) : p)),
  };
}

// Appends a log entry tagged with the current round. `entry` is spread after
// `round` so callers can override round if needed (rare).
export function logEntry(state, entry) {
  return { ...state, log: [...(state.log ?? []), { round: state.round, ...entry }] };
}
