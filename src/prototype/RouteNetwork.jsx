// Roads and rails drawn as a continuous network across the board, above the
// tiles and below the unit tokens.
//
// Two problems shape how these are drawn:
//
// 1. The background is never the same colour twice. A route crosses hexes
//    glowing in whatever colour their owner is, so no single stroke colour is
//    reliably legible. Fix: a dark CASING under every route — the standard
//    cartographic trick — so the bright core always sits against near-black
//    regardless of the hologram underneath.
// 2. Two route types have to be told apart by more than hue. Roads are one
//    solid line; rails carry cross-ties. That difference survives both a
//    faction recolour and colour-vision deficiency.
//
// Purely derived from the board: roads are laid once at generation time
// (src/game/board.js assignRoads) and never move, so this re-renders only when
// the board itself changes.
import { routeSegments, trimToEllipse } from "./hexProjection.js";
import BlockadeMark from "./BlockadeMark.jsx";
import { HEX_W } from "./hexProjection.js";

// How far short of a Location's centre a route stops. Sized to clear the
// settlement art and the floating radial's contact ellipse beneath it.
const LOCATION_CLEARANCE = HEX_W * 0.23;

const STYLES = {
  road: {
    casing: { color: "rgba(4,8,12,0.88)", width: 6.5 },
    ties: null,
    line: { color: "#f2c078", width: 3.0 },
    glow: "#f2c07855",
  },
  rail: {
    casing: { color: "rgba(4,8,12,0.9)", width: 7.5 },
    // sleepers: a thick, heavily-dashed stroke reading as cross-ties
    ties: { color: "#aebccb", width: 7.0, dash: "1.8 6.5" },
    line: { color: "#e6edf5", width: 1.8 },
    glow: "#cfd8e355",
  },
};

function buildPaths(rows, hexes, centers, carries) {
  const out = [];
  for (const [a, b] of routeSegments(rows, hexes, carries)) {
    const ca = centers[a];
    const cb = centers[b];
    if (!ca || !cb) continue;
    // Trim whichever end lands on a Location so the line stops outside it.
    let pa = hexes[a]?.type === "location" ? trimToEllipse(cb, ca, LOCATION_CLEARANCE) : ca;
    let pb = hexes[b]?.type === "location" ? trimToEllipse(ca, cb, LOCATION_CLEARANCE) : cb;
    if (!pa || !pb) continue;
    out.push({ key: `${a}~${b}`, x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y });
  }
  return out;
}

function Strokes({ paths, spec, dash }) {
  if (!spec) return null;
  return paths.map((p) => (
    <line
      key={p.key}
      x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2}
      stroke={spec.color}
      strokeWidth={spec.width}
      strokeDasharray={dash || undefined}
      strokeLinecap={dash ? "butt" : "round"}
    />
  ));
}

export default function RouteNetwork({ rows, hexes, centers, width, height }) {
  // A route is only drawn where the viewer has seen the ground. Fog hides the
  // road network the same way it hides everything else.
  const known = (h) => h && h.fog !== "unexplored";
  const roads = buildPaths(rows, hexes, centers, (h) => known(h) && h.road);
  // Rail is generated as a capital-to-capital trunk line (board.js
  // assignRails) and stamped per hex, so this draws whatever that laid down.
  const rails = buildPaths(rows, hexes, centers, (h) => known(h) && h.rail);
  // Blockades sit ON the road network, so they are drawn with it rather than in
  // the tile layer — which also means they survive the zoom-out unchanged
  // instead of needing a second implementation at the flat level of detail.
  const blockades = Object.values(hexes).filter((h) => h.blockade && centers[h.id]);
  if (!roads.length && !rails.length && !blockades.length) return null;

  return (
    <svg
      width={width}
      height={height}
      style={{ position: "absolute", inset: 0, zIndex: 8000, pointerEvents: "none" }}
    >
      {[["road", roads], ["rail", rails]].map(([kind, paths]) => {
        if (!paths.length) return null;
        const s = STYLES[kind];
        return (
          <g key={kind} style={{ filter: `drop-shadow(0 0 4px ${s.glow})` }}>
            <g strokeLinejoin="round"><Strokes paths={paths} spec={s.casing} /></g>
            {s.ties && <g><Strokes paths={paths} spec={s.ties} dash={s.ties.dash} /></g>}
            <g strokeLinejoin="round"><Strokes paths={paths} spec={s.line} /></g>
          </g>
        );
      })}

      {blockades.map((h) => (
        <BlockadeMark
          key={`blockade-${h.id}`}
          x={centers[h.id].x}
          y={centers[h.id].y}
          blockade={h.blockade}
        />
      ))}
    </svg>
  );
}
