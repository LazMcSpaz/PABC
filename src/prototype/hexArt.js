// Resolves which pre-rendered isometric hex tile image belongs on a given
// hex, once the Blender asset pipeline (docs/blender-hex-tile-pipeline.md)
// starts delivering files. This module is pure infrastructure — every path
// below is a *template* following that doc's naming convention exactly, so
// dropping real art in later is a file-copy, not a logic change.
//
// Nothing calls this yet. Hex.jsx/HexBoard.jsx still render flat CSS fills.
// Wiring this in — with an <img onError> fallback to the current gradient
// fill for any tile whose art hasn't landed yet — is a small, separate
// follow-up once real files exist.

import { LOCATIONS } from "../game/content.js";

// The 4 playable/major factions — the only ones with a permanent home
// region, and the only ones the art pipeline produces terrain/settlement
// sets for. Minor (NPC-only) factions never hold a Location's permanent
// `affiliation` in content.js, so they never need their own tile art —
// their units on the board are the existing 2D token art, not a hex tile.
export const ART_FACTIONS = ["versari", "lakers", "goldgrass", "plainers"];

// Locations with no home faction (`affiliation: null` — e.g. Concordan,
// Erport in content.js today) and any hex outside every faction's region
// fall back to this bucket. This needs its own small art pool once art
// exists — don't just borrow a real faction's set for it, or "neutral"
// territory will silently read as uncredited land belonging to whichever
// faction's set you reused.
export const NEUTRAL_STYLE = "neutral";

const TERRAIN_VARIANTS = { flat: 3, mountain: 3 };
const SETTLEMENT_VARIANTS = { small: 2, medium: 3, large: 2 };

// content.js's strategicValue -> art size tier. Chosen to match the actual
// distribution of the 10 locations defined today: veryHigh (dambar, chigan)
// -> large; high (korad, kansit, droit, the-shelf) -> medium; medium + low
// (omara, tin-town, concordan, erport; no location currently uses "low")
// -> small. A named location's TIER never changes; which of the tier's N
// variants it draws is a stable per-location pick (see stableIndex below),
// so multiple named locations legitimately share the same handful of models
// — that's the point of building a variant pool instead of one asset per
// named location.
export const STRATEGIC_VALUE_TO_TIER = {
  low: "small",
  medium: "small",
  high: "medium",
  veryHigh: "large",
};

// Stable, deterministic string hash -> index in [0, count). Deliberately
// NOT Math.random and NOT the engine's seeded state.rng — this is a pure
// display-layer concern (which of N interchangeable art variants a hex
// shows), not game state, and it must return the SAME index for the same
// key on every render/session forever, or a tile's art would visibly
// shuffle every time the component re-renders.
function stableIndex(key, count) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0;
  return Math.abs(h) % count;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}
// Paths follow docs/blender-hex-tile-pipeline.md's naming convention.
// Terrain lives under the existing (currently-empty) board/terrain folder;
// settlements under the dedicated (also currently-empty) locations folder
// — semantically a location tile, not a generic board/token asset.
function terrainPath(faction, bucket, n) {
  return `/assets/ui/board/terrain/terrain_${faction}_${bucket}_${pad2(n)}.webp`;
}
function settlementPath(faction, tier, n) {
  return `/assets/locations/settlement_${faction}_${tier}_${pad2(n)}.webp`;
}

// --- region ownership (terrain hexes only) ---------------------------------
//
// There is no static "home region" field on a hex today — territory is
// otherwise 100% emergent at runtime via Zone of Control
// (src/game/influence.js), which is recomputed on every control/Loyalty
// change and can shift turn to turn as armies move. Tile art can't work
// that way: a real landscape doesn't change biome because an army marched
// through it this round, and re-picking art on every ZoC recompute would
// make the map visibly flicker. So this derives a STATIC region assignment
// once, from data that's already permanent: each faction's home Locations
// (LOCATIONS[id].affiliation in content.js — fixed at content-authoring
// time, unaffected by conquest; see src/game/content.js). A multi-source
// BFS from every affiliated Location's hex, over state.board.adjacency,
// gives every terrain/encounter hex to whichever Location is nearest — a
// Voronoi partition seeded by permanent home cities instead of by current
// control.
//
// Pure function of already-persisted state (state.locations,
// state.board.adjacency) — no new engine state, no save-format change, no
// generation-time code touched. Cheap at this game's map scale (<=~120
// hexes on "Huge"); memoize per game instance if this ever needs calling
// every render instead of once.
export function regionOwnerMap(state) {
  const { adjacency } = state.board;
  const owner = {};
  const queue = [];
  for (const hexId in state.locations) {
    const loc = state.locations[hexId];
    const def = LOCATIONS[loc.locationId];
    if (!def || !def.affiliation) continue; // unaffiliated Locations aren't a seed
    owner[hexId] = def.affiliation;
    queue.push(hexId);
  }
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    for (const nb of adjacency[cur] || []) {
      if (owner[nb] !== undefined) continue;
      owner[nb] = owner[cur];
      queue.push(nb);
    }
  }
  return owner; // hexId -> factionId. A hex unreachable from any affiliated
                // Location (shouldn't happen on a connected board) is absent
                // — callers should fall back to NEUTRAL_STYLE.
}

// --- resolvers ---------------------------------------------------------

// `hex`: a raw engine hex (state.board.hexes[hexId]), type === "terrain".
// `owner`: this hex's factionId from regionOwnerMap(state)[hex.id] — pass
// undefined/null for unassigned hexes, it falls back to NEUTRAL_STYLE.
export function resolveTerrainArt(hex, owner) {
  const faction = ART_FACTIONS.includes(owner) ? owner : NEUTRAL_STYLE;
  const bucket = hex.elevation ? "mountain" : "flat";
  const n = stableIndex(hex.id, TERRAIN_VARIANTS[bucket]) + 1;
  return terrainPath(faction, bucket, n);
}

// `locationId`: the content.js key (e.g. "korad"), not the hex id.
export function resolveSettlementArt(locationId) {
  const def = LOCATIONS[locationId];
  if (!def) return null;
  const faction = ART_FACTIONS.includes(def.affiliation) ? def.affiliation : NEUTRAL_STYLE;
  const tier = STRATEGIC_VALUE_TO_TIER[def.strategicValue] || "small";
  const n = stableIndex(locationId, SETTLEMENT_VARIANTS[tier]) + 1;
  return settlementPath(faction, tier, n);
}
