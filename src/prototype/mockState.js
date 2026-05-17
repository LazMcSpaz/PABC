// A hand-authored mid-game snapshot. The prototype renders against this
// so every UI state (neutral / contested / held / decaying) is visible
// without a running engine.

export const VP_GOAL = 12;

// Units, keyed by id. `strength`/`movement` are base; chips add on top.
export const UNITS = {
  "vk-vanguard": { id: "vk-vanguard", owner: "versari", name: "Vanguard", strength: 4, movement: 2, chips: ["sharpenedBlades"], immobilized: false },
  "gl-tidewardens": { id: "gl-tidewardens", owner: "lakers", name: "Tidewardens", strength: 5, movement: 1, chips: [], immobilized: false },
  "gg-reapers": { id: "gg-reapers", owner: "goldgrass", name: "Reapers", strength: 3, movement: 2, chips: ["navigator"], immobilized: true },
  "fp-windriders": { id: "fp-windriders", owner: "plainers", name: "Wind Riders", strength: 4, movement: 3, chips: [], immobilized: false },
};

export const PLAYERS = {
  versari: { id: "versari", scrap: 7, vp: 4, actions: { remaining: 2, max: 3 }, unitCap: 1 },
  lakers: { id: "lakers", scrap: 5, vp: 6, actions: { remaining: 0, max: 3 }, unitCap: 2 },
  goldgrass: { id: "goldgrass", scrap: 9, vp: 3, actions: { remaining: 3, max: 3 }, unitCap: 1 },
  plainers: { id: "plainers", scrap: 4, vp: 5, actions: { remaining: 1, max: 3 }, unitCap: 1 },
};

// control: { sections:[3], foothold, footholdCap, chips:[] }
// `foothold` is null until a player holds all 3 sections.
const held = (owner, foothold, footholdCap, chips) => ({
  sections: [owner, owner, owner],
  foothold,
  footholdCap,
  chips,
});

export const HEXES = {
  "t-nw": { id: "t-nw", type: "terrain" },
  chigan: {
    id: "chigan", type: "location", locationId: "chigan",
    control: held("goldgrass", 2, 3, ["capital", "recyclers"]),
  },
  "t-ne": { id: "t-ne", type: "terrain" },

  kansit: {
    id: "kansit", type: "location", locationId: "kansit",
    control: { sections: ["neutral", "neutral", "neutral"], foothold: null, footholdCap: 3, chips: [] },
  },
  "e-1": { id: "e-1", type: "encounter", unitId: "gg-reapers" },
  omara: {
    id: "omara", type: "location", locationId: "omara",
    control: { sections: ["versari", "versari", "neutral"], foothold: null, footholdCap: 3, chips: [] },
  },
  "e-2": { id: "e-2", type: "encounter" },

  korad: {
    id: "korad", type: "location", locationId: "korad",
    control: held("versari", 3, 3, ["capital", "factory", "defenseTurrets"]),
  },
  "e-3": { id: "e-3", type: "encounter" },
  theShelf: {
    id: "theShelf", type: "location", locationId: "theShelf",
    control: { sections: ["versari", "neutral", "lakers"], foothold: null, footholdCap: 3, chips: [] },
    unitId: "vk-vanguard",
  },
  "e-4": { id: "e-4", type: "encounter" },
  erport: {
    id: "erport", type: "location", locationId: "erport",
    control: held("plainers", 1, 3, ["capital"]),
    unitId: "fp-windriders",
  },

  droit: {
    id: "droit", type: "location", locationId: "droit",
    control: { sections: ["neutral", "neutral", "neutral"], foothold: null, footholdCap: 3, chips: [] },
  },
  "e-5": { id: "e-5", type: "encounter" },
  concordan: {
    id: "concordan", type: "location", locationId: "concordan",
    control: held("lakers", 1, 3, []),
  },
  "e-6": { id: "e-6", type: "encounter" },

  "t-sw": { id: "t-sw", type: "terrain" },
  dambar: {
    id: "dambar", type: "location", locationId: "dambar",
    control: held("lakers", 3, 4, ["capital", "townHall"]),
    unitId: "gl-tidewardens",
  },
  tinTown: {
    id: "tinTown", type: "location", locationId: "tinTown",
    control: { sections: ["neutral", "neutral", "neutral"], foothold: null, footholdCap: 3, chips: [] },
  },
};

// Board layout — a 3/4/5/4/3 hex field, the brief's "Catan-sized" map.
export const ROWS = [
  ["t-nw", "chigan", "t-ne"],
  ["kansit", "e-1", "omara", "e-2"],
  ["korad", "e-3", "theShelf", "e-4", "erport"],
  ["droit", "e-5", "concordan", "e-6"],
  ["t-sw", "dambar", "tinTown"],
];

// Market Row — face-down upgrade chips on offer.
export const MARKET = ["cannons", "defenseTurrets", "logisticsHub", "navigator", "trainingGrounds"];

export const mockState = {
  round: 4,
  phase: "Main",
  youId: "versari",
  activeId: "versari",
  vpGoal: VP_GOAL,
  players: PLAYERS,
  units: UNITS,
  hexes: HEXES,
  rows: ROWS,
  market: MARKET,
};
