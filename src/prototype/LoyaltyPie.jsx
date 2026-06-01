// §18.2 Loyalty — the 8-slice centre pie. Presentational, props-only:
//   { value: 0..8, danger: boolean }   (size / x / y are optional layout)
// Holographic light treatment: filled slices read as glowing translucent
// light (amber, or the warning hue when `danger`), the rest as faint outlines.
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
  const gap = 4; // degrees of dark gutter between slices
  const filled = Math.max(0, Math.min(SLICES, Math.round(value)));
  const fillColor = danger ? DANGER : theme.accent;
  const glow = Math.max(1.5, size * 0.08);

  return (
    <svg x={x} y={y} width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: "visible" }} aria-hidden>
      {Array.from({ length: SLICES }).map((_, i) => {
        const a0 = -90 + i * (360 / SLICES) + gap / 2;
        const a1 = -90 + (i + 1) * (360 / SLICES) - gap / 2;
        const on = i < filled;
        return (
          <path
            key={i}
            d={wedgePath(cx, cy, r - 0.5, a0, a1)}
            fill={fillColor}
            fillOpacity={on ? 0.32 : 0.05}
            stroke={on ? fillColor : "rgba(143,246,234,0.4)"}
            strokeWidth={on ? 1.1 : 0.6}
            strokeOpacity={on ? 1 : 0.5}
            strokeLinejoin="round"
            style={on ? { filter: `drop-shadow(0 0 ${glow}px ${fillColor})` } : undefined}
          />
        );
      })}
    </svg>
  );
}
