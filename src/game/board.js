// Board construction — the hex graph and the per-game layout generator
// (mechanical-spec §6.1, §6.7).
import { CONFIG, VALUE_RANK } from "./config.js";

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
