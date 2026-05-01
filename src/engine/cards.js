// src/engine/cards.js
// Ashland Conquest — Age 1 Card Data
// Source of truth for all card definitions.
// Schema definitions are in README.md > Card Data Reference.
//
// Card data is split by section under ./cards/. This module is a barrel that
// re-exports each section plus a few derived collections used during deck setup.

export { BUILDINGS } from "./cards/buildings.js";
export { UPGRADES } from "./cards/upgrades.js";
export { LEADERS } from "./cards/leaders.js";
export { CHALLENGES } from "./cards/challenges.js";
export { PROGRESSION_CHALLENGES } from "./cards/progression.js";
export { EVENTS } from "./cards/events.js";
export { INTRIGUE_CARDS } from "./cards/intrigue.js";
export { NARRATIVE_CHAINS } from "./cards/narrative.js";

import { BUILDINGS } from "./cards/buildings.js";
import { LEADERS } from "./cards/leaders.js";
import { CHALLENGES } from "./cards/challenges.js";
import { PROGRESSION_CHALLENGES } from "./cards/progression.js";
import { EVENTS } from "./cards/events.js";
import { NARRATIVE_CHAINS } from "./cards/narrative.js";


// ─── CONVENIENCE EXPORTS ──────────────────────────────────────────────────────
// Flattened and tagged collections for deck building.

export const ALL_EXPLORATION_CARDS = [
  ...CHALLENGES,
  ...PROGRESSION_CHALLENGES,
  ...EVENTS,
  // Narrative Beat 1 cards are included here — they enter the starting Exploration deck.
  // Beats 2+ are kept out of the deck and drawn procedurally when prior beats complete.
  ...NARRATIVE_CHAINS.flatMap(chain =>
    chain.beats.filter(b => b.inStartingDeck).map(b => ({
      id: `${chain.id}_beat_${b.beat}`,
      name: b.name,
      type: "Challenge (Narrative)",
      chainId: chain.id,
      chainName: chain.name,
      beat: b.beat,
      age: 1,
      surprise: b.surprise,
      scrapCost: b.scrapCost,
      reqAtk: b.reqAtk,
      reqDef: b.reqDef,
      scrapReward: 0,
      atkReward: 0,
      defReward: 0,
      actionReward: 0,
      vp: b.vp,
      ability: b.ability,
      flavor: b.flavor,
    }))
  ),
];

export const ALL_PURCHASABLE_BUILDINGS = BUILDINGS.filter(b => b.type === "Building");
export const STARTER_BUILDINGS = BUILDINGS.filter(b => b.type === "Starter");
export const STARTER_LEADERS = LEADERS.filter(l => l.type === "Leader (Starter)");
export const DISCOVERABLE_LEADERS = LEADERS.filter(l => l.type === "Leader");

// Deck qty helpers — returns an array with each card repeated by its qty value.
export function expandByQty(cards) {
  return cards.flatMap(card =>
    Array.from({ length: card.qty || 1 }, (_, i) => ({
      ...card,
      uid: `${card.id}_${i}`,
    }))
  );
}
