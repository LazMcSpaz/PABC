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
import { Label, Coin, IconBtn } from "./kit.jsx";
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
      <span style={{ fontFamily: theme.fontDisplay, fontWeight: 700, fontSize: 15, color: theme.text }}>
        {n}
      </span>
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
  const height = Math.round(width * 1.54);
  const chipW = Math.max(46, Math.round(width * 0.235));

  return (
    <div
      className="pc-flip"
      style={{ width, height, position: "relative", filter: "drop-shadow(0 6px 12px rgba(0,0,0,0.55))" }}
    >
      <IconBtn
        title="Flip card"
        onClick={(e) => {
          e.stopPropagation();
          setShowBack((s) => !s);
        }}
        style={{ position: "absolute", top: 6, right: 6, zIndex: 2 }}
      >
        ⮌
      </IconBtn>
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
              "repeating-linear-gradient(135deg, #241e15, #241e15 9px, #2b2419 9px, #2b2419 18px)",
            boxShadow: "inset 0 0 0 3px rgba(0,0,0,0.35)",
            display: "flex",
            flexDirection: "column",
            padding: 12,
          }}
        >
          <div style={{ textAlign: "center" }}>
            <Label style={{ letterSpacing: 2.4 }}>· Location ·</Label>
          </div>
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 13,
            }}
          >
            <div
              style={{
                fontFamily: theme.fontDisplay,
                fontSize: width < 170 ? 18 : 22,
                fontWeight: 700,
                letterSpacing: 1,
                color: theme.text,
                textAlign: "center",
                textShadow: "0 2px 4px rgba(0,0,0,0.6)",
              }}
            >
              {loc.name}
            </div>
            <div
              style={{
                padding: "5px 13px",
                borderRadius: 4,
                background: `linear-gradient(180deg, ${value.color}, ${value.color}cc)`,
                border: "1px solid rgba(0,0,0,0.4)",
                color: "#16120b",
                fontFamily: theme.fontDisplay,
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: 1,
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
            background: theme.plate,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* faction title banner */}
          <div
            style={{
              background: faction
                ? `linear-gradient(180deg, ${faction.color}, ${faction.color}99)`
                : theme.panel3,
              padding: "6px 11px",
              borderBottom: "1px solid rgba(0,0,0,0.5)",
            }}
          >
            <div
              style={{
                fontFamily: theme.fontDisplay,
                fontSize: width < 170 ? 14 : 16,
                fontWeight: 700,
                letterSpacing: 0.8,
                color: "#fff",
                textShadow: "0 1px 3px rgba(0,0,0,0.7)",
              }}
            >
              {loc.name}
            </div>
            <div
              style={{
                fontSize: 8.5,
                fontWeight: 600,
                letterSpacing: 1,
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.82)",
              }}
            >
              {faction ? `Held — ${faction.name}` : "Uncontrolled"}
            </div>
          </div>

          <div style={{ padding: 11, display: "flex", flexDirection: "column", gap: 9, flex: 1 }}>
            <div style={{ display: "flex", gap: 14 }}>
              <div>
                <Label>Garrison</Label>
                <div style={{ marginTop: 2 }}>
                  <Shield n={garrison} color={theme.textDim} />
                </div>
              </div>
              <div>
                <Label>Scrap / turn</Label>
                <div style={{ marginTop: 3 }}>
                  <Coin n={production} size={15} />
                </div>
              </div>
            </div>
            <div>
              <Label>Ability</Label>
              <div
                className="pc-prose"
                style={{
                  fontSize: 10.5,
                  color: loc.ability ? theme.textDim : theme.textFaint,
                  lineHeight: 1.4,
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
                        background: "rgba(0,0,0,0.2)",
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
    </div>
  );
}
