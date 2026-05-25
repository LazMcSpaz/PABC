// §18.2 Loyalty — the 8-slice centre pie. Presentational, props-only:
//   { value: 0..8, danger: boolean }   (size / x / y are optional layout)
// Matches the ControlMeter ring's radial language: the first `value`
// slices read as integrated (filled), the rest as not-yet-loyal (dim).
// `danger` recolours the filled slices to the warning hue so a Location
// bleeding toward a Control peel reads at a glance. Built standalone so it
// renders from mock props; ControlMeter embeds it in its centre disc.
import { theme } from "./data.js";

const SLICES = 8;
const DANGER = "#d2453f"; // warning red — a Location about to peel Control

function wedgePath(cx, cy, r, a0, a1) {
  const pt = (a) => {
    const rad = (a * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const [x0, y0] = pt(a0);
  const [x1, y1] = pt(a1);
  return `M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
}

export default function LoyaltyPie({ value = 0, danger = false, size = 44, x, y }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;
  const gap = 3; // degrees of dark gutter between slices
  const filled = Math.max(0, Math.min(SLICES, Math.round(value)));
  const fillColor = danger ? DANGER : theme.accent;

  return (
    <svg
      x={x}
      y={y}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
    >
      {Array.from({ length: SLICES }).map((_, i) => {
        const a0 = -90 + i * (360 / SLICES) + gap / 2;
        const a1 = -90 + (i + 1) * (360 / SLICES) - gap / 2;
        const on = i < filled;
        return (
          <path
            key={i}
            d={wedgePath(cx, cy, r, a0, a1)}
            fill={on ? fillColor : theme.panel3}
            stroke={theme.bg}
            strokeWidth="0.75"
            opacity={on ? 1 : 0.55}
          />
        );
      })}
      <circle cx={cx} cy={cy} r={r - 0.4} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth="1" />
    </svg>
  );
}
