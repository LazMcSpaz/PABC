// Locked v0.1 configuration constants. Mirrors mechanical-spec §14.1.
// The engine reads gameplay numbers from here — never hard-code them.

export const CONFIG = {
  vpThreshold: 12,
  // Per-entity actions (docs/vp-and-actions-design.md §2/§4): every unit
  // and Location gets 1 action per turn; the old global pool survives as a
  // WILDCARD pool (base 0) that effect-granted actions (Staging Ground,
  // reactive cards) feed — any entity may spend a wildcard when its own
  // action is gone.
  baseActions: 0,

  // Repeatable VP faucets (docs/vp-and-actions-design.md §1). Dominion:
  // +vpPerCity per Upkeep for each high/veryHigh Location the player (or a
  // vassal of theirs) fully holds at Loyalty >= loyaltyMin that is NOT one
  // of the player's own affiliated cities — dominion is rule over others'
  // land, so a homeland never ticks. Alliance trickle: +allianceTrickle
  // per Upkeep while pacted with a majority of the other surviving majors.
  victory: {
    // 4 (was 6): the rung was calibrated for the old all-or-nothing control
    // model, where a city you held was quiet. Under graduated control a
    // contested city hovers around Loyalty 1–4 for most of a war, so the
    // Dominion faucet ran bone dry — sim leaders plateaued at 9–11 VP with
    // nothing left to earn. 4 keeps it a real bar (a neglected city still
    // misses) while rewarding the "hold and settle it" play.
    dominionLoyaltyMin: 4,
    dominionPerCity: 1,
    // Paid PER allied major, once you're pacted with a majority of them —
    // so breadth of alliance scales the way breadth of conquest does.
    allianceTrickle: 1,
  },

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
    // A unit beginning its turn ON a road hex marches +this Movement that
    // turn — the highway network is a fast lane for armies, not only a
    // terrain-negator (playtest: roads otherwise only differ from open
    // ground on the map's few forest/mountain hexes).
    roadStartBonus: 1,
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

  // AI combat judgment (docs/ai-overhaul-plan.md item 4 — "contests are
  // blind"). The AI only commits to a contest when its estimated win
  // probability clears a threshold; the threshold drops as the faction's
  // `aggression` dial rises, so a warlord fights worse odds than a
  // cautious minor. `floor` never goes below `min` even at aggression 1.
  ai: {
    contestWinProbBase: 0.55, // required win% at aggression 0
    contestWinProbAggressionScale: 0.35, // subtracted at aggression 1
    contestWinProbMin: 0.15, // never accept worse odds than this, however aggressive
  },

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
  // Playtest: one slot per medium city meant a single build ended a town's
  // development (and scrap piled up with nothing to sink into). Raised one
  // across the board; the Loyalty-6 bonus slot still adds one more.
  chipSlotsByValue: { low: 1, medium: 2, high: 3, veryHigh: 4 },

  // §16.2 roads. Every settlement is road-linked to its nearest neighbour;
  // bigger ones also reach their second-nearest, which is what turns a chain
  // of towns into a network with alternate routes worth cutting. Raising the
  // high/veryHigh numbers thickens the network (and makes blockades less
  // decisive, since traffic can route around); lowering them to 1 across the
  // board yields a bare spanning chain.
  roads: {
    linksByValue: { low: 1, medium: 1, high: 2, veryHigh: 2 },
  },

  // Rail (docs/rail-road-blockade-design.md §2). Pre-collapse trunk line,
  // generated at setup, never built or destroyed. A hop between two linked
  // capitals costs this regardless of how far apart they are — that flat cost
  // IS the mechanic, so it should stay cheap enough to be worth a detour.
  rail: {
    hopCost: 1,
  },

  // The v0.1 test board — still the default when no map size is given, so
  // headless games and the harness keep their existing layouts.
  testMap: [3, 4, 5, 6, 5, 4, 3], // 30 hexes

  // Board sizes offered on the setup screen. `rows` is the row-width array
  // fed to buildHexGrid; the bigger ones are hexagons-of-hexes of radius
  // 4/5/6, which is what keeps the board round rather than lozenge-shaped.
  //
  // `locations` is how many of the named Locations get placed. This is the
  // real scarcity dial: a small map with all ten settlements has an objective
  // every other hex and nothing to march across. Placement fills in a fixed
  // order that keeps factions symmetric — every capital first, then the
  // unaffiliated prizes, then each faction's second home Location — so a
  // budget of 6 gives everyone exactly one home and two neutral targets
  // rather than handing one faction two cities and another none.
  //
  // NOTE the ceiling: src/game/content.js defines ten Locations, so `large`
  // and `huge` are content-capped, not design-capped. Authoring more named
  // Locations is what makes the big maps denser.
  mapSizes: {
    small:  { rows: [3, 4, 5, 6, 5, 4, 3], locations: 6 },   //  30 hexes, diameter 6
    medium: { rows: [5, 6, 7, 8, 9, 8, 7, 6, 5], locations: 8 },  //  61 hexes, diameter 8
    large:  { rows: [6, 7, 8, 9, 10, 11, 10, 9, 8, 7, 6], locations: 10 }, // 91, diameter 10
    huge:   { rows: [7, 8, 9, 10, 11, 12, 13, 12, 11, 10, 9, 8, 7], locations: 10 }, // 127, d 12
  },

  // Of the hexes left over after Locations are placed, this share become
  // encounters and the rest plain terrain. Was an absolute count (13), which
  // silently stopped scaling the moment the board could grow.
  hexSplit: { encounterShare: 0.65 },

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
    // Influence pressure (docs/vp-and-actions-design.md §1): a Location
    // whose OWN hex sits in a rival's dominant ZoC bleeds Loyalty each
    // Upkeep — the soft-power siege. Garrisoning cancels it (rise 1 −
    // bleed 1 = stalemate); Civic Hall's rise beats it; out-projecting
    // ends it. Over-exertion is soft hostility: each bleeding Upkeep
    // costs the presser Standing with the owner and raises their Menace.
    pressure: { bleed: 1, standingHit: 1, menaceHit: 1 },
    // A Location held by a MAJORITY (2 of 3 sections) but not outright
    // still projects — at reduced strength. Before this, one flipped
    // section silenced a city's influence entirely, handing its own hex
    // to a neighbour's ZoC (playtest 2026-08-15).
    partialHolderScale: 0.5,
  },
  // §20 Economy & City Development — chips are the output of the economy,
  // built off each Location's Output via the guns/butter slider (Market retired).
  economy: {
    // A besieged city (majority held, not full) still pays its holder —
    // at this fraction of Output, rounded down. Losing one section is a
    // squeeze, not an eviction (playtest 2026-08-15).
    partialOutputScale: 0.5,
    // §20.6 Tech-Level build gate: chip techLevel T needs player Tech Level >= gate[T].
    buildTechGate: { 1: 1, 2: 3, 3: 5 },
    // §20.6 Loyalty rung granting the +1 chip slot (drop below → eject newest, §20.8).
    bonusSlotLoyalty: 6,
    // §20.3 default guns/butter split f∈[0,1]: scrapBank += (1−f)·Output, build += f·Output.
    // 0.5 (was 0): half of Output feeds the active build by default, so
    // organic building happens without slider micromanagement — and banked
    // scrap is no longer a free 100% by default (docs/chip-set-v0.1.md).
    defaultSlider: 0.5,
    // §20.7 rush rate — banked scrap per build-point. 2 (was 1): Rush now
    // carries a real premium over organic building, so it's an emergency
    // lever, not a strictly-dominant default (docs/chip-economy-handoff.md).
    rushScrapPerPoint: 2,
  },

  // §19 Exploration, Vision & Fog of War. Per-faction sight; LoS over
  // elevation/cover; concealment + ambush. All TBD-in-spec; demo defaults
  // here. Built for a larger map — nothing keys off the 30-hex field.
  fog: {
    unitVision: 1, // §19.3 base sight radius of a unit — its own hex + the ring
                   // around it. +1 on high ground (elevationVisionBonus), +
                   // Vision chips/upgrades (unit.visionBonus / chip `vision`),
                   // + Watch Network's faction-wide bonus. Scouting is a choice.
    unitDetection: 0, // §19.5 a plain unit has NO Detection — concealment hides
                      // even point-blank; Detection comes from scout/recon/
                      // watchtower chips + the Intelligence vision path (§19.7).
    locationVisionBase: 1, // §19.3 a controlled Location's base sight
    // + floor(loyalty × this): a loyal core sees farther — capped in
    // practice at radius 2 (loyalty 8 → +1). At the old 0.25 a capital saw
    // radius 3 = virtually the whole 30-hex board from turn one (the
    // "why can I see everything" playtest report). Settlements now top out
    // at 2; Watchtower/vision chips are the way to see farther.
    locationVisionPerLoyalty: 0.125,
    zocVision: 0, // §19.3 ZoC-owned hexes contribute sight at this radius (0 = the hex itself)
    elevationVisionBonus: 1, // §19.4 a source on elevation sees +this (and over ridges)
    coverSightCost: 1, // §19.4 extra sight cost to see INTO a cover hex
    ambushBonus: 2, // §19.5 ambush edge added to the surpriser's contest total
    ghostMaxAge: null, // §19.11 ghost aging (TBD) — null = ghosts never expire
    intelVisionBonus: 1, // §19.8 Intelligence vision-branch faction-wide sight bonus
    intelDetection: 1, // §19.8 Intelligence vision-branch detection
    // §19.4 share of terrain (wasteland) hexes carrying features. Raised
    // from 0.18/0.22 — at those rates a 30-hex map carried ~3 feature
    // hexes total and terrain almost never touched movement or combat.
    terrainSeedDensity: { elevation: 0.35, cover: 0.4 },
  },

  // §17.7 Listening Post (Intelligence A2) — a unit-built, concealed Vision
  // source that survives by stealth, not toughness. Costs scrap to build and
  // a trickle of scrap per Upkeep to keep paid (else it goes dormant).
  // Blockade structures (docs/rail-road-blockade-design.md §3). Numbers are
  // the doc's placeholders pending a balance pass — the mechanics are settled,
  // these are not.
  blockades: {
    buildCost: 4,  // §3.1 — 1 Action + scrap to break ground
    cost: 4,       // §3.1 — total construction progress needed
    // §3.1 sets a 2-turn floor. cost/buildRate IS that floor, so these two move
    // together. When §3.4 lands, buildRate becomes the connected settlement's
    // surplus output and a thin supply line stretches the timeline naturally.
    buildRate: 2,
    defense: 6,    // §3.2 — Location-style static baseline, before stacking
    vision: 1,     // §3.2 — its own sight footprint
    // §3.2 proposes +defense / +vision / Toll Booth upgrade chips. None are
    // authored yet; these maps are the hook the content batch fills in, keyed
    // chipId -> bonus, so blockades.js never branches on a chip id.
    chipDefense: {},
    chipVision: {},
  },

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
    driftPerRound: 1, // §18.5 Standing drifts toward its BASELINE when unreinforced…
    grudgeDriftScale: 1, // …modulated by the faction's grudge (high grudge → slower fade)
    seedJitter: 3, // §18.4.1 per-seed jitter on seeded faction↔faction standing

    // Standing baselines — history leaves a mark. Drift pulls Standing toward
    // an EARNED per-pair baseline (not zero): honored calls raise it, betrayal
    // lowers it, long alliances warm it. Capped so no pair is permanent.
    baseline: {
      cap: 4, // baselines live in [-cap, +cap]
      pactHonoredGain: 2, // caller's baseline toward an ally who answered the call
      pactBrokenLoss: 2, // victim's baseline toward the breaker
      surpriseAttackLoss: 2, // victim's baseline toward a treacherous attacker
      tenureRounds: 4, // every N full rounds of unbroken pact…
      tenureGain: 1, // …warms both parties' baselines by this
    },

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
    // `minRounds` / `reformCooldownRounds` keep a coalition a WEIGHTY event
    // rather than a flicker: it can't dissolve the moment threat dips, and
    // the board can't immediately re-raise the same one (playtest
    // 2026-08-15: 19 coalitions formed across 8 games, and their war
    // declarations were the last source of peace→war churn).
    coalition: {
      wM: 1, wP: 2, threshold: 16, dissolve: 11,
      vpWeight: 1.5, territoryWeight: 1, standingHit: 4,
      minRounds: 4, reformCooldownRounds: 5,
    },

    // §18.10 Recognition victory — Allied=1, Vassal=2; win at threshold while
    // Menace < each contributor's Tolerance and Honor > its floor. Threshold
    // ≈ a majority of the field's worth of acknowledgement (e.g. 3 vassals,
    // or 2 vassals + 2 allies) so the peaceful win is earned, not trivial.
    // `summitVp`: the first time each faction EVER backs you, you bank VP —
    // diplomacy pays into the same race conquest does, not only the long-shot
    // instant win. Once per backer per game, majors only (minors don't win).
    recognition: { alliedWeight: 1, vassalWeight: 2, threshold: 6, summitVp: 1 },

    // §18.9 Vassalage.
    vassal: {
      tributeScrap: 2, // tribute flow per round to the lord
      tributeResearch: 0,
      resentmentPerRound: 1, // base autonomy/resentment growth
      rebellionThreshold: 10, // resentment past this → rebel
      lordWeaknessScale: 2, // a weak lord raises resentment faster
      rebellionCooldownRounds: 4, // a rebel won't re-submit to the SAME lord this long
    },

    // §18.8 AI valuation / cadence dials.
    ai: {
      relationshipBiasPerStanding: 0.5, // bias in wouldAccept, scales with Standing
      sociabilityScale: 4, // eagerness to seek pacts
      localityRadius: 3, // §18.4.1 scope:"local" minors only engage within this hop radius
      giftStandingPerScrap: 0.5, // Standing bought per scrap gifted
      warGrudgeThreshold: -5, // AI declares war when Standing falls to/below this (+ aggression)
      vassalPowerRatio: 0.4, // offer/accept vassalage when weak side power < ratio·strong side
      mediateCooldownRounds: 3, // a mediated pair can't be re-mediated (no Honor pump)
      // Casus belli — the AI's blind combat loop only opens hostilities with a
      // reason: an existing war, contempt (Wary-), or a warlike temperament.
      // Raised past the mid-range so ordinary opportunists (0.55) no longer
      // treat "I am standing next to it" as sufficient reason for a war.
      blindAttackAggressionMin: 0.7,
    },

    // --- diplomacy-spec.md §6.3 — the verb/AI/agreement layer on top of §18.
    // Playtest starting numbers (all TBD-tunable).
    gift: {
      windowRounds: 3, // §1.2 — gift diminishing-returns window
      maxScrapPerGift: 8, // scrap counted per gift — one giant gift can't buy a pact
      baselineWarmth: 1, // a gift that lands (≥2 Standing) also warms the baseline
    },
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
      callExpiryRounds: 2, // an AI→human pact call sits in the inbox this many rounds
    },
    vision: { sharedPactDefault: true }, // §1.9 — pacts auto-share vision by default
    borders: { pactDefault: true }, // §1.10 — pacts auto-open borders by default
    // Open-borders ENFORCEMENT — open borders is a permit, not a wall: a unit
    // may always move into another faction's territory (conquest needs that),
    // but moving through their ZoC WITHOUT an open-borders agreement is
    // trespassing and costs relations (softened when already on good terms).
    trespass: {
      standingPenalty: 2, // relationship hit (owner → mover) — full rate, distrustful hosts
      reputationPenalty: 1, // global Menace bump on the mover — distrustful hosts only
      goodTermsReduction: 1, // legacy softening dial (Friendly+ terms)
      // Civ-style escalation on Neutral-or-better ground: consecutive rounds
      // of presence walk this ladder — a warning first (0), then −1, then −2
      // per round. Leaving for a round resets the streak. Distrustful hosts
      // (below Neutral) skip the ladder and cite at the full rate at once.
      escalation: [0, 1, 2],
    },
    // Truce — peace is a PROMISE, not a pause. Making peace lifts both
    // sides' Standing to a floor above contempt and opens a window during
    // which neither will re-open hostilities (playtest 2026-08-15: peace
    // left Standing at exactly the Wary line, so the AI's combat loop
    // re-attacked and auto-declared war the very next turn — war and peace
    // churned every round with no legible reason).
    // `rounds` is short and `standingFloor` deliberately stops at Wary: a
    // truce must END the same-turn churn without pacifying the map. Lifting
    // to Neutral instead left former enemies permanently unable to fight
    // (the AI only presses at Wary-or-worse), and 8 of 24 sim games
    // deadlocked with leaders stranded at 9–11 VP.
    truce: {
      rounds: 2, // hostilities stay shut for this long after peace
      standingFloor: -3, // peace lifts both sides to Wary — cooled, not friends
      breakHonorLoss: 6, // attacking through a truce is treachery
      breakMenace: 3,
    },
    // Just war — a formal grievance makes a war RIGHTEOUS: fighting it costs
    // no Menace. You earn one by denouncing the target first (a declared
    // intent the board has heard) or by being wronged by them (broken pact
    // or promise, surprise attack) within the window.
    justWar: {
      denounceWindowRounds: 6, // your denouncement of them counts this long
      grievanceWindowRounds: 8, // their betrayal of you counts this long
    },
    // Precursor warnings — the AI telegraphs trouble to the HUMAN before it
    // lands: a faction whose regard sinks to Wary sends word; the board
    // murmurs when the human's threat score nears the coalition threshold.
    warnings: {
      cooldownRounds: 4, // the same warning won't repeat for this long
      coalitionFraction: 0.7, // murmur when threat ≥ threshold × this
      defyStandingHit: 2, // telling an envoy where to put it
      placateScrap: 5, // the offered tribute on the "placate" answer
    },
    pact: { // §1.9, §1.10 — toggle costs
      toggleVisionStandingHit: 1,
      toggleBordersStandingHit: 1,
    },
  },
};

// Strategic-value ordering helper.
export const VALUE_RANK = { low: 0, medium: 1, high: 2, veryHigh: 3 };
