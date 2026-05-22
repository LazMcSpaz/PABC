// Stub content set for engine development. Mirrors the content/ sheets;
// values still blank in those sheets (chip costs, tech levels, scrap
// production ranges) are PROVISIONAL stubs here, flagged inline. The
// engine never branches on these ids — they are plain data.

export const FACTIONS = {
  versari: { id: "versari", name: "Versari Korad", color: "#3a7d44", affiliatedLocations: ["korad", "dambar"] },
  goldgrass: { id: "goldgrass", name: "Goldgrass Coalition", color: "#d8a72b", affiliatedLocations: ["kansit", "omara"] },
  lakers: { id: "lakers", name: "Grand Lakers", color: "#21406e", affiliatedLocations: ["chigan", "droit"] },
  plainers: { id: "plainers", name: "Free Plainers", color: "#c43b35", affiliatedLocations: ["the-shelf", "tin-town"] },
};

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

// Upgrade chips. kind = which slot type; slots = slots occupied (2-slot
// chips are powerful + rare); techLevel = Market tier; cost = scrap;
// copies = how many seed the tier's market deck. techLevel / cost /
// copies are PROVISIONAL until the content batch. `effects` are left for
// Layer 2 (the effect library); `desc` carries the plain-text effect.
export const CHIPS = {
  // --- unit chips --- (strength / movement = structured stat bonuses)
  // §16.5 — recruitment is now an action; this stays a +1 Strength gear chip.
  "drilled-troops": { id: "drilled-troops", name: "Drilled Troops", kind: "unit", slots: 1, techLevel: 1, cost: 2, copies: 3, strength: 1, desc: "+1 Strength" },
  navigator: { id: "navigator", name: "Navigator", kind: "unit", slots: 1, techLevel: 1, cost: 2, copies: 3, movement: 1, desc: "+1 Movement" },
  "sharpened-blades": { id: "sharpened-blades", name: "Sharpened Blades", kind: "unit", slots: 1, techLevel: 2, cost: 4, copies: 3, strength: 2, desc: "+2 Strength" },
  cannons: { id: "cannons", name: "Cannons", kind: "unit", slots: 1, techLevel: 3, cost: 6, copies: 2, strength: 3, desc: "+3 Strength" },
  landship: { id: "landship", name: "Landship", kind: "unit", slots: 2, techLevel: 3, cost: 7, copies: 2, movement: 2, desc: "+2 Movement (rare, 2-slot)" },
  // --- location chips ---
  recyclers: { id: "recyclers", name: "Recyclers", kind: "location", slots: 1, techLevel: 1, cost: 3, copies: 3, desc: "+1 scrap production" },
  "town-hall": { id: "town-hall", name: "Town Hall", kind: "location", slots: 1, techLevel: 1, cost: 3, copies: 3, desc: "+1 to this location's foothold cap" },
  "recon-team": { id: "recon-team", name: "Recon Team", kind: "location", slots: 1, techLevel: 1, cost: 3, copies: 2, desc: "Discard a drawn encounter and draw again" },
  "training-grounds": { id: "training-grounds", name: "Training Grounds", kind: "location", slots: 1, techLevel: 1, cost: 4, copies: 3, desc: "Enables recruiting units; +1 unit cap" },
  labs: { id: "labs", name: "Labs", kind: "location", slots: 1, techLevel: 1, cost: 3, copies: 3, desc: "+1 Tech score" },
  "defense-turrets": { id: "defense-turrets", name: "Defense Turrets", kind: "location", slots: 1, techLevel: 2, cost: 4, copies: 3, desc: "+2 garrison Strength" },
  factory: { id: "factory", name: "Factory", kind: "location", slots: 1, techLevel: 2, cost: 5, copies: 2, desc: "+2 scrap production" },
  "logistics-hub": { id: "logistics-hub", name: "Logistics Hub", kind: "location", slots: 2, techLevel: 3, cost: 6, copies: 2, desc: "+1 Action each turn (rare, 2-slot)" },
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
