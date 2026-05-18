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
export const LOCATIONS = {
  korad: { id: "korad", name: "Korad", strategicValue: "high", affiliation: "versari", production: [3, 4] },
  dambar: { id: "dambar", name: "Dambar", strategicValue: "veryHigh", affiliation: "versari", production: [4, 5] },
  kansit: { id: "kansit", name: "Kansit", strategicValue: "high", affiliation: "goldgrass", production: [3, 4] },
  omara: { id: "omara", name: "Omara", strategicValue: "medium", affiliation: "goldgrass", production: [2, 3] },
  chigan: { id: "chigan", name: "Chigan", strategicValue: "veryHigh", affiliation: "lakers", production: [4, 5] },
  droit: { id: "droit", name: "Droit", strategicValue: "high", affiliation: "lakers", production: [3, 4] },
  "the-shelf": { id: "the-shelf", name: "The Shelf", strategicValue: "high", affiliation: "plainers", production: [3, 4] },
  "tin-town": { id: "tin-town", name: "Tin Town", strategicValue: "medium", affiliation: "plainers", production: [2, 3] },
  concordan: { id: "concordan", name: "Concordan", strategicValue: "medium", affiliation: null, production: [2, 3] },
  erport: { id: "erport", name: "Erport", strategicValue: "medium", affiliation: null, production: [2, 3] },
};

// Upgrade chips. kind = which slot type; slots = slots occupied (2-slot
// chips are powerful + rare); techLevel = Market tier; cost = scrap;
// copies = how many seed the tier's market deck. techLevel / cost /
// copies are PROVISIONAL until the content batch. `effects` are left for
// Layer 2 (the effect library); `desc` carries the plain-text effect.
export const CHIPS = {
  // --- unit chips ---
  "new-recruits": { id: "new-recruits", name: "New Recruits", kind: "unit", slots: 1, techLevel: 1, cost: 2, copies: 3, desc: "+1 Strength" },
  navigator: { id: "navigator", name: "Navigator", kind: "unit", slots: 1, techLevel: 1, cost: 2, copies: 3, desc: "+1 Movement" },
  "sharpened-blades": { id: "sharpened-blades", name: "Sharpened Blades", kind: "unit", slots: 1, techLevel: 2, cost: 4, copies: 3, desc: "+2 Strength" },
  cannons: { id: "cannons", name: "Cannons", kind: "unit", slots: 1, techLevel: 3, cost: 6, copies: 2, desc: "+3 Strength" },
  landship: { id: "landship", name: "Landship", kind: "unit", slots: 2, techLevel: 3, cost: 7, copies: 2, desc: "+2 Movement (rare, 2-slot)" },
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
  desc: "Decay-immune; +1 garrison Strength, +1 scrap production",
};
