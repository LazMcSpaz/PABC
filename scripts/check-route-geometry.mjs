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
//      lies in the same place on every render and every machine;
//   4. and it must not take shapes no road takes. A road that doubles back on
//      itself inside one hex, crosses itself, strays over ground carrying no
//      road at all, or runs into the middle of a town is wrong however smooth
//      the curve is. These were not hypothetical: sampling the wander in the
//      chain's WALK order while indexing it in the edge's SORTED order made
//      every two-sample road edge walked from the higher hex id to the lower
//      lay down a hairpin — up two thirds of the edge, back to one third, then
//      up again — about 1.6 times a board.
//
//   node scripts/check-route-geometry.mjs

import { createGame } from "../src/game/setup.js";
import { buildHexGeometry, HEX_H, HEX_W } from "../src/prototype/hexProjection.js";
import { buildRouteNetwork, LOCATION_CLEARANCE as CLEARANCE, SEPARATION } from "../src/prototype/routeGeometry.js";

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
const shape = { hairpin: 0, selfCross: 0, stray: 0, intoTown: 0, dupe: 0, stubby: 0, overshoot: 0 };
const shapeWhere = {};
const net = { isolated: 0, deadEnd: 0, islands: 0, unserved: 0 };
const netWhere = {};
let contactRun = 0;
let worstContact = 0;
let worstContactWhere = "";

for (const seed of SEEDS) {
  for (const mapSize of SIZES) {
    const { rows, hexes, centers, adjacency } = boardFor(seed, mapSize);
    const net_ = buildRouteNetwork(rows, hexes, centers);
    totalShared += net_.shared;

    const road = samples(net_.road.d);
    const rail = samples(net_.rail.d);

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

    // --- 3. shapes no road takes -----------------------------------------
    // Walked densely rather than by control point, because the failure this
    // exists to catch lives BETWEEN the points a chain is built from.
    const note = (k, msg) => { shape[k]++; shapeWhere[k] ||= msg; };
    const nearestHex = (p) => {
      let id = null;
      let best = Infinity;
      for (const h of Object.keys(centers)) {
        const d = Math.hypot(centers[h].x - p.x, centers[h].y - p.y);
        if (d < best) { best = d; id = h; }
      }
      return { id, d: best };
    };
    const RY = CLEARANCE * (HEX_H / HEX_W);
    const towns = Object.keys(hexes).filter((h) => hexes[h].type === "location");

    for (const kind of ["road", "rail"]) {
      const subs = parsePath(net_[kind].d);
      const ends = new Set();
      for (const sub of subs) {
        const pts = [];
        for (const c of sub.curves) {
          const n = Math.max(6, Math.ceil((Math.hypot(c.p3.x - c.p0.x, c.p3.y - c.p0.y) + 1) / 3));
          for (let i = 0; i <= n; i++) pts.push(at(c, i / n));
        }
        if (pts.length < 2) continue;

        // A subpath drawn twice, or one too short to be a stretch of road.
        let arc = 0;
        for (let i = 1; i < pts.length; i++) arc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        if (arc < HEX_W * 0.25) note("stubby", `${kind} ${arc.toFixed(0)}px (seed ${seed}/${mapSize})`);
        const key = [pts[0], pts[pts.length - 1]]
          .map((p) => `${p.x.toFixed(0)},${p.y.toFixed(0)}`).sort().join("|");
        if (ends.has(key)) note("dupe", `${kind} (seed ${seed}/${mapSize})`); else ends.add(key);

        // HAIRPIN: the direction reverses while barely moving across the board.
        const dirAt = (i) => {
          const a = pts[Math.max(0, i - 4)];
          const b = pts[Math.min(pts.length - 1, i + 4)];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const l = Math.hypot(dx, dy) || 1;
          return { x: dx / l, y: dy / l };
        };
        for (let i = 6; i < pts.length - 6; i++) {
          for (let j = i + 4; j < Math.min(pts.length - 6, i + 40); j++) {
            const d1 = dirAt(i);
            const d2 = dirAt(j);
            if (d1.x * d2.x + d1.y * d2.y >= -0.55) continue;
            if (Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y) >= HEX_W * 0.35) continue;
            note("hairpin", `${kind} near ${nearestHex(pts[i]).id} (seed ${seed}/${mapSize})`);
            i = j + 20;
            break;
          }
        }
        // A subpath that comes back to ground it has already covered.
        for (let i = 0; i < pts.length - 2; i += 2) {
          for (let j = i + 30; j < pts.length - 1; j += 2) {
            if (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) < 4) {
              note("selfCross", `${kind} near ${nearestHex(pts[i]).id} (seed ${seed}/${mapSize})`);
              i = pts.length;
              break;
            }
          }
        }
        for (const p of pts) {
          const nh = nearestHex(p);
          // Wandering over a hex that carries no such route at all.
          if (!hexes[nh.id]?.[kind]) note("stray", `${kind} over ${nh.id} (seed ${seed}/${mapSize})`);
          // Or bulging so far off the lattice that the curve has overshot.
          if (nh.d > HEX_W * 0.56) note("overshoot", `${kind} ${nh.d.toFixed(0)}px from ${nh.id} (seed ${seed}/${mapSize})`);
          // Or running into the settlement it is supposed to stop outside of.
          for (const t of towns) {
            const dx = (p.x - centers[t].x) / CLEARANCE;
            const dy = (p.y - centers[t].y) / RY;
            if (dx * dx + dy * dy < 0.9) { note("intoTown", `${kind} inside ${t} (seed ${seed}/${mapSize})`); break; }
          }
        }
      }
    }

    // --- 4. the generated network, before anything draws it ---------------
    for (const kind of ["road", "rail"]) {
      const carry = Object.keys(hexes).filter((h) => hexes[h][kind]);
      if (!carry.length) continue;
      const on = new Set(carry);
      for (const id of carry) {
        const nbs = (adjacency[id] || []).filter((n) => on.has(n));
        if (!nbs.length) { net.isolated++; netWhere.isolated ||= `${kind} ${id} (seed ${seed}/${mapSize})`; }
        // A road that stops in open country serves nothing; only a settlement
        // may be the end of the line.
        if (nbs.length === 1 && hexes[id].type !== "location") {
          net.deadEnd++;
          netWhere.deadEnd ||= `${kind} ${id} (seed ${seed}/${mapSize})`;
        }
      }
      const seen = new Set([carry[0]]);
      const q = [carry[0]];
      for (let i = 0; i < q.length; i++) {
        for (const nb of adjacency[q[i]] || []) if (on.has(nb) && !seen.has(nb)) { seen.add(nb); q.push(nb); }
      }
      if (seen.size !== carry.length) {
        net.islands++;
        netWhere.islands ||= `${kind} (seed ${seed}/${mapSize}): ${seen.size} of ${carry.length}`;
      }
    }
    for (const t of Object.keys(hexes)) {
      if (hexes[t].type === "location" && !hexes[t].road) {
        net.unserved++;
        netWhere.unserved ||= `${t} (seed ${seed}/${mapSize})`;
      }
    }

    // --- 5. determinism --------------------------------------------------
    const again = buildRouteNetwork(rows, hexes, centers);
    if (again.road.d !== net_.road.d || again.rail.d !== net_.rail.d) {
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

// --- shapes no road takes -------------------------------------------------
const SHAPE_LABEL = {
  hairpin: "no route doubles back on itself",
  selfCross: "no route crosses its own line",
  stray: "no route wanders over ground that carries none",
  intoTown: "no route runs inside a settlement's keep-out",
  overshoot: "no curve overshoots the hex lattice",
  dupe: "no stretch of route is drawn twice",
  stubby: "no route is a stub too short to be a road",
};
for (const [k, label] of Object.entries(SHAPE_LABEL)) {
  check(label, shape[k] === 0, shape[k] ? `${shape[k]} found — e.g. ${shapeWhere[k]}` : "none");
}

// --- the generated network ------------------------------------------------
const NET_LABEL = {
  isolated: "no route hex is stranded with no neighbour",
  deadEnd: "a route only ends at a settlement, never in open country",
  islands: "each route network is one connected piece",
  unserved: "every settlement is on the road network",
};
for (const [k, label] of Object.entries(NET_LABEL)) {
  check(label, net[k] === 0, net[k] ? `${net[k]} found — e.g. ${netWhere[k]}` : "none");
}

console.log(failures ? `\n${failures} FAILED` : "\nall route geometry checks passed");
process.exit(failures ? 1 : 0);
