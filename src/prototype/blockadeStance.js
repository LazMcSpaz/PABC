// Where a blockade stands on its road, and which way it looks.
//
// A blockade closes a ROAD, so it stands on that road rather than at the hex
// centre — which since the route rework is not where the road runs anyway: a
// route drifts off centre by a hashed fraction of a hex so the network does not
// read as pinned to a lattice. Positions therefore come from the route
// geometry's own nodes (routeGeometry.js `nodes`), which are the points where
// each road actually crosses each hex.
//
// It stands out toward the tile edge, not in the middle, for two reasons: it is
// where a checkpoint belongs — you meet it entering the tile, not after
// crossing it — and it leaves the middle clear, so a hex crossed by two roads
// has room for a blockade on each. The engine keeps one blockade per road now,
// so that is exactly what happens: a through-road tile takes two, a T-junction
// three, and each barricade takes its stance from its own road.
//
// JSX-free so it stays testable headless, like boardSlots.js and hexProjection.
import { HEX_H, HEX_W, neighborMap } from "./hexProjection.js";
import { facingFor } from "./boardSlots.js";

// How far from the hex's own road node toward the neighbour's, as a fraction of
// the gap between them. Half would land on the shared edge and read as
// belonging to neither tile, so this stops short of it.
const ALONG = 0.36;

// Ground depth is squashed on screen by this much, so a screen-space direction
// has to be un-squashed before it means a compass bearing the sprite sheet
// would recognise.
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

// Which road a blockade sits on, when the record does not say.
//
// It normally does: the engine picks the road facing its owner's nearest
// settlement at build time (blockades.js `supplyEdgeFor`) and stores it, so this
// is a fallback for an older record rather than the usual path. It takes the
// road running most toward the camera, ties breaking on neighbour id, so a
// blockade never hops between roads as the board re-renders.
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

// Where the blockade on `hexId` closing the road toward `edge` stands.
//
// `nodes` is the route network's road nodes — `{ hexId: { x, y, angle } }`.
// Both ends of the step are road crossings, so interpolating between them keeps
// the barricade on the drawn road rather than on a straight line between hex
// centres, which is no longer where the road is.
//
// Returns `{ x, y, angle, facing }`: `angle` is the bearing of THIS road for the
// SVG mark to lie across, and `facing` is the sprite row, so a booth and a
// construction site on the same road agree with each other.
export function blockadeStance(hexId, edge, nodes, centers) {
  const from = nodes?.[hexId] || centers?.[hexId];
  if (!from) return null;
  const to = (edge && (nodes?.[edge] || centers?.[edge])) || null;
  if (!to) {
    // No road to step along — draw it where the road crosses this hex, on that
    // hex's own bearing. An invisible thing that stops you reads as a bug.
    return { x: from.x, y: from.y, angle: from.angle ?? 0, facing: "s" };
  }
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return {
    x: from.x + dx * ALONG,
    y: from.y + dy * ALONG,
    // This road's own bearing, not the hex's dominant through-road: two
    // barricades on a junction have to lie across different roads.
    angle: (Math.atan2(dy, dx) * 180) / Math.PI,
    // Turned to look back down the road into its own tile, the same way units
    // face the middle of the hex they stand on.
    facing: facingFor(Math.atan2(dy / DEPTH_SQUASH, dx)),
  };
}
