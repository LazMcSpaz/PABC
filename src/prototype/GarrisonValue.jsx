// A garrison Strength readout with a hover breakdown that shows how the
// number is reached — the base garrison plus each upgrade chip's bonus.
// The breakdown is portalled to <body> so it escapes any clipping or
// transformed parent (the board viewport, a flipping card).
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { garrisonBreakdown, theme } from "./data.js";

function Shield({ height, color }) {
  const width = Math.round((height * 14) / 16);
  return (
    <svg width={width} height={height} viewBox="0 0 14 16" aria-hidden>
      <path
        d="M7 0.5 L13.2 2.7 V8 C13.2 11.7 10.6 14.4 7 15.5 C3.4 14.4 0.8 11.7 0.8 8 V2.7 Z"
        fill="none"
        stroke={color}
        strokeWidth="1.5"
      />
    </svg>
  );
}

function Row({ label, value, strong }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: 11,
        marginTop: 4,
      }}
    >
      <span style={{ color: strong ? theme.text : theme.textDim, fontWeight: strong ? 700 : 400 }}>
        {label}
      </span>
      <span
        style={{
          color: strong ? theme.accent : theme.text,
          fontWeight: 700,
          fontFamily: theme.fontDisplay,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function Breakdown({ data, anchor }) {
  const W = 198;
  const above = anchor.top > 210;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const left = Math.min(Math.max(anchor.cx - W / 2, 8), vw - W - 8);
  const style = {
    position: "fixed",
    left,
    width: W,
    zIndex: 95,
    background: theme.panel3,
    border: `1px solid ${theme.borderLit}`,
    borderRadius: 8,
    padding: 11,
    boxShadow: "0 10px 28px rgba(0,0,0,0.6)",
    pointerEvents: "none",
  };
  if (above) {
    style.top = anchor.top - 10;
    style.transform = "translateY(-100%)";
  } else {
    style.top = anchor.bottom + 10;
  }
  return createPortal(
    <div style={style}>
      <div
        style={{
          fontSize: 8.5,
          fontWeight: 700,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          color: theme.textFaint,
        }}
      >
        Garrison Strength
      </div>
      <div style={{ height: 1, background: theme.border, margin: "7px 0 0" }} />
      <Row label="Base garrison" value={data.base} />
      {data.parts.map((p, i) => (
        <Row key={i} label={p.label} value={`+${p.value}`} />
      ))}
      {data.parts.length === 0 && (
        <div style={{ fontSize: 10, color: theme.textFaint, marginTop: 4 }}>
          No upgrades installed.
        </div>
      )}
      <div style={{ height: 1, background: theme.border, margin: "7px 0 0" }} />
      <Row label="Total" value={data.total} strong />
    </div>,
    document.body,
  );
}

export default function GarrisonValue({
  locationId,
  control,
  height = 17,
  fontSize = 15,
  color = theme.textDim,
  pill = false,
}) {
  const ref = useRef(null);
  const [anchor, setAnchor] = useState(null);
  const data = garrisonBreakdown(locationId, control);

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setAnchor({ cx: r.left + r.width / 2, top: r.top, bottom: r.bottom });
  };

  const wrap = pill
    ? {
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        background: "rgba(0,0,0,0.4)",
        padding: "1px 8px",
        borderRadius: 999,
        cursor: "help",
      }
    : { display: "inline-flex", alignItems: "center", gap: 5, cursor: "help" };

  return (
    <>
      <span ref={ref} onMouseEnter={show} onMouseLeave={() => setAnchor(null)} style={wrap}>
        <Shield height={height} color={color} />
        <span style={{ fontFamily: theme.fontDisplay, fontWeight: 700, fontSize, color: theme.text }}>
          {data.total}
        </span>
      </span>
      {anchor && <Breakdown data={data} anchor={anchor} />}
    </>
  );
}
