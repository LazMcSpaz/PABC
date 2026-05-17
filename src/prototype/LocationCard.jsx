// A location's card. Face-down (uncontrolled) shows name, strategic
// value and garrison. Face-up (held) reveals scrap production, the
// innate ability and chip slots. A corner button flips it for review.
import { useState } from "react";
import {
  LOCATIONS,
  STRATEGIC_VALUE,
  FACTIONS,
  fullController,
  garrisonStrength,
  locationProduction,
  theme,
} from "./data.js";
import { Label, Coin } from "./kit.jsx";
import Chip from "./Chip.jsx";

function Shield({ n, color }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <svg width="15" height="17" viewBox="0 0 14 16" aria-hidden>
        <path
          d="M7 0.5 L13.2 2.7 V8 C13.2 11.7 10.6 14.4 7 15.5 C3.4 14.4 0.8 11.7 0.8 8 V2.7 Z"
          fill="none"
          stroke={color}
          strokeWidth="1.4"
        />
      </svg>
      <span style={{ fontWeight: 800, fontSize: 15, color: theme.text }}>{n}</span>
    </span>
  );
}

export default function LocationCard({ locationId, control, width = 210, compact = false }) {
  const loc = LOCATIONS[locationId];
  const ctrl = fullController(control?.sections);
  const [showBack, setShowBack] = useState(!!ctrl);
  if (!loc) return null;

  const value = STRATEGIC_VALUE[loc.value];
  const garrison = garrisonStrength(locationId, control);
  const production = locationProduction(locationId, control);
  const faction = ctrl ? FACTIONS[ctrl] : null;
  const height = Math.round(width * 1.52);
  const chipW = Math.max(46, Math.round(width * 0.235));

  const flipBtn = (
    <button
      className="pc-int"
      onClick={(e) => {
        e.stopPropagation();
        setShowBack((s) => !s);
      }}
      title="Flip card"
      style={{
        position: "absolute",
        top: 6,
        right: 6,
        zIndex: 2,
        width: 22,
        height: 22,
        borderRadius: 5,
        border: `1px solid ${theme.border}`,
        background: theme.panel2,
        color: theme.textDim,
        cursor: "pointer",
        fontSize: 11,
        padding: 0,
      }}
    >
      ⮌
    </button>
  );

  return (
    <div className="pc-flip" style={{ width, height, position: "relative" }}>
      {flipBtn}
      <div
        className="pc-flip-inner"
        style={{ transform: showBack ? "rotateY(180deg)" : "none" }}
      >
        {/* FACE-DOWN — uncontrolled */}
        <div
          className="pc-flip-face"
          style={{
            borderRadius: 9,
            border: `1px solid ${theme.borderLit}`,
            background:
              "repeating-linear-gradient(135deg, #20242c, #20242c 9px, #232830 9px, #232830 18px)",
            display: "flex",
            flexDirection: "column",
            padding: 12,
          }}
        >
          <Label>Location</Label>
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                fontSize: width < 170 ? 16 : 20,
                fontWeight: 800,
                color: theme.text,
                textAlign: "center",
              }}
            >
              {loc.name}
            </div>
            <div
              style={{
                padding: "5px 12px",
                borderRadius: 6,
                background: value.color,
                color: "#15171c",
                fontWeight: 800,
                fontSize: 11,
                letterSpacing: 0.8,
                textTransform: "uppercase",
              }}
            >
              {value.label} value
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Label>Garrison</Label>
            <Shield n={garrison} color={theme.textDim} />
          </div>
        </div>

        {/* FACE-UP — held */}
        <div
          className="pc-flip-face pc-back"
          style={{
            borderRadius: 9,
            border: `1px solid ${theme.border}`,
            borderLeft: `4px solid ${faction ? faction.color : theme.borderLit}`,
            background: theme.panel2,
            display: "flex",
            flexDirection: "column",
            padding: 12,
            gap: 9,
          }}
        >
          <div>
            <div style={{ fontSize: width < 170 ? 14 : 17, fontWeight: 800, color: theme.text }}>
              {loc.name}
            </div>
            <div style={{ fontSize: 10.5, color: faction ? faction.color : theme.textFaint, fontWeight: 700 }}>
              {faction ? `Held — ${faction.name}` : "Uncontrolled"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 14 }}>
            <div>
              <Label>Garrison</Label>
              <Shield n={garrison} color={theme.textDim} />
            </div>
            <div>
              <Label>Scrap / turn</Label>
              <div style={{ marginTop: 2 }}>
                <Coin n={production} size={15} />
              </div>
            </div>
          </div>
          <div>
            <Label>Ability</Label>
            <div
              style={{
                fontSize: 10.5,
                color: loc.ability ? theme.text : theme.textFaint,
                lineHeight: 1.35,
                marginTop: 3,
                maxHeight: compact ? 46 : "none",
                overflow: "hidden",
              }}
            >
              {loc.ability || "No innate ability."}
            </div>
          </div>
          <div style={{ marginTop: "auto" }}>
            <Label>{`Chip slots — ${control?.chips?.length || 0}/${loc.chipSlots}`}</Label>
            <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
              {Array.from({ length: loc.chipSlots }).map((_, i) => {
                const chipId = control?.chips?.[i];
                if (chipId) return <Chip key={i} chipId={chipId} width={chipW} />;
                return (
                  <div
                    key={i}
                    style={{
                      width: chipW,
                      height: Math.round(chipW * 1.2),
                      borderRadius: 7,
                      border: `1.5px dashed ${theme.border}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: theme.textFaint,
                      fontSize: 16,
                    }}
                  >
                    +
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
