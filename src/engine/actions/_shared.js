// src/engine/actions/_shared.js
// Helpers shared across the action submodules. Kept private to actions/ —
// other engine modules should not import from here.

// True iff the player owns a non-disabled copy of the building. Used to gate
// building-conditional logic (Servotech Assembly discount, Light Artillery
// challenge reduction, Signal Jammers / Perimeter Traps reactives, etc.).
export function hasActiveBuilding(player, buildingId) {
  const disabled = new Set(player.disabledBuildingUids ?? []);
  return (player.settlement ?? []).some((b) => b.id === buildingId && !disabled.has(b.uid));
}

// Top up the building row from the deck after a card was claimed (or refresh
// from index 0 at turn-end). Pure.
export function refreshBuildingRow(state, removedIndex) {
  const nextRow = [...state.buildingRow];
  if (removedIndex != null) nextRow.splice(removedIndex, 1);
  const deck = [...state.buildingDeck];
  while (nextRow.length < 5 && deck.length) nextRow.push(deck.shift());
  return { ...state, buildingRow: nextRow, buildingDeck: deck };
}
