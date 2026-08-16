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
//   • `railEdges` (Map hexId -> [hexId]): rail hops available to THIS mover,
//     each a flat 1 MP however far apart the endpoints. Injected as extra
//     adjacency rather than special-cased, so chaining across a hub falls out
//     of the same search with no bespoke algorithm (rail doc §2.1).
//   • `surprise` (a Set of hexIds ⊆ blockedThrough): halts the mover could not
//     SEE coming. It still stops there, but keeps the movement it had left
//     rather than losing the rest of its turn to something it had no way to
//     know about — see below.
//
// Two different numbers come out of this, which used to be one:
//
//   best[hex]    what the search may continue with. A halting hex is 0, which
//                is exactly how nothing paths onward through it.
//   arrive[hex]  what a unit standing there actually has left. Identical to
//                `best` everywhere except a SURPRISE halt, where the unit keeps
//                its remainder. Conflating the two is what made an ambush cost
//                a whole turn instead of an advance.
//
// Best-first expansion (maximise movement left = minimise cost), tracking a
// predecessor for each hex so the exact ROUTE can be reconstructed. Returns
// { best, arrive, prev } including `start`.
function expandMovement(state, start, budget, blocked, ignoreTerrain, extraCost, railEdges, surprise) {
  const adj = state.board.adjacency;
  const hexes = state.board.hexes;
  // A Landship-class mover (chip `ignoresTerrain`) treats every hex as
  // road-grade: forest costs 1, mountains do not halt. Blockade halts and
  // per-hex budget still apply — it drives over terrain, not through armies.
  const halts = CONFIG.movement.mountainHalts && !ignoreTerrain;
  const forestCost = ignoreTerrain ? 1 : CONFIG.movement.forestCost;
  const best = { [start]: budget };
  const arrive = { [start]: budget };
  const prev = { [start]: null };
  const queue = [start];
  // A halt keeps its remainder only when the mover could not see it coming.
  const kept = (nb, rem, cost) => (surprise && surprise.has(nb) ? rem - cost : 0);
  // `best` drives expansion; `arrive` is relaxed separately, because a halting
  // hex pins best at 0 and would otherwise never take a cheaper approach.
  const relax = (nb, cur, enter, landed) => {
    if (landed > (arrive[nb] ?? -1)) { arrive[nb] = landed; prev[nb] = cur; }
    if (enter > (best[nb] ?? -1)) { best[nb] = enter; queue.push(nb); }
  };
  while (queue.length) {
    let bi = 0;
    for (let i = 1; i < queue.length; i++) if (best[queue[i]] > best[queue[bi]]) bi = i;
    const cur = queue.splice(bi, 1)[0];
    const rem = best[cur];
    if (rem <= 0) continue; // out of movement — also how halting hexes (rem 0) stop
    for (const nb of adj[cur] || []) {
      const road = isRoad(hexes[nb]);
      const mountain = halts && isElevation(hexes[nb]) && !road; // road negates the halt
      // Toll Gate (MOVE_TAX): a per-hex surcharge layered on top of the
      // terrain cost — roads don't waive a toll.
      const toll = extraCost ? extraCost.get(nb) || 0 : 0;
      const cost = (mountain ? 1 : (isCover(hexes[nb]) && !road ? forestCost : 1)) + toll;
      if (rem < cost) continue; // not enough movement to enter
      // A mountain (no road) or a blockaded hex halts you on entry: enter, stop.
      // Terrain is never a "surprise" — a mountain is a mountain whether or not
      // you had scouted it, and §16.2's speed-1 rule is not what this is for.
      const halted = blocked && blocked.has(nb);
      const terminal = mountain || halted;
      const enter = terminal ? 0 : rem - cost;
      relax(nb, cur, enter, halted && !mountain ? kept(nb, rem, cost) : enter);
    }
    // Rail hops from this hex. Flat 1 MP, and a blockaded far end still halts
    // you there — arriving by train is still arriving.
    for (const nb of (railEdges && railEdges.get(cur)) || []) {
      if (rem < CONFIG.rail.hopCost) continue;
      const halted = blocked && blocked.has(nb);
      const enter = halted ? 0 : rem - CONFIG.rail.hopCost;
      relax(nb, cur, enter, halted ? kept(nb, rem, CONFIG.rail.hopCost) : enter);
    }
  }
  return { best, arrive, prev };
}

// Reachable hexes → { hexId: movement points remaining } (start excluded; a
// halting hex stores 0).
export function movementField(state, start, budget, { blockedThrough, ignoreTerrain, extraCost, railEdges, surprise } = {}) {
  const { arrive } = expandMovement(state, start, budget, blockedThrough || null, !!ignoreTerrain, extraCost || null, railEdges || null, surprise || null);
  const out = {};
  // ARRIVAL values, not pathing values: the reachable set is identical either
  // way (same keys), but a unit halted by an ambush must be told the movement
  // it actually kept.
  for (const hex in arrive) if (hex !== start) out[hex] = arrive[hex];
  return out;
}

// §16.2 — the exact least-cost ROUTE a unit takes from `start` to `dest` under
// the same rules as movementField (so the UI arrow and the actual move agree).
// Returns the ordered hex list [start, …, dest], or null if `dest` isn't
// reachable within `budget`. Pass a large budget for a budget-agnostic route
// (e.g. replay display).
export function movementRoute(state, start, budget, dest, { blockedThrough, ignoreTerrain, extraCost, railEdges, surprise } = {}) {
  if (dest === start) return [start];
  const { arrive, prev } = expandMovement(state, start, budget, blockedThrough || null, !!ignoreTerrain, extraCost || null, railEdges || null, surprise || null);
  if (arrive[dest] === undefined) return null;
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

// §16.2 roads — roads connect SETTLEMENTS, because that is what makes them
// mean something. A road that merely links the four capitals is a handful of
// corridors through empty country; a road network that ties every Location to
// its neighbours is the thing a blockade can actually cut
// (docs/rail-road-blockade-design.md §3 funds a blockade through "an
// uninterrupted road connection to the nearest owned settlement" — that
// sentence only has teeth if such a connection generally exists).
//
// The rule:
//   * every settlement gets a road to its NEAREST other settlement;
//   * a settlement big enough (CONFIG.roads.linksByValue) also gets one to its
//     SECOND nearest, which is what turns a chain into a network;
//   * finally, if that still leaves separate clusters, the cheapest links
//     between them are added until the network is connected — a road system
//     with unreachable islands would silently break supply and blockade.
//
// Links are undirected and deduplicated, so A→B and B→A lay one road. Every
// link stamps `road` along a shortest hex path, so roads remain a per-hex
// terrain property exactly as before; only which hexes get stamped changes.
export function assignRoads(adjacency, hexes, settlementHexes, valueOfHex = () => "medium") {
  const nodes = [...new Set(settlementHexes)].filter((h) => hexes[h]);
  if (nodes.length < 2) return [];
  const distCache = {};
  const distFrom = (h) => (distCache[h] ||= bfsDistances(adjacency, h));

  const links = new Map(); // "a|b" (sorted) -> [a, b]
  const addLink = (a, b) => {
    if (a === b) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (!links.has(key)) links.set(key, a < b ? [a, b] : [b, a]);
  };

  // nearest / second-nearest, ties broken by hexId so the map is deterministic
  for (const a of nodes) {
    const da = distFrom(a);
    const ranked = nodes
      .filter((b) => b !== a && da[b] !== undefined)
      .sort((p, q) => (da[p] - da[q]) || (p < q ? -1 : 1));
    const want = CONFIG.roads.linksByValue[valueOfHex(a)] ?? 1;
    for (let i = 0; i < Math.min(want, ranked.length); i++) addLink(a, ranked[i]);
  }

  // union-find over the links so far, then bridge any remaining clusters
  const parent = {};
  const find = (x) => (parent[x] === undefined || parent[x] === x ? (parent[x] = x)
    : (parent[x] = find(parent[x])));
  const union = (x, y) => { parent[find(x)] = find(y); };
  for (const [a, b] of links.values()) union(a, b);
  for (;;) {
    const roots = new Set(nodes.map(find));
    if (roots.size <= 1) break;
    let best = null;
    for (const a of nodes) {
      const da = distFrom(a);
      for (const b of nodes) {
        if (find(a) === find(b) || da[b] === undefined) continue;
        if (!best || da[b] < best.d || (da[b] === best.d && `${a}|${b}` < `${best.a}|${best.b}`)) {
          best = { a, b, d: da[b] };
        }
      }
    }
    if (!best) break; // genuinely unreachable on this graph — nothing to add
    addLink(best.a, best.b);
    union(best.a, best.b);
  }

  for (const [a, b] of links.values()) {
    for (const hex of shortestPathHexes(adjacency, a, b)) hexes[hex].road = true;
  }
  return [...links.values()];
}

// Rail — docs/rail-road-blockade-design.md §2. NOT player-built: it is
// pre-collapse trunk line, laid once here and never changed.
//
// Rail is deliberately sparse where road is dense. Roads now reach every
// settlement, so a rail network of comparable size would add nothing; instead
// rail is a spanning tree over the CAPITALS only — the fewest lines that still
// tie every faction's home into one system. Capitals are fixed content
// (`FACTIONS[fid].capital`), so the trunk line is stable across a game.
//
// A line occupies a real sequence of hexes, so it can be cut per-hex like a
// road (§2.1), and `hex.rail` gives the board renderer something to draw. But
// the 1-MP hop is a property of the LINK, not of its hexes, so the endpoints
// and the path are returned as records for `state.board.rails`.
export function assignRails(adjacency, hexes, capitalHexes) {
  const hubs = [...new Set(capitalHexes)].filter((h) => hexes[h]);
  if (hubs.length < 2) return [];
  const distCache = {};
  const distFrom = (h) => (distCache[h] ||= bfsDistances(adjacency, h));
  const links = [];
  const inTree = new Set([hubs[0]]);
  while (inTree.size < hubs.length) {
    let best = null;
    for (const a of inTree) {
      const da = distFrom(a);
      for (const b of hubs) {
        if (inTree.has(b) || da[b] === undefined) continue;
        if (!best || da[b] < best.d || (da[b] === best.d && b < best.b)) best = { a, b, d: da[b] };
      }
    }
    if (!best) break;
    inTree.add(best.b);
    const path = shortestPathHexes(adjacency, best.a, best.b);
    for (const hex of path) hexes[hex].rail = true;
    links.push({ a: best.a, b: best.b, path });
  }
  return links;
}

// Constrained-random layout: place the 10 Locations, then fill the rest
// with encounter / terrain tiles. Each faction's two affiliated Locations
// land within 2 hexes of each other; the four start areas are spread.
export function generateLayout(rng, grid, factions, locations, { locationBudget } = {}) {
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

  // Which named Locations are in play at this board size.
  //
  // These come in FAIRNESS GROUPS, and a group is all-or-nothing. Every capital
  // is one Location per faction; every second home is one Location per faction;
  // the unaffiliated prizes belong to nobody. Take part of a group and the
  // factions stop being equal — which is exactly what used to happen: the list
  // was concatenated and truncated flat, so a budget of 8 took all 4 capitals,
  // both prizes, and then the FIRST TWO second homes. Versari and Goldgrass got
  // a homeland pair and Lakers and Plainers got one city each, on every seed
  // (docs/playtest-2026-08-15-findings.md).
  //
  // So groups are now admitted whole or not at all, in priority order. Second
  // homes outrank the neutral prizes because a homeland pair is what makes two
  // factions comparable, while a prize belongs to whoever reaches it first.
  //
  // Budgets land as: 6 → capitals + prizes; 8 → capitals + second homes;
  // 10 → everything. Only the 8 case changes, and it is the one that was unfair.
  const fids = Object.keys(factions);
  const capitals = fids.map((f) => factions[f].capital).filter(Boolean);
  // Homes beyond the capital, banded by RANK: band 0 is every faction's second
  // home, band 1 every faction's third, and so on. Ranking rather than
  // hard-coding "seconds" means a faction gaining a fourth affiliated Location
  // extends the sequence instead of silently unbalancing it.
  const homeBands = [];
  for (const f of fids) {
    const rest = (factions[f].affiliatedLocations || []).filter((l) => l !== factions[f].capital);
    rest.forEach((id, rank) => { (homeBands[rank] ||= []).push(id); });
  }
  const unaffiliated = Object.values(locations).filter((l) => !l.affiliation).map((l) => l.id);
  const total = capitals.length + homeBands.flat().length + unaffiliated.length;
  const budget = Math.max(capitals.length, Math.min(locationBudget ?? total, total));

  const inPlay = new Set(capitals); // capitals are never optional
  let room = budget - capitals.length;
  // Each home band is ALL-OR-NOTHING: half a band means some factions get an
  // extra city and others do not, which is exactly the unfairness this replaced.
  for (const band of homeBands) {
    if (band.length === 0 || band.length > room) continue;
    for (const id of band) inPlay.add(id);
    room -= band.length;
  }
  // The neutral prizes are NOT a fairness group — they belong to nobody, so a
  // subset is perfectly fair as long as it is deterministic. Taking them
  // all-or-nothing would mean that authoring more of them SHRINKS the big
  // boards, which is the opposite of what more content should do.
  for (const id of unaffiliated) {
    if (room <= 0) break;
    inPlay.add(id);
    room -= 1;
  }

  const placement = {}; // hexId -> locationId
  const factionStart = {}; // factionId -> hexId
  const used = new Set();

  rng.shuffle(Object.keys(factions)).forEach((fid, i) => {
    const anchor = anchors[i];
    // The faction's declared capital is the start; the other affiliated
    // Location is its nearby second objective. This used to be inferred by
    // sorting the pair on strategicValue and starting on the weaker one, which
    // made the capital a side effect of the value table — promote a Location
    // and a faction would silently start somewhere else. It is content now
    // (`FACTIONS[fid].capital`), with the old ordering kept as a fallback so a
    // faction that declares no capital still gets a sensible one.
    const affiliated = factions[fid].affiliatedLocations;
    const declared = factions[fid].capital;
    const start = affiliated.includes(declared)
      ? declared
      : [...affiliated].sort(
          (p, q) => VALUE_RANK[locations[p].strategicValue] - VALUE_RANK[locations[q].strategicValue],
        )[0];
    placement[anchor] = start;
    factionStart[fid] = anchor;
    used.add(anchor);

    // The rest of the homeland, in rank order, each dropped near the anchor.
    // A faction's second home sits closest; the third pushes a ring further
    // out so a homeland spreads rather than stacking on one spot. Boards that
    // did not budget for a band simply do not reach it — on a small map a
    // faction holds its capital and nothing else, which is the point: fewer
    // objectives, more ground between them.
    const homeland = affiliated.filter((l) => l !== start && inPlay.has(l));
    homeland.forEach((locId, rank) => {
      const near = 1 + rank;      // 2nd home within 1-2, 3rd within 2-3, …
      const far = 2 + rank;
      let candidates = hexIds.filter(
        (id) => !used.has(id) && distFrom[anchor][id] >= near && distFrom[anchor][id] <= far,
      );
      if (candidates.length === 0) {
        candidates = hexIds.filter((id) => !used.has(id) && distFrom[anchor][id] <= far + 1);
      }
      if (candidates.length === 0) return; // board too small to seat it
      const partner = rng.pick(candidates);
      placement[partner] = locId;
      used.add(partner);
    });
  });

  // unaffiliated Locations — biased toward hexes far from every anchor
  for (const locId of unaffiliated.filter((id) => inPlay.has(id))) {
    const ranked = hexIds
      .filter((id) => !used.has(id))
      .map((id) => ({ id, score: Math.min(...anchors.map((a) => distFrom[a][id])) }))
      .sort((a, b) => b.score - a.score);
    const pool = ranked.slice(0, Math.max(3, Math.floor(ranked.length / 3)));
    const chosen = rng.pick(pool).id;
    placement[chosen] = locId;
    used.add(chosen);
  }

  // everything else splits into encounter / terrain
  const type = {};
  for (const id of hexIds) if (placement[id]) type[id] = "location";
  // Encounters are a SHARE of what's left, not a fixed count — a fixed count
  // meant every hex added to a bigger board became plain terrain.
  const spare = hexIds.filter((id) => !used.has(id));
  const nEncounter = Math.round(spare.length * CONFIG.hexSplit.encounterShare);
  rng.shuffle(spare).forEach((id, i) => {
    type[id] = i < nEncounter ? "encounter" : "terrain";
  });

  return { type, placement, factionStart, anchors };
}
