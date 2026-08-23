// The signature control meter: a ring of 3 sections (each owned by a
// player or neutral) with the §18.2 Loyalty pie (8 slices) in the centre.
// Holographic light treatment: sections read as glowing translucent light in
// their owner colour rather than solid blocks; neutral sections are faint.
import { ownerColor, fullController } from "./data.js";
import LoyaltyPie from "./LoyaltyPie.jsx";

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
  loyalty,
  danger = false,
  // §11 — who is out-projecting the holder on this city's own hex. Influence
  // pressure bleeds a point of Loyalty every Upkeep and costs the presser
  // Standing and Menace: a soft siege, and until now visible only as one line
  // of feed text that scrolled away. A city being hollowed out says so.
  pressureBy = null,
  size = 44,
}) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;
  const gap = 7; // degrees of dark gutter between sections
  const innerR = size * 0.34;
  const ctrl = fullController(sections);
  const glow = Math.max(2, size * 0.07);

  const showPie = size >= 30 && loyalty != null;
  const pieSize = innerR * 2 - 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: "visible" }} aria-hidden>
      {sections.map((owner, i) => {
        const a0 = -90 + i * 120 + gap / 2;
        const a1 = -90 + (i + 1) * 120 - gap / 2;
        const neutral = !owner || owner === "neutral";
        const col = ownerColor(owner);
        return (
          <path
            key={i}
            d={wedgePath(cx, cy, r - 1, a0, a1)}
            fill={col}
            fillOpacity={neutral ? 0.06 : 0.24}
            stroke={col}
            strokeWidth={neutral ? 1 : 1.7}
            strokeOpacity={neutral ? 0.45 : 1}
            strokeLinejoin="round"
            style={neutral ? undefined : { filter: `drop-shadow(0 0 ${glow}px ${col})` }}
          />
        );
      })}
      {/* centre disc — dark glass; glows in the controller's colour when fully held */}
      <circle
        cx={cx}
        cy={cy}
        r={innerR}
        fill="rgba(5,12,13,0.88)"
        stroke={danger ? "#d2453f" : ctrl ? ownerColor(ctrl) : "rgba(86,211,198,0.45)"}
        strokeWidth={ctrl || danger ? 1.8 : 1}
        style={ctrl || danger ? { filter: `drop-shadow(0 0 ${glow}px ${danger ? "#d2453f" : ownerColor(ctrl)})` } : undefined}
      />
      {/* The pressure arrow, biting into the ring from the presser's side, in
          the presser's colour. Drawn over the sections and under the pie, so
          it reads as something pushing IN on the city rather than as part of
          the city's own state. Pulses, because it is happening now. */}
      {pressureBy && size >= 24 && (
        <g style={{ pointerEvents: "none" }} className="hud-breathe">
          <path
            d={`M ${cx - r * 0.92} ${cy} l ${r * 0.34} ${-r * 0.24} l 0 ${r * 0.14}
                l ${r * 0.3} 0 l 0 ${r * 0.2} l ${-r * 0.3} 0 l 0 ${r * 0.14} Z`}
            fill={ownerColor(pressureBy)}
            fillOpacity={0.95}
            stroke="rgba(5,12,13,0.9)"
            strokeWidth={0.6}
            style={{ filter: `drop-shadow(0 0 ${glow}px ${ownerColor(pressureBy)})` }}
          />
        </g>
      )}
      {showPie ? (
        <LoyaltyPie
          value={loyalty}
          danger={danger}
          size={pieSize}
          x={cx - pieSize / 2}
          y={cy - pieSize / 2}
        />
      ) : (
        size >= 30 && (
          <text
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={size * 0.34}
            fontWeight="700"
            fill="rgba(143,246,234,0.5)"
            fontFamily="'Oswald', sans-serif"
          >
            ·
          </text>
        )
      )}
    </svg>
  );
}
