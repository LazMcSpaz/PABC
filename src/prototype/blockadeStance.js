// Where a blockade stands, and which way it looks.
//
// A blockade blocks a ROAD, so drawing it at the hex centre was always a
// placeholder: it sat wherever the tile's middle happened to be, on nothing in
// particular, and a barricade that is not on the road it closes reads as
// decoration. This puts it on the road line itself, out near the tile edge.
//
// Out near the edge for two reasons. It is where a checkpoint belongs — you
// meet it entering the tile, not after crossing it — and it leaves the middle
// clear, so a hex crossed by two roads has room for a blockade on each. The
// engine keeps one blockade per road now, so that is exactly what happens: a
// through-road tile can hold two, a T-junction three.
//
// JSX-free so it stays testable headless, like boardSlots.js and hexProjection.
import { HEX_H, HEX_W, neighborMap } from "./hexProjection.js";
import { facingFor } from "./boardSlots.js";

// How far along the road toward the neighbour, as a fraction of the centre-to-
// centre distance. Half would land exactly on the shared edge and read as
// belonging to neither tile, so this stops short of it.
const ALONG = 0.36;

// Ground depth is squashed on screen by this much (hexProjection's projection),
// so a screen-space direction has to be un-squashed before it means a compass
// bearing the sprite sheet would recognise.
const DEPTH_SQUASH = HEX_H / HEX_W;

function carriesRoad(hex) {
  return !!hex && hex.fog !== "unexplored" && !!hex.road;
}

// The road segments leaving `hexId`, as neighbour ids. Deterministic order.
export function roadNeighbours(hexId, rows, hexes) {
  const nb = neighborMap(rows)[hexId] || [];
  if (!carriesRoad(hexes[hexId])) return [];
  return nb.filter((n) => carriesRoad(hexes[n])).sort();
}

// Which of a hex's roads a blockade sits on.
//
// The one running most toward the camera. That is the stretch with the most
// room in front of it and the least chance of a neighbouring tile's art
// crowding it, and it is stable: ties break on the neighbour id, so a blockade
// never hops between roads as the board re-renders.
export function pickSegment(hexId, rows, hexes, centers) {
  const here = centers[hexId];
  if (!here) return null;
  let best = null;
  for (const n of roadNeighbours(hexId, rows, hexes)) {
    const there = centers[n];
    if (!there) continue;
    const dy = there.y - here.y;
    if (!best || dy > best.dy) best = { id: n, dy };
  }
  return best ? best.id : null;
}

// Where the blockade on `hexId` stands, in board space, and the sprite row it
// should draw. Returns null when the hex has no road to sit on — the caller
// falls back to the hex centre rather than dropping the blockade, because an
// invisible thing that stops you reads as a bug.
export function blockadeStance(hexId, rows, hexes, centers, edge = null) {
  const here = centers[hexId];
  if (!here) return null;
  // A blockade knows which road it closes. Without one — an older record, or a
  // caller that does not track it — fall back to picking a road, so a blockade
  // is never left undrawn.
  const neighbour = (edge && centers[edge]) ? edge : pickSegment(hexId, rows, hexes, centers);
  if (!neighbour) return null;
  const there = centers[neighbour];

  const dx = there.x - here.x;
  const dy = there.y - here.y;
  return {
    x: here.x + dx * ALONG,
    y: here.y + dy * ALONG,
    neighbour,
    // Turned to look back down the road into its own tile, the same way units
    // face the middle of the hex they stand on. Either way along the road puts
    // the barrier ACROSS it, which is the part that matters; facing inward is
    // what keeps it consistent with everything else standing on a tile.
    facing: facingFor(Math.atan2(dy / DEPTH_SQUASH, dx)),
  };
}
