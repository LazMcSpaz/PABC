// Where blockades stand — on the road, near the edge, facing along it.
//
// The engine keeps one blockade per hex, so the board can never show the
// two-per-tile case today. These tests build it anyway: the geometry is
// per-segment, and the point of moving off the hex centre was to leave room.
//
//   node scripts/check-blockade-stance.mjs

import { blockadeStance, pickSegment, roadNeighbours } from "../src/prototype/blockadeStance.js";
import { buildHexGeometry, HEX_W, HEX_H, topFacePoints } from "../src/prototype/hexProjection.js";

let failures = 0;
function check(name, pass, detail) {
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

// A real board: `rows` is the adapter's shape, [[hexId, ...], ...], and
// buildHexGeometry gives the same centres the renderer uses.
const rows = Array.from({ length: 7 }, (_, r) =>
  Array.from({ length: 7 }, (_, c) => `h${r}-${c}`));
const geom = buildHexGeometry(rows);
const centers = geom.centers;
const ids = Object.keys(centers);
// Put a road on every hex so every neighbour pair is a segment.
const hexes = Object.fromEntries(ids.map((id) => [id, { id, road: true, fog: "visible" }]));

console.log("--- a blockade stands on one of its hex's roads ---");
let placed = 0, offRoad = 0, atCentre = 0;
for (const id of ids) {
  const st = blockadeStance(id, rows, hexes, centers);
  if (!st) continue;
  placed++;
  const c = centers[id];
  const n = centers[st.neighbour];
  if (Math.hypot(st.x - c.x, st.y - c.y) < 1) atCentre++;
  // The stance must lie ON the segment from centre to neighbour.
  const t = Math.hypot(st.x - c.x, st.y - c.y) / Math.hypot(n.x - c.x, n.y - c.y);
  const px = c.x + (n.x - c.x) * t;
  const py = c.y + (n.y - c.y) * t;
  if (Math.hypot(st.x - px, st.y - py) > 0.001) offRoad++;
}
check("every hex with roads gets a stance", placed === ids.length, `${placed}/${ids.length}`);
check("no stance is left at the hex centre", atCentre === 0, `${atCentre} at centre`);
check("every stance lies on its road segment", offRoad === 0, `${offRoad} off the line`);

console.log("\n--- out near the edge, but still on its own tile ---");
const poly = topFacePoints(0, 0);
function inside(px, py) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]; const [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
let off = 0, tooCentral = 0;
const fracs = [];
for (const id of ids) {
  const st = blockadeStance(id, rows, hexes, centers);
  if (!st) continue;
  const c = centers[id];
  const lx = st.x - c.x, ly = st.y - c.y;
  if (!inside(lx, ly)) off++;
  // "Near the edge" means well past the middle of its own half.
  const n = centers[st.neighbour];
  const f = Math.hypot(lx, ly) / Math.hypot(n.x - c.x, n.y - c.y);
  fracs.push(f);
  if (f < 0.25) tooCentral++;
}
check("stays on its own top face", off === 0, `${off} off-tile`);
check("sits out toward the edge", tooCentral === 0,
  `${(Math.min(...fracs) * 100).toFixed(0)}–${(Math.max(...fracs) * 100).toFixed(0)}% of the way to the neighbour`);

console.log("\n--- room for a second blockade on the same tile ---");
// The engine allows one today. This asserts the geometry would not overlap if
// a hex ever carried two, which is the whole reason for leaving the centre.
const BOOTH = HEX_W * 0.20; // tollbooth footprint on screen, 7.4m at rest
let crowded = 0, pairs = 0;
for (const id of ids) {
  const nbs = roadNeighbours(id, rows, hexes);
  if (nbs.length < 2) continue;
  const c = centers[id];
  const stances = nbs.map((n) => {
    const t = centers[n];
    return { x: (t.x - c.x) * 0.36, y: (t.y - c.y) * 0.36 };
  });
  for (let i = 0; i < stances.length; i++) {
    for (let j = i + 1; j < stances.length; j++) {
      pairs++;
      if (Math.hypot(stances[i].x - stances[j].x, stances[i].y - stances[j].y) < BOOTH) crowded++;
    }
  }
}
check("two roads give two clear stances", crowded === 0,
  `${pairs} road pairs, none closer than ${BOOTH.toFixed(0)}px`);

console.log("\n--- the choice is stable ---");
let unstable = 0;
for (const id of ids) {
  const a = pickSegment(id, rows, hexes, centers);
  for (let k = 0; k < 5; k++) if (pickSegment(id, rows, hexes, centers) !== a) unstable++;
}
check("the same road is chosen every time", unstable === 0,
  "no hopping between roads on re-render");

console.log("\n--- hexes with no road ---");
const bare = Object.fromEntries(ids.map((id) => [id, { id, road: false, fog: "visible" }]));
check("no road, no stance", ids.every((id) => blockadeStance(id, rows, bare, centers) === null),
  "caller falls back to the hex centre");

console.log("\n--- facing runs along the road ---");
// Opposite roads must give opposite aspects, or the booth is not square to the
// road it closes.
const seen = new Set();
for (const id of ids) {
  const st = blockadeStance(id, rows, hexes, centers);
  if (st) seen.add(st.facing);
}
check("more than one aspect is used", seen.size > 1, [...seen].sort().join(","));

console.log(`\n${failures ? `${failures} FAILED` : "all blockade-stance tests passed"}`);
process.exit(failures ? 1 : 0);
