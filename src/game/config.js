// Locked v0.1 configuration constants. Mirrors mechanical-spec §14.1.
// The engine reads gameplay numbers from here — never hard-code them.

export const CONFIG = {
  vpThreshold: 12,
  baseActions: 2,

  // §18.2 Loyalty — the 8-slice centre pie that replaces foothold/decay.
  // The ceiling is fixed; the rest are TBD-in-spec tunables, set here for
  // the demo. Capture starts low; a garrisoned, fully-held Location climbs
  // to the ceiling and holds itself; a neglected one bleeds to 0 and then
  // peels Control one section per Upkeep.
  loyalty: {
    ceiling: 8, // §18.2 — fixed; nothing raises it
    start: 2, // initialises low on first reaching full Control
    risePerUpkeep: 1, // +x per Upkeep while garrisoned (capped at ceiling)
    decayPerUpkeep: 1, // −y per Upkeep while neglected (floored at 0)
    dangerThreshold: 2, // warn (loyalty_failing) at/below this, before any peel
    peelPerUpkeep: 1, // Control sections peeled to neutral per Upkeep at 0
  },

  unit: { baseStrength: 4, baseMovement: 1, baySlots: 2 },
  unitRecruitCost: 10,

  contestDieSides: 6, // 1d6 per side, defender wins ties

  tech: { start: 1, tier2: 3, tier3: 6 },
  marketRowSizes: { 1: 5, 2: 4, 3: 3 },

  // Derived per the spec — garrison Strength and base chip slots by a
  // location's strategic value.
  garrisonByValue: { low: 4, medium: 6, high: 8, veryHigh: 10 },
  chipSlotsByValue: { low: 0, medium: 1, high: 2, veryHigh: 3 },

  // The v0.1 test board.
  testMap: [3, 4, 5, 6, 5, 4, 3], // 30 hexes
  hexSplit: { location: 10, encounter: 13, terrain: 7 },

  // Capital chip bonuses (content/config.csv).
  capital: { garrisonBonus: 2, productionBonus: 2 },
};

// Strategic-value ordering helper.
export const VALUE_RANK = { low: 0, medium: 1, high: 2, veryHigh: 3 };
