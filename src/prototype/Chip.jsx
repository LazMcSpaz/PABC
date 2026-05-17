// An upgrade chip. Face-down shows name + cost + family colour; hovering
// or clicking flips it to reveal the effect — "we want people to know
// what they would be buying."
import { useState } from "react";
import { ALL_UPGRADES, CHIP_COLOR, theme } from "./data.js";
import { Coin } from "./kit.jsx";

export default function Chip({ chipId, width = 84, dim = false }) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const chip = ALL_UPGRADES[chipId];
  if (!chip) return null;

  const flipped = hover || pinned;
  const accent = CHIP_COLOR[chip.kind] || theme.border;
  const height = Math.round(width * 1.2);

  return (
    <div
      className="pc-flip pc-int"
      style={{ width, height, opacity: dim ? 0.5 : 1, cursor: "pointer" }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => setPinned((p) => !p)}
      title={pinned ? "Click to un-pin" : "Click to keep revealed"}
    >
      <div
        className="pc-flip-inner"
        style={{ transform: flipped ? "rotateY(180deg)" : "none" }}
      >
        {/* FRONT — face-down: name, cost, family colour */}
        <div
          className="pc-flip-face"
          style={{
            background: theme.panel3,
            border: `2px solid ${accent}`,
            borderRadius: 7,
            padding: 6,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span
              style={{
                fontSize: 8,
                fontWeight: 800,
                letterSpacing: 0.5,
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
              fontSize: 11.5,
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
              <Coin n={chip.cost} size={13} />
            ) : (
              <span style={{ fontSize: 9, color: theme.textFaint }}>included</span>
            )}
          </div>
        </div>
        {/* BACK — revealed effect */}
        <div
          className="pc-flip-face pc-back"
          style={{
            background: theme.panel2,
            border: `2px solid ${accent}`,
            borderRadius: 7,
            padding: 7,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ fontSize: 9.5, color: theme.text, lineHeight: 1.3, textAlign: "center" }}>
            {chip.effect}
          </span>
        </div>
      </div>
    </div>
  );
}
