// Board geometry for the holographic tile art. Everything screen-space about
// the board is derived here, so the whole projection is one file to reason
// about (and one file to change if the art is ever re-rendered from a
// different camera).
//
// The art is FLAT-TOP (vertices left and right, flat edges top and bottom),
// viewed from ~25° above the horizon, which squashes it vertically. The live
// board used to be pointy-top, so the renderer transposes: an engine ROW
// becomes a screen COLUMN.
//
// That transpose costs nothing, because the engine's adjacency is purely
// topological — `buildHexGrid` (src/game/board.js) links hexes by row/col
// arithmetic and never assumes an orientation. No engine change, no
// save-format change; this is display-only.
//
// JSX-free on purpose so the pure geometry stays importable headless (the AI
// replay's CameraController leans on it).
import manifest from "./hexTiles.json";

export const FRAME = manifest.frame;
export const TILES = manifest.tiles;
// Vite serves this app under a base path (`/PABC/` for Pages), so asset URLs
// have to go through BASE_URL like every other static asset in the prototype.
export const TILE_BASE_URL = `${import.meta.env.BASE_URL}assets/ui/board/tiles`;

// --- scale ---------------------------------------------------------------
// One hex, vertex to vertex, at board scale 1. BoardViewport then applies its
// own pan/zoom transform on top; this is just the resting size.
export const HEX_W = 216;
// CSS px per source-image unit. Every measurement out of the manifest is in
// source units, so this is the only place the two spaces meet.
export const UNIT = HEX_W / FRAME.hexW;
export const HEX_H = FRAME.hexH * UNIT;      // projected height of the top face
export const SKIRT_H = FRAME.skirt * UNIT;   // plinth depth below the near edge

// Tiles float rather than packing flush. Packed, the plinths fuse into one
// slab and a tall tile buries the one behind it (the art reaches up to ~332
// source units above the centreline against a 352-unit vertical pitch); the
// gap buys that clearance back and lets every plinth keep a silhouette.
export const GAP = 1.22;
export const COL_STEP = 0.75 * HEX_W * GAP;  // engine row  -> screen x
export const ROW_STEP = HEX_H * GAP;         // engine hex.x -> screen y

const MAX_PEAK = Math.max(...TILES.map((t) => t.peakAbove)) * UNIT;
// Headroom above the tallest tile for the Loyalty radial that floats over
// Location hexes, so the board's own bounds never clip it.
export const FLOAT_LIFT = 78;
const PAD_TOP = MAX_PEAK + FLOAT_LIFT + 96;
const PAD_BOTTOM = HEX_H / 2 + SKIRT_H + 24;
const PAD_X = HEX_W / 2 + 24;

// --- the top face --------------------------------------------------------
// A flat-top hexagon squashed to HEX_H. Used for hit-testing, the selection
// ring and the Zone-of-Control ring, so all three agree by construction.
export function topFacePoints(inset = 0) {
  const w = (HEX_W / 2) * (1 - inset);
  const h = (HEX_H / 2) * (1 - inset);
  return [
    [-w, 0], [-w / 2, -h], [w / 2, -h],
    [w, 0], [w / 2, h], [-w / 2, h],
  ];
}

export function topFacePolygon(inset = 0, cx = 0, cy = 0) {
  return topFacePoints(inset).map(([x, y]) => `${(cx + x).toFixed(1)},${(cy + y).toFixed(1)}`).join(" ");
}

// --- board layout --------------------------------------------------------
// `rows` is the adapter's state.rows: [[hexId, …], …], one array per engine
// row, sorted by col. A hex's offset within its row is `col - (width-1)/2`,
// exactly as src/game/board.js computes it — read it, don't re-derive the
// interlock, or the grid drifts out of step with the engine's adjacency.
export function buildHexGeometry(rows) {
  const centers = {};
  let minY = Infinity;
  let maxY = -Infinity;
  rows.forEach((row, r) => {
    row.forEach((hexId, c) => {
      const y = (c - (row.length - 1) / 2) * ROW_STEP;
      centers[hexId] = { x: r * COL_STEP, y };
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    });
  });
  if (!Number.isFinite(minY)) return { centers, width: 0, height: 0 };

  // Shift into a positive box so the result is plain content-space pixels,
  // which is what BoardViewport (and the replay camera) expect.
  for (const id in centers) {
    centers[id].x += PAD_X;
    centers[id].y += PAD_TOP - minY;
  }
  return {
    centers,
    width: (rows.length - 1) * COL_STEP + PAD_X * 2,
    height: maxY - minY + PAD_TOP + PAD_BOTTOM,
  };
}

// Painter's order: strictly by screen y, so a nearer tile always overlaps a
// farther one. Per-ROW ordering is not enough here — adjacent screen columns
// sit half a step apart, so tiles in one engine row no longer share a y.
export function paintOrder(centers) {
  return Object.keys(centers).sort((a, b) => centers[a].y - centers[b].y);
}

// --- which tile art goes on which hex ------------------------------------
// Deterministic, and deliberately NOT the engine's seeded rng: this is a pure
// display choice, and it must resolve the same way on every render forever or
// tiles would visibly reshuffle between frames.
function stableIndex(key, count) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0;
  return Math.abs(h) % count;
}

const byTag = (tag) => TILES.filter((t) => t.tags.includes(tag));
const POOLS = {
  flat: byTag("flat"),
  forest: byTag("forest"),
  mountain: byTag("mountain"),
  town: byTag("town"),
  city: byTag("city"),
};

// Settlement size comes from the Location's permanent strategicValue, not from
// who currently holds it — capturing a city does not rebuild it smaller.
const VALUE_TO_POOL = { low: "town", medium: "town", high: "town", veryHigh: "city" };

export function tileFor(hex, locationValue) {
  let pool;
  if (hex.type === "location") pool = POOLS[VALUE_TO_POOL[locationValue] || "town"];
  else if (hex.elevation) pool = POOLS.mountain;
  else if (hex.cover) pool = POOLS.forest;
  else pool = POOLS.flat;
  if (!pool || !pool.length) pool = TILES;
  return pool[stableIndex(hex.id, pool.length)];
}

export function layerUrl(file) {
  return `${TILE_BASE_URL}/${file}`;
}
