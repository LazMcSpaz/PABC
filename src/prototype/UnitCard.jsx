// A unit's stat card. Faction title banner, effective Strength /
// Movement (base + chip deltas), and the 2-slot chip bay.
import { FACTIONS, unitEffective, theme } from "./data.js";
import { Label } from "./kit.jsx";
import Chip from "./Chip.jsx";

function StatBlock({ label, base, total, color }) {
  const delta = total - base;
  return (
    <div style={{ flex: 1 }}>
      <Label>{label}</Label>
      <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
        <span style={{ fontFamily: theme.fontDisplay, fontSize: 27, fontWeight: 700, color }}>
          {total}
        </span>
        {delta !== 0 && (
          <span style={{ fontSize: 10, color: theme.good, fontWeight: 700 }}>
            {base}
            <span style={{ color: theme.textFaint }}> +{delta}</span>
          </span>
        )}
      </div>
    </div>
  );
}

export default function UnitCard({ unit, width = 190 }) {
  const faction = FACTIONS[unit.owner];
  const eff = unitEffective(unit);

  return (
    <div
      style={{
        width,
        flexShrink: 0,
        background: theme.plate,
        border: `1px solid ${theme.border}`,
        borderRadius: 8,
        overflow: "hidden",
        boxShadow: `${theme.shadow}, inset 0 1px 0 rgba(255,255,255,0.05)`,
      }}
    >
      {/* faction title banner */}
      <div
        style={{
          background: `linear-gradient(180deg, ${faction.color}, ${faction.color}99)`,
          padding: "6px 11px",
          borderBottom: "1px solid rgba(0,0,0,0.5)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: theme.fontDisplay,
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: 0.6,
              color: "#fff",
              textShadow: "0 1px 3px rgba(0,0,0,0.7)",
            }}
          >
            {unit.name}
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
            {faction.name}
          </div>
        </div>
        {unit.immobilized && (
          <span
            style={{
              fontFamily: theme.fontDisplay,
              fontSize: 8.5,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              color: "#fff",
              background: "rgba(0,0,0,0.4)",
              border: "1px solid rgba(0,0,0,0.5)",
              borderRadius: 3,
              padding: "2px 6px",
            }}
          >
            Immobilized
          </span>
        )}
      </div>

      <div style={{ padding: 11, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <StatBlock label="Strength" base={unit.strength} total={eff.strength} color={theme.accent2} />
          <div style={{ width: 1, background: theme.border }} />
          <StatBlock label="Movement" base={unit.movement} total={eff.movement} color={theme.accent} />
        </div>
        <div>
          <Label>Chip bay — {unit.chips.length}/2</Label>
          <div style={{ display: "flex", gap: 7, marginTop: 5 }}>
            {Array.from({ length: 2 }).map((_, i) => {
              const chipId = unit.chips[i];
              if (chipId) return <Chip key={i} chipId={chipId} width={62} />;
              return (
                <div
                  key={i}
                  style={{
                    width: 62,
                    height: Math.round(62 * 1.2),
                    borderRadius: 7,
                    border: `1.5px dashed ${theme.border}`,
                    background: "rgba(0,0,0,0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: theme.textFaint,
                    fontSize: 18,
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
