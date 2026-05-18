// The signature control meter: a ring of 3 sections (each owned by a
// player or neutral) with the foothold score in the centre.
import { ownerColor, fullController, theme } from "./data.js";

function wedgePath(cx, cy, r, a0, a1) {
  const pt = (a) => {
    const rad = (a * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const [x0, y0] = pt(a0);
  const [x1, y1] = pt(a1);
  return `M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
}

export default function ControlMeter({
  sections,
  foothold,
  footholdCap,
  size = 44,
}) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;
  const gap = 6; // degrees of dark gutter between sections
  const innerR = size * 0.31;
  const ctrl = fullController(sections);

  const showNum = size >= 30;
  const footholdText = foothold == null ? "·" : `${foothold}`;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      {sections.map((owner, i) => {
        const a0 = -90 + i * 120 + gap / 2;
        const a1 = -90 + (i + 1) * 120 - gap / 2;
        return (
          <path
            key={i}
            d={wedgePath(cx, cy, r, a0, a1)}
            fill={ownerColor(owner)}
            stroke={theme.bg}
            strokeWidth="1"
          />
        );
      })}
      {/* crisp outer ring */}
      <circle cx={cx} cy={cy} r={r - 0.6} fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth="1.2" />
      {/* centre disc — holds the foothold score */}
      <circle
        cx={cx}
        cy={cy}
        r={innerR}
        fill={theme.panel}
        stroke={ctrl ? ownerColor(ctrl) : theme.border}
        strokeWidth={ctrl ? 2 : 1}
      />
      {showNum && (
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={size * 0.36}
          fontWeight="700"
          fill={foothold == null ? theme.textFaint : theme.accent}
          fontFamily="'Oswald', sans-serif"
        >
          {footholdText}
        </text>
      )}
    </svg>
  );
}
