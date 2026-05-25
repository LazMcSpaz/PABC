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

  unit: {
    baseStrength: 4,
    baseMovement: 2, // v0.2 §16.2 — was 1; movement is now its own budget
    baySlots: 2,
    baseStrengthCap: 4, // v0.2 §16.3 — base Strength doubles as HP, capped here
    veteranStrengthCap: 8, // §16.7 combining (deferred)
  },
  baseUnitCap: 3, // v0.2 §16.3 — cap = baseUnitCap + Training Grounds
  startingUnits: 2, // v0.2 §16.3
  unitRecruitCost: 6, // v0.2 §16.3 — was 10

  contestDieSides: 6, // 1d6 per side, defender wins ties

  // v0.2 §16.4 attrition
  attrition: { routMargin: 4 }, // margin >= this spills a casualty to a 2nd stacked unit
  // v0.2 §16.5 healing / reinforcement
  heal: { passivePerTurn: 1, scrapPerStrength: 2 },
  // v0.2 §16.6 combat levers
  combat: {
    concentrationPerUnit: 1,
    concentrationCap: 3,
    mountainDefenseBonus: 1,
    fortifyBonus: 1,
    veteranBonus: 1,
  },
  veteran: { winsToPromote: 3, survivedToPromote: 5 },

  // §17 Tech Wheel. Research fills a bar; Tech Level is a derived band
  // (1–5); each new level grants one Ability Point to spend on the wheel.
  tech: {
    researchThresholds: [2, 4, 6, 8], // research needed for L2, L3, L4, L5
    maxLevel: 5,
    marketTierByLevel: { 2: 3, 3: 5 }, // Market tier 2 @ L3, tier 3 @ L5
  },
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

  // §18.3 Influence & Zone of Control — the deterministic scalar field a
  // faction's controlled Locations project, and the dominance test that
  // turns it into a ZoC owner map. All TBD-in-spec; demo defaults here.
  influence: {
    range: 2, // R — hops a Location projects influence
    factionBase: 2, // faction-wide base contributed per controlled Location
    loyaltyScale: 1, // local influence = loyaltyScale × the Location's Loyalty
    falloff: 0.5, // per-hop multiplier — contribution at d hops = source × falloff^d
    dominanceThreshold: 3, // a hex needs at least this Influence to join any ZoC
  },
  // §20 Economy & City Development — chips are the output of the economy,
  // built off each Location's Output via the guns/butter slider (Market retired).
  economy: {
    // §20.6 Tech-Level build gate: chip techLevel T needs player Tech Level >= gate[T].
    buildTechGate: { 1: 1, 2: 3, 3: 5 },
    // §20.6 Loyalty rung granting the +1 chip slot (drop below → eject newest, §20.8).
    bonusSlotLoyalty: 6,
    // §20.3 default guns/butter split f∈[0,1]: scrapBank += (1−f)·Output, build += f·Output.
    defaultSlider: 0,
    // §20.7 rush rate — banked scrap per build-point.
    rushScrapPerPoint: 1,
  },
};

// Strategic-value ordering helper.
export const VALUE_RANK = { low: 0, medium: 1, high: 2, veryHigh: 3 };
