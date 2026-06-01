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

// Constrained-random layout: place the 10 Locations, then fill the rest
// with encounter / terrain tiles. Each faction's two affiliated Locations
// land within 2 hexes of each other; the four start areas are spread.
export function generateLayout(rng, grid, factions, locations) {
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

  // everything else splits into encounter / terrain
  const type = {};
  for (const id of hexIds) if (placement[id]) type[id] = "location";
  rng.shuffle(hexIds.filter((id) => !used.has(id))).forEach((id, i) => {
    type[id] = i < CONFIG.hexSplit.encounter ? "encounter" : "terrain";
  });

  return { type, placement, factionStart, anchors };
}
