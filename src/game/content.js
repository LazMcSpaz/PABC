// Stub content set for engine development. Mirrors the content/ sheets;
// values still blank in those sheets (chip costs, tech levels, scrap
// production ranges) are PROVISIONAL stubs here, flagged inline. The
// engine never branches on these ids — they are plain data.

// §18.4 Faction model — factions are no longer cosmetic. Each carries the
// authored diplomatic characteristics the AI pursues and others judge it by
// (temperament/aggression, trust, grudge, sociability, victory lean,
// expansion appetite). These are the §18.4.2 starter-roster dials, inline
// here in the engine registry (NEVER content/) and tunable. `aggression`
// 0..1 is the numeric spine of Menace scoring and Tolerance.
// `capital` is the Location a faction starts holding — set explicitly per
// faction rather than derived, so it is a design decision rather than a
// side effect of strategicValue ordering. All four capitals are deliberately
// the same tier (see LOCATIONS below), so nobody opens ahead on garrison,
// chip slots, production or VP.
export const FACTIONS = {
  versari: {
    id: "versari", name: "Versari Korad", color: "#3a7d44", affiliatedLocations: ["korad", "dambar"], capital: "korad",
    tier: "major", scope: "global", playable: true,
    temperament: "schemer", aggression: 0.4, trust: 0.55, grudge: 0.4, sociability: 0.8,
    victoryLean: "diplomacy", expansion: 0.5,
  },
  goldgrass: {
    id: "goldgrass", name: "Goldgrass Coalition", color: "#d8a72b", affiliatedLocations: ["kansit", "omara"], capital: "kansit",
    tier: "major", scope: "global", playable: true,
    temperament: "pacifist", aggression: 0.1, trust: 0.9, grudge: 0.25, sociability: 0.95,
    victoryLean: "diplomacy", expansion: 0.3,
  },
  lakers: {
    id: "lakers", name: "Grand Lakers", color: "#21406e", affiliatedLocations: ["chigan", "droit"], capital: "droit",
    tier: "major", scope: "global", playable: true,
    temperament: "warlord", aggression: 0.9, trust: 0.6, grudge: 0.7, sociability: 0.2,
    victoryLean: "conquest", expansion: 0.9,
  },
  plainers: {
    id: "plainers", name: "Free Plainers", color: "#c43b35", affiliatedLocations: ["the-shelf", "tin-town"], capital: "tin-town",
    tier: "major", scope: "global", playable: true,
    temperament: "opportunist", aggression: 0.5, trust: 0.3, grudge: 0.3, sociability: 0.65,
    victoryLean: "opportunist", expansion: 0.6,
  },
};

// §18.4.1/§18.4.2 — minor factions: the SAME model plus three fields
// (playable:false, scope:"local", associatedMajor+relationship). They
// populate the political landscape; a variable subset is seeded per game
// (setup.js) so no two games field the same cast. relationship ∈
// kin (warm) | rival (cold) | foil (wary) seeds default standing toward
// the associated major. Not added to FACTIONS so the default 4-major
// headless game (Object.keys(FACTIONS)) is unchanged.
export const MINOR_FACTIONS = {
  tempest: {
    id: "tempest", name: "Clan Tempest", color: "#4a6fa5",
    tier: "minor", scope: "local", playable: false,
    associatedMajor: "lakers", relationship: "rival",
    temperament: "warlord", aggression: 0.8, trust: 0.6, grudge: 0.7, sociability: 0.2,
    victoryLean: "conquest", expansion: 0.55,
  },
  croppers: {
    id: "croppers", name: "The Croppers", color: "#c9b24e",
    tier: "minor", scope: "local", playable: false,
    associatedMajor: "goldgrass", relationship: "kin",
    temperament: "pacifist", aggression: 0.12, trust: 0.85, grudge: 0.25, sociability: 0.8,
    victoryLean: "economy", expansion: 0.3,
  },
  steeltraders: {
    id: "steeltraders", name: "The Steel Traders", color: "#a8584f",
    tier: "minor", scope: "local", playable: false,
    associatedMajor: "plainers", relationship: "rival",
    temperament: "opportunist", aggression: 0.55, trust: 0.3, grudge: 0.35, sociability: 0.5,
    victoryLean: "conquest", expansion: 0.5,
  },
  dambarans: {
    id: "dambarans", name: "The Dambarans", color: "#5fa06e",
    tier: "minor", scope: "local", playable: false,
    associatedMajor: "versari", relationship: "foil",
    temperament: "honorable", aggression: 0.45, trust: 0.92, grudge: 0.5, sociability: 0.5,
    victoryLean: "conquest", expansion: 0.4,
  },
};

// Combined faction lookup — resolves a faction id to its def whether major
// or minor. The diplomacy layer (standing, valuation, AI) reads through
// this so it never has to branch on tier.
export function factionDef(fid) {
  return FACTIONS[fid] || MINOR_FACTIONS[fid] || null;
}

// strategicValue drives garrison Strength and chip slots (see config).
// affiliation: a faction id, or null for unaffiliated.
// production: [min, max] scrap/turn — PROVISIONAL ranges by value.
// vpReward: VP banked by the player on FIRST capture of this Location.
// One-shot — recaptures don't grant it again (loc.vpAwarded gates it).
// Total board VP = 3·1 (med) + 5·2 (high) + 2·3 (veryHigh) = 19, so
// the win threshold of 12 needs a little under two-thirds of the map.
// (Was 18 before Tin Town was promoted to high as the Plainers capital.)
export const LOCATIONS = {
  korad: { id: "korad", name: "Korad", strategicValue: "high", affiliation: "versari", production: [3, 3], vpReward: 2 },
  dambar: { id: "dambar", name: "Dambar", strategicValue: "veryHigh", affiliation: "versari", production: [4, 5], vpReward: 3 },
  kansit: { id: "kansit", name: "Kansit", strategicValue: "high", affiliation: "goldgrass", production: [3, 3], vpReward: 2 },
  omara: { id: "omara", name: "Omara", strategicValue: "medium", affiliation: "goldgrass", production: [2, 3], vpReward: 1 },
  chigan: { id: "chigan", name: "Chigan", strategicValue: "veryHigh", affiliation: "lakers", production: [4, 5], vpReward: 3 },
  droit: { id: "droit", name: "Droit", strategicValue: "high", affiliation: "lakers", production: [3, 3], vpReward: 2 },
  "the-shelf": { id: "the-shelf", name: "The Shelf", strategicValue: "high", affiliation: "plainers", production: [3, 4], vpReward: 2 },
  // The four capitals -- korad, kansit, droit, tin-town -- are deliberately
  // identical: all `high` (same garrison, chip slots and VP) and all with a
  // FIXED production of 3 rather than a [3,4] roll, so every faction's opening
  // is the same rather than merely the same in expectation. Tin Town was
  // raised medium -> high to join them. Non-capital Locations keep their
  // ranges.
  "tin-town": { id: "tin-town", name: "Tin Town", strategicValue: "high", affiliation: "plainers", production: [3, 3], vpReward: 2 },
  concordan: { id: "concordan", name: "Concordan", strategicValue: "medium", affiliation: null, production: [2, 3], vpReward: 1 },
  erport: { id: "erport", name: "Erport", strategicValue: "medium", affiliation: null, production: [2, 3], vpReward: 1 },
};

// Upgrade chips — §20 makes these the whole economy: built at a Location
// off its Output (the Market is retired), and upgraded in place.
//   kind         which slot type (unit chips need a stationed friendly unit)
//   slots        slots occupied (ONLY the shared T3 capstones are 2-slot)
//   statType     unit chips: the stat family this chip occupies — a unit may
//                never carry two chips of the same statType (docs/chip-set-v0.1.md)
//   faction      set → only that faction may build it (signature chips)
//   techLevel    §20.6 Tech-Level band gate (1/2/3 → player Tech L ≥ 1/3/5)
//   buildCost    §20.4 construction cost in Output units (defaults to `cost`)
//   loyaltyReq   §20.6 Loyalty rung (0–8) this city needs to build the chip
//   upgradesTo   §20.5 next-tier chip id this one upgrades into, if any
//   upkeep       §20.9 optional scrap/turn; unpaid → dormant (disabled), not destroyed
//   output       §20.3 scrap-equivalent this economy chip adds to Location Output
//   vision/detection      §19.7 sight fields (units AND Locations — visibility.js)
//   localInfluence/influenceRange  §18.11 influence fields (influence.js)
//   Behavior flags read by their one engine hook each (docs/chip-system-dependencies.md):
//   ignoresTerrain, siege, railIncompatible, buildRate, healBonus,
//   cheapReinforce, loyaltyRise, noLoyaltyDecay, actionBonus, recruitDiscount,
//   turnStartMovement, standingDrift, garrisonErosion
// Tiers: T1 = individual capability, T2 = collective capability, T3 = shared
// pre-collapse salvage. Display names come from CHIP_SKINS per faction; the
// `name` here is the neutral fallback. Costs follow the 3/6/12 curve
// (docs/chip-set-v0.1.md) — final tuning waits on the Rush/slider pass.
export const CHIPS = {
  // --- unit chips: Strength line ---
  "drilled-troops": { id: "drilled-troops", name: "Drilled Troops", kind: "unit", statType: "strength", slots: 1, techLevel: 1, cost: 3, strength: 1, buildCost: 3, loyaltyReq: 0, upgradesTo: "sharpened-blades", desc: "+1 Strength" },
  "sharpened-blades": { id: "sharpened-blades", name: "Sharpened Blades", kind: "unit", statType: "strength", slots: 1, techLevel: 2, cost: 6, strength: 2, buildCost: 6, loyaltyReq: 3, desc: "+2 Strength" },
  bombard: { id: "bombard", name: "Bombard", kind: "unit", statType: "strength", slots: 2, techLevel: 3, cost: 12, strength: 3, buildCost: 12, loyaltyReq: 6, upkeep: 1, siege: true, railIncompatible: true, desc: "+3 Strength; ignores a defending Location's static defenses (fortify, high ground, turret walls)" },
  // --- unit chips: Movement line ---
  navigator: { id: "navigator", name: "Navigator", kind: "unit", statType: "movement", slots: 1, techLevel: 1, cost: 3, movement: 1, buildCost: 3, loyaltyReq: 0, upgradesTo: "troop-carrier", desc: "+1 Movement" },
  "troop-carrier": { id: "troop-carrier", name: "Troop Carrier", kind: "unit", statType: "movement", slots: 1, techLevel: 2, cost: 6, movement: 2, buildCost: 6, loyaltyReq: 3, desc: "+2 Movement — the whole squad rides" },
  landship: { id: "landship", name: "Landship", kind: "unit", statType: "movement", slots: 2, techLevel: 3, cost: 12, movement: 3, buildCost: 12, loyaltyReq: 6, upkeep: 2, ignoresTerrain: true, railIncompatible: true, desc: "+3 Movement; ignores terrain (forest costs 1, mountains do not halt)" },
  // --- unit chips: Vision line (no T3 — sight is an area; docs/chip-set-v0.1.md) ---
  "field-glass": { id: "field-glass", name: "Field Glass", kind: "unit", statType: "vision", slots: 1, techLevel: 1, cost: 3, vision: 1, buildCost: 3, loyaltyReq: 0, upgradesTo: "spotter-net", desc: "+1 Vision range" },
  "spotter-net": { id: "spotter-net", name: "Spotter Net", kind: "unit", statType: "vision", slots: 1, techLevel: 2, cost: 6, vision: 1, detection: 1, buildCost: 6, loyaltyReq: 3, desc: "+1 Vision and +1 Detection — finds what hides" },
  // --- location chips: economy ---
  recyclers: { id: "recyclers", name: "Recyclers", kind: "location", slots: 1, techLevel: 1, cost: 3, output: 1, buildCost: 3, loyaltyReq: 0, upgradesTo: "factory", desc: "+1 scrap Output" },
  factory: { id: "factory", name: "Factory", kind: "location", slots: 1, techLevel: 2, cost: 6, output: 2, buildCost: 6, loyaltyReq: 3, desc: "+2 scrap Output" },
  works: { id: "works", name: "Works", kind: "location", slots: 1, techLevel: 1, cost: 4, buildRate: 1, buildCost: 4, loyaltyReq: 0, desc: "+1 build progress each turn toward this location's active build" },
  // --- location chips: research ---
  labs: { id: "labs", name: "Labs", kind: "location", slots: 1, techLevel: 1, cost: 3, research: 1, buildCost: 3, loyaltyReq: 0, upgradesTo: "advanced-lab", desc: "+1 Research while controlled" },
  "advanced-lab": { id: "advanced-lab", name: "Advanced Lab", kind: "location", slots: 1, techLevel: 2, cost: 6, research: 2, buildCost: 6, loyaltyReq: 3, upkeep: 1, desc: "+2 Research while controlled (upkeep 1)" },
  // --- location chips: defense ---
  "defense-turrets": { id: "defense-turrets", name: "Defense Turrets", kind: "location", slots: 1, techLevel: 1, cost: 4, garrison: 2, buildCost: 4, loyaltyReq: 0, upgradesTo: "stronghold", desc: "+2 garrison Strength" },
  stronghold: { id: "stronghold", name: "Stronghold", kind: "location", slots: 1, techLevel: 2, cost: 7, garrison: 4, buildCost: 7, loyaltyReq: 3, upkeep: 1, desc: "+4 garrison Strength (upkeep 1)" },
  // --- location chips: military ---
  "training-grounds": { id: "training-grounds", name: "Training Grounds", kind: "location", slots: 1, techLevel: 1, cost: 4, buildCost: 4, loyaltyReq: 0, unitCapBonus: 1, desc: "Enables recruiting units; +1 unit cap" },
  infirmary: { id: "infirmary", name: "Infirmary", kind: "location", slots: 1, techLevel: 2, cost: 5, buildCost: 5, loyaltyReq: 3, healBonus: 1, cheapReinforce: true, desc: "Units here heal +1 more per Upkeep; instant reinforce here costs 1 scrap per Strength" },
  // --- location chips: sight & politics ---
  watchtower: { id: "watchtower", name: "Watchtower", kind: "location", slots: 1, techLevel: 1, cost: 3, vision: 1, detection: 1, buildCost: 3, loyaltyReq: 0, desc: "This location: +1 Vision, +1 Detection" },
  beacon: { id: "beacon", name: "Beacon", kind: "location", slots: 1, techLevel: 1, cost: 4, localInfluence: 2, buildCost: 4, loyaltyReq: 0, upgradesTo: "broadcast", desc: "+2 Influence projected by this location" },
  broadcast: { id: "broadcast", name: "Broadcast", kind: "location", slots: 1, techLevel: 2, cost: 7, localInfluence: 2, influenceRange: 1, buildCost: 7, loyaltyReq: 3, desc: "+2 Influence and +1 Influence range" },
  "civic-hall": { id: "civic-hall", name: "Civic Hall", kind: "location", slots: 1, techLevel: 2, cost: 5, loyaltyRise: 1, noLoyaltyDecay: true, buildCost: 5, loyaltyReq: 3, desc: "Loyalty rises +1 extra while garrisoned and never decays while neglected" },
  // --- location chips: utility ---
  "recon-team": { id: "recon-team", name: "Recon Team", kind: "location", slots: 1, techLevel: 1, cost: 3, buildCost: 3, loyaltyReq: 0, encounterRedraws: 1, desc: "Discard a drawn encounter and draw again" },
  "logistics-hub": { id: "logistics-hub", name: "Logistics Hub", kind: "location", slots: 2, techLevel: 3, cost: 12, buildCost: 12, loyaltyReq: 6, upkeep: 1, actionBonus: 1, desc: "+1 Action each turn (rare, 2-slot; upkeep 1)" },
  // --- special unit chips: buildable (docs/chip-set-v0.1.md) ---
  // No statType — specials compete for bay slots but not stat families.
  "field-medics": { id: "field-medics", name: "Field Medics", kind: "unit", slots: 1, techLevel: 2, cost: 4, buildCost: 4, loyaltyReq: 3, healAnywhere: 1, desc: "Heals +1 at Upkeep anywhere, not only on a held Location" },
  pathfinders: { id: "pathfinders", name: "Pathfinders", kind: "unit", slots: 1, techLevel: 2, cost: 5, buildCost: 5, loyaltyReq: 3, ignoresTerrain: true, desc: "Forest costs 1 to enter; mountains don't halt the move" },
  rearguard: { id: "rearguard", name: "Rearguard", kind: "unit", slots: 1, techLevel: 2, cost: 4, buildCost: 4, loyaltyReq: 3, retreatBonus: 1, routSpillImmune: true, desc: "On losing a contest, may retreat 2 hexes; never takes rout spill damage" },
  trailwise: { id: "trailwise", name: "Trailwise", kind: "unit", slots: 1, techLevel: 1, cost: 3, buildCost: 3, loyaltyReq: 0, encounterRedraws: 1, desc: "Discard an encounter this unit triggers and draw again" },
  "entrenching-tools": { id: "entrenching-tools", name: "Entrenching Tools", kind: "unit", slots: 1, techLevel: 1, cost: 3, buildCost: 3, loyaltyReq: 0, fortifyBonus: 1, desc: "+1 to this unit's fortify bonus" },
  // --- special unit chips: quest/encounter rewards (reward: true — never
  // in a build menu; granted via the GRANT_CHIP effect. One world-wide
  // name each: found artifacts have no faction).
  "cold-camp": { id: "cold-camp", name: "Cold Camp", kind: "unit", slots: 1, reward: true, cost: 0, activatable: { cost: 2, grants: "stealth" }, desc: "Pay 2 scrap: unseen until the start of your next turn" },
  "night-march": { id: "night-march", name: "Night March", kind: "unit", slots: 1, reward: true, cost: 0, passThroughUnits: true, desc: "Passes through enemy units without being halted (Locations still halt)" },
  "war-banner": { id: "war-banner", name: "War Banner", kind: "unit", slots: 1, reward: true, cost: 0, concentrationBonus: 1, concentrationCapBonus: 1, desc: "Counts as an extra unit for concentration and raises its stack's concentration cap by 1" },
  "old-hands": { id: "old-hands", name: "Old Hands", kind: "unit", slots: 1, reward: true, cost: 0, veteranEquiv: true, desc: "This unit counts as a veteran while the chip is installed" },
  "safe-conduct": { id: "safe-conduct", name: "Safe Conduct", kind: "unit", slots: 1, reward: true, cost: 0, safeConduct: true, desc: "No Standing or Menace penalty for entering another faction's territory" },
  "relay-kit": { id: "relay-kit", name: "Relay Kit", kind: "unit", slots: 1, reward: true, cost: 0, postsWithoutTech: true, desc: "This unit can build Listening Posts without the Intelligence tech (normal costs)" },
  // --- faction signature chips (docs/location-chips-v0.1.md) ---
  "burning-glass": { id: "burning-glass", name: "Burning Glass", kind: "location", faction: "versari", slots: 1, techLevel: 2, cost: 6, garrison: 2, garrisonErosion: 1, buildCost: 6, loyaltyReq: 3, desc: "+2 garrison Strength; attackers suffer 1 Strength erosion before the contest" },
  "guest-house": { id: "guest-house", name: "Guest House", kind: "location", faction: "goldgrass", slots: 1, techLevel: 2, cost: 5, standingDrift: 1, buildCost: 5, loyaltyReq: 3, desc: "Each round, Standing toward you rises with every faction you are not at war with" },
  "motor-pool": { id: "motor-pool", name: "Motor Pool", kind: "location", faction: "lakers", slots: 1, techLevel: 2, cost: 5, recruitDiscount: 2, unitCapBonus: 1, buildCost: 5, loyaltyReq: 3, desc: "Recruiting here costs 2 less scrap; +1 unit cap" },
  waystation: { id: "waystation", name: "Waystation", kind: "location", faction: "plainers", slots: 1, techLevel: 2, cost: 5, turnStartMovement: 1, buildCost: 5, loyaltyReq: 3, desc: "Friendly units starting their turn here gain +1 Movement that turn" },
};

// Per-faction display names (docs/chip-set-v0.1.md — the skin table). One
// mechanical row per effect; the faction only changes what it's called.
// 2-slot capstones and signature chips keep one world-wide name (salvage
// has no faction; a signature IS its faction's name for it). Entries may
// later carry mechanical overrides; today they are strings only.
export const CHIP_SKINS = {
  "drilled-troops": { versari: "Engineered Blades", goldgrass: "Scythe Levy", lakers: "Stamped Plate", plainers: "Bushwhackers" },
  "sharpened-blades": { versari: "Set Piece", goldgrass: "Threshers", lakers: "Drop Hammer", plainers: "Buffalo Gun" },
  navigator: { versari: "Sunrunner", goldgrass: "Trace Horses", lakers: "Droit Iron", plainers: "Mustangers" },
  "troop-carrier": { versari: "Sunhauler", goldgrass: "Stage Line", lakers: "Chrome Hauler", plainers: "Remuda" },
  "field-glass": { versari: "Long Optics", goldgrass: "Field Talk", lakers: "Highbeams", plainers: "Outriders" },
  "spotter-net": { versari: "Signal Intercept", goldgrass: "Neighbors", lakers: "Searchlight", plainers: "Cutting Sign" },
  recyclers: { versari: "Panel Field", goldgrass: "Gleaning Yards", lakers: "Breaker Yard", plainers: "Salvage Camp" },
  factory: { versari: "Sunworks", goldgrass: "Gristmill", lakers: "Stamping Plant", plainers: "Tradehouse" },
  works: { versari: "Fabricator", goldgrass: "Barn Raising", lakers: "Assembly Line", plainers: "Roustabouts" },
  labs: { versari: "Lyceum", goldgrass: "Almanac Society", lakers: "Trade School", plainers: "Assay Office" },
  "advanced-lab": { versari: "The Institute", goldgrass: "Seed Vault", lakers: "Proving Grounds", plainers: "Surveyors' Guild" },
  "defense-turrets": { versari: "Rampart", goldgrass: "Hedgerows", lakers: "Slag Wall", plainers: "Stockade" },
  stronghold: { versari: "Bastion", goldgrass: "Granary Keep", lakers: "Blast Wall", plainers: "Hillfort" },
  "training-grounds": { versari: "The Academy", goldgrass: "Militia Green", lakers: "Union Hall", plainers: "Bunkhouse" },
  infirmary: { versari: "Clean Ward", goldgrass: "Apothecary", lakers: "Company Clinic", plainers: "Sawbones" },
  watchtower: { versari: "Heliograph", goldgrass: "Steeple Watch", lakers: "Water Tower", plainers: "Fence Riders" },
  beacon: { versari: "Wire Service", goldgrass: "Market Fair", lakers: "Radio Tower", plainers: "Circuit Riders" },
  broadcast: { versari: "Signal Authority", goldgrass: "County Fair", lakers: "Clear Channel", plainers: "Camp Meeting" },
  "civic-hall": { versari: "The Ministry", goldgrass: "Grange Hall", lakers: "Company Store", plainers: "Watering Hole" },
  "recon-team": { versari: "Field Agents", goldgrass: "Town Criers", lakers: "Block Captains", plainers: "Trail Scouts" },
};

// Resolve a chip's display name for a faction — the skin if one exists,
// the neutral registry name otherwise. UI paths pass the VIEWER-OWNER's
// faction (the chip holder's controller), so a captured Panel Field
// renders as Breaker Yard once the Lakers hold it.
export function chipDisplayName(chipId, factionId) {
  if (chipId === "capital") return CAPITAL.name;
  return CHIP_SKINS[chipId]?.[factionId] || CHIPS[chipId]?.name || chipId;
}

// docs/rail-road-blockade-design.md §2.1 — a unit carrying a rail-incompatible
// chip cannot use rail. The rule is "anything bulky enough to need two chip
// slots is too bulky to put on a train", DERIVED from `slots` rather than read
// off a hand-set flag, so a future 2-slot unit chip inherits it without anyone
// remembering to tag it. The explicit `railIncompatible: true` on Bombard and
// Landship stays as documentation and is asserted against this in the harness.
// Location chips are exempt whatever their size — they never ride a unit.
export function chipBlocksRail(chipId) {
  const def = CHIPS[chipId];
  return !!def && def.kind === "unit" && (def.slots || 1) >= 2;
}

// The Capital — a special predefined chip, one per player. Not sold in
// the Market; placed on each faction's starting location at setup.
export const CAPITAL = {
  id: "capital", name: "Capital", kind: "location", slots: 1, special: true,
  desc: "Decay-immune; +2 garrison Strength, +2 scrap production",
};

// Look up the definition behind a chip instance — covers both the
// Market's CHIPS and the special CAPITAL chip, so callers don't have to
// branch.
export function chipDefOf(state, chipUid) {
  const inst = state.chips[chipUid];
  if (!inst) return null;
  if (inst.chipId === "capital") return CAPITAL;
  return CHIPS[inst.chipId] || null;
}

// Location abilities (mechanical-spec §6.3, §13.2). Every High / Very
// High location is assigned ONE of these at setup; it occupies one of
// that location's chip slots. The v0.2 roster (ability-brainstorm pass,
// docs/vp-and-actions-design.md era): 4 veryHigh + 6 high abilities so
// each game seeds a different subset onto the 2 veryHigh / 4 high seats.
// Passive types (each read by its one engine hook):
//   SUPPRESS_CHIP_BONUSES  contest.js — attackers get no chip Strength here
//   INFLUENCE_RANGE        influence.js — this Location projects farther
//   HEAL_HERE              turn.js — units standing here mend extra (ANY owner)
//   MOVE_TAX               movement/board — enemies pay +amount entering
//                          this Location's hex or any adjacent hex
// Rail Corridor's true effect (unit teleport) waits on the rail system —
// its interim effect is rail-flavored tempo, not a scrap faucet.
export const ABILITIES = {
  // --- veryHigh tier ---
  "rail-corridor": {
    id: "rail-corridor", name: "Rail Corridor", eligibleTier: "veryHigh",
    passives: [],
    activated: [{
      cost: { resource: 2 },
      effects: [{ type: "MODIFY_STAT", stat: "Movement", amount: 2, target: "stationed_unit", duration: "this_turn" }],
    }],
  },
  "knowledge-cache": {
    id: "knowledge-cache", name: "Knowledge Cache", eligibleTier: "veryHigh",
    passives: [],
    activated: [{
      cost: { action: 1 },
      effects: [{ type: "MOVE_CARD", from: "reactiveDeck", to: "hand:controller" }],
    }],
  },
  blacksite: {
    id: "blacksite", name: "Blacksite", eligibleTier: "veryHigh",
    passives: [],
    activated: [{
      cost: { action: 1 },
      effects: [{ type: "DISABLE_CHIP", target: "chosen_enemy_chip" }],
    }],
  },
  "old-armory": {
    id: "old-armory", name: "Old Armory", eligibleTier: "veryHigh",
    passives: [],
    activated: [{
      cost: { action: 1 }, oncePerGame: true,
      effects: [{ type: "GRANT_CHIP", pool: "reward", target: "controller" }],
    }],
  },
  // --- high tier ---
  "staging-ground": {
    id: "staging-ground", name: "Staging Ground", eligibleTier: "high",
    passives: [],
    activated: [{
      // 2 scrap — free +1 Action strictly dominated the Logistics Hub
      // chip (cost 12, 2 slots, upkeep). Priced, it's a scrap-for-tempo
      // trade with the same launchpad identity.
      cost: { resource: 2 },
      effects: [{ type: "GRANT_ACTIONS", amount: 1, target: "controller" }],
    }],
  },
  "fortified-ruins": {
    id: "fortified-ruins", name: "Fortified Ruins", eligibleTier: "high",
    // Attacking units get no chip Strength in contests here — the ruins
    // channel the fight into corridors old-world gear can't exploit.
    passives: [{ type: "SUPPRESS_CHIP_BONUSES" }],
    activated: [],
  },
  scrapyard: {
    id: "scrapyard", name: "Scrapyard", eligibleTier: "high",
    passives: [],
    activated: [{
      cost: { resource: 2 },
      effects: [{ type: "STRIP_CHIP" }],
    }],
  },
  "beacon-hill": {
    id: "beacon-hill", name: "Beacon Hill", eligibleTier: "high",
    passives: [{ type: "INFLUENCE_RANGE", amount: 1 }],
    activated: [],
  },
  "the-springs": {
    id: "the-springs", name: "The Springs", eligibleTier: "high",
    // The neutral oasis — heals WHOEVER stands here, any owner. Worth
    // camping, worth denying.
    passives: [{ type: "HEAL_HERE", amount: 2 }],
    activated: [],
  },
  "toll-gate": {
    id: "toll-gate", name: "Toll Gate", eligibleTier: "high",
    passives: [{ type: "MOVE_TAX", amount: 1 }],
    activated: [],
  },
};

// Reactive cards (mechanical-spec §5, §10). Granted to a player's hand
// by encounters; trigger on a matching event and either modify the
// pending action (replace mode) or apply effects after it (on mode).
// The set below mirrors content/reactive-cards.csv. Rows that need
// effect types not in the v0.1 effect library (MOVE_UNIT, DISABLE_CHIP,
// targeted action grants, ALT_COST_OR_CANCEL surcharges) or events not
// yet windowed (move_declared, action_declared, encounter_drawn,
// unit_retreats) are omitted — listed in the commit message.
export const REACTIVES = {
  "steady-hand": {
    id: "steady-hand",
    name: "Steady Hand",
    role: "Reactive",
    copies: 3,
    desc: "When a contest targets you, your defending unit gets +2 Strength this contest.",
    triggers: [{
      trigger: "contest_declared",
      mode: "on",
      condition: "defender-owns-source",
      effects: [{
        type: "MODIFY_STAT", stat: "Strength", amount: 2,
        target: "defending_unit", duration: "this_contest",
      }],
    }],
  },
  "emergency-reinforcements": {
    id: "emergency-reinforcements",
    name: "Emergency Reinforcements",
    role: "Reactive",
    copies: 3,
    desc: "When a contest targets you, your defending unit gets +2 Strength this contest.",
    triggers: [{
      trigger: "contest_declared",
      mode: "on",
      condition: "defender-owns-source",
      effects: [{
        type: "MODIFY_STAT", stat: "Strength", amount: 2,
        target: "defending_unit", duration: "this_contest",
      }],
    }],
  },
  "false-flag": {
    id: "false-flag",
    name: "False Flag",
    role: "Reactive",
    copies: 2,
    desc: "Cancel a contest declared against you.",
    triggers: [{
      trigger: "contest_declared",
      mode: "replace",
      condition: "defender-owns-source",
      effects: [{ type: "CANCEL" }],
    }],
  },
  vulture: {
    id: "vulture",
    name: "Vulture",
    role: "Reactive",
    copies: 2,
    desc: "Redirect a reward granted to an opponent — you take it instead.",
    triggers: [{
      trigger: "reward_granted",
      mode: "replace",
      effects: [{ type: "REDIRECT", field: "recipient", operation: "set", value: "self" }],
    }],
  },
  scavengers: {
    id: "scavengers",
    name: "Scavengers",
    role: "Reactive",
    copies: 3,
    desc: "When you lose a contest, gain 3 Scrap.",
    triggers: [{
      trigger: "contest_lost",
      mode: "on",
      condition: "loser-is-source",
      effects: [{ type: "ADJUST_RESOURCE", resource: "Resource", amount: 3, target: "self" }],
    }],
  },
};
