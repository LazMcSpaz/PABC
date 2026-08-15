// Board geometry for the holographic tile art. Everything screen-space about
// the board is derived here, so the whole projection is one file to reason
// about (and one file to change if the art is ever re-rendered from a
// different camera).
//
// The art is FLAT-TOP (vertices left and right, flat edges top and bottom),
// squashed vertically by the camera tilt. The masters are rendered in
// PERSPECTIVE, which makes their far edge ~25% shorter than their near edge and
// means the raw shapes cannot tile at any pitch; build_tiles.py rectifies that
// out, so by the time the renderer sees a tile it is a true regular hexagon.
// The manifest carries the rectified geometry, and build_tiles.py documents the
// measurement (and the two traps that produced confident wrong answers).
//
// The live board used to be pointy-top, so the renderer transposes: an engine
// ROW becomes a screen COLUMN.
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

// Fake a higher camera by stretching everything vertically. A real camera lift
// would foreshorten tall geometry as it opened up the ground plane; this only
// does the second half, so mountains grow with the ground and the illusion
// breaks if you push it far. 1.0 is the art as rendered (~34° above the
// horizon); ~1.25 reads as ~45°. Applied to every vertical measurement, so the
// grid, the art and the hit polygons stay in agreement whatever it is set to.
export const STRETCH = 1.25;
export const UNIT_Y = UNIT * STRETCH;

export const HEX_H = FRAME.hexH * UNIT_Y;     // projected height of the top face
export const HEX_FLAT = FRAME.hexFlat * UNIT; // length of the top/bottom edges
export const SKIRT_H = FRAME.skirt * UNIT_Y;  // plinth depth below the near edge

// Tiles sit just clear of each other. 1.0 is flush — mathematically correct,
// but the plinths then touch and the board reads as one poured slab with no
// seam to tell tiles apart. A few percent of air restores the sense of
// separate pieces on a table without opening real gaps in the hex grid.
// Raise it further to float the tiles properly apart.
export const GAP = 1.05;
// Tiling vectors for a hexagon with opposite sides parallel and equal. The
// familiar 0.75 * W only holds for a REGULAR hexagon (flat edge = W/2); these
// rectified tiles are regular, so this reduces to the textbook 0.75 * W — but
// it is written from the manifest's own hexFlat so a future art batch with a
// different footprint still tiles. Verified by tiling a master at this pitch
// and checking the hexagons share edges exactly.
export const COL_STEP = ((HEX_W + HEX_FLAT) / 2) * GAP;  // engine row  -> screen x
export const ROW_STEP = HEX_H * GAP;                     // engine hex.x -> screen y

const MAX_PEAK = Math.max(...TILES.map((t) => t.peakAbove)) * UNIT;
// Headroom above the tallest tile for the Loyalty radial that floats over
// Location hexes, so the board's own bounds never clip it.
export const FLOAT_LIFT = 78;
const PAD_TOP = MAX_PEAK + FLOAT_LIFT + 96;
const PAD_BOTTOM = HEX_H / 2 + SKIRT_H + 24;
const PAD_X = HEX_W / 2 + 24;

// --- the top face --------------------------------------------------------
// The tile's actual hexagon — flat edges of HEX_FLAT, vertices at ±HEX_W/2.
// Used for hit-testing, the selection ring and the Zone-of-Control ring, so
// all three agree with the art and with each other by construction.
export function topFacePoints(inset = 0) {
  const w = (HEX_W / 2) * (1 - inset);
  const f = (HEX_FLAT / 2) * (1 - inset);
  const h = (HEX_H / 2) * (1 - inset);
  return [
    [-w, 0], [-f, -h], [f, -h],
    [w, 0], [f, h], [-f, h],
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

// --- route networks (roads, rails) ---------------------------------------
// `hex.road` is a per-hex boolean, not an edge list, so a drawable network has
// to be recovered by linking road hexes to their road neighbours. Adjacency is
// re-derived here with the SAME rule the engine uses (src/game/board.js: same
// row and one column apart, or neighbouring rows half a hex apart) rather than
// from screen distance, which would be fragile under any projection change.
export function neighborMap(rows) {
  const index = rows.map((row) => {
    const m = new Map();
    row.forEach((id, c) => m.set(c - (row.length - 1) / 2, id));
    return m;
  });
  const nb = {};
  rows.forEach((row, r) => {
    row.forEach((id, c) => {
      const x = c - (row.length - 1) / 2;
      const out = [];
      for (const dx of [-1, 1]) {
        const hit = index[r].get(x + dx);
        if (hit) out.push(hit);
      }
      for (const dr of [-1, 1]) {
        const m = index[r + dr];
        if (!m) continue;
        for (const dx of [-0.5, 0.5]) {
          const hit = m.get(x + dx);
          if (hit) out.push(hit);
        }
      }
      nb[id] = out;
    });
  });
  return nb;
}

// Every unordered pair of adjacent hexes that both carry the route.
export function routeSegments(rows, hexes, carries) {
  const nb = neighborMap(rows);
  const segs = [];
  for (const id of Object.keys(nb)) {
    if (!carries(hexes[id])) continue;
    for (const other of nb[id]) {
      if (id < other && carries(hexes[other])) segs.push([id, other]);
    }
  }
  return segs;
}

// Pull the `to` end of a segment back to the edge of an ellipse centred on it,
// so a route arriving at a Location stops just outside the settlement instead
// of running through its middle. The ellipse matches the board's vertical
// squash, so the clearance looks circular on the projected ground plane.
export function trimToEllipse(from, to, rx) {
  const ry = rx * (HEX_H / HEX_W);
  const k = rx / ry;
  const dx = from.x - to.x;
  const dy = (from.y - to.y) * k;
  const len = Math.hypot(dx, dy);
  if (len <= rx) return null; // wholly inside the keep-out — draw nothing
  const t = rx / len;
  return { x: to.x + dx * t, y: to.y + (dy * t) / k };
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

// Coast tiles are ORIENTED — the sea is painted on the tile's east side — so
// they are the one pool that can't go anywhere. They belong on the map's
// eastern rim and nowhere else; conversely a rim hex should prefer one, or
// the coastline comes out full of holes. Every other pool is inland-only.
const hasTag = (t, tag) => t.tags.includes(tag);
// A settlement tile is tagged with its terrain too (mountain_city is both
// `city` and `mountain`) so a Location on high ground can draw a settlement
// that sits on high ground. That cross-tagging must NOT leak the other way:
// an empty terrain hex drawing `mountain_city` would put an unnamed
// metropolis on the board.
const settled = (t) => hasTag(t, "town") || hasTag(t, "city");

const terrainPool = (tag, coast) =>
  TILES.filter((t) => hasTag(t, tag) && !settled(t) && hasTag(t, "coast") === coast);
const settlementPool = (tier, coast) =>
  TILES.filter((t) => hasTag(t, tier) && hasTag(t, "coast") === coast);

// Open shoreline — every coast tile without a settlement on it. On the rim a
// hex's elevation/cover stops driving the art: what it is, is shoreline.
const COAST_OPEN = TILES.filter((t) => hasTag(t, "coast") && !settled(t));

const POOLS = {
  inland: {
    flat: terrainPool("flat", false),
    forest: terrainPool("forest", false),
    mountain: terrainPool("mountain", false),
    town: settlementPool("town", false),
    city: settlementPool("city", false),
  },
  coast: {
    flat: COAST_OPEN,
    forest: COAST_OPEN,
    mountain: COAST_OPEN,
    town: settlementPool("town", true),
    city: settlementPool("city", true),
  },
};

// Settlement size comes from the Location's permanent strategicValue, not from
// who currently holds it — capturing a city does not rebuild it smaller.
const VALUE_TO_POOL = { low: "town", medium: "town", high: "town", veryHigh: "city" };

// Which hexes have no neighbour further east. Derived the same way the engine
// derives adjacency (`x = col - (width-1)/2`, neighbours in the next row sit
// at x ± 0.5), so the rim tracks the real map shape instead of assuming the
// last row is the whole edge.
export function eastRimHexes(rows) {
  const rim = new Set();
  const xsOf = (r) => {
    const row = rows[r];
    if (!row) return null;
    return new Set(row.map((_, c) => c - (row.length - 1) / 2));
  };
  rows.forEach((row, r) => {
    const next = xsOf(r + 1);
    row.forEach((id, c) => {
      const x = c - (row.length - 1) / 2;
      if (!next || (!next.has(x - 0.5) && !next.has(x + 0.5))) rim.add(id);
    });
  });
  return rim;
}

export function tileFor(hex, locationValue, onCoast = false) {
  const set = onCoast ? POOLS.coast : POOLS.inland;
  let pool;
  if (hex.type === "location") {
    pool = set[VALUE_TO_POOL[locationValue] || "town"];
    // Prefer a settlement whose ground matches the hex's own terrain, so a
    // Location on high ground doesn't render as a town on a flat plain.
    const want = hex.elevation ? "mountain" : "flat";
    const matched = (pool || []).filter((t) => hasTag(t, want));
    if (matched.length) pool = matched;
  } else if (hex.elevation) pool = set.mountain;
  else if (hex.cover) pool = set.forest;
  else pool = set.flat;
  if (!pool || !pool.length) pool = POOLS.inland.flat.length ? POOLS.inland.flat : TILES;
  return pool[stableIndex(hex.id, pool.length)];
}

export function layerUrl(file) {
  return `${TILE_BASE_URL}/${file}`;
}
