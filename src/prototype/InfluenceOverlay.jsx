// The influence heatmap (economy brief §11).
//
// `recomputeInfluence` has run on every control, Loyalty and chip change since
// the layer shipped — nine call sites — and the field it produces was consumed
// by NOTHING on screen. No heatmap, no readout, no tooltip. That is the single
// biggest gap in the territory layer, and every case in the genre research
// where a territory system was called confusing, arbitrary or broken was a
// system players could not see.
//
// WHAT THIS HAS TO MAKE LEGIBLE, specifically. Dominance is a step function
// with a wide dead zone. Measured on the real board:
//
//   source under 6      dominates 1 hex
//   source 6 to <12     dominates 7
//   source 12 or more   dominates 19
//
// So Loyalty 4 through 8 changes nothing on a bare Location, and 11 scrap of
// influence chips buys zero extra hexes until Loyalty is at the ceiling. A
// player who cannot see the field experiences that as the game ignoring their
// investment. A player who CAN see it reads a contour a hex short of the bar
// and knows exactly what one more point of Loyalty would buy.
//
// So the overlay does two things and not more:
//
//   1. Ramps opacity with your own field strength, so gradient is visible.
//   2. Draws a HARD EDGE at the dominance threshold. The cliff is the
//      mechanic; a smooth gradient alone would hide the thing that matters.
//
// Own field only, on explored ground only. A rival's projection is what the
// dashed ZoC ring already reports, at the resolution the design intends — you
// learn whose ground it is, not how much slack they have on it.
import { topFacePolygon } from "./hexProjection.js";
import { theme } from "./data.js";

// Colour ramp. Cyan is the board's own "your reach" colour; the amber marks
// the band where one more point would flip a hex, which is the actionable
// reading.
const COLD = "#2f6f7a";
const WARM = "#56d3c6";
const EDGE = "#e8b467";

// Where the ramp tops out. Past twice the dominance threshold the extra
// projection buys nothing on the current board (the 19-hex plateau), so the
// scale ends there rather than being dominated by one capital.
const rampFor = (v, threshold) => Math.max(0, Math.min(1, v / (threshold * 2)));

// Shared by both board renderers, so the flat top-down board and the holo
// board never drift into two different readings of the same field.
export const INFLUENCE_EDGE = EDGE;
export function influenceFill(v, threshold) {
  if (v == null || v <= 0) return null;
  const t = rampFor(v, threshold);
  return { color: mix(COLD, WARM, t), opacity: 0.1 + 0.42 * t };
}

function mix(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [ar, ag, ab] = p(a), [br, bg, bb] = p(b);
  const c = (x, y) => Math.round(x + (y - x) * t);
  return `rgb(${c(ar, br)},${c(ag, bg)},${c(ab, bb)})`;
}

/**
 * @param {object}  props
 * @param {string[]} props.order      paint order (ignored for fill, kept for parity)
 * @param {object}  props.hexes       the adapted hex map
 * @param {object}  props.centers     projected centres, hexId -> {x,y}
 * @param {number}  props.width
 * @param {number}  props.height
 * @param {number}  props.threshold   CONFIG.influence.dominanceThreshold, from the adapter
 * @param {boolean} props.flat        true on the top-down board (no projection inset)
 */
export default function InfluenceOverlay({ order, hexes, centers, width, height, threshold = 3, flat = false }) {
  const ids = order || Object.keys(hexes || {});
  return (
    <svg
      width={width}
      height={height}
      style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 8600 }}
    >
      {ids.map((id) => {
        const hex = hexes[id];
        const c = centers[id];
        if (!hex || !c) return null;
        const v = hex.influence;
        // null is unexplored; 0 is "you project nothing here", and both should
        // paint nothing at all rather than a faint wash over the whole map.
        if (v == null || v <= 0) return null;
        const t = rampFor(v, threshold);
        const dominant = hex.influenceDominant;
        return (
          <g key={id}>
            <polygon
              points={topFacePolygon(flat ? 1 : 2, c.x, c.y)}
              fill={mix(COLD, WARM, t)}
              opacity={0.1 + 0.42 * t}
            />
            {/* The cliff. A hex you DOMINATE is ringed; a hex you merely reach
                is not. Walking the border of that ring is how a player reads
                "one more point of Loyalty and this row joins my ZoC". */}
            {dominant && (
              <polygon
                points={topFacePolygon(flat ? 3 : 4, c.x, c.y)}
                fill="none"
                stroke={EDGE}
                strokeWidth={1.2}
                opacity={0.75}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

// The legend. Without it the ramp is decoration — the player has to be told
// that the amber ring IS the dominance threshold, because the threshold is the
// whole mechanic and it is not derivable from a gradient.
export function InfluenceLegend({ threshold }) {
  const cell = (label, bg, ring) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{
        width: 12, height: 12, borderRadius: 2, background: bg,
        border: ring ? `1.2px solid ${EDGE}` : "1px solid rgba(255,255,255,0.15)",
      }} />
      <span style={{ fontSize: 8.5, letterSpacing: 0.8, textTransform: "uppercase", color: theme.textDim }}>{label}</span>
    </span>
  );
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      padding: "6px 10px", borderRadius: 6,
      background: "rgba(6,14,15,0.9)", border: `1px solid ${WARM}55`,
    }}>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase", color: WARM }}>
        Your Influence
      </span>
      {cell("reach", mix(COLD, WARM, 0.2), false)}
      {cell("strong", mix(COLD, WARM, 0.9), false)}
      {cell(`dominant (${threshold}+)`, mix(COLD, WARM, 0.9), true)}
    </div>
  );
}
