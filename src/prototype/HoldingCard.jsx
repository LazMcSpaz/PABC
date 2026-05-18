// A wide landscape card for a location the player fully holds, shown in
// the bottom dock's Holdings tab. Stats run horizontally so two tiles
// fit per row across the bar; the dock lays them out in a 2-column grid.
import {
  LOCATIONS,
  FACTIONS,
  fullController,
  locationProduction,
  theme,
} from "./data.js";
import { Label, Coin, Vp } from "./kit.jsx";
import Chip from "./Chip.jsx";
import GarrisonValue from "./GarrisonValue.jsx";

function StatCol({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export default function HoldingCard({ locationId, control }) {
  const loc = LOCATIONS[locationId];
  if (!loc) return null;
  const ctrl = fullController(control?.sections);
  const faction = ctrl ? FACTIONS[ctrl] : null;
  const production = locationProduction(locationId, control);
  const chipCount = control?.chips?.length || 0;

  return (
    <div
      style={{
        width: "100%",
        background: theme.plate,
        border: `1px solid ${theme.border}`,
        borderRadius: 8,
        overflow: "hidden",
        boxShadow: `${theme.shadow}, inset 0 1px 0 rgba(255,255,255,0.05)`,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* faction banner */}
      <div
        style={{
          background: faction
            ? `linear-gradient(180deg, ${faction.color}, ${faction.color}99)`
            : theme.panel3,
          padding: "6px 12px",
          borderBottom: "1px solid rgba(0,0,0,0.5)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 10,
        }}
      >
        <span
          style={{
            fontFamily: theme.fontDisplay,
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: 0.6,
            color: "#fff",
            textShadow: "0 1px 3px rgba(0,0,0,0.7)",
          }}
        >
          {loc.name}
        </span>
        <span
          style={{
            fontSize: 8.5,
            fontWeight: 600,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.85)",
            whiteSpace: "nowrap",
          }}
        >
          {faction ? `Held — ${faction.name}` : "Uncontrolled"}
        </span>
      </div>

      {/* body — stats row, then chip slots */}
      <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 24 }}>
          <StatCol label="Garrison">
            <GarrisonValue locationId={locationId} control={control} height={15} fontSize={15} />
          </StatCol>
          <StatCol label="Scrap / turn">
            <Coin n={production} size={15} />
          </StatCol>
          <StatCol label="Victory Pts">
            <Vp n={loc.vp} size={15} />
          </StatCol>
        </div>
        <div>
          <Label>{`Chip slots — ${chipCount}/${loc.chipSlots}`}</Label>
          <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
            {Array.from({ length: loc.chipSlots }).map((_, i) => {
              const chipId = control?.chips?.[i];
              if (chipId) return <Chip key={i} chipId={chipId} width={50} />;
              return (
                <div
                  key={i}
                  style={{
                    width: 50,
                    height: 60,
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
  );
}
