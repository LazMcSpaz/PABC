// Locked v0.1 configuration constants. Mirrors mechanical-spec §14.1.
// The engine reads gameplay numbers from here — never hard-code them.

export const CONFIG = {
  // Kept only as the label on the end-of-game score. Nothing reads it as a
  // win condition any more — see `victory` below.
  vpThreshold: 12,
  // Per-entity actions (docs/vp-and-actions-design.md §2/§4): every unit
  // and Location gets 1 action per turn; the old global pool survives as a
  // WILDCARD pool (base 0) that effect-granted actions (Staging Ground,
  // reactive cards) feed — any entity may spend a wildcard when its own
  // action is gone.
  baseActions: 0,

  // VP is HELD, not banked (src/game/victory.js): a faction draws a Location's
  // vpReward for as long as it holds the place — full value while Loyalty is
  // OVER half the counter, half (floored) below. Dominion's per-Upkeep tick and
  // the one-off capture bounty are both gone; the scoreboard is the map.
  // Victory is ONE condition with three faces: every surviving faction is
  // eliminated, your ally, or your vassal. Win it by conquest, by diplomacy,
  // or — the interesting case — by any mix of the two.
  //
  // What it replaced: a VP threshold labelled "conquest" that had nothing to
  // do with conquering. Across 20 AI-only games it ended every single one,
  // the winner held 29% of the board on average, and one winner held NOTHING
  // — 12 points banked from an alliance drip while holding zero cities. The
  // separate Recognition and last-standing conditions never fired once.
  victory: {
    // The arrangement has to HOLD for this many consecutive rounds before it
    // wins. Allying your way to a bloodless victory should be a position you
    // have to defend for a moment, not a switch that flips the instant the
    // last signature dries — rivals get a window to denounce you, break a
    // partner away, or simply attack.
    //
    // It only applies while rivals are still ALIVE to break it. Kill everyone
    // and you have won; there is nothing left to hold against.
    holdRounds: 3,
    // Score, purely for the end-of-game standing. Nothing here wins anything.
    // Both are HELD, like territory: you show them while the relationship
    // stands and lose them when it doesn't.
    score: { allied: 2, vassal: 3 },
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
    // Standing armies eat. 1 scrap per unit each Upkeep, doubled once BOTH
    // bay slots are filled — whether by two 1-slot chips or one 2-slot chip,
    // so the heavy kit (Bombard, Landship) carries a supply tail. An unpaid
    // unit is UNSUPPLIED: it holds ground but cannot move or act until it is
    // paid again. Never destroyed by arrears.
    upkeep: 1,
    upkeepFullyChipped: 2,
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
    // A graded surface — road OR rail — costs this to enter instead of 1, so a
    // column that stays on the network covers twice the ground: 2 Movement is
    // two hexes cross-country and four down a lane. That is what makes the
    // network worth routing along, worth holding, and worth cutting.
    //
    // It replaces an earlier `roadStartBonus: +1 Movement if you began the
    // turn on a road`, which was a patch for the same complaint (roads only
    // differed from open ground on the map's few forest/mountain hexes) and
    // paid out whether or not you then USED the road. Halving the hexes pays
    // for the distance actually travelled on them, and it makes a long lane
    // better than a short one, which a flat start bonus never did.
    pavedCost: 0.5,
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
  // stations costs this regardless of how far apart they are — that flat cost
  // IS the mechanic, so it should stay cheap enough to be worth a detour.
  rail: {
    hopCost: 1,
    // Which settlements the trunk line stops at. It used to be the four
    // CAPITALS and nothing else, which made rail three links on every board
    // size however big the map or however many cities were seated — and, worse,
    // meant no faction ever held both ends of a link at setup, so production
    // pooling (which needs both stations) could not be used until you had taken
    // an enemy capital. A trunk line stops at the big places: every capital is
    // `high`, so this keeps all four and adds the other major cities.
    // Sign-named settlements are excluded separately (`noRailTerminus`) — they
    // grew up around road signage and a railway had no reason to stop at a
    // lay-by, though a line may still run through their hex.
    hubTiers: ["high", "veryHigh"],
  },

  // The v0.1 test board — still the default when no map size is given, so
  // headless games and the harness keep their existing layouts.
  testMap: [3, 4, 5, 6, 5, 4, 3], // 30 hexes
  // …and how many Locations it seats. PINNED at 10 (the count that existed
  // before the 2026-08-16 content pass took the roster to 19) precisely so the
  // headless harness keeps its fixtures. Leaving it unset would have handed the
  // legacy 30-hex board all 19 Locations — two thirds of the map a settlement.
  testMapLocations: 10,

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
  // Locations arrive in fairness BANDS (board.js generateLayout): capitals,
  // then every faction's second home, then every faction's third, each taken
  // whole or not at all; the unaffiliated prizes then fill whatever room is
  // left. So a budget lands on a band boundary — 4, 8, 12 — plus prizes.
  mapSizes: {
    // `locations` is the DEFAULT budget; `locationTiers` is what the setup
    // screen's density slider offers (low / medium / high / very high). Density
    // and size are independent on purpose — a cramped small board and a sparse
    // huge one are both legitimate games, and tying the two made "small" mean
    // "few cities" whether or not that is what anyone wanted.
    //
    // Ceilings are measured, not guessed: a 30-hex board reliably seats 11
    // Locations before the placement rules start dropping them, so small stops
    // at 10. Every larger board can seat the whole 19-Location roster, which is
    // why the top tiers converge there.
    small:  { rows: [3, 4, 5, 6, 5, 4, 3], locations: 6, locationTiers: [4, 6, 8, 10] },   //  30 hexes, diameter 6
    medium: { rows: [5, 6, 7, 8, 9, 8, 7, 6, 5], locations: 8, locationTiers: [6, 9, 13, 17] },  //  61 hexes, diameter 8
    // Raised from 10 with the 2026-08-16 content pass (19 Locations now
    // exist, up from 10). At 10 the big boards could not reach past every
    // faction's SECOND home, so the third-home band never appeared on any map
    // — the new content would have been unreachable. 14/19 keeps roughly the
    // medium board's Location density on a much bigger field.
    large:  { rows: [6, 7, 8, 9, 10, 11, 10, 9, 8, 7, 6], locations: 14, locationTiers: [8, 14, 17, 19] }, // 91, diameter 10
    huge:   { rows: [7, 8, 9, 10, 11, 12, 13, 12, 11, 10, 9, 8, 7], locations: 19, locationTiers: [10, 15, 19, 19] }, // 127, d 12
  },

  // Of the hexes left over after Locations are placed, this share become
  // encounters and the rest plain terrain. Was an absolute count (13), which
  // silently stopped scaling the moment the board could grow.
  hexSplit: { encounterShare: 0.65 },

  // Encounter cadence, both settable from the setup screen.
  //   fieldShare      the share of spare hexes that become encounter sites.
  //                   Overrides hexSplit.encounterShare when the screen sends
  //                   one; the default IS hexSplit.encounterShare.
  //   worldPerRound   how many world triggers fire at each round end
  //                   (triggers.js). 0 switches world encounters off without
  //                   removing the content.
  encounters: { worldPerRound: 2 },

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
    buildCost: 8,  // §3.1 — 1 Action + scrap to break ground
    cost: 4,       // §3.1 — total construction progress needed
    // §3.1's floor. Construction is funded from the connected settlement's build
    // output (§3.4), so without this a rich city could raise one in a single
    // Upkeep; a site takes at most ceil(cost/minTurns) per turn and the rest
    // flows on to whatever else that city is building.
    minTurns: 2,
    defense: 4,    // §3.2 — Location-style static baseline, before stacking
    vision: 1,     // §3.2 — its own sight footprint
    // A blockade is a manned position, not a wall you walk away from: 1 scrap
    // each Upkeep or it goes DORMANT — blocks nobody and sees nothing until
    // it is paid again. Never destroyed by arrears; the garrison drifts off
    // and comes back. Same contract as a listening post (§17.7).
    upkeep: 1,
    // §3.2 upgrade slots. Deliberately fewer than a settlement's: a blockade is
    // a chokepoint, not a second city. Palisade / Signal Mast / Toll Booth are
    // in content.js as kind "blockade"; their bonuses are read off the chip def
    // (blockadeDefense / blockadeVision / output), never branched on by id.
    chipSlots: 2,
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
      // Declaring an UNJUSTIFIED war is itself unjustified aggression, and
      // the board reacts to the declaration, not only to the first blow.
      // A justified war (denounced first, or answering a betrayal) costs
      // nothing to declare — which is the whole point of earning one.
      declareUnjustified: 2,
      // Menace is what the BOARD thinks of you, so it should depend on what
      // the board saw. An attack is scored by the share of third parties who
      // could see the hex: seen by everyone it costs full, seen by nobody it
      // costs nothing. The victim always knows regardless — that is what the
      // grievance ledger is for, and denouncing is how they tell everyone
      // else. A declaration of war is always public and is never scaled.
      witnessedOnly: true,
      // …but never quite nothing: rumour travels, and an army that vanishes
      // into the wasteland and comes back bloody invites questions.
      unwitnessedShare: 0.2,
      // What a believed accusation does to the accused. This is how a crime
      // nobody saw catches up with you: the victim was there, holds the
      // grievance, and can put it in front of the board.
      denouncedShare: 0.5,
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
      // Denouncing cuts both ways, exactly as declaring war does. Naming a
      // faction the board can already see is dangerous — one past your
      // Menace tolerance, below your Honor floor, or that has wronged you —
      // is what Honor IS, and pays a little. Naming a clean-handed neighbour
      // because you want their cities is a slander, and costs.
      denounceLoss: 3,
      denounceWarrantedGain: 1,
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
    // Deal flows (a per-turn stream, as opposed to a lump sum). Every flow a
    // DEAL creates is term-limited; vassal tribute is not a deal and stays
    // perpetual, ending when the vassalage does.
    flow: {
      defaultRounds: 5, // a flow proposed without a term runs this long
      maxRounds: 20, // the deal builder's ceiling
      // What a perpetual flow (vassal tribute) is worth to a valuer. Only
      // reached by engine-made agreements; a deal can no longer create one.
      perpetualHorizon: 8,
    },
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
    // Third-party reaction to a denouncement, scored on whether the
    // accusation is CREDIBLE rather than on whether they happen to dislike
    // the target. Saying out loud what everyone was thinking rallies the
    // board; accusing a faction with clean hands isolates you.
    denounce: {
      rallyWarranted: 3, // they agree, and you had grounds
      rally: 2, // they agree
      backlash: 2, // they do not, and now they wonder about you
      allyDefends: 2, // the target's allies close ranks whatever the merits
      targetHit: 3, // Standing the target loses toward you (always)
    },
    // Grievances — the ledger of what has actually been done to you. Each
    // entry carries a severity, so three small betrayals can weigh like one
    // large one, and a settlement has a PRICE rather than being a word.
    grievance: {
      severity: {
        "surprise-attack": 3, // struck before declaring
        "truce-broken": 4, // struck through a promise not to
        "pact-broken": 4, // abandoned an alliance
        "promise-broken": 2, // walked away from a term
        occupation: 2, // holds a place you call yours (a condition, not an event)
        defiance: 3, // ignored an ultimatum you put your name to
      },
      defaultSeverity: 2,
      maxPerPair: 8, // the ledger keeps this many; older entries fall off
      // What settling costs the VICTIM: giving up a grievance means giving
      // up the righteous war it entitles you to, so it is not free to ask
      // for and cannot be bought with an apology.
      settlementPerWeight: 1.2,
      // Making amends is honourable — the one route back for a faction that
      // has burned its reputation.
      settlementHonorGain: 2,
    },
    // §3.2 — a Location on the table. The map is the thing the war is
    // about, and until now the only thing anyone could trade was scrap, so
    // diplomacy ran as a side-market beside the game rather than inside it.
    // These are the numbers that make "cede Omara and we have peace" a
    // sentence with a price attached.
    cession: {
      // A city's worth, before anybody's feelings about it: its victory
      // points, weighted, plus what it actually produces each turn.
      vpWeight: 4,
      outputWeight: 1.2,
      // …and what its walls are worth. Bigger places are harder to take, so
      // they cost more to be handed.
      valueRank: { low: 0, medium: 1, high: 2, veryHigh: 4 },
      // A homeland is not priced like a holding. Goldgrass will pay well
      // past Omara's output to have Omara back, which is what makes
      // "give it back" a thing a faction can want badly enough to deal for.
      claimMultiplier: 2.2,
      // Ground given up is worth more than ground gained — you lose the
      // place, the ZoC around it, and the base you were operating from.
      // Scaled by aggression: a warlord does not sell land.
      cedeReluctanceBase: 1.15,
      cedeReluctancePerAggression: 0.7,
      // Handed over, not stormed. A city given is a city intact — no chip
      // is destroyed — but the people living in it did not choose this, so
      // Loyalty starts where a capture would leave it.
      loyaltyOnCede: 2,
      // Being traded away is a grievance the residents' faction holds
      // against nobody in particular, but the affiliated faction minds who
      // ends up standing there. Same penalty a conquest carries: to
      // Goldgrass, Omara passing from Versari to the Lakers is not an
      // improvement.
      thirdPartyStandingHit: 2,
    },

    justWar: {
      denounceWindowRounds: 6, // your denouncement of them counts this long
      grievanceWindowRounds: 8, // their betrayal of you counts this long
      // You cannot re-denounce the same faction until this clears. Paired
      // with honor.denounceLoss it makes a standing pretext something you
      // have to keep paying for, rather than a switch you flip once a round
      // to keep the window open forever.
      denounceCooldownRounds: 5,
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

    // The verb between asking and attacking. A demand with a deadline and a
    // named consequence — and, crucially, a cost for not following through:
    // an ultimatum you let lapse is a bluff the whole board watched you make.
    ultimatum: {
      deadlineRounds: 3, // how long the other side has to comply
      graceRounds: 2, // how long the issuer then has to make good on it
      menaceOnIssue: 1, // a threat is a hostile act, however politely worded
      bluffHonorLoss: 4, // …and an empty one is worse than never speaking
      defianceSeverity: 3, // the grievance the issuer earns when defied
      complyStandingGain: 2, // giving in buys a little warmth; it costs face
      maxScrap: 30, // ceiling on a tribute demand
      // How long before the same pair can be threatened again. Without this
      // a strong AI reissues every other round and the word stops meaning
      // anything — which is the same reason denouncing has a cooldown.
      cooldownRounds: 8,
    },

    // The round trip. A proposal is a thing that sits on a table, not a
    // button that resolves the instant it is pressed.
    offers: {
      // How long an offer waits in the recipient's inbox before it lapses.
      // Short: an offer nobody answered is an insult that fades, and a stale
      // inbox is worse than an empty one.
      expiryRounds: 3,
      // Asking is free this many times per round, per faction. Past that
      // you are pestering, and a refusal cools them.
      freeAsksPerRound: 2,
      pesterStandingHit: 1,
      // A counter-offer will not ask the proposer for more scrap than they
      // actually hold. An unanswerable counter is a refusal with extra
      // steps, and reads as the AI not listening.
      counterWithinMeans: true,
      // Nor will it counter at all when the gap is this far past what the
      // proposer could cover — at some point "no" is the honest answer.
      counterGapCeiling: 60,
      // How often an AI opens with a proposal of its own, as a share of its
      // sociability. Kept low: an inbox that fills every round stops being
      // an event.
      aiProposeChance: 0.35,
    },
  },
};

// Strategic-value ordering helper.
export const VALUE_RANK = { low: 0, medium: 1, high: 2, veryHigh: 3 };
