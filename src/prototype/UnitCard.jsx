// A unit's stat card — sits in the player's area beside the board.
// Shows effective Strength / Movement (base + chip deltas) and the
// 2-slot chip bay.
import { FACTIONS, unitEffective, theme } from "./data.js";
import { Label } from "./kit.jsx";
import Chip from "./Chip.jsx";

function StatBlock({ label, base, total, color }) {
  const delta = total - base;
  return (
    <div style={{ flex: 1 }}>
      <Label>{label}</Label>
      <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
        <span style={{ fontSize: 24, fontWeight: 800, color }}>{total}</span>
        {delta !== 0 && (
          <span style={{ fontSize: 10.5, color: theme.good, fontWeight: 700 }}>
            {base}
            <span style={{ color: theme.textFaint }}> +{delta}</span>
          </span>
        )}
      </div>
    </div>
  );
}

export default function UnitCard({ unit, width = 188 }) {
  const faction = FACTIONS[unit.owner];
  const eff = unitEffective(unit);

  return (
    <div
      style={{
        width,
        background: theme.panel2,
        border: `1px solid ${theme.border}`,
        borderTop: `3px solid ${faction.color}`,
        borderRadius: 8,
        padding: 11,
        display: "flex",
        flexDirection: "column",
        gap: 9,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: theme.text }}>{unit.name}</div>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: faction.color }}>
            {faction.name}
          </div>
        </div>
        {unit.immobilized && (
          <span
            style={{
              fontSize: 8.5,
              fontWeight: 800,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              color: theme.accent2,
              border: `1px solid ${theme.accent2}`,
              borderRadius: 4,
              padding: "2px 5px",
            }}
          >
            Immobilized
          </span>
        )}
      </div>

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
  );
}
