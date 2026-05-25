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

// control: { sections:[3], loyalty, loyaltyMax, loyaltyDanger, chips:[] }
// §18.2 — `loyalty` is null until a player holds all 3 sections; it is the
// 0–8 centre pie (ceiling fixed at 8). `loyaltyDanger` flags a Location
// bleeding toward a Control peel.
const held = (owner, loyalty, chips) => ({
  sections: [owner, owner, owner],
  loyalty,
  loyaltyMax: 8,
  loyaltyDanger: loyalty != null && loyalty <= 2,
  chips,
});

// A location nobody fully holds yet — `sections` may still be all-neutral
// or a partial split passed in explicitly.
const open = (sections = ["neutral", "neutral", "neutral"]) => ({
  sections,
  loyalty: null,
  loyaltyMax: 8,
  loyaltyDanger: false,
  chips: [],
});

const terrain = (id) => ({ id, type: "terrain" });
const encounter = (id, unitId) => ({ id, type: "encounter", ...(unitId ? { unitId } : null) });
const location = (id, control, unitId) => ({
  id,
  type: "location",
  locationId: id,
  control,
  ...(unitId ? { unitId } : null),
});

// Board layout — a 3/4/5/6/5/4/3 hex field, the brief's "Catan-sized" map.
// The four faction capitals sit at the cardinal points: Chigan (N),
// Dambar (S), Korad (W) and Erport (E).
export const ROWS = [
  ["t-nw", "chigan", "t-ne"],
  ["kansit", "e-1", "e-2", "omara"],
  ["t-w1", "theShelf", "e-3", "droit", "t-e1"],
  ["korad", "e-4", "e-5", "e-6", "e-10", "erport"],
  ["t-w2", "concordan", "e-7", "tinTown", "t-e2"],
  ["t-sw", "e-8", "e-9", "t-se"],
  ["t-s1", "dambar", "t-s2"],
];

export const HEXES = {
  // row 0
  "t-nw": terrain("t-nw"),
  chigan: location("chigan", held("goldgrass", 8, ["capital", "recyclers"])),
  "t-ne": terrain("t-ne"),
  // row 1
  kansit: location("kansit", open()),
  "e-1": encounter("e-1", "gg-reapers"),
  "e-2": encounter("e-2"),
  omara: location("omara", open(["versari", "versari", "neutral"])),
  // row 2
  "t-w1": terrain("t-w1"),
  theShelf: location("theShelf", open(["versari", "neutral", "lakers"]), "vk-vanguard"),
  "e-3": encounter("e-3"),
  droit: location("droit", open()),
  "t-e1": terrain("t-e1"),
  // row 3
  korad: location("korad", held("versari", 8, ["capital", "factory", "defenseTurrets"])),
  "e-4": encounter("e-4"),
  "e-5": encounter("e-5"),
  "e-6": encounter("e-6"),
  "e-10": encounter("e-10"),
  erport: location("erport", held("plainers", 8, ["capital"]), "fp-windriders"),
  // row 4
  "t-w2": terrain("t-w2"),
  concordan: location("concordan", held("lakers", 2, [])),
  "e-7": encounter("e-7"),
  tinTown: location("tinTown", open()),
  "t-e2": terrain("t-e2"),
  // row 5
  "t-sw": terrain("t-sw"),
  "e-8": encounter("e-8"),
  "e-9": encounter("e-9"),
  "t-se": terrain("t-se"),
  // row 6
  "t-s1": terrain("t-s1"),
  dambar: location("dambar", held("lakers", 8, ["capital", "townHall"]), "gl-tidewardens"),
  "t-s2": terrain("t-s2"),
};

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
