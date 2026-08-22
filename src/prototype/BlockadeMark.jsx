// A blockade on the board (rail doc §3) — a barricade drawn across the road it
// sits on, in its owner's colour.
//
// It has to be visible, and not only for flavour: a completed blockade HALTS
// enemy movement, and an invisible thing that stops you reads as a bug rather
// than as an enemy doing something to you. The two phases are deliberately easy
// to tell apart at a glance, because they mean completely different things to
// whoever is looking at it:
//
//   under construction   hollow and dashed, with a progress fill. Blocks
//                        nobody yet; kill the builder and it is gone.
//   complete             solid, with uprights. This is the thing that stops you.
//
// Two details inherited from RouteNetwork, which this is drawn inside, and for
// the same reasons: it carries a dark CASING (a faction-coloured mark sitting
// on that same faction's tinted ground would otherwise disappear), and it is
// plain SVG so it costs one element at either level of detail (boardLod.js).
//
// Sized off HEX_W rather than in pixels, so it holds its proportion of a hex
// if the tiles are ever re-exported at a different resolution.
//
// `angle` is the bearing of the road under it, and the mark is laid ACROSS
// that. It used to be drawn flat whatever the road did, which meant a
// barricade on a road running north-south lay ALONG the road rather than
// blocking it — scenery beside the route rather than the thing standing in
// it.
import { ownerColor } from "./data.js";
import { HEX_W } from "./hexProjection.js";

const W = HEX_W * 0.3;
const H = HEX_W * 0.095;
const CASING = "rgba(4,8,12,0.88)";

export default function BlockadeMark({ x, y, blockade, angle = 0 }) {
  const col = ownerColor(blockade.owner);
  const left = x - W / 2;
  const top = y - H / 2;
  const r = H * 0.22;
  // Square across the road, and never upside down: past a quarter turn the
  // mark is flipped back so its uprights always read the same way up.
  let a = ((angle + 90) % 180 + 180) % 180;
  if (a > 90) a -= 180;
  const across = `rotate(${a.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})`;

  if (!blockade.done) {
    const frac = blockade.cost > 0 ? Math.min(1, blockade.progress / blockade.cost) : 0;
    return (
      <g transform={across}>
        <rect x={left} y={top} width={W} height={H} rx={r}
          fill={CASING} stroke={CASING} strokeWidth={4} />
        {/* progress fills from the left, so "nearly done" reads without
            needing a tooltip */}
        {frac > 0 && (
          <rect x={left} y={top} width={W * frac} height={H} rx={r}
            fill={col} opacity={0.5} />
        )}
        <rect x={left} y={top} width={W} height={H} rx={r}
          fill="none" stroke={col} strokeWidth={2.2} strokeDasharray="6 4" />
      </g>
    );
  }

  return (
    <g transform={across} style={{ filter: `drop-shadow(0 0 5px ${col}88)` }}>
      <rect x={left - 2} y={top - 2} width={W + 4} height={H + 4} rx={r}
        fill={CASING} />
      <rect x={left} y={top} width={W} height={H} rx={r}
        fill={col} fillOpacity={0.9} stroke={col} strokeWidth={1.6} />
      {/* uprights make it read as a barricade rather than a bar of colour */}
      {[-0.26, 0.26].map((f) => (
        <line key={f}
          x1={x + W * f} y1={top - H * 0.55} x2={x + W * f} y2={top + H * 1.55}
          stroke={CASING} strokeWidth={5} strokeLinecap="round" />
      ))}
      {[-0.26, 0.26].map((f) => (
        <line key={`c${f}`}
          x1={x + W * f} y1={top - H * 0.55} x2={x + W * f} y2={top + H * 1.55}
          stroke={col} strokeWidth={2.6} strokeLinecap="round" />
      ))}
    </g>
  );
}
