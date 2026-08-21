// Where blockades stand — on their own road, out toward the edge, laid across it.
//
// A hex holds one blockade per road leaving it, and each takes its stance from
// that road. Positions come from the route network's nodes rather than from hex
// centres, because a road no longer runs through the centre: the network drifts
// each crossing off it so the board does not read as a lattice. Measuring
// against centres would put a barricade beside the road it is meant to close.
//
//   node scripts/check-blockade-stance.mjs

import { blockadeStance, pickSegment, roadNeighbours } from "../src/prototype/blockadeStance.js";
import { buildHexGeometry, topFacePoints } from "../src/prototype/hexProjection.js";
import { buildRouteNetwork } from "../src/prototype/routeGeometry.js";

let failures = 0;
function check(name, pass, detail) {
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const rows = Array.from({ length: 7 }, (_, r) =>
  Array.from({ length: 7 }, (_, c) => `h${r}-${c}`));
const { centers } = buildHexGeometry(rows);
const ids = Object.keys(centers);
const hexes = Object.fromEntries(ids.map((id) => [id, { id, road: true, fog: "visible" }]));
const nodes = buildRouteNetwork(rows, hexes, centers).road.nodes;

const edgesOf = (id) => roadNeighbours(id, rows, hexes).filter((n) => nodes[n]);
const stanceOf = (id, edge) => blockadeStance(id, edge, nodes, centers);

console.log("--- a stance sits on its own road ---");
{
  let placed = 0, offRoad = 0, atNode = 0;
  for (const id of ids) {
    for (const e of edgesOf(id)) {
      const st = stanceOf(id, e);
      if (!st) continue;
      placed++;
      const a = nodes[id]; const b = nodes[e];
      if (Math.hypot(st.x - a.x, st.y - a.y) < 1) atNode++;
      // It must lie on the segment between the two road crossings.
      const t = Math.hypot(st.x - a.x, st.y - a.y) / Math.hypot(b.x - a.x, b.y - a.y);
      if (Math.hypot(st.x - (a.x + (b.x - a.x) * t), st.y - (a.y + (b.y - a.y) * t)) > 0.001) offRoad++;
    }
  }
  check("every road gets a stance", placed > 0, `${placed} across ${ids.length} hexes`);
  check("none is left on the hex's own crossing", atNode === 0, `${atNode} un-moved`);
  check("every stance lies on its road", offRoad === 0, `${offRoad} off the line`);
}

console.log("\n--- out toward the edge, still on its own tile ---");
{
  const poly = topFacePoints(0);
  const inside = (px, py) => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i]; const [xj, yj] = poly[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  let off = 0, central = 0, n = 0;
  for (const id of ids) {
    for (const e of edgesOf(id)) {
      const st = stanceOf(id, e); if (!st) continue;
      n++;
      const c = centers[id];
      if (!inside(st.x - c.x, st.y - c.y)) off++;
      const a = nodes[id]; const b = nodes[e];
      if (Math.hypot(st.x - a.x, st.y - a.y) / Math.hypot(b.x - a.x, b.y - a.y) < 0.25) central++;
    }
  }
  check("stays on its own top face", off === 0, `${off} of ${n} off-tile`);
  check("sits out toward the edge", central === 0, "past a quarter of the way to the neighbour");
}

console.log("\n--- two roads, two clear stances ---");
// The reason for leaving the middle clear: a junction can be closed twice.
{
  const BOOTH = 43; // tollbooth footprint on screen at rest, 7.4m
  let crowded = 0, pairs = 0, junctions = 0;
  for (const id of ids) {
    const es = edgesOf(id);
    if (es.length < 2) continue;
    junctions++;
    const st = es.map((e) => stanceOf(id, e)).filter(Boolean);
    for (let i = 0; i < st.length; i++) {
      for (let j = i + 1; j < st.length; j++) {
        pairs++;
        if (Math.hypot(st[i].x - st[j].x, st[i].y - st[j].y) < BOOTH) crowded++;
      }
    }
  }
  check("blockades on one hex do not overlap", crowded === 0,
    `${junctions} junctions, ${pairs} pairs, none closer than ${BOOTH}px`);
}

console.log("\n--- each lies across its OWN road ---");
// The bearing has to be that of the road this barricade closes, not the hex's
// dominant through-road: on a junction the second one would otherwise lie
// across the wrong road.
//
// Note two barricades on a hex may legitimately SHARE a bearing — a road
// running straight through gets one at each end, parallel to each other. They
// are still distinct positions, which the overlap check above covers.
{
  let wrong = 0, checked = 0, differing = 0;
  for (const id of ids) {
    const es = edgesOf(id);
    for (const e of es) {
      const st = stanceOf(id, e); if (!st) continue;
      checked++;
      const want = (Math.atan2(nodes[e].y - nodes[id].y, nodes[e].x - nodes[id].x) * 180) / Math.PI;
      const d = Math.abs(((st.angle - want) % 360 + 360) % 360);
      if (Math.min(d, 360 - d) > 0.001) wrong++;
    }
    if (es.length < 2) continue;
    const angles = es.map((e) => stanceOf(id, e)?.angle).filter((a) => a != null);
    const mod180 = angles.map((a) => ((a % 180) + 180) % 180);
    if (new Set(mod180.map((a) => a.toFixed(1))).size > 1) differing++;
  }
  check("each stance carries its own road's bearing", wrong === 0,
    `${checked} stances, ${wrong} wrong`);
  check("a junction of differently-angled roads gets different bearings", differing > 0,
    `${differing} hexes where the roads genuinely diverge`);
}

console.log("\n--- facings ---");
{
  const seen = new Set();
  for (const id of ids) for (const e of edgesOf(id)) {
    const st = stanceOf(id, e); if (st) seen.add(st.facing);
  }
  check("more than one sprite row is used", seen.size > 1, [...seen].sort().join(","));
  check("every stance names a real row",
    [...seen].every((f) => ["s", "se", "e", "ne", "n", "nw", "w", "sw"].includes(f)));
}

console.log("\n--- degenerate input ---");
check("no nodes and no centres: no stance", blockadeStance("h0-0", null, {}, {}) === null);
{
  // A record with no edge still draws, on its hex's own road crossing.
  const st = blockadeStance(ids[0], null, nodes, centers);
  check("a record with no road still gets a stance", !!st,
    st ? `at its own crossing, angle ${st.angle.toFixed(0)}` : "nothing");
}
check("pickSegment is stable", (() => {
  for (const id of ids.slice(0, 20)) {
    const a = pickSegment(id, rows, hexes, centers);
    for (let k = 0; k < 3; k++) if (pickSegment(id, rows, hexes, centers) !== a) return false;
  }
  return true;
})(), "no hopping between roads on re-render");

console.log(`\n${failures ? `${failures} FAILED` : "all blockade-stance tests passed"}`);
process.exit(failures ? 1 : 0);
