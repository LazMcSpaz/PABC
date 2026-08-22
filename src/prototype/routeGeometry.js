// The SHAPE of the road and rail network: pure geometry, no React, no styling.
//
// The old drawing was one <line> per adjacent pair of route hexes, centre to
// centre, and three things went wrong with that — all of them at the joints:
//
//   1. Every stroke was its own element, so at a hex centre where three roads
//      meet, three semi-transparent round caps stacked and the junction bloomed
//      into a bright blob. The line was translucent; the knot was not.
//   2. A road and a railway sharing a stretch of ground were each stepped
//      sideways off the centre line, but only over the segments they SHARED.
//      Where a shared stretch ended, the road jumped back to the hex centre
//      inside one segment — a visible kink at the exact point the eye is drawn
//      to, and a gap on the outside of the turn.
//   3. Nothing in it varied. Straight, uniform, dead-centre through every hex:
//      the read is "line drawn on top of the board", not "track worn into it".
//
// All three are the same mistake — drawing SEGMENTS instead of ROUTES. So this
// recovers the network's topology first (chains of hexes running from junction
// to junction), and hands back ONE path per kind. A path can be stroked once,
// which means a junction is just a place the path passes through and can no
// longer stack its own transparency; and a continuous chain can be smoothed and
// nudged off true without ever coming apart, because both sides of every joint
// are literally the same point in the same subpath.
//
// Everything here is deterministic. The wander is hashed off hex ids, never
// rng'd and never time-based, so a road lies in exactly the same place on every
// frame, every reload and every machine — a route that reshuffled between
// renders would be worse than a straight one.
import { HEX_H, HEX_W, neighborMap } from "./hexProjection.js";

// How far short of a Location's centre a route stops. Sized to clear the
// settlement art and the floating radial's contact ellipse beneath it.
export const LOCATION_CLEARANCE = HEX_W * 0.23;

// Centre-to-centre distance between a road and a railway that run along the
// same ground. It has to exceed the widest stroke of the two put together, or
// the pair reads as one fat line: the widest trough is ~12px, so 6 + 6 = 12 is
// the floor and this leaves daylight on top of it — including where the pair
// converges slightly on the approach to a junction.
export const SEPARATION = 17;

// How far along an edge a pair forced to swap sides holds its offset before
// crossing. Far enough that the crossing is over inside the last fifth of the
// run and the rest of the corridor keeps its full separation.
const CROSS_HOLD = 0.8;

// Which way each kind steps off the shared centre line. Half the separation
// each, so the pair straddles the line the single route would have taken and
// neither looks displaced.
const SIDE = { road: -1, rail: 1 };

// How much each kind wanders, and how finely.
//
//   amp     perpendicular wander at each sample inside a hex edge
//   drift   how far a route's crossing point may sit off the hex's centre
//   samples extra points per edge — 2 gives a lazy S inside one hex, 1 gives a
//           single bend, which is all an engineered line should ever do
//
// A road is a track worn by use and wanders freely. A railway was surveyed:
// it holds its line, and the small drift it does get is what keeps it from
// looking like it was drawn with a ruler on top of the art.
const PROFILE = {
  road: { amp: HEX_W * 0.052, drift: HEX_W * 0.03, samples: 2 },
  rail: { amp: HEX_W * 0.015, drift: HEX_W * 0.008, samples: 1 },
};

// Deterministic hash -> [0,1). FNV-1a with a final avalanche, because the raw
// FNV of two keys differing in one character lands in nearly the same place and
// neighbouring hex ids would then all wander the same way.
function hash01(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
const signed = (key) => hash01(key) * 2 - 1;

const edgeKey = (a, b) => (a < b ? `${a}~${b}` : `${b}~${a}`);

// The unit normal of an edge, INDEPENDENT of which end you name first and
// consistent along a whole route.
//
// This is what keeps a road and a railway on the same sides of each other for
// the length of a shared run. Ordering the two ends by hex id (what this used
// to do) is arbitrary relative to the geometry: at a bend where the id order
// happens to flip, the two normals point opposite ways and the pair swaps
// sides — they cross, right in the middle of running side by side. Ordering by
// POSITION instead can't flip: the board's six edge directions all fold into a
// 126° fan under this rule, so any two edges meeting at a hex get normals that
// agree rather than cancel.
function edgeNormal(ca, cb) {
  let vx = cb.x - ca.x;
  let vy = cb.y - ca.y;
  if (vx < 0 || (vx === 0 && vy < 0)) { vx = -vx; vy = -vy; }
  const len = Math.hypot(vx, vy) || 1;
  return { x: -vy / len, y: vx / len };
}

// Adjacency restricted to the hexes carrying one kind of route.
function subgraph(rows, hexes, carries) {
  const nb = neighborMap(rows);
  const adj = {};
  const edges = new Map();
  for (const id of Object.keys(nb)) {
    if (!carries(hexes[id])) continue;
    const out = [];
    for (const other of nb[id]) {
      if (!carries(hexes[other])) continue;
      out.push(other);
      edges.set(edgeKey(id, other), id < other ? [id, other] : [other, id]);
    }
    adj[id] = out;
  }
  return { adj, edges };
}

// Split the network into chains that run from one junction (or dead end, or
// Location) to the next, passing straight through everything in between.
//
// Chains are the unit the rest of this file works in: a chain becomes exactly
// one subpath, so a route that runs across six hexes is one continuous stroke
// rather than six with five joints in it.
function chainsOf(adj, edges, breaks) {
  const used = new Set();
  const out = [];

  const walk = (start, first) => {
    const nodes = [start];
    let prev = start;
    let cur = first;
    used.add(edgeKey(start, first));
    nodes.push(cur);
    while (!breaks(cur)) {
      const next = adj[cur].find((x) => x !== prev);
      if (!next || used.has(edgeKey(cur, next))) break;
      used.add(edgeKey(cur, next));
      nodes.push(next);
      prev = cur;
      cur = next;
    }
    return nodes;
  };

  for (const id of Object.keys(adj)) {
    if (!breaks(id)) continue;
    for (const other of adj[id]) {
      if (used.has(edgeKey(id, other))) continue;
      out.push({ nodes: walk(id, other), closed: false });
    }
  }

  // Anything left is a ring with no junction anywhere on it — rare, but a road
  // network that loops back on itself is legal and would otherwise vanish.
  for (const [key, [a, b]] of edges) {
    if (used.has(key)) continue;
    used.add(key);
    const nodes = [a];
    let prev = a;
    let cur = b;
    while (cur !== a) {
      nodes.push(cur);
      const next = adj[cur].find((x) => x !== prev);
      if (!next || used.has(edgeKey(cur, next))) break;
      used.add(edgeKey(cur, next));
      prev = cur;
      cur = next;
    }
    out.push({ nodes, closed: true });
  }
  return out;
}

// Where a route arriving at a settlement should stop: the point at which it
// crosses a keep-out ellipse around the hex centre, measured ALONG THE ROUTE
// rather than along the line to the centre.
//
// That distinction is the difference between a road and a railway both serving
// one town arriving on their own alignments, and the two converging into each
// other on the way in. Stopping each of them a fixed distance from the centre
// throws away where they were: two lines held 16px apart for the length of a
// shared run both end up on the same radius, and near the town they pinch
// together to nothing. Cutting each one where IT meets the boundary keeps the
// gap they arrived with.
//
// The ellipse is the circle the keep-out would be on the ground, squashed by
// the board's camera like everything else.
function cutAtEllipse(from, to, center, rx) {
  const ry = rx * (HEX_H / HEX_W);
  const ux = (from.x - center.x) / rx;
  const uy = (from.y - center.y) / ry;
  const vx = (to.x - from.x) / rx;
  const vy = (to.y - from.y) / ry;
  const a = vx * vx + vy * vy;
  const b = 2 * (ux * vx + uy * vy);
  const c = ux * ux + uy * uy - 1;
  if (c <= 0) return null;      // already inside the keep-out — draw nothing
  if (a < 1e-9) return null;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return { x: to.x, y: to.y }; // never enters it; keep the end
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t <= 0 || t >= 1) return { x: to.x, y: to.y };
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

// Catmull-Rom through every point, emitted as cubic beziers.
//
// The curve passes THROUGH each point rather than near it, which is what makes
// the joints reliable: a hex centre a chain crosses is a point on the curve, and
// two chains meeting there meet exactly. Tension is shy of 1 because a 60°
// turn — the tightest the grid can produce — overshoots visibly at full
// Catmull-Rom and the road bulges outside the hex it is turning in.
const TENSION = 0.82;

function smoothPath(pts, closed) {
  if (pts.length < 2) return "";
  const n = pts.length;
  const at = (i) => (closed
    ? pts[((i % n) + n) % n]
    : pts[Math.max(0, Math.min(n - 1, i))]);
  const f = (v) => Math.round(v * 10) / 10;
  let d = `M${f(at(0).x)},${f(at(0).y)}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1x = p1.x + ((p2.x - p0.x) / 6) * TENSION;
    const c1y = p1.y + ((p2.y - p0.y) / 6) * TENSION;
    const c2x = p2.x - ((p3.x - p1.x) / 6) * TENSION;
    const c2y = p2.y - ((p3.y - p1.y) / 6) * TENSION;
    d += `C${f(c1x)},${f(c1y)} ${f(c2x)},${f(c2y)} ${f(p2.x)},${f(p2.y)}`;
  }
  return closed ? `${d}Z` : d;
}

// Both networks at once, because neither can be placed without the other: the
// separation, the wander and the crossing points on shared ground all have to
// be agreed between them or the pair drifts together somewhere in the middle.
export function buildRouteNetwork(rows, hexes, centers, opts = {}) {
  const separation = opts.separation ?? SEPARATION;
  const clearance = opts.clearance ?? LOCATION_CLEARANCE;
  const known = (h) => h && h.fog !== "unexplored";

  const road = subgraph(rows, hexes, (h) => known(h) && h.road);
  const rail = subgraph(rows, hexes, (h) => known(h) && h.rail);

  // Ground carried by BOTH. Edges are where the two must be held apart; nodes
  // are where they must agree on the wander, or the gap between them closes as
  // they cross the hex.
  const sharedEdges = new Set([...road.edges.keys()].filter((k) => rail.edges.has(k)));
  const sharedNodes = new Set(Object.keys(road.adj).filter((id) => rail.adj[id]));

  // Which side of a shared run each kind takes, decided by WALKING the run
  // rather than per edge.
  //
  // An edge's normal has to be computed the same way from either end or the
  // pair swaps sides mid-run, so it is pinned to a fixed half-plane (see
  // edgeNormal). That is enough for a run that goes one general way, which is
  // nearly all of them — but a shared run that closes a loop must eventually
  // come back, and on the returning edges the fixed half-plane points the
  // other way round the loop. The road crosses to the rail's side, and the two
  // pinch together in the middle of ground they share.
  //
  // So each run is walked once and every edge on it is oriented relative to the
  // direction of travel: "left" stays left for the whole run, including all the
  // way around a loop. Junctions where several shared runs meet can still
  // disagree, which is fine — a junction is a place lines meet by definition.
  const flip = new Map();
  {
    const adj = {};
    const edges = new Map();
    for (const key of sharedEdges) {
      const [a, b] = road.edges.get(key);
      (adj[a] ||= []).push(b);
      (adj[b] ||= []).push(a);
      edges.set(key, [a, b]);
    }
    const orient = (u, v) => {
      const cu = centers[u];
      const cv = centers[v];
      const n = edgeNormal(cu, cv);
      // The normal to the LEFT of travel, whichever way this run is walked.
      const tx = -(cv.y - cu.y);
      const ty = cv.x - cu.x;
      flip.set(edgeKey(u, v), tx * n.x + ty * n.y >= 0 ? 1 : -1);
    };
    for (const { nodes, closed } of chainsOf(adj, edges, (id) => adj[id].length !== 2)) {
      for (let i = 1; i < nodes.length; i++) orient(nodes[i - 1], nodes[i]);
      if (closed && nodes.length > 2) orient(nodes[nodes.length - 1], nodes[0]);
    }
  }
  // The oriented normal of a shared edge; plain geometry everywhere else.
  const routeNormal = (a, b) => {
    const n = edgeNormal(centers[a], centers[b]);
    const f = flip.get(edgeKey(a, b));
    return f === -1 ? { x: -n.x, y: -n.y } : n;
  };

  // Which way a hex steps its pair off the centre line, and how square that
  // step is to the arms arriving here. Wanted in two places — the crossing
  // point itself, and the edges either side of it, which need to know whether
  // this hex agrees with them about which side is which.
  //
  // A hex where both kinds pass but share no edge is a LEVEL CROSSING, and
  // those get stepped apart too — off the average of everything arriving,
  // which both kinds compute identically and then take opposite ways. They
  // still have to cross somewhere, but now they cross cleanly at an angle
  // instead of both running through the exact centre and knotting together
  // with every other branch that meets there.
  const axisCache = new Map();
  const nodeAxis = (id, kind) => {
    const cacheKey = `${kind}:${id}`;
    if (axisCache.has(cacheKey)) return axisCache.get(cacheKey);
    const graph = kind === "road" ? road : rail;
    const arms = [...(graph.adj[id] || [])].filter((o) => sharedEdges.has(edgeKey(id, o)));
    if (!arms.length && sharedNodes.has(id)) {
      const seen = new Set();
      for (const o of [...(road.adj[id] || []), ...(rail.adj[id] || [])]) {
        if (seen.has(o)) continue;
        seen.add(o);
        arms.push(o);
      }
    }
    let normals = arms.map((other) => routeNormal(id, other));
    const sum = (ns) => {
      let x = 0;
      let y = 0;
      for (const n of ns) { x += n.x; y += n.y; }
      const l = Math.hypot(x, y);
      return l > 1e-6 ? { x: x / l, y: y / l } : null;
    };
    let u = sum(normals);
    // Several shared runs can meet here, each with its own idea of which side
    // is which (see `flip`). Averaging arms that disagree gives a direction
    // perpendicular to nothing, and the pair ends up displaced somewhere
    // useless. Keep the majority side and let the odd arm out swing across on
    // its own — near a junction it crosses at an angle, which reads correctly,
    // where a bad average would have both lines wandering.
    if (u && normals.length > 1) {
      const keep = normals.filter((n) => n.x * u.x + n.y * u.y > 0.05);
      if (keep.length && keep.length < normals.length) {
        normals = keep;
        u = sum(normals) || u;
      }
    }
    let res = null;
    if (u) {
      let dot = 1;
      for (const n of normals) dot = Math.min(dot, u.x * n.x + u.y * n.y);
      res = { x: u.x, y: u.y, dot };
    }
    axisCache.set(cacheKey, res);
    return res;
  };

  // Where a route crosses a hex. Drifted off the centre by a hashed amount so
  // the network doesn't visibly pin itself to a lattice of exact centres — the
  // single strongest tell that these are drawn on top of the board rather than
  // lying on it. The drift is a fraction of a hex and the same for every chain
  // through that hex, so junctions still meet exactly.
  //
  // Squashed vertically like everything else on this board, so a drift that is
  // circular on the ground stays circular on screen.
  const SQUASH = HEX_H / HEX_W;
  const nodeCache = new Map();
  const nodePoint = (id, kind) => {
    const cacheKey = `${kind}:${id}`;
    const hit = nodeCache.get(cacheKey);
    if (hit) return hit;
    const c = centers[id];
    // Shared ground uses the rail's tighter drift for BOTH kinds. The two are
    // then displaced from the same point by exactly half the separation each,
    // which is the whole guarantee that they stay apart.
    const shared = sharedNodes.has(id);
    const p = PROFILE[shared ? "rail" : kind];
    // A Location's route stops at a keep-out ellipse centred on the settlement
    // art, so its crossing point stays put — drifting it would drag the mouth
    // of the road off the town it serves.
    const drift = hexes[id]?.type === "location" ? 0 : p.drift;
    const ang = hash01(`${id}#a`) * Math.PI * 2;
    const mag = hash01(`${id}#m`) * drift;
    const pt = { x: c.x + Math.cos(ang) * mag, y: c.y + Math.sin(ang) * mag * SQUASH };

    // Step off the centre line, perpendicular to the shared edges arriving
    // here. On a straight run that is just the edge normal, so the pair runs
    // truly parallel; at a bend the step is mitred (below) so the gap stays
    // open through the turn without either line kinking.
    //
    // A hex where both kinds pass but share no edge is a LEVEL CROSSING, and
    // those get stepped apart too — off the average of everything arriving,
    // which both kinds compute identically and then take opposite ways. They
    // still have to cross somewhere, but now they cross cleanly at an angle
    // instead of both running through the exact centre and knotting together
    // with every other branch that meets there.
    const a = nodeAxis(id, kind);
    if (a) {
      // MITRE, not just the average direction. Averaging two normals and
      // stepping half the separation along it looks right and is wrong: at a
      // bend the step is no longer perpendicular to either arm, so the gap
      // measured across the route — the gap you can actually see — closes to
      // `sep * cos(half the turn)`. On this grid that is as little as 45% of
      // it, which is the two lines touching. Lengthening the step by the same
      // cosine restores a true perpendicular separation on every arm, which is
      // exactly what mitring a stroked polyline does and for the same reason.
      //
      // Capped, because a hairpin's mitre runs away to infinity and would fire
      // the crossing point off into the next hex.
      const k = (separation / 2) * Math.min(1 / Math.max(a.dot, 0.001), 2.6) * SIDE[kind];
      pt.x += a.x * k;
      pt.y += a.y * k;
    }
    nodeCache.set(cacheKey, pt);
    return pt;
  };
  // The points BETWEEN two hex centres: where the route actually bends. Shared
  // ground falls back to the rail's profile for both kinds, so the two sample
  // the same base points and stay a fixed distance apart the whole way.
  const edgePoints = (a, b, kind) => {
    const key = edgeKey(a, b);
    const shared = sharedEdges.has(key);
    const p = PROFILE[shared ? "rail" : kind];
    const ca = centers[a];
    const cb = centers[b];
    const n = shared ? routeNormal(a, b) : edgeNormal(ca, cb);
    const push = shared ? (separation / 2) * SIDE[kind] : 0;
    // Two different orderings meet here, and they must NOT be conflated.
    //
    // POSITION runs in the chain's direction of travel: `a` is the hex the
    // chain is coming from and `b` the one it is going to, so the samples have
    // to come out at rising t or the path doubles back on itself between two
    // hexes — up the edge, back down it, then up again. (It did. A road with
    // two samples an edge, on any edge whose chain happened to walk it from
    // the higher hex id to the lower, drew a hairpin in open ground.)
    //
    // The HASH runs along the sorted edge instead, so the point one third of
    // the way from the low hex gets the same wander whichever way a chain
    // crosses it — which is what keeps a road and a railway sharing an edge
    // sampling the same base line, and keeps the board stable if the walk
    // order ever changes.
    const out = [];
    for (let i = 1; i <= p.samples; i++) {
      const t = i / (p.samples + 1);
      const along = a < b ? i : p.samples + 1 - i;
      const off = signed(`${key}@${along}`) * p.amp + push;
      out.push({
        x: ca.x + (cb.x - ca.x) * t + n.x * off,
        y: ca.y + (cb.y - ca.y) * t + n.y * off,
      });
    }

    // A junction with three arms has no side that all three agree on, so one
    // arm's pair is left having to swap over (see nodeAxis). Left alone the
    // swap is spread across the whole hex edge: the two lines converge from
    // the moment they leave one hex and only part again as they reach the
    // next, which reads as a long shallow braid rather than a crossing.
    //
    // Held on their own side until the last of the run, they instead cross
    // once, steeply, right where the arms meet — which is where a level
    // crossing belongs and what one looks like.
    if (shared) {
      const side = (id) => {
        const ax = nodeAxis(id, kind);
        return !ax || ax.x * n.x + ax.y * n.y >= 0;
      };
      const sa = side(a);
      const sb = side(b);
      if (sa !== sb) {
        const t = sa ? CROSS_HOLD : 1 - CROSS_HOLD;
        const pt = {
          x: ca.x + (cb.x - ca.x) * t + n.x * push,
          y: ca.y + (cb.y - ca.y) * t + n.y * push,
        };
        if (sa) out.push(pt); else out.unshift(pt);
      }
    }
    return out;
  };

  // Where a route AIMS at a settlement. A Location's own crossing point is
  // never drawn — the route is cut at the keep-out ellipse well before it — so
  // the only thing this point decides is the line the road comes in on, and
  // that is better decided per ARM than per hex.
  //
  // One point per hex has to serve every route meeting there, and at a
  // settlement where several shared runs converge the compromise it strikes is
  // along one of them, which drags a road and a railway that arrived neatly
  // apart into each other's line as they enter the town. Per arm, each pair
  // keeps the offset it was already running at, right up to the edge of the
  // settlement. Chains END at a Location, so nothing has to agree with
  // anything else here.
  const approachPoint = (id, from, kind) => {
    const c = centers[id];
    if (!sharedEdges.has(edgeKey(id, from))) return { x: c.x, y: c.y };
    const n = routeNormal(id, from);
    const k = (separation / 2) * SIDE[kind];
    return { x: c.x + n.x * k, y: c.y + n.y * k };
  };

  const build = (kind, graph) => {
    const breaks = (id) => graph.adj[id].length !== 2 || hexes[id]?.type === "location";
    const chains = chainsOf(graph.adj, graph.edges, breaks);
    const subpaths = [];
    for (const { nodes, closed } of chains) {
      const last = nodes.length - 1;
      const town = (i) => !closed && (i === 0 || i === last) && nodes.length > 1
        && hexes[nodes[i]]?.type === "location";
      const pts = [];
      for (let i = 0; i < nodes.length; i++) {
        if (i > 0) pts.push(...edgePoints(nodes[i - 1], nodes[i], kind));
        pts.push(town(i)
          ? approachPoint(nodes[i], nodes[i === 0 ? 1 : last - 1], kind)
          : nodePoint(nodes[i], kind));
      }
      if (closed && nodes.length > 1) pts.push(...edgePoints(nodes[nodes.length - 1], nodes[0], kind));

      // Stop outside a settlement rather than running through its middle. The
      // trim is measured from the neighbouring bend, so the route arrives on
      // the line it was already travelling.
      //
      // It has to WALK BACK, not just look at the one neighbouring point.
      // Anything may leave a point inside the keep-out — and the crossing hold
      // a shared pair uses to swap sides (edgePoints) does exactly that, since
      // it sits four fifths along an edge, which on this grid's short edges is
      // ~22px from the far centre and well within the ellipse. Cutting FROM a
      // point that is already inside cuts nothing: the segment never crosses
      // the boundary, so the route simply ends wherever that point fell —
      // in the middle of the settlement art it was meant to stop outside of.
      // Dropping inside points until one is outside, then cutting from there,
      // is right whatever put them there.
      const cutEnd = (centre, head) => {
        while (pts.length > 1) {
          const iEnd = head ? 0 : pts.length - 1;
          const iPrev = head ? 1 : pts.length - 2;
          const t = cutAtEllipse(pts[iPrev], pts[iEnd], centre, clearance);
          if (t) { pts[iEnd] = t; return; }
          if (head) pts.shift(); else pts.pop();
        }
      };
      if (!closed) {
        if (hexes[nodes[0]]?.type === "location" && pts.length > 1) {
          cutEnd(centers[nodes[0]], true);
        }
        const end = nodes[nodes.length - 1];
        if (pts.length > 1 && hexes[end]?.type === "location") {
          cutEnd(centers[end], false);
        }
      }
      if (pts.length < 2) continue;
      subpaths.push(smoothPath(pts, closed));
    }
    // Where this kind actually crosses each hex, and on what bearing. Anything
    // that has to sit ON the route — a blockade, today — needs both: the road
    // no longer runs dead through the centre, and a barricade laid out flat
    // across a road that runs north-south is a barricade laid ALONG it.
    const nodes = {};
    for (const id of Object.keys(graph.adj)) {
      const p = hexes[id]?.type === "location" ? { ...centers[id] } : nodePoint(id, kind);
      const arms = graph.adj[id].map((other) => {
        const dx = centers[other].x - centers[id].x;
        const dy = centers[other].y - centers[id].y;
        const l = Math.hypot(dx, dy) || 1;
        return { x: dx / l, y: dy / l };
      });
      let dir = arms[0] || { x: 1, y: 0 };
      if (arms.length > 1) {
        // The pair pointing most nearly opposite ways is the road THROUGH this
        // hex; anything else meeting here is a branch off it.
        let worst = Infinity;
        for (let i = 0; i < arms.length; i++) {
          for (let j = i + 1; j < arms.length; j++) {
            const dot = arms[i].x * arms[j].x + arms[i].y * arms[j].y;
            if (dot < worst) {
              worst = dot;
              dir = { x: arms[j].x - arms[i].x, y: arms[j].y - arms[i].y };
            }
          }
        }
      }
      nodes[id] = { x: p.x, y: p.y, angle: (Math.atan2(dir.y, dir.x) * 180) / Math.PI };
    }
    return { d: subpaths.join(" "), chains: subpaths.length, nodes };
  };

  return {
    road: build("road", road),
    rail: build("rail", rail),
    shared: sharedEdges.size,
  };
}
