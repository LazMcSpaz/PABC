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

  // §16.2 terrain movement — per-hex entry costs over the base 1/hex.
  // Forest (cover) costs extra; mountains (elevation) HALT a move (you may
  // climb onto one but advance no further that turn — "speed 1 in mountains").
  // (Roads, when added, will reduce these.)
  movement: {
    forestCost: 2,     // entering a cover/forest hex costs this (vs 1) — "−1 speed"
    mountainHalts: true, // entering an elevation/mountain hex ends the move
  },

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

  // §19 Exploration, Vision & Fog of War. Per-faction sight; LoS over
  // elevation/cover; concealment + ambush. All TBD-in-spec; demo defaults
  // here. Built for a larger map — nothing keys off the 30-hex field.
  fog: {
    unitVision: 2, // §19.3 base sight radius of a unit
    unitDetection: 0, // §19.5 a plain unit has NO Detection — concealment hides
                      // even point-blank; Detection comes from scout/recon/
                      // watchtower chips + the Intelligence vision path (§19.7).
    locationVisionBase: 1, // §19.3 a controlled Location's base sight
    locationVisionPerLoyalty: 0.25, // + floor(loyalty × this): a loyal core sees farther
    zocVision: 0, // §19.3 ZoC-owned hexes contribute sight at this radius (0 = the hex itself)
    elevationVisionBonus: 1, // §19.4 a source on elevation sees +this (and over ridges)
    coverSightCost: 1, // §19.4 extra sight cost to see INTO a cover hex
    ambushBonus: 2, // §19.5 ambush edge added to the surpriser's contest total
    ghostMaxAge: null, // §19.11 ghost aging (TBD) — null = ghosts never expire
    intelVisionBonus: 1, // §19.8 Intelligence vision-branch faction-wide sight bonus
    intelDetection: 1, // §19.8 Intelligence vision-branch detection
    terrainSeedDensity: { elevation: 0.18, cover: 0.22 }, // §19.4 share of terrain hexes
  },

  // §17.7 Listening Post (Intelligence A2) — a unit-built, concealed Vision
  // source that survives by stealth, not toughness. Costs scrap to build and
  // a trickle of scrap per Upkeep to keep paid (else it goes dormant).
  posts: {
    buildCost: 3, // §17.7 — 1 Action + 3 scrap to deploy
    upkeep: 1,    // §17.7 — 1 scrap per Upkeep; unpaid → dormant
    defense: 5,   // §17.7 — defends a contest as a standing garrison Str 5 + 1d6
    range: 1,     // §17.7 — radius-1 Vision footprint (Vision only, no Detection)
  },

  // §18.4–§18.13 Diplomacy. Standing is pairwise (numeric); Menace/Honor are
  // global player reputations; Tolerance & the trust floor are DERIVED gates.
  // All TBD-in-spec, inline here and tunable.
  diplomacy: {
    // §18.5 Standing tiers (numeric thresholds). Vassal is a separate flag.
    standingMin: -10, standingMax: 12,
    tiers: { hostile: -6, wary: -3, neutral: -1, friendly: 5, allied: 8 }, // value >= → tier (0 = Neutral)
    pactStandingReq: 6, // §18.7 Standing needed to form a pact (Friendly+)
    driftPerRound: 1, // §18.5 Standing drifts toward Neutral when unreinforced…
    grudgeDriftScale: 1, // …modulated by the faction's grudge (high grudge → slower fade)
    seedJitter: 3, // §18.4.1 per-seed jitter on seeded faction↔faction standing

    // §18.5 Menace — reputation for UNJUSTIFIED aggression, scored vs target.
    menace: {
      base: 3, // magnitude of a single attack's Menace swing
      decayPerRound: 1, // slow decay with clean play / time
      min: 0, max: 24,
    },
    // §18.5 Honor — reputation for keeping your word (global).
    honor: {
      start: 4, min: -12, max: 12,
      keepGain: 1, // honoring a pact/deal to term
      breakLoss: 5, // breaking a pact call / treaty / promise (sharp)
      mediateGain: 2, // §18.7 peacemaker reputation
      surpriseAttackLoss: 8, // §1.1 — attacking before declaring war (treachery)
      decayToward: 0, decayPerRound: 0, // no passive decay by default
    },
    // §18.5 Tolerance = base + standing·perStanding, ± by the faction's
    // aggression (a warlord tolerates a bloodier ally than a pacifist).
    tolerance: { base: 5, perStanding: 0.6, aggressionScale: 8 },
    // §18.5 trust floor: Honor must exceed this to deepen — liars hit a wall.
    trustFloor: { base: -2, distrustScale: 6 }, // higher faction.trust → higher floor

    // §18.8 Coalition — threat(player)=wM·Menace + wP·powerLead. Forms past
    // `threshold`, dissolves below `dissolve` (hysteresis).
    coalition: { wM: 1, wP: 2, threshold: 16, dissolve: 11, vpWeight: 1.5, territoryWeight: 1, standingHit: 4 },

    // §18.10 Recognition victory — Allied=1, Vassal=2; win at threshold while
    // Menace < each contributor's Tolerance and Honor > its floor. Threshold
    // ≈ a majority of the field's worth of acknowledgement (e.g. 3 vassals,
    // or 2 vassals + 2 allies) so the peaceful win is earned, not trivial.
    recognition: { alliedWeight: 1, vassalWeight: 2, threshold: 6 },

    // §18.9 Vassalage.
    vassal: {
      tributeScrap: 2, // tribute flow per round to the lord
      tributeResearch: 0,
      resentmentPerRound: 1, // base autonomy/resentment growth
      rebellionThreshold: 10, // resentment past this → rebel
      lordWeaknessScale: 2, // a weak lord raises resentment faster
    },

    // §18.8 AI valuation / cadence dials.
    ai: {
      relationshipBiasPerStanding: 0.5, // bias in wouldAccept, scales with Standing
      sociabilityScale: 4, // eagerness to seek pacts
      localityRadius: 3, // §18.4.1 scope:"local" minors only engage within this hop radius
      giftStandingPerScrap: 0.5, // Standing bought per scrap gifted
      warGrudgeThreshold: -5, // AI declares war when Standing falls to/below this (+ aggression)
      vassalPowerRatio: 0.4, // offer/accept vassalage when weak side power < ratio·strong side
    },

    // --- diplomacy-spec.md §6.3 — the verb/AI/agreement layer on top of §18.
    // Playtest starting numbers (all TBD-tunable).
    gift: { windowRounds: 3 }, // §1.2 — gift diminishing-returns window
    tradingPact: { // §1.3
      scrapPerUpkeep: 2,
      permanentResearchOnFormation: 1, // Research FLOOR granted each party; removed on dissolve
      suspendGraceRounds: 3, // consecutive suspended rounds → auto-dissolve
    },
    demandTribute: { // §1.4
      minPowerRatio: 1.5, // power needed over target to even offer the demand
      caveBaseRatio: 2.0,
      braveryScale: 1.5,
      escalateOnRefusal: "war", // "war" | "standing-drop"
      refuseStandingDropTiers: 2,
    },
    suePeace: { acceptThreshold: 8, standingBoost: 3 }, // §1.5
    war: { unitLossWeight: 2, locationLossWeight: 4 }, // §1.5 war-exhaustion weights
    freeVassal: { // §1.7
      honorGain: 5,
      standingToFriendly: 5, // Standing value the freed vassal takes toward you
      rivalCoolingTiers: 1, // tiers the freed party's rivals cool toward you
    },
    pactCall: { // §1.8
      hostilityWeight: 0.3,
      loyaltyWeight: 0.3,
      targetPowerWeight: 2.0,
      acceptScoreThreshold: 1,
      aggressionScoreBias: 1, // ±1 to score from the ally's aggression dial
      honorGainOnHonor: 2, // ally→caller Standing gain on honoring
      declineStandingHit: 4, // caller→ally Standing hit on declining
    },
    vision: { sharedPactDefault: true }, // §1.9 — pacts auto-share vision by default
    borders: { pactDefault: true }, // §1.10 — pacts auto-open borders by default
    // Open-borders ENFORCEMENT — open borders is a permit, not a wall: a unit
    // may always move into another faction's territory (conquest needs that),
    // but moving through their ZoC WITHOUT an open-borders agreement is
    // trespassing and costs relations (softened when already on good terms).
    trespass: {
      standingPenalty: 2, // relationship hit (owner → mover) per incursion — the larger hit
      reputationPenalty: 1, // global Menace bump on the mover — the smaller hit
      goodTermsReduction: 1, // both softened by this when on Friendly+ terms (floored)
    },
    pact: { // §1.9, §1.10 — toggle costs
      toggleVisionStandingHit: 1,
      toggleBordersStandingHit: 1,
    },
  },
};

// Strategic-value ordering helper.
export const VALUE_RANK = { low: 0, medium: 1, high: 2, veryHigh: 3 };
