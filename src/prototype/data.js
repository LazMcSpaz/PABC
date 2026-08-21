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
  // "This can still act." Deliberately NOT `accent`: amber is already the
  // selection glow, and a unit that is selected is not the same as a unit
  // that has an action left. Holo teal is the interface's own voice — it
  // reads as a readout rather than as a faction or a highlight.
  ready: "#56d3c6",
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

// Player factions. `capital` is the Location each one begins holding.
//
// Display fallback only — the live value comes from the engine via
// `adaptDiplomacy`'s `capital` / `youCapital`, since a Capital moves when its
// Location is captured. Truth is `FACTIONS[].capital` in src/game/content.js;
// keep these in step with it. (They were wrong for three of the four factions
// once already, and the error reached the map.)
export const FACTIONS = {
  versari: { id: "versari", name: "Versari Korad", short: "Versari", color: "#d2453f", capital: "korad" },
  lakers: { id: "lakers", name: "Grand Lakers", short: "Lakers", color: "#3f84c4", capital: "droit" },
  goldgrass: { id: "goldgrass", name: "Goldgrass Coalition", short: "Goldgrass", color: "#85ab3e", capital: "kansit" },
  plainers: { id: "plainers", name: "Free Plainers", short: "Plainers", color: "#9d70c4", capital: "tinTown" },
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
  tinTown: { id: "tinTown", name: "Tin Town", value: "high", vp: 3, garrison: 6, chipSlots: 3, production: 3, ability: null },
  // 2026-08-16 content pass. Numeric fields are re-derived from the engine at
  // load (ensureUiConstantsSynced), so these are placeholders for anything the
  // engine does not own — the name is the part that matters here.
  runaway: { id: "runaway", name: "Runaway", value: "high", vp: 2, garrison: 8, chipSlots: 3, production: 3, ability: null },
  witcha: { id: "witcha", name: "Witcha", value: "high", vp: 2, garrison: 8, chipSlots: 3, production: 3, ability: null },
  dulut: { id: "dulut", name: "Dulut", value: "high", vp: 2, garrison: 8, chipSlots: 3, production: 3, ability: null },
  linkin: { id: "linkin", name: "Linkin", value: "high", vp: 2, garrison: 8, chipSlots: 3, production: 3, ability: null },
  restaria: { id: "restaria", name: "Restaria", value: "medium", vp: 1, garrison: 6, chipSlots: 2, production: 2, ability: null },
  lastgas: { id: "lastgas", name: "Lastgas", value: "medium", vp: 1, garrison: 6, chipSlots: 2, production: 2, ability: null },
  overlook: { id: "overlook", name: "Overlook", value: "medium", vp: 1, garrison: 6, chipSlots: 2, production: 2, ability: null },
  nosservis: { id: "nosservis", name: "Nosservis", value: "low", vp: 1, garrison: 4, chipSlots: 1, production: 1, ability: null },
  detor: { id: "detor", name: "Detor", value: "low", vp: 1, garrison: 4, chipSlots: 1, production: 1, ability: null },
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
  drilledTroops: { id: "drilledTroops", name: "Drilled Troops", kind: "unit", cost: 3, str: 1, mov: 0, effect: "+1 Strength" },
  sharpenedBlades: { id: "sharpenedBlades", name: "Sharpened Blades", kind: "unit", cost: 6, str: 2, mov: 0, effect: "+2 Strength" },
  bombard: { id: "bombard", name: "Bombard", kind: "unit", cost: 12, rare: true, str: 3, mov: 0, effect: "+3 Strength; ignores static defenses" },
  navigator: { id: "navigator", name: "Navigator", kind: "unit", cost: 3, str: 0, mov: 1, effect: "+1 Movement" },
  troopCarrier: { id: "troopCarrier", name: "Troop Carrier", kind: "unit", cost: 6, str: 0, mov: 2, effect: "+2 Movement" },
  landship: { id: "landship", name: "Landship", kind: "unit", cost: 12, rare: true, str: 0, mov: 3, effect: "+3 Movement; ignores terrain" },
  fieldGlass: { id: "fieldGlass", name: "Field Glass", kind: "unit", cost: 3, str: 0, mov: 0, effect: "+1 Vision" },
  spotterNet: { id: "spotterNet", name: "Spotter Net", kind: "unit", cost: 6, str: 0, mov: 0, effect: "+1 Vision, +1 Detection" },
  fieldMedics: { id: "fieldMedics", name: "Field Medics", kind: "unit", cost: 4, str: 0, mov: 0, effect: "Heals +1/Upkeep anywhere" },
  pathfinders: { id: "pathfinders", name: "Pathfinders", kind: "unit", cost: 5, str: 0, mov: 0, effect: "Ignores terrain penalties" },
  rearguard: { id: "rearguard", name: "Rearguard", kind: "unit", cost: 4, str: 0, mov: 0, effect: "Retreat 2; no rout spill" },
  trailwise: { id: "trailwise", name: "Trailwise", kind: "unit", cost: 3, str: 0, mov: 0, effect: "Redraw a triggered encounter" },
  entrenchingTools: { id: "entrenchingTools", name: "Entrenching Tools", kind: "unit", cost: 3, str: 0, mov: 0, effect: "+1 fortify bonus" },
  coldCamp: { id: "coldCamp", name: "Cold Camp", kind: "unit", cost: 0, rare: true, str: 0, mov: 0, effect: "Pay 2 scrap: unseen until your next turn" },
  nightMarch: { id: "nightMarch", name: "Night March", kind: "unit", cost: 0, rare: true, str: 0, mov: 0, effect: "Passes through enemy units" },
  warBanner: { id: "warBanner", name: "War Banner", kind: "unit", cost: 0, rare: true, str: 0, mov: 0, effect: "Extra unit for concentration; cap +1" },
  oldHands: { id: "oldHands", name: "Old Hands", kind: "unit", cost: 0, rare: true, str: 0, mov: 0, effect: "Counts as a veteran" },
  safeConduct: { id: "safeConduct", name: "Safe Conduct", kind: "unit", cost: 0, rare: true, str: 0, mov: 0, effect: "No trespass penalties" },
  relayKit: { id: "relayKit", name: "Relay Kit", kind: "unit", cost: 0, rare: true, str: 0, mov: 0, effect: "Builds Listening Posts without tech" },
};

// Location upgrade chips. Costs are placeholders (scrap).
export const LOCATION_UPGRADES = {
  defenseTurrets: { id: "defenseTurrets", name: "Defense Turrets", kind: "location", cost: 4, short: "+2 Garrison", effect: "+2 Strength to this location's garrison." },
  stronghold: { id: "stronghold", name: "Stronghold", kind: "location", cost: 7, short: "+4 Garrison", effect: "+4 Strength to this location's garrison (upkeep 1)." },
  recyclers: { id: "recyclers", name: "Recyclers", kind: "location", cost: 3, short: "+1 Scrap / turn", effect: "+1 scrap production each turn." },
  factory: { id: "factory", name: "Factory", kind: "location", cost: 6, short: "+2 Scrap / turn", effect: "+2 scrap production each turn." },
  works: { id: "works", name: "Works", kind: "location", cost: 4, short: "+1 Build / turn", effect: "+1 build progress each turn toward this location's active build." },
  reconTeam: { id: "reconTeam", name: "Recon Team", kind: "location", cost: 3, short: "Encounter Redraw", effect: "When you draw from the encounter deck, you may discard it and draw again." },
  trainingGrounds: { id: "trainingGrounds", name: "Training Grounds", kind: "location", cost: 4, short: "+1 Unit Cap", effect: "Prerequisite for creating units. Raises your unit cap by 1." },
  infirmary: { id: "infirmary", name: "Infirmary", kind: "location", cost: 5, short: "+1 Heal / turn", effect: "Units here heal +1 more per Upkeep; instant reinforce costs 1 scrap per Strength." },
  watchtower: { id: "watchtower", name: "Watchtower", kind: "location", cost: 3, short: "+1 Vision / Detection", effect: "This location sees +1 further and pierces concealment at +1." },
  beacon: { id: "beacon", name: "Beacon", kind: "location", cost: 4, short: "+2 Influence", effect: "+2 Influence projected by this location." },
  broadcast: { id: "broadcast", name: "Broadcast", kind: "location", cost: 7, short: "+2 Influence, +1 Range", effect: "+2 Influence projected by this location and +1 Influence range." },
  civicHall: { id: "civicHall", name: "Civic Hall", kind: "location", cost: 5, short: "Loyalty Engine", effect: "Loyalty rises +1 extra while garrisoned and never decays while neglected." },
  logisticsHub: { id: "logisticsHub", name: "Logistics Hub", kind: "location", cost: 12, rare: true, short: "+1 Action / turn", effect: "+1 Action each of your turns." },
  burningGlass: { id: "burningGlass", name: "Burning Glass", kind: "location", cost: 6, short: "+2 Garrison, Burn", effect: "Versari signature. +2 garrison; attackers lose 1 Strength before the contest." },
  guestHouse: { id: "guestHouse", name: "Guest House", kind: "location", cost: 5, short: "Standing Rises", effect: "Goldgrass signature. Standing toward you rises each round with factions you are not at war with." },
  motorPool: { id: "motorPool", name: "Motor Pool", kind: "location", cost: 5, short: "Cheap Recruits", effect: "Lakers signature. Recruiting here costs 2 less scrap; +1 unit cap." },
  waystation: { id: "waystation", name: "Waystation", kind: "location", cost: 5, short: "+1 Move at Start", effect: "Plainers signature. Friendly units starting their turn here gain +1 Movement that turn." },
  capital: { id: "capital", name: "Capital", kind: "capital", cost: 0, special: true, short: "Capital Seat", effect: "This location cannot decay. +1 garrison Strength and +1 scrap production. One per player; removed if the location is captured." },
};

export const ALL_UPGRADES = { ...UNIT_UPGRADES, ...LOCATION_UPGRADES };

// --- helpers -------------------------------------------------------------

export function ownerColor(ownerId) {
  if (!ownerId || ownerId === "neutral") return NEUTRAL;
  return FACTIONS[ownerId]?.color || NEUTRAL;
}

// The engine is deliberately theme-free, so every resource event carries the
// generic key ("Resource", "Research", "VP") rather than the setting's name for
// it. That key is an engine identifier, not player-facing copy — printing it
// raw is how the turn feed ended up saying "+5 resource (output)" for what the
// rest of the UI, down to the icon beside it, calls scrap. Translate here, at
// the one seam that is allowed to know the theme.
const RESOURCE_LABEL = {
  Resource: "scrap",
  Research: "research",
  VP: "VP",
};
export function resourceLabel(key) {
  return RESOURCE_LABEL[key] || String(key || "").toLowerCase();
}

// Board hologram tints. A separate palette from the UI colours above, and it
// has to be: the tile hologram is recoloured by ADDING a flat colour over a
// white-hot glow, and the mid-tone UI colours come out of that muddy and
// nearly indistinguishable from each other. Same hues, pushed to emissive
// luminance and saturation. Keep the two palettes in step when either moves —
// a faction whose chip is red and whose territory glows orange reads as two
// different factions.
export const HOLO_NEUTRAL = "#9fd8ff"; // unheld ground, ~the as-generated cyan
const HOLO = {
  versari: "#ff5f52",
  lakers: "#58b6ff",
  goldgrass: "#b8e04e",
  plainers: "#c08cff",
  tempest: "#6f9de0",
  croppers: "#ecd162",
  steeltraders: "#f0796c",
  dambarans: "#7fd88f",
};

export function holoColor(ownerId) {
  if (!ownerId || ownerId === "neutral") return HOLO_NEUTRAL;
  return HOLO[ownerId] || HOLO_NEUTRAL;
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
