// Board construction — the hex graph and the per-game layout generator
// (mechanical-spec §6.1, §6.7).
import { CONFIG, VALUE_RANK } from "./config.js";
import { hasTechNode } from "./tech.js";

// Build a hex field from a list of row widths (e.g. [3,4,5,6,5,4,3]).
// Hexes are pointy-top; a row is centred, so a hex's horizontal centre is
// `col - (width-1)/2`. Two hexes are adjacent if they share a row and
// differ by one column, or sit in neighbouring rows half a hex apart.
export function buildHexGrid(rowWidths) {
  const hexes = {};
  rowWidths.forEach((width, row) => {
    for (let col = 0; col < width; col++) {
      const id = `h${row}-${col}`;
      hexes[id] = { id, row, col, x: col - (width - 1) / 2 };
    }
  });

  const list = Object.values(hexes);
  const adjacency = {};
  for (const a of list) {
    adjacency[a.id] = list
      .filter((b) => {
        if (b.id === a.id) return false;
        if (b.row === a.row) return Math.abs(b.col - a.col) === 1;
        if (Math.abs(b.row - a.row) === 1) {
          const dx = Math.abs(b.x - a.x);
          return dx > 0.4 && dx < 0.6;
        }
        return false;
      })
      .map((b) => b.id);
  }
  return { hexes, adjacency };
}

// Hop distance from `start` to every reachable hex.
export function bfsDistances(adjacency, start) {
  const dist = { [start]: 0 };
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift();
    for (const nb of adjacency[cur]) {
      if (dist[nb] === undefined) {
        dist[nb] = dist[cur] + 1;
        queue.push(nb);
      }
    }
  }
  return dist;
}

// v0.2 §16.5 — shortest supply route to `targetNode` from the nearest
// Location player `pid` fully controls, travelling only through
// friendly / neutral hexes (an enemy-controlled Location is a wall; the
// target hex itself is always reachable if a path leads to it). Returns
// `{ dist, originHex }` or null if walled off entirely.
//
// §18.3 — friendly/neutral-hex pathing is a ZoC concept: a hex that sits
// inside an *enemy* faction's Zone of Control is also a wall, so growing
// your ZoC over a corridor severs an opponent's supply line and shrinking
// it reopens one. Friendly / contested-neutral ZoC stays passable.
export function reinforcementRoute(state, pid, targetNode) {
  const sources = Object.values(state.locations)
    .filter((l) => l.controller === pid)
    .map((l) => l.hexId);
  if (!sources.length) return null;

  const zoc = state.world?.zoc;
  // §17.5 Logistics A2 (Forward Supply): convoys may route THROUGH enemy ZoC
  // hexes — forward-deployed units stay supplied behind enemy lines. Enemy-
  // CONTROLLED Location hexes remain hard walls regardless.
  const forwardSupply = hasTechNode(state, pid, "log-a2");
  const isWall = (hex) => {
    const loc = state.locations[hex];
    if (loc && loc.controller && loc.controller !== pid) return true;
    if (forwardSupply) return false;
    const owner = zoc?.[hex];
    return !!(owner && owner !== pid);
  };

  const dist = {};
  const origin = {};
  const queue = [];
  for (const s of sources) { dist[s] = 0; origin[s] = s; queue.push(s); }
  while (queue.length) {
    const cur = queue.shift();
    for (const nb of state.board.adjacency[cur] || []) {
      if (dist[nb] !== undefined) continue;
      if (isWall(nb) && nb !== targetNode) continue;
      dist[nb] = dist[cur] + 1;
      origin[nb] = origin[cur];
      queue.push(nb);
    }
  }
  if (dist[targetNode] === undefined) return null;
  return { dist: dist[targetNode], originHex: origin[targetNode] };
}

// §19.4 terrain LoS predicates. Two new roles beyond the §16.6 combat +1:
// `elevation` extends a source's sight and BLOCKS line of sight to hexes
// behind it (ridgelines = sight-walls); `cover` raises the sight cost to
// see into a hex and CONCEALS units standing in it from distant eyes.
// Stored as plain hex flags so the recompute and the UI read one shape.
export function isElevation(hex) {
  return !!(hex && (hex.elevation || hex.terrain === "mountain"));
}
export function isCover(hex) {
  return !!(hex && hex.cover);
}
// §16.2 roads — a per-hex MOVEMENT modifier (not its own terrain). A road
// negates terrain movement cost: a road hex costs 1 to enter and never halts,
// even through forest or mountain. Roads do NOT affect cover/visibility — a
// road through a forest still conceals and a mountain still blocks sight.
export function isRoad(hex) {
  return !!(hex && hex.road);
}

// §16.2 terrain movement — the hexes a unit can reach this turn from `start`
// with `budget` movement points, honouring per-hex entry costs and stoppers:
//   • forest (cover): costs CONFIG.movement.forestCost (default 2 = "−1 speed")
//   • mountain (elevation): you may step ONTO one (≥1 point) but it HALTS the
//     move (arrive with 0) — "speed 1, no matter what"; no passing through.
//   • road: negates the above — costs 1, never halts (fast lane / chokepoint).
//   • everything else: 1.
//   • `blockedThrough` (a Set of hexIds): you may ENTER such a hex but it HALTS
//     you there (a foreign unit's blockade, or an enemy Location §16.2) — the
//     caller computes these via diplomacy (see movement.js).
// Best-first expansion (maximise movement left = minimise cost), tracking a
// predecessor for each hex so the exact ROUTE can be reconstructed. Returns
// { best: {hex: remaining}, prev: {hex: cameFrom} } including `start`.
function expandMovement(state, start, budget, blocked) {
  const adj = state.board.adjacency;
  const hexes = state.board.hexes;
  const halts = CONFIG.movement.mountainHalts;
  const forestCost = CONFIG.movement.forestCost;
  const best = { [start]: budget };
  const prev = { [start]: null };
  const queue = [start];
  while (queue.length) {
    let bi = 0;
    for (let i = 1; i < queue.length; i++) if (best[queue[i]] > best[queue[bi]]) bi = i;
    const cur = queue.splice(bi, 1)[0];
    const rem = best[cur];
    if (rem <= 0) continue; // out of movement — also how halting hexes (rem 0) stop
    for (const nb of adj[cur] || []) {
      const road = isRoad(hexes[nb]);
      const mountain = halts && isElevation(hexes[nb]) && !road; // road negates the halt
      const cost = mountain ? 1 : (isCover(hexes[nb]) && !road ? forestCost : 1);
      if (rem < cost) continue; // not enough movement to enter
      // A mountain (no road) or a blockaded hex halts you on entry: enter, stop.
      const terminal = mountain || (blocked && blocked.has(nb));
      const nrem = terminal ? 0 : rem - cost;
      if (nrem > (best[nb] ?? -1)) { best[nb] = nrem; prev[nb] = cur; queue.push(nb); }
    }
  }
  return { best, prev };
}

// Reachable hexes → { hexId: movement points remaining } (start excluded; a
// halting hex stores 0).
export function movementField(state, start, budget, { blockedThrough } = {}) {
  const { best } = expandMovement(state, start, budget, blockedThrough || null);
  const out = {};
  for (const hex in best) if (hex !== start) out[hex] = best[hex];
  return out;
}

// §16.2 — the exact least-cost ROUTE a unit takes from `start` to `dest` under
// the same rules as movementField (so the UI arrow and the actual move agree).
// Returns the ordered hex list [start, …, dest], or null if `dest` isn't
// reachable within `budget`. Pass a large budget for a budget-agnostic route
// (e.g. replay display).
export function movementRoute(state, start, budget, dest, { blockedThrough } = {}) {
  if (dest === start) return [start];
  const { best, prev } = expandMovement(state, start, budget, blockedThrough || null);
  if (best[dest] === undefined) return null;
  const path = [];
  for (let c = dest; c != null; c = prev[c]) path.unshift(c);
  return path;
}

// §19.4 — stamp deterministic elevation / cover features onto the board.
// Only terrain ("wasteland") hexes are eligible: Locations stay
// feature-free (so a contested Location hex never silently conceals an
// attacker) and encounter hexes stay readable. Built off the seeded rng so
// a given seed always yields the same ridges and forests. Designed for the
// larger map; on the 30-hex field it just sprinkles a few of each.
export function assignTerrainFeatures(rng, hexes) {
  const cfg = CONFIG.fog.terrainSeedDensity;
  const terrainHexes = Object.values(hexes).filter((h) => h.type === "terrain");
  const shuffled = rng.shuffle(terrainHexes.map((h) => h.id));
  const nElev = Math.round(shuffled.length * (cfg.elevation || 0));
  const nCover = Math.round(shuffled.length * (cfg.cover || 0));
  let i = 0;
  for (; i < nElev && i < shuffled.length; i++) hexes[shuffled[i]].elevation = true;
  for (let j = 0; j < nCover && i + j < shuffled.length; j++) hexes[shuffled[i + j]].cover = true;
}

// Shortest hex path from `a` to `b` (inclusive) over `adjacency`, or [] if
// disconnected. BFS with parent reconstruction; deterministic.
export function shortestPathHexes(adjacency, a, b) {
  if (a === b) return [a];
  const prev = { [a]: null };
  const q = [a];
  while (q.length) {
    const cur = q.shift();
    if (cur === b) break;
    for (const nb of adjacency[cur] || []) if (prev[nb] === undefined) { prev[nb] = cur; q.push(nb); }
  }
  if (prev[b] === undefined) return [];
  const path = [];
  for (let c = b; c != null; c = prev[c]) path.unshift(c);
  return path;
}

// §16.2 roads — lay a deterministic road network: a minimum spanning tree
// (Prim's, by hop distance) over the given `hubHexes` — the faction capitals —
// with each tree edge's shortest path stamped `road`. The result is a few main
// corridors between the powers (negating terrain movement cost along them), so
// the wilderness off-road still matters and the roads become contested lanes.
// Operates on the live `hexes` map (sets hexes[id].road = true).
export function assignRoads(adjacency, hexes, hubHexes) {
  const hubs = [...new Set(hubHexes)].filter((h) => hexes[h]);
  if (hubs.length < 2) return;
  const distCache = {};
  const distFrom = (h) => (distCache[h] ||= bfsDistances(adjacency, h));
  const inTree = new Set([hubs[0]]);
  while (inTree.size < hubs.length) {
    let best = null;
    for (const a of inTree) {
      const da = distFrom(a);
      for (const b of hubs) {
        if (inTree.has(b)) continue;
        const d = da[b];
        if (d === undefined) continue;
        if (!best || d < best.d || (d === best.d && b < best.b)) best = { a, b, d };
      }
    }
    if (!best) break;
    inTree.add(best.b);
    for (const hex of shortestPathHexes(adjacency, best.a, best.b)) hexes[hex].road = true;
  }
}

// Constrained-random layout: place the 10 Locations, then fill the rest
// with encounter / terrain tiles. Each faction's two affiliated Locations
// land within 2 hexes of each other; the four start areas are spread.
export function generateLayout(rng, grid, factions, locations, opts = {}) {
  const hexIds = Object.keys(grid.hexes);
  const distFrom = {};
  for (const id of hexIds) distFrom[id] = bfsDistances(grid.adjacency, id);

  // four well-spread anchors (farthest-point sampling from a random seed)
  const anchors = [rng.pick(hexIds)];
  while (anchors.length < 4) {
    let best = null;
    let bestScore = -1;
    for (const id of hexIds) {
      if (anchors.includes(id)) continue;
      const minD = Math.min(...anchors.map((a) => distFrom[a][id]));
      if (minD > bestScore) {
        bestScore = minD;
        best = id;
      }
    }
    anchors.push(best);
  }

  const placement = {}; // hexId -> locationId
  const factionStart = {}; // factionId -> hexId
  const used = new Set();

  rng.shuffle(Object.keys(factions)).forEach((fid, i) => {
    const anchor = anchors[i];
    // sort the faction's pair by strategic value — the weaker is the start
    const pair = [...factions[fid].affiliatedLocations].sort(
      (p, q) => VALUE_RANK[locations[p].strategicValue] - VALUE_RANK[locations[q].strategicValue],
    );
    placement[anchor] = pair[0];
    factionStart[fid] = anchor;
    used.add(anchor);

    let candidates = hexIds.filter(
      (id) => !used.has(id) && distFrom[anchor][id] >= 1 && distFrom[anchor][id] <= 2,
    );
    if (candidates.length === 0) {
      candidates = hexIds.filter((id) => !used.has(id) && distFrom[anchor][id] <= 3);
    }
    const partner = rng.pick(candidates);
    placement[partner] = pair[1];
    used.add(partner);
  });

  // unaffiliated Locations — biased toward hexes far from every anchor
  const unaffiliated = Object.values(locations).filter((l) => !l.affiliation).map((l) => l.id);
  for (const locId of unaffiliated) {
    const ranked = hexIds
      .filter((id) => !used.has(id))
      .map((id) => ({ id, score: Math.min(...anchors.map((a) => distFrom[a][id])) }))
      .sort((a, b) => b.score - a.score);
    const pool = ranked.slice(0, Math.max(3, Math.floor(ranked.length / 3)));
    const chosen = rng.pick(pool).id;
    placement[chosen] = locId;
    used.add(chosen);
  }

  // everything else splits into encounter / terrain. `encounterCount`
  // defaults to the v0.1 split so the test board is byte-identical; larger
  // maps pass a scaled count (setup.js) to keep encounter density steady.
  const type = {};
  for (const id of hexIds) if (placement[id]) type[id] = "location";
  const encounterCount = opts.encounterCount ?? CONFIG.hexSplit.encounter;
  rng.shuffle(hexIds.filter((id) => !used.has(id))).forEach((id, i) => {
    type[id] = i < encounterCount ? "encounter" : "terrain";
  });

  return { type, placement, factionStart, anchors };
}
