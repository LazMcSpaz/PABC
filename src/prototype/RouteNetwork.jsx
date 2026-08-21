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
import { LOD_FLAT, useBoardLod } from "./boardLod.js";
import BlockadeMark from "./BlockadeMark.jsx";
import { blockadeStance } from "./blockadeStance.js";
import { structureFor } from "./unitSprites.js";
import { HEX_W } from "./hexProjection.js";

// How far short of a Location's centre a route stops. Sized to clear the
// settlement art and the floating radial's contact ellipse beneath it.
const LOCATION_CLEARANCE = HEX_W * 0.23;

// Each route is a STACK of strokes rather than a single line, widest first.
// One flat stroke is what made these read as clip-art laid over the board: the
// terrain underneath is a glowing wireframe, and a hard opaque line has no
// relationship to it.
//
// The stack has three jobs, and they pull against each other:
//
//   trough   two wide, soft, dark strokes. This is the legibility guarantee —
//            a route crosses hexes glowing in whatever colour their owner is,
//            and without something dark underneath the core has no reliable
//            contrast. Widened and softened from the old single hard casing so
//            it reads as ground worn into the terrain rather than an outline
//            drawn around a line.
//   halo     a wide, faint, warm/cool wash in the route's own colour, painted
//            with `screen` so it ADDS light like everything else on this board
//            instead of covering what is beneath it.
//   core     the thin bright line that actually says "there is a road here",
//            also screened, and no longer at full opacity.
//
// Roads stay one continuous line and rails keep their cross-ties: that
// difference has to survive a faction recolour and colour-vision deficiency,
// so it can never be carried by hue alone.
const STYLES = {
  road: {
    trough: [
      { color: "rgba(6,10,14,0.14)", width: 14 },
      { color: "rgba(6,10,14,0.28)", width: 10 },
      { color: "rgba(6,10,14,0.58)", width: 6.5 },
    ],
    halo: { color: "#f2c078", width: 5.5, opacity: 0.24 },
    ties: null,
    core: { color: "#f0c184", width: 2.1, opacity: 0.76 },
    glow: "#f2c07866",
  },
  rail: {
    trough: [
      { color: "rgba(6,10,14,0.14)", width: 15 },
      { color: "rgba(6,10,14,0.30)", width: 11 },
      { color: "rgba(6,10,14,0.62)", width: 7.5 },
    ],
    halo: { color: "#cfe0f0", width: 6.0, opacity: 0.18 },
    // sleepers: a thick, heavily-dashed stroke reading as cross-ties
    ties: { color: "#9fb2c6", width: 6.6, dash: "1.8 6.5", opacity: 0.7 },
    core: { color: "#dce7f2", width: 1.5, opacity: 0.7 },
    glow: "#cfd8e355",
  },
};

// Segment identity, direction-independent, so the road pass and the rail pass
// agree on which stretch of ground they are both crossing.
const segKey = (a, b) => (a < b ? `${a}~${b}` : `${b}~${a}`);

// How far each route slides off the centre line where a road and a railway run
// between the SAME two hexes. Half the separation each, so the pair straddles
// the line the single route would have taken and neither looks displaced.
//
// Sized to clear both troughs: the widest strokes are 14 (road) and 15 (rail),
// so ~7.5 each way puts a visible gap of ground between them at every zoom.
const PARALLEL_OFFSET = 7.5;

// `shared` is the set of segment keys carried by BOTH kinds; `side` is which
// way this kind steps off the line there (-1 / +1).
//
// Without this the two draw on top of each other and only the one painted last
// survives — a settlement served by road AND rail looked rail-only, which is a
// lie about how you can reach it.
function buildPaths(rows, hexes, centers, carries, shared, side = 0) {
  const out = [];
  for (const [a, b] of routeSegments(rows, hexes, carries)) {
    const ca = centers[a];
    const cb = centers[b];
    if (!ca || !cb) continue;
    // Trim whichever end lands on a Location so the line stops outside it.
    let pa = hexes[a]?.type === "location" ? trimToEllipse(cb, ca, LOCATION_CLEARANCE) : ca;
    let pb = hexes[b]?.type === "location" ? trimToEllipse(ca, cb, LOCATION_CLEARANCE) : cb;
    if (!pa || !pb) continue;

    let dx = 0, dy = 0;
    if (side && shared?.has(segKey(a, b))) {
      // Perpendicular to the segment, measured in a FIXED direction (low hex id
      // to high) so both kinds resolve the same normal and reliably step to
      // opposite sides rather than landing on each other.
      const [from, to] = a < b ? [ca, cb] : [cb, ca];
      const vx = to.x - from.x;
      const vy = to.y - from.y;
      const len = Math.hypot(vx, vy) || 1;
      dx = (-vy / len) * PARALLEL_OFFSET * side;
      dy = (vx / len) * PARALLEL_OFFSET * side;
    }
    out.push({
      key: `${a}~${b}`,
      x1: pa.x + dx, y1: pa.y + dy,
      x2: pb.x + dx, y2: pb.y + dy,
    });
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
      strokeOpacity={spec.opacity ?? undefined}
      strokeDasharray={dash || undefined}
      strokeLinecap={dash ? "butt" : "round"}
    />
  ));
}

export default function RouteNetwork({ rows, hexes, centers, width, height }) {
  // Below the LOD threshold a hex is under ~130px across and a route is a few
  // pixels wide: the soft trough and the screened glow are invisible at that
  // size, and paying a full-screen compositing pass for something nobody can
  // see is exactly what the LOD pass exists to stop (boardLod.js). Zoomed out,
  // routes collapse to one casing + one core in a single normally-composited
  // layer — the same trade the tile layer makes.
  const flat = useBoardLod() === LOD_FLAT;
  // A route is only drawn where the viewer has seen the ground. Fog hides the
  // road network the same way it hides everything else.
  const known = (h) => h && h.fog !== "unexplored";
  // Which stretches carry both? Computed once from the unoffset segment lists,
  // then fed back so each kind knows where to step aside.
  const roadCarries = (h) => known(h) && h.road;
  const railCarries = (h) => known(h) && h.rail;
  const railKeys = new Set(
    routeSegments(rows, hexes, railCarries).map(([a, b]) => segKey(a, b)),
  );
  const shared = new Set(
    routeSegments(rows, hexes, roadCarries)
      .map(([a, b]) => segKey(a, b))
      .filter((k) => railKeys.has(k)),
  );
  const roads = buildPaths(rows, hexes, centers, roadCarries, shared, -1);
  // Rail is generated as a capital-to-capital trunk line (board.js
  // assignRails) and stamped per hex, so this draws whatever that laid down.
  const rails = buildPaths(rows, hexes, centers, railCarries, shared, +1);
  // Blockades sit ON the road network, so they are drawn with it rather than in
  // the tile layer — which also means they survive the zoom-out unchanged
  // instead of needing a second implementation at the flat level of detail.
  // A blockade closes a road, so it stands ON that road out near the tile edge
  // rather than at the hex centre — see blockadeStance.js. A finished blockade
  // with art is drawn by BlockadeSprites instead; what stays here is the
  // construction site, whose whole job is to show progress, and any faction
  // without blockade art.
  const blockades = [];
  for (const h of Object.values(hexes)) {
    if (!centers[h.id]) continue;
    for (const b of h.blockades || []) {
      // A finished blockade with art is drawn by BlockadeSprites instead.
      if (b.done && structureFor(b.owner, "tollbooth")) continue;
      blockades.push({
        hex: h,
        blockade: b,
        at: blockadeStance(h.id, rows, hexes, centers, b.edge) || centers[h.id],
      });
    }
  }
  if (!roads.length && !rails.length && !blockades.length) return null;

  // TWO svg layers at full detail, and the split is load-bearing rather than
  // tidiness.
  //
  // `mix-blend-mode` only blends within its own stacking context, and a
  // positioned, z-indexed layer creates one — so a screened stroke inside a
  // single SVG would blend against that SVG's own transparent backdrop and
  // change nothing. Putting the light-adding strokes in their own element with
  // the blend mode on the ELEMENT lets them add light to the board underneath,
  // which is what makes them read as part of the hologram instead of paint on
  // top of it. The dark trough has to stay out of that layer: screening
  // something dark is a no-op, and the trough is the contrast guarantee.
  const layer = (extra) => ({
    position: "absolute", inset: 0, pointerEvents: "none", ...extra,
  });

  const kinds = [["road", roads], ["rail", rails]].filter(([, paths]) => paths.length);

  if (flat) {
    // One layer, two strokes per route, no blending. Still casing-then-core so
    // a route stays legible over any faction tint — that rule holds at every
    // zoom; it is only the softness that is dropped.
    return (
      <svg width={width} height={height} style={layer({ zIndex: 8000 })}>
        {kinds.map(([kind, paths]) => {
          const s = STYLES[kind];
          return (
            <g key={kind} strokeLinejoin="round">
              <Strokes paths={paths} spec={s.trough[s.trough.length - 1]} />
              <Strokes paths={paths} spec={s.core} />
            </g>
          );
        })}
        {blockades.map(({ hex, blockade, at }) => (
          <BlockadeMark key={`blockade-${hex.id}-${blockade.edge || "0"}`}
            x={at.x} y={at.y} blockade={blockade} />
        ))}
      </svg>
    );
  }

  return (
    <>
      {/* 1 — the worn trough. Normal compositing: this is the dark that keeps
          the core legible over a hex glowing in any faction's colour. */}
      <svg width={width} height={height} style={layer({ zIndex: 7990 })}>
        {kinds.map(([kind, paths]) => (
          <g key={kind} strokeLinejoin="round">
            {STYLES[kind].trough.map((t, i) => (
              <Strokes key={i} paths={paths} spec={t} />
            ))}
          </g>
        ))}
      </svg>

      {/* 2 — the light. Screened onto the board so a route glows with the
          terrain rather than covering it. */}
      <svg
        width={width}
        height={height}
        style={layer({ zIndex: 8000, mixBlendMode: "screen" })}
      >
        {kinds.map(([kind, paths]) => {
          const s = STYLES[kind];
          return (
            <g key={kind} style={{ filter: `drop-shadow(0 0 5px ${s.glow})` }}>
              <g strokeLinejoin="round"><Strokes paths={paths} spec={s.halo} /></g>
              {s.ties && <g><Strokes paths={paths} spec={s.ties} dash={s.ties.dash} /></g>}
              <g strokeLinejoin="round"><Strokes paths={paths} spec={s.core} /></g>
            </g>
          );
        })}
      </svg>

      {/* 3 — blockades sit ON the road network, so they are drawn with it
          rather than in the tile layer, which also means they survive the
          zoom-out unchanged instead of needing a second implementation at the
          flat level of detail (boardLod.js).

          Their own layer, above both route layers and composited normally: a
          blockade is a solid object on the road, not more light, and once it
          carries real sprite art it must sit ON the road rather than blend
          into it. Unit sprites (BoardTokens, z 9200) still draw above this, so
          a unit standing at a blockade reads in front of it. */}
      {blockades.length > 0 && (
        <svg width={width} height={height} style={layer({ zIndex: 8010 })}>
          {blockades.map(({ hex, blockade, at }) => (
            <BlockadeMark
              key={`blockade-${hex.id}-${blockade.edge || "0"}`}
              x={at.x}
              y={at.y}
              blockade={blockade}
            />
          ))}
        </svg>
      )}
    </>
  );
}
