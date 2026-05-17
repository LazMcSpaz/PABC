// An upgrade chip. Face shows name + cost + family colour; hovering
// raises a floating popover (fixed-positioned, so it escapes any
// clipping parent) with the full effect text.
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ALL_UPGRADES, CHIP_COLOR, theme } from "./data.js";
import { Coin } from "./kit.jsx";

function ChipTooltip({ chip, accent, anchor }) {
  const W = 212;
  const above = anchor.top > 210;
  const left = Math.min(
    Math.max(anchor.cx - W / 2, 8),
    (typeof window !== "undefined" ? window.innerWidth : 1280) - W - 8,
  );
  const style = {
    position: "fixed",
    left,
    width: W,
    zIndex: 90,
    background: theme.panel3,
    border: `1px solid ${accent}`,
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
      <div style={{ fontSize: 12.5, fontWeight: 800, color: accent }}>{chip.name}</div>
      <div
        style={{
          fontSize: 8.5,
          fontWeight: 700,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color: theme.textFaint,
          marginTop: 1,
          marginBottom: 7,
        }}
      >
        {chip.kind === "capital" ? "Faction chip" : `${chip.kind} upgrade`}
        {chip.rare ? " · Rare" : ""}
      </div>
      <div style={{ fontSize: 11, color: theme.text, lineHeight: 1.45 }}>{chip.effect}</div>
      <div style={{ marginTop: 9, display: "flex", alignItems: "center", gap: 7 }}>
        <span
          style={{
            fontSize: 8.5,
            fontWeight: 700,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            color: theme.textFaint,
          }}
        >
          Cost
        </span>
        {chip.cost > 0 ? (
          <Coin n={chip.cost} size={13} />
        ) : (
          <span style={{ fontSize: 10, color: theme.textFaint }}>Included with faction</span>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default function Chip({ chipId, width = 84, dim = false }) {
  const ref = useRef(null);
  const [anchor, setAnchor] = useState(null);
  const chip = ALL_UPGRADES[chipId];
  if (!chip) return null;

  const accent = CHIP_COLOR[chip.kind] || theme.border;
  const height = Math.round(width * 1.2);
  const small = width < 70;

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setAnchor({ cx: r.left + r.width / 2, top: r.top, bottom: r.bottom });
  };

  return (
    <>
      <div
        ref={ref}
        className="pc-int"
        onMouseEnter={show}
        onMouseLeave={() => setAnchor(null)}
        style={{
          width,
          height,
          opacity: dim ? 0.5 : 1,
          background: theme.panel3,
          border: `2px solid ${accent}`,
          borderRadius: 7,
          padding: small ? 5 : 6,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          cursor: "default",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <span
            style={{
              fontSize: 8,
              fontWeight: 800,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              color: accent,
            }}
          >
            {chip.kind === "capital" ? "Faction" : chip.kind}
          </span>
          {chip.rare && (
            <span style={{ fontSize: 9, color: theme.accent }} title="Rare">
              ★
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: small ? 9.5 : 11.5,
            fontWeight: 800,
            color: theme.text,
            lineHeight: 1.15,
            textAlign: "center",
          }}
        >
          {chip.name}
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          {chip.cost > 0 ? (
            <Coin n={chip.cost} size={small ? 11 : 13} />
          ) : (
            <span style={{ fontSize: 8, color: theme.textFaint }}>included</span>
          )}
        </div>
      </div>
      {anchor && <ChipTooltip chip={chip} accent={accent} anchor={anchor} />}
    </>
  );
}
