// A location's card. Face-down (uncontrolled or contested) shows name,
// strategic value, victory-point worth and garrison. Face-up (fully
// held) reveals scrap production, the innate ability and chip slots.
// Fog of war keeps the detailed face hidden — and shown without a flip
// control — until a player fully controls the location.
import {
  LOCATIONS,
  STRATEGIC_VALUE,
  FACTIONS,
  fullController,
  locationProduction,
  theme,
} from "./data.js";
import { Label, Coin, Vp } from "./kit.jsx";
import Chip from "./Chip.jsx";
import GarrisonValue from "./GarrisonValue.jsx";

export default function LocationCard({ locationId, control, width = 210 }) {
  const loc = LOCATIONS[locationId];
  const ctrl = fullController(control?.sections);
  // Fog of war: the detailed face shows only once a player fully holds
  // the location. While contested or neutral the card stays face-down.
  const revealed = !!ctrl;
  if (!loc) return null;

  const value = STRATEGIC_VALUE[loc.value];
  const production = locationProduction(locationId, control);
  const faction = ctrl ? FACTIONS[ctrl] : null;
  const height = Math.round(width * 1.54);
  const chipW = Math.max(46, Math.round(width * 0.235));

  return (
    <div
      className="pc-flip"
      style={{ width, height, position: "relative", filter: "drop-shadow(0 6px 12px rgba(0,0,0,0.55))" }}
    >
      <div
        className="pc-flip-inner"
        style={{ transform: revealed ? "rotateY(180deg)" : "none" }}
      >
        {/* FACE-DOWN — uncontrolled or contested */}
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div>
              <Label>Garrison</Label>
              <div style={{ marginTop: 2 }}>
                <GarrisonValue locationId={locationId} control={control} />
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <Label>Victory Pts</Label>
              <div style={{ marginTop: 2 }}>
                <Vp n={loc.vp} size={15} />
              </div>
            </div>
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
                  <GarrisonValue locationId={locationId} control={control} />
                </div>
              </div>
              <div>
                <Label>Scrap / turn</Label>
                <div style={{ marginTop: 3 }}>
                  <Coin n={production} size={15} />
                </div>
              </div>
              <div>
                <Label>Victory Pts</Label>
                <div style={{ marginTop: 3 }}>
                  <Vp n={loc.vp} size={15} />
                </div>
              </div>
            </div>
            <div>
              <Label>Ability</Label>
              <div
                className="pc-prose"
                style={{
                  fontSize: 10.5,
                  color: control?.ability || loc.ability ? theme.textDim : theme.textFaint,
                  lineHeight: 1.4,
                  marginTop: 3,
                }}
              >
                {control?.ability ? (
                  <>
                    <strong style={{ color: theme.text }}>{control.ability.name}</strong>
                    {" — "}
                    {control.ability.text}
                  </>
                ) : (
                  loc.ability || "No innate ability."
                )}
              </div>
            </div>
            <div style={{ marginTop: "auto" }}>
              <Label>{`Chip slots — ${control?.chips?.length || 0}/${control?.chipSlots ?? loc.chipSlots}`}</Label>
              <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                {Array.from({ length: control?.chipSlots ?? loc.chipSlots }).map((_, i) => {
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
