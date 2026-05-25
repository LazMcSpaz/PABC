// Content + theme tokens for the prototype UI.
//
// Numbers that the design has not pinned down yet (garrison strengths,
// chip costs, chip-slot counts) are placeholders chosen to make the
// mockup read well — flagged here so they are not mistaken for final.

export const theme = {
  bg: "#14110d",
  panel: "#1e1913",
  panel2: "#262017",
  panel3: "#312a1f",
  border: "#403729",
  borderLit: "#5b4e3a",
  text: "#ece3d2",
  textDim: "#a89d87",
  textFaint: "#776c5b",
  accent: "#e8a93f", // amber lamplight
  accent2: "#c75d30", // rust
  good: "#86ad52",
  boardBg:
    "radial-gradient(ellipse 72% 64% at 50% 38%, #322a1d 0%, #1c1711 52%, #100d09 100%)",
  plate: "linear-gradient(180deg, #2a2217 0%, #1c1711 100%)",
  shadow: "0 6px 18px rgba(0,0,0,0.55)",
  shadowDeep: "0 16px 38px rgba(0,0,0,0.7)",
  fontDisplay: "'Oswald','Arial Narrow','Roboto Condensed',system-ui,sans-serif",
};

export const NEUTRAL = "#717171";

// Player factions. `capital` is the location each one begins holding.
export const FACTIONS = {
  versari: { id: "versari", name: "Versari Korad", short: "Versari", color: "#d2453f", capital: "korad" },
  lakers: { id: "lakers", name: "Grand Lakers", short: "Lakers", color: "#3f84c4", capital: "dambar" },
  goldgrass: { id: "goldgrass", name: "Goldgrass Coalition", short: "Goldgrass", color: "#85ab3e", capital: "chigan" },
  plainers: { id: "plainers", name: "Free Plainers", short: "Plainers", color: "#9d70c4", capital: "erport" },
  // §18.4.1 minor factions — now real on-board actors (seated near their
  // major), so the UI must resolve their name/short/colour like any faction.
  tempest: { id: "tempest", name: "Clan Tempest", short: "Tempest", color: "#4a6fa5", capital: null },
  croppers: { id: "croppers", name: "The Croppers", short: "Croppers", color: "#c9b24e", capital: null },
  steeltraders: { id: "steeltraders", name: "The Steel Traders", short: "Steel Traders", color: "#a8584f", capital: null },
  dambarans: { id: "dambarans", name: "The Dambarans", short: "Dambarans", color: "#5fa06e", capital: null },
};

// Strategic value — shown on an uncontrolled (face-down) location card.
export const STRATEGIC_VALUE = {
  low: { key: "low", label: "Low", color: "#5f6b66", rank: 1 },
  medium: { key: "medium", label: "Medium", color: "#3f93a8", rank: 2 },
  high: { key: "high", label: "High", color: "#d18a3c", rank: 3 },
  veryHigh: { key: "veryHigh", label: "Very High", color: "#d2453f", rank: 4 },
};

// The ten named locations. `garrison` / `chipSlots` / `production` / `vp`
// and the flavour `ability` strings are placeholders for the look pass.
export const LOCATIONS = {
  korad: { id: "korad", name: "Korad", value: "high", vp: 3, garrison: 6, chipSlots: 3, production: 3, ability: "Forge — once per turn, spend 2 scrap to give a unit here +1 Strength until your next turn." },
  dambar: { id: "dambar", name: "Dambar", value: "veryHigh", vp: 4, garrison: 9, chipSlots: 4, production: 4, ability: "Deepwater Port — your units may Move between Dambar and any other water-edge location for 1 Action." },
  kansit: { id: "kansit", name: "Kansit", value: "high", vp: 3, garrison: 6, chipSlots: 3, production: 3, ability: null },
  theShelf: { id: "theShelf", name: "The Shelf", value: "high", vp: 3, garrison: 7, chipSlots: 3, production: 3, ability: "High Ground — this garrison adds +1 to its contest roll." },
  omara: { id: "omara", name: "Omara", value: "medium", vp: 2, garrison: 4, chipSlots: 2, production: 2, ability: null },
  chigan: { id: "chigan", name: "Chigan", value: "veryHigh", vp: 4, garrison: 9, chipSlots: 4, production: 4, ability: "Goldgrass Reserves — gain 1 scrap whenever you flip a section anywhere on the board." },
  droit: { id: "droit", name: "Droit", value: "high", vp: 3, garrison: 6, chipSlots: 3, production: 3, ability: null },
  erport: { id: "erport", name: "Erport", value: "medium", vp: 2, garrison: 4, chipSlots: 2, production: 2, ability: "Airfield — once per turn, redeploy a unit you control to any location you fully hold." },
  concordan: { id: "concordan", name: "Concordan", value: "medium", vp: 2, garrison: 5, chipSlots: 2, production: 2, ability: null },
  tinTown: { id: "tinTown", name: "Tin Town", value: "medium", vp: 2, garrison: 4, chipSlots: 2, production: 2, ability: null },
};

// Chip family tints — orange = unit upgrade, teal = location upgrade.
export const CHIP_COLOR = {
  unit: "#d6863a",
  location: "#3f93a8",
  capital: "#e0b349",
};

// Unit upgrade chips. Costs are placeholders (scrap). `str`/`mov` are
// the structured deltas the UI uses to compute effective unit stats.
export const UNIT_UPGRADES = {
  landship: { id: "landship", name: "Landship", kind: "unit", cost: 5, rare: true, str: 0, mov: 2, effect: "+2 Movement" },
  sharpenedBlades: { id: "sharpenedBlades", name: "Sharpened Blades", kind: "unit", cost: 3, str: 2, mov: 0, effect: "+2 Strength" },
  drilledTroops: { id: "drilledTroops", name: "Drilled Troops", kind: "unit", cost: 2, str: 1, mov: 0, effect: "+1 Strength" },
  navigator: { id: "navigator", name: "Navigator", kind: "unit", cost: 2, str: 0, mov: 1, effect: "+1 Movement" },
  cannons: { id: "cannons", name: "Cannons", kind: "unit", cost: 5, str: 3, mov: 0, effect: "+3 Strength" },
};

// Location upgrade chips. Costs are placeholders (scrap).
export const LOCATION_UPGRADES = {
  defenseTurrets: { id: "defenseTurrets", name: "Defense Turrets", kind: "location", cost: 4, short: "+2 Garrison", effect: "+2 Strength to this location's garrison." },
  townHall: { id: "townHall", name: "Town Hall", kind: "location", cost: 3, short: "+1 Decay Limit", effect: "+1 to this location's decay limit (foothold cap)." },
  recyclers: { id: "recyclers", name: "Recyclers", kind: "location", cost: 3, short: "+1 Scrap / turn", effect: "+1 scrap production each turn." },
  factory: { id: "factory", name: "Factory", kind: "location", cost: 5, short: "+2 Scrap / turn", effect: "+2 scrap production each turn." },
  reconTeam: { id: "reconTeam", name: "Recon Team", kind: "location", cost: 3, short: "Encounter Redraw", effect: "When you draw from the encounter deck, you may discard it and draw again." },
  trainingGrounds: { id: "trainingGrounds", name: "Training Grounds", kind: "location", cost: 4, short: "+1 Unit Cap", effect: "Prerequisite for creating units. Raises your unit cap by 1." },
  logisticsHub: { id: "logisticsHub", name: "Logistics Hub", kind: "location", cost: 6, rare: true, short: "+1 Action / turn", effect: "+1 Action each of your turns." },
  capital: { id: "capital", name: "Capital", kind: "capital", cost: 0, special: true, short: "Capital Seat", effect: "This location cannot decay. +1 garrison Strength and +1 scrap production. One per player; removed if the location is captured." },
};

export const ALL_UPGRADES = { ...UNIT_UPGRADES, ...LOCATION_UPGRADES };

// --- helpers -------------------------------------------------------------

export function ownerColor(ownerId) {
  if (!ownerId || ownerId === "neutral") return NEUTRAL;
  return FACTIONS[ownerId]?.color || NEUTRAL;
}

// A location is fully controlled only when one player owns all 3 sections.
export function fullController(sections) {
  if (!sections) return null;
  const [a, b, c] = sections;
  return a !== "neutral" && a === b && b === c ? a : null;
}

export function valueOf(locationId) {
  return STRATEGIC_VALUE[LOCATIONS[locationId]?.value] || STRATEGIC_VALUE.low;
}

// Effective unit stats = base + installed chip deltas.
export function unitEffective(unit) {
  let strength = unit.strength;
  let movement = unit.movement;
  for (const id of unit.chips || []) {
    const c = UNIT_UPGRADES[id];
    if (c) {
      strength += c.str || 0;
      movement += c.mov || 0;
    }
  }
  return { strength, movement };
}

// A location's garrison Strength, split into its base value and each
// upgrade chip's bonus. `total` is the figure an attacker must beat.
export function garrisonBreakdown(locationId, control) {
  const base = LOCATIONS[locationId]?.garrison || 0;
  const parts = [];
  for (const id of control?.chips || []) {
    if (id === "defenseTurrets") parts.push({ label: "Defense Turrets", value: 2 });
    else if (id === "capital") parts.push({ label: "Capital", value: 1 });
  }
  const total = parts.reduce((sum, p) => sum + p.value, base);
  return { base, parts, total };
}

// Convenience total — base + defensive chip bonuses.
export function garrisonStrength(locationId, control) {
  return garrisonBreakdown(locationId, control).total;
}

// Scrap produced per turn = base + production chip bonuses.
export function locationProduction(locationId, control) {
  let p = LOCATIONS[locationId]?.production || 0;
  for (const id of control?.chips || []) {
    if (id === "recyclers") p += 1;
    else if (id === "factory") p += 2;
    else if (id === "capital") p += 1;
  }
  return p;
}
