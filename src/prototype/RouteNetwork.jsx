// Roads and rails drawn as a continuous network across the board, above the
// tiles and below the unit tokens.
//
// Three problems shape how these are drawn:
//
// 1. The background is never the same colour twice. A route crosses hexes
//    glowing in whatever colour their owner is, so no single stroke colour is
//    reliably legible. Fix: a dark TROUGH under every route — the standard
//    cartographic casing trick, softened — so the core always sits against
//    near-black regardless of the hologram underneath.
// 2. Two route types have to be told apart by more than hue. Roads are one
//    worn line; rails carry cross-ties. That difference survives both a
//    faction recolour and colour-vision deficiency.
// 3. A route must not compete with the units standing on it. The board's
//    subject is the tokens; the network is ground under them, and every value
//    here is set low enough that a sprite reads in front of it rather than
//    against it.
//
// The SHAPE — where the lines actually run, how they join, and how a road and
// a railway sharing ground are held apart — is routeGeometry.js. Two paths
// come back, one per kind, and everything below is styling laid over them.
//
// One path per kind, rather than one element per segment, is load-bearing at
// these opacities. An SVG stroke is a single paint: where a path crosses
// itself, or three chains meet at a hex centre, the translucent stroke does NOT
// stack. Separate elements do, and that is what used to make every junction
// flare brighter than the roads feeding it.
//
// Purely derived from the board: roads are laid once at generation time
// (src/game/board.js assignRoads) and never move, so the geometry is rebuilt
// only when the network or the fog over it actually changes.
import { useMemo } from "react";
import { buildRouteNetwork } from "./routeGeometry.js";
import { LOD_FLAT, useBoardLod } from "./boardLod.js";
import BlockadeMark from "./BlockadeMark.jsx";
import { blockadeStance } from "./blockadeStance.js";
import { structureFor } from "./unitSprites.js";

// Each route is a STACK of strokes rather than a single line, widest first.
// One flat stroke is what made these read as clip-art laid over the board: the
// terrain underneath is a glowing wireframe, and a hard opaque line has no
// relationship to it.
//
// The stack has three jobs, and they pull against each other:
//
//   trough   three wide, soft, dark strokes. This is the legibility guarantee —
//            a route crosses hexes glowing in whatever colour their owner is,
//            and without something dark underneath the core has no reliable
//            contrast. Wide and faint rather than narrow and hard, so it reads
//            as ground worn down rather than as an outline drawn around a line.
//   halo     a wide, faint wash in the route's own colour, painted with
//            `screen` so it ADDS light like everything else on this board
//            instead of covering what is beneath it.
//   core     the thin line that actually says "there is a road here", also
//            screened, kept well under half opacity, and BROKEN: the dash
//            pattern is long and irregular, so the road shows through as a
//            worn track with the surface gone in places rather than as an
//            unbroken drawn line. The gaps let the halo and the terrain under
//            it come through, which is most of what stops it reading as an
//            overlay.
//
// Roads stay one worn line and rails keep their cross-ties: that difference has
// to survive a faction recolour and colour-vision deficiency, so it can never
// be carried by hue alone.
const STYLES = {
  road: {
    trough: [
      { color: "rgba(6,10,14,0.10)", width: 12 },
      { color: "rgba(6,10,14,0.21)", width: 8.5 },
      { color: "rgba(6,10,14,0.42)", width: 5.5 },
    ],
    halo: { color: "#f2c078", width: 5, opacity: 0.15 },
    ties: null,
    // Long dashes with uneven gaps: at a glance it is a line, up close the
    // surface is patchy. The pattern is prime-ish so it never lines up with
    // itself over the length of a chain.
    core: { color: "#f0c184", width: 1.9, opacity: 0.5, dash: "37 4 19 3 26 6", cap: "round" },
    glow: "#f2c07840",
    // Zoomed out the whole stack collapses to these two. Brighter and wider
    // than the full-detail core on purpose: at 0.6 zoom a 1.9px line at half
    // opacity is a rumour, and what you are reading down there is where the
    // network GOES, not what it is made of.
    flat: {
      casing: { color: "rgba(6,10,14,0.55)", width: 6 },
      core: { color: "#f0c184", width: 2.4, opacity: 0.85 },
    },
  },
  rail: {
    trough: [
      { color: "rgba(6,10,14,0.10)", width: 12.5 },
      { color: "rgba(6,10,14,0.21)", width: 9 },
      { color: "rgba(6,10,14,0.45)", width: 6 },
    ],
    halo: { color: "#cfe0f0", width: 5.5, opacity: 0.12 },
    // sleepers: a thick, heavily-dashed stroke reading as cross-ties. Butt
    // caps, because a sleeper is a rectangle of timber and rounding its ends
    // turns the ties into a row of beads.
    ties: { color: "#9fb2c6", width: 6.2, dash: "1.7 6.5", opacity: 0.44, cap: "butt" },
    core: { color: "#dce7f2", width: 1.4, opacity: 0.46 },
    glow: "#cfd8e33a",
    // The ties are too fine to survive the zoom-out, so the flat rail carries
    // the difference as a dashed line instead. Roads and rails still have to
    // be told apart without reading colour at every zoom, not just close up.
    flat: {
      casing: { color: "rgba(6,10,14,0.58)", width: 6.5 },
      core: { color: "#dce7f2", width: 2.1, opacity: 0.8, dash: "7 4.5", cap: "butt" },
    },
  },
};

function Route({ d, spec }) {
  if (!d || !spec) return null;
  return (
    <path
      d={d}
      fill="none"
      stroke={spec.color}
      strokeWidth={spec.width}
      strokeOpacity={spec.opacity ?? undefined}
      strokeDasharray={spec.dash || undefined}
      strokeLinecap={spec.cap || "round"}
      strokeLinejoin="round"
    />
  );
}

// The route network, memoised on what it actually depends on.
//
// Exported because the blockade sprites need the same road nodes to stand on,
// and building the network twice a render would put the chain walk and the
// curve fitting back on the hot path. HexBoard3D builds it once and hands it to
// both layers.
export function useRouteNetwork(rows, hexes, centers) {
  // The board object is rebuilt on every tick, so `hexes` is a new reference
  // several times a turn while the network under it changes perhaps twice a
  // game. Hashing what this actually depends on — who carries a route, and
  // which ground has been seen — keeps the work off the hot path.
  const signature = useMemo(() => {
    let s = "";
    for (const id of Object.keys(hexes)) {
      const h = hexes[id];
      if (!h.road && !h.rail) continue;
      s += `${id}${h.road ? "r" : ""}${h.rail ? "l" : ""}${h.fog === "unexplored" ? "?" : ""},`;
    }
    return s;
  }, [hexes]);
  return useMemo(
    () => buildRouteNetwork(rows, hexes, centers),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, centers, signature],
  );
}

export default function RouteNetwork({ rows, hexes, centers, width, height, net: netIn }) {
  // Below the LOD threshold a hex is under ~130px across and a route is a few
  // pixels wide: the soft trough and the screened glow are invisible at that
  // size, and paying a full-screen compositing pass for something nobody can
  // see is exactly what the LOD pass exists to stop (boardLod.js). Zoomed out,
  // routes collapse to one casing + one core in a single normally-composited
  // layer — the same trade the tile layer makes.
  const flat = useBoardLod() === LOD_FLAT;

  // The board object is rebuilt on every tick, so `hexes` is a new reference
  // several times a turn while the network under it changes perhaps twice a
  // game. Hashing what this actually depends on — who carries a route, and
  // which ground has been seen — keeps the chain walk and the curve fitting off
  // the hot path.
  // Built here when nobody hands one down, so this component still stands
  // alone; HexBoard3D passes one so the blockade layer shares it.
  const built = useRouteNetwork(rows, hexes, centers);
  const net = netIn || built;

  // Blockades sit ON the road network, so they are drawn with it rather than in
  // the tile layer — which also means they survive the zoom-out unchanged
  // instead of needing a second implementation at the flat level of detail.
  // A blockade sits ON the road, so it takes its place and its bearing from
  // the road's own geometry rather than from the hex centre — which is no
  // longer where the road runs.
  //
  // A hex holds one blockade per road leaving it, so each takes its stance from
  // its OWN road rather than from the hex's node: two barricades on a junction
  // would otherwise stack on the same point at the same angle. A finished
  // blockade with art is drawn by BlockadeSprites instead; what stays here is
  // the construction site, whose whole job is to show progress, and any faction
  // without blockade art.
  const blockades = [];
  for (const h of Object.values(hexes)) {
    if (!centers[h.id]) continue;
    for (const b of h.blockades || []) {
      if (b.done && structureFor(b.owner, "tollbooth")) continue;
      blockades.push({
        hex: h,
        blockade: b,
        at: blockadeStance(h.id, b.edge, net.road.nodes, centers),
      });
    }
  }
  const kinds = [["road", net.road.d], ["rail", net.rail.d]].filter(([, d]) => d);
  if (!kinds.length && !blockades.length) return null;

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

  if (flat) {
    // One layer, two strokes per route, no blending. Still casing-then-core so
    // a route stays legible over any faction tint — that rule holds at every
    // zoom; it is only the softness that is dropped.
    return (
      <svg width={width} height={height} style={layer({ zIndex: 8000 })}>
        {kinds.map(([kind, d]) => {
          const s = STYLES[kind];
          return (
            <g key={kind}>
              <Route d={d} spec={s.flat.casing} />
              <Route d={d} spec={s.flat.core} />
            </g>
          );
        })}
        {blockades.map(({ hex, blockade, at }) => (
          <BlockadeMark
            key={`blockade-${hex.id}-${blockade.edge || "0"}`}
            x={at.x}
            y={at.y}
            angle={at.angle}
            blockade={blockade}
          />
        ))}
      </svg>
    );
  }

  return (
    <>
      {/* 1 — the worn trough. Normal compositing: this is the dark that keeps
          the core legible over a hex glowing in any faction's colour. */}
      <svg width={width} height={height} style={layer({ zIndex: 7990 })}>
        {kinds.map(([kind, d]) => (
          <g key={kind}>
            {STYLES[kind].trough.map((t, i) => (
              <Route key={i} d={d} spec={t} />
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
        {kinds.map(([kind, d]) => {
          const s = STYLES[kind];
          return (
            <g key={kind} style={{ filter: `drop-shadow(0 0 3.5px ${s.glow})` }}>
              <Route d={d} spec={s.halo} />
              {s.ties && <Route d={d} spec={s.ties} />}
              <Route d={d} spec={s.core} />
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
              angle={at.angle}
              blockade={blockade}
            />
          ))}
        </svg>
      )}
    </>
  );
}
