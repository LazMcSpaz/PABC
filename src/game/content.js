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
export const FACTIONS = {
  versari: {
    id: "versari", name: "Versari Korad", color: "#3a7d44", affiliatedLocations: ["korad", "dambar"],
    tier: "major", scope: "global", playable: true,
    temperament: "schemer", aggression: 0.4, trust: 0.55, grudge: 0.4, sociability: 0.8,
    victoryLean: "diplomacy", expansion: 0.5,
  },
  goldgrass: {
    id: "goldgrass", name: "Goldgrass Coalition", color: "#d8a72b", affiliatedLocations: ["kansit", "omara"],
    tier: "major", scope: "global", playable: true,
    temperament: "pacifist", aggression: 0.1, trust: 0.9, grudge: 0.25, sociability: 0.95,
    victoryLean: "diplomacy", expansion: 0.3,
  },
  lakers: {
    id: "lakers", name: "Grand Lakers", color: "#21406e", affiliatedLocations: ["chigan", "droit"],
    tier: "major", scope: "global", playable: true,
    temperament: "warlord", aggression: 0.9, trust: 0.6, grudge: 0.7, sociability: 0.2,
    victoryLean: "conquest", expansion: 0.9,
  },
  plainers: {
    id: "plainers", name: "Free Plainers", color: "#c43b35", affiliatedLocations: ["the-shelf", "tin-town"],
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
// Total board VP = 4·1 (med) + 4·2 (high) + 2·3 (veryHigh) = 18, so
// the win threshold of 12 needs roughly two-thirds of the map.
export const LOCATIONS = {
  korad: { id: "korad", name: "Korad", strategicValue: "high", affiliation: "versari", production: [3, 4], vpReward: 2 },
  dambar: { id: "dambar", name: "Dambar", strategicValue: "veryHigh", affiliation: "versari", production: [4, 5], vpReward: 3 },
  kansit: { id: "kansit", name: "Kansit", strategicValue: "high", affiliation: "goldgrass", production: [3, 4], vpReward: 2 },
  omara: { id: "omara", name: "Omara", strategicValue: "medium", affiliation: "goldgrass", production: [2, 3], vpReward: 1 },
  chigan: { id: "chigan", name: "Chigan", strategicValue: "veryHigh", affiliation: "lakers", production: [4, 5], vpReward: 3 },
  droit: { id: "droit", name: "Droit", strategicValue: "high", affiliation: "lakers", production: [3, 4], vpReward: 2 },
  "the-shelf": { id: "the-shelf", name: "The Shelf", strategicValue: "high", affiliation: "plainers", production: [3, 4], vpReward: 2 },
  "tin-town": { id: "tin-town", name: "Tin Town", strategicValue: "medium", affiliation: "plainers", production: [2, 3], vpReward: 1 },
  concordan: { id: "concordan", name: "Concordan", strategicValue: "medium", affiliation: null, production: [2, 3], vpReward: 1 },
  erport: { id: "erport", name: "Erport", strategicValue: "medium", affiliation: null, production: [2, 3], vpReward: 1 },
};

// Upgrade chips — §20 makes these the whole economy: built at a Location
// off its Output (the Market is retired), and upgraded in place.
//   kind         which slot type (unit chips need a stationed friendly unit)
//   slots        slots occupied (2-slot chips are powerful + rare)
//   techLevel    §20.6 Tech-Level band gate (1/2/3 → player Tech L ≥ 1/3/5)
//   buildCost    §20.4 construction cost in Output units (defaults to `cost`)
//   loyaltyReq   §20.6 Loyalty rung (0–8) this city needs to build the chip
//   upgradesTo   §20.5 next-tier chip id this one upgrades into, if any
//   upkeep       §20.9 optional scrap/turn; unpaid → dormant (disabled), not destroyed
//   output       §20.3 scrap-equivalent this economy chip adds to Location Output
//   cost/copies  legacy Market fields, retained as build-cost fallback / data
// Values are PROVISIONAL demo tunables. `desc` carries the plain-text effect.
export const CHIPS = {
  // --- unit chips --- (strength / movement = structured stat bonuses)
  // §16.5 — recruitment is now an action; this stays a +1 Strength gear chip.
  "drilled-troops": { id: "drilled-troops", name: "Drilled Troops", kind: "unit", slots: 1, techLevel: 1, cost: 2, copies: 3, strength: 1, buildCost: 2, loyaltyReq: 0, upgradesTo: "sharpened-blades", desc: "+1 Strength" },
  navigator: { id: "navigator", name: "Navigator", kind: "unit", slots: 1, techLevel: 1, cost: 2, copies: 3, movement: 1, buildCost: 2, loyaltyReq: 0, desc: "+1 Movement" },
  "sharpened-blades": { id: "sharpened-blades", name: "Sharpened Blades", kind: "unit", slots: 1, techLevel: 2, cost: 4, copies: 3, strength: 2, buildCost: 4, loyaltyReq: 3, upgradesTo: "cannons", desc: "+2 Strength" },
  cannons: { id: "cannons", name: "Cannons", kind: "unit", slots: 1, techLevel: 3, cost: 6, copies: 2, strength: 3, buildCost: 6, loyaltyReq: 6, upkeep: 1, desc: "+3 Strength (upkeep 1)" },
  landship: { id: "landship", name: "Landship", kind: "unit", slots: 2, techLevel: 3, cost: 7, copies: 2, movement: 2, buildCost: 7, loyaltyReq: 6, upkeep: 2, desc: "+2 Movement (rare, 2-slot; upkeep 2)" },
  // --- location chips ---
  recyclers: { id: "recyclers", name: "Recyclers", kind: "location", slots: 1, techLevel: 1, cost: 3, copies: 3, output: 1, buildCost: 3, loyaltyReq: 0, upgradesTo: "factory", desc: "+1 scrap Output" },
  "town-hall": { id: "town-hall", name: "Town Hall", kind: "location", slots: 1, techLevel: 1, cost: 3, copies: 3, buildCost: 3, loyaltyReq: 0, desc: "+1 to this location's foothold cap" },
  "recon-team": { id: "recon-team", name: "Recon Team", kind: "location", slots: 1, techLevel: 1, cost: 3, copies: 2, buildCost: 3, loyaltyReq: 0, desc: "Discard a drawn encounter and draw again" },
  "training-grounds": { id: "training-grounds", name: "Training Grounds", kind: "location", slots: 1, techLevel: 1, cost: 4, copies: 3, buildCost: 4, loyaltyReq: 0, desc: "Enables recruiting units; +1 unit cap" },
  labs: { id: "labs", name: "Labs", kind: "location", slots: 1, techLevel: 1, cost: 3, copies: 3, research: 1, buildCost: 3, loyaltyReq: 0, upgradesTo: "advanced-lab", desc: "+1 Research while controlled" },
  "advanced-lab": { id: "advanced-lab", name: "Advanced Lab", kind: "location", slots: 1, techLevel: 2, cost: 5, copies: 2, research: 2, buildCost: 5, loyaltyReq: 3, upkeep: 1, desc: "+2 Research while controlled (upkeep 1)" },
  "defense-turrets": { id: "defense-turrets", name: "Defense Turrets", kind: "location", slots: 1, techLevel: 2, cost: 4, copies: 3, garrison: 2, buildCost: 4, loyaltyReq: 3, desc: "+2 garrison Strength" },
  factory: { id: "factory", name: "Factory", kind: "location", slots: 1, techLevel: 2, cost: 5, copies: 2, output: 2, buildCost: 5, loyaltyReq: 3, desc: "+2 scrap Output" },
  "logistics-hub": { id: "logistics-hub", name: "Logistics Hub", kind: "location", slots: 2, techLevel: 3, cost: 6, copies: 2, buildCost: 6, loyaltyReq: 6, upkeep: 1, desc: "+1 Action each turn (rare, 2-slot; upkeep 1)" },
};

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
// that location's chip slots. The v0.1 stubs here keep to existing
// effect types — the real effects from content/location-abilities.csv
// need new effect types (teleport, suppress-chip-bonuses, …) authored
// with the content batch. Names and tiers match the CSV.
export const ABILITIES = {
  "rail-corridor": {
    id: "rail-corridor", name: "Rail Corridor", eligibleTier: "veryHigh",
    passives: [],
    activated: [{
      cost: { resource: 2 },
      effects: [{ type: "ADJUST_RESOURCE", resource: "Resource", amount: 5, target: "controller" }],
    }],
  },
  "knowledge-cache": {
    id: "knowledge-cache", name: "Knowledge Cache", eligibleTier: "veryHigh",
    passives: [],
    activated: [{
      cost: { action: 1 },
      effects: [{ type: "ADJUST_RESOURCE", resource: "VP", amount: 1, target: "controller" }],
    }],
  },
  "staging-ground": {
    id: "staging-ground", name: "Staging Ground", eligibleTier: "high",
    passives: [],
    activated: [{
      cost: {},
      effects: [{ type: "GRANT_ACTIONS", amount: 1, target: "controller" }],
    }],
  },
  "fortified-ruins": {
    id: "fortified-ruins", name: "Fortified Ruins", eligibleTier: "high",
    passives: [],
    activated: [{
      cost: { resource: 1 },
      effects: [{ type: "ADJUST_RESOURCE", resource: "VP", amount: 1, target: "controller" }],
    }],
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
