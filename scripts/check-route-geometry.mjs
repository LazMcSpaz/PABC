// Road and rail SHAPE tests, run against real generated boards.
//
// The on-screen check (check-board-layers.mjs) can only see what a browser
// drew. These test the geometry itself, which is where all three of the
// long-standing route bugs actually lived:
//
//   1. a route must be CONTINUOUS — one stroke from junction to junction,
//      passing through the ground it is laid on, with no gap or kink where two
//      stretches meet;
//   2. a road and a railway sharing ground must never touch, at any point
//      along the shared run, including through bends;
//   3. it must be deterministic — the wander is hashed, not random, so a road
//      lies in the same place on every render and every machine.
//
//   node scripts/check-route-geometry.mjs

import { createGame } from "../src/game/setup.js";
import { buildHexGeometry } from "../src/prototype/hexProjection.js";
import { buildRouteNetwork, SEPARATION } from "../src/prototype/routeGeometry.js";

let failures = 0;
function check(name, pass, detail) {
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

// --- a reader for the path data this module emits -------------------------
// Only "M x,y" and "C x,y x,y x,y" (plus a trailing Z) are ever produced, so
// this stays a few lines rather than a general SVG path parser.
function parsePath(d) {
  const subpaths = [];
  let cur = null;
  const re = /([MCZ])([^MCZ]*)/g;
  let m;
  while ((m = re.exec(d))) {
    const nums = (m[2].match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    if (m[1] === "M") {
      cur = { start: { x: nums[0], y: nums[1] }, curves: [], closed: false };
      subpaths.push(cur);
    } else if (m[1] === "C") {
      let from = cur.curves.length ? cur.curves[cur.curves.length - 1].p3 : cur.start;
      for (let i = 0; i < nums.length; i += 6) {
        const c = {
          p0: from,
          p1: { x: nums[i], y: nums[i + 1] },
          p2: { x: nums[i + 2], y: nums[i + 3] },
          p3: { x: nums[i + 4], y: nums[i + 5] },
        };
        cur.curves.push(c);
        from = c.p3;
      }
    } else if (m[1] === "Z") {
      cur.closed = true;
    }
  }
  return subpaths;
}

const at = (c, t) => {
  const u = 1 - t;
  return {
    x: u * u * u * c.p0.x + 3 * u * u * t * c.p1.x + 3 * u * t * t * c.p2.x + t * t * t * c.p3.x,
    y: u * u * u * c.p0.y + 3 * u * u * t * c.p1.y + 3 * u * t * t * c.p2.y + t * t * t * c.p3.y,
  };
};
const tangentAt = (c, t) => {
  const u = 1 - t;
  const x = 3 * u * u * (c.p1.x - c.p0.x) + 6 * u * t * (c.p2.x - c.p1.x) + 3 * t * t * (c.p3.x - c.p2.x);
  const y = 3 * u * u * (c.p1.y - c.p0.y) + 6 * u * t * (c.p2.y - c.p1.y) + 3 * t * t * (c.p3.y - c.p2.y);
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
};

// Every curve sampled at a fixed arc-length-ish step, with its direction.
function samples(d, step = 3) {
  const out = [];
  for (const sp of parsePath(d)) {
    for (const c of sp.curves) {
      const rough = Math.hypot(c.p3.x - c.p0.x, c.p3.y - c.p0.y) + 1;
      const n = Math.max(4, Math.ceil(rough / step));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        out.push({ ...at(c, t), dir: tangentAt(c, t) });
      }
    }
  }
  return out;
}

function boardFor(seed, mapSize) {
  const g = createGame({ seed, mapSize });
  const byRow = {};
  for (const h of Object.values(g.board.hexes)) (byRow[h.row] ||= []).push(h);
  const rows = Object.keys(byRow).map(Number).sort((a, b) => a - b)
    .map((r) => byRow[r].sort((a, b) => a.col - b.col).map((h) => h.id));
  const hexes = {};
  for (const [id, h] of Object.entries(g.board.hexes)) {
    hexes[id] = {
      id,
      road: !!h.road,
      rail: !!h.rail,
      type: g.locations?.[id] || h.locationId ? "location" : h.type,
      fog: "visible",
    };
  }
  // Locations are the hexes the engine seated a Location on.
  for (const id of Object.keys(g.locations || {})) if (hexes[id]) hexes[id].type = "location";
  const geom = buildHexGeometry(rows);
  return { rows, hexes, centers: geom.centers, adjacency: g.board.adjacency };
}

const SEEDS = [424242, 7, 991, 4711, 8123, 20260821, 31337, 55555, 90210, 123456];
const SIZES = [null, "medium", "huge"];

let totalShared = 0;
let worstGap = Infinity;
let worstGapWhere = "";
let strayCount = 0;
let straySample = "";
let unlinked = 0;
let unlinkedSample = "";
let contactRun = 0;
let worstContact = 0;
let worstContactWhere = "";

for (const seed of SEEDS) {
  for (const mapSize of SIZES) {
    const { rows, hexes, centers, adjacency } = boardFor(seed, mapSize);
    const net = buildRouteNetwork(rows, hexes, centers);
    totalShared += net.shared;

    const road = samples(net.road.d);
    const rail = samples(net.rail.d);

    // --- 1. continuity ---------------------------------------------------
    // Every hex carrying a route must have the stroke actually crossing it,
    // and every adjacent pair of carrying hexes must be joined by an unbroken
    // run of samples between them. A gap would show as a road that stops in
    // the middle of open ground.
    for (const kind of ["road", "rail"]) {
      const pts = kind === "road" ? road : rail;
      if (!pts.length) continue;
      for (const [id, h] of Object.entries(hexes)) {
        if (!h[kind] || h.type === "location") continue;
        const c = centers[id];
        const near = pts.some((p) => Math.hypot(p.x - c.x, p.y - c.y) < 26);
        const linked = (adjacency[id] || []).some((n) => hexes[n]?.[kind]);
        if (!linked) continue;
        if (!near) {
          strayCount++;
          if (!straySample) straySample = `${kind} misses ${id} (seed ${seed}/${mapSize})`;
        }
        // Midway to each carrying neighbour there must be stroke too.
        for (const n of adjacency[id] || []) {
          if (!hexes[n]?.[kind] || n < id) continue;
          const mid = { x: (c.x + centers[n].x) / 2, y: (c.y + centers[n].y) / 2 };
          if (!pts.some((p) => Math.hypot(p.x - mid.x, p.y - mid.y) < 26)) {
            unlinked++;
            if (!unlinkedSample) unlinkedSample = `${kind} ${id}–${n} (seed ${seed}/${mapSize})`;
          }
        }
      }
    }

    // --- 2. road and rail never run on top of each other -----------------
    // The promise is about ground they SHARE: wherever both kinds are laid
    // along the same hex edge, there must be daylight between them the whole
    // way. Measured across the corridor itself rather than by hunting for
    // near-misses anywhere on the board, because the two are also allowed to
    // CROSS — a level crossing is a real thing and touches by definition.
    const nearest = (pts, p) => {
      let best = null;
      let bd = Infinity;
      for (const q of pts) {
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < bd) { bd = d; best = q; }
      }
      return best;
    };
    for (const [id, h] of Object.entries(hexes)) {
      if (!h.road || !h.rail) continue;
      for (const n of adjacency[id] || []) {
        if (n < id || !hexes[n]?.road || !hexes[n]?.rail) continue;
        const ca = centers[id];
        const cb = centers[n];
        for (const t of [0.3, 0.4, 0.5, 0.6, 0.7]) {
          const p = { x: ca.x + (cb.x - ca.x) * t, y: ca.y + (cb.y - ca.y) * t };
          const r = nearest(road, p);
          const l = nearest(rail, p);
          // Only the pair running along THIS corridor. Near a junction or a
          // settlement the nearest stroke can belong to another arm entirely,
          // and two routes converging on the same town is not the failure
          // being tested for.
          if (!r || !l) continue;
          if (Math.hypot(r.x - p.x, r.y - p.y) > 34 || Math.hypot(l.x - p.x, l.y - p.y) > 34) continue;
          const gap = Math.hypot(r.x - l.x, r.y - l.y);
          if (gap < worstGap) {
            worstGap = gap;
            worstGapWhere = `${id}-${n} (seed ${seed}/${mapSize})`;
            if (process.env.ROUTE_DEBUG) {
              worstGapWhere += ` t=${t} p=${p.x.toFixed(0)},${p.y.toFixed(0)} road=${r.x.toFixed(0)},${r.y.toFixed(0)} rail=${l.x.toFixed(0)},${l.y.toFixed(0)}`;
            }
          }
        }
      }
    }

    // ...and where they do cross, they must cross and be gone. A contact that
    // persists for most of a hex is the two braiding together, which is the
    // failure this whole separation pass exists to prevent.
    for (let i = 0; i < road.length; i++) {
      const a = road[i];
      let close = false;
      for (const b of rail) {
        if (Math.abs(a.x - b.x) > 13 || Math.abs(a.y - b.y) > 13) continue;
        if (Math.hypot(a.x - b.x, a.y - b.y) <= 13) { close = true; break; }
      }
      if (close) {
        contactRun += 3;
        if (contactRun > worstContact) {
          worstContact = contactRun;
          worstContactWhere = `seed ${seed}/${mapSize} near ${a.x.toFixed(0)},${a.y.toFixed(0)}`;
        }
      } else {
        contactRun = 0;
      }
    }
    contactRun = 0;

    // --- 3. determinism --------------------------------------------------
    const again = buildRouteNetwork(rows, hexes, centers);
    if (again.road.d !== net.road.d || again.rail.d !== net.rail.d) {
      check(`deterministic (seed ${seed}/${mapSize})`, false, "two builds differ");
    }
  }
}

check("boards under test carry shared road+rail ground", totalShared > 0,
  `${totalShared} shared edge(s) across ${SEEDS.length * SIZES.length} boards`);
check("a route crosses every hex that carries it", strayCount === 0,
  strayCount ? straySample : "no stray hexes");
check("adjacent route hexes are joined by unbroken stroke", unlinked === 0,
  unlinked ? unlinkedSample : "no gaps");
// The strokes are at most ~6px each side of centre, so 12 apart is touching.
check("road and rail keep daylight between them on shared ground",
  worstGap >= 12.5,
  Number.isFinite(worstGap) ? `tightest gap ${worstGap.toFixed(1)}px across a shared edge (${worstGapWhere})` : "no shared runs found");
// One hex edge is ~200px, so anything under half of that is a crossing rather
// than a shared run.
check("where they cross, they cross and part", worstContact <= 95,
  `longest contact ${worstContact}px${worstContactWhere ? ` (${worstContactWhere})` : ""}`);
check("route geometry is deterministic", true, "same board -> byte-identical paths");

console.log(failures ? `\n${failures} FAILED` : "\nall route geometry checks passed");
process.exit(failures ? 1 : 0);
