// Persistent floating panel for the currently-selected unit. Shows
// faction, base + effective stats, status, and chip bay. Anchored
// bottom-left so it stays out of the way of the inspector and the
// event feed. X dismisses, which deselects the unit.
import { FACTIONS as UI_FACTIONS, theme } from "./data.js";
import { IconBtn, Label } from "./kit.jsx";

export default function UnitPanel({ unit, hex, onClose }) {
  if (!unit) return null;
  const f = UI_FACTIONS[unit.owner];
  const eff = {
    strength: unit.effectiveStrength ?? unit.strength,
    movement: unit.effectiveMovement ?? unit.movement,
  };

  return (
    <div
      style={{
        position: "absolute",
        left: 14,
        // Sit clear of the bottom dock tab bar (44px tall, fixed) and
        // above its z-index so it never hides behind the dock.
        bottom: 58,
        width: 230,
        zIndex: 45,
        background: "rgba(20, 17, 13, 0.96)",
        border: `1px solid ${f?.color || theme.borderLit}`,
        borderRadius: 8,
        boxShadow: `0 8px 18px rgba(0,0,0,0.55), 0 0 14px ${(f?.color || theme.accent)}33`,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 9px 6px",
          background: `linear-gradient(180deg, ${f?.color || theme.accent}33, transparent)`,
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: `radial-gradient(circle at 36% 30%, ${f?.color}, #14110c 145%)`,
            border: "1.5px solid #100d09",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: theme.fontDisplay,
            fontWeight: 700,
            color: "#fff",
            fontSize: 11,
            flexShrink: 0,
          }}
        >
          {unit.name?.[0] || "?"}
        </span>
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15, flex: 1, minWidth: 0 }}>
          <span
            style={{
              fontFamily: theme.fontDisplay,
              fontSize: 13,
              fontWeight: 700,
              color: theme.text,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {unit.name}
          </span>
          <span
            style={{
              fontSize: 8.5,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: f?.color || theme.textDim,
              fontWeight: 600,
            }}
          >
            {f?.short || unit.owner} · selected
          </span>
        </div>
        <IconBtn title="Deselect" onClick={onClose}>✕</IconBtn>
      </div>

      <div style={{ padding: "8px 11px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 16 }}>
          <Stat label="Strength" base={unit.strength} total={eff.strength} color={theme.accent2} />
          <Stat label="Movement" base={unit.movement} total={eff.movement} color={theme.accent} />
          <Stat
            label="Status"
            base={null}
            total={unit.immobilized ? "Imm." : "Ready"}
            color={unit.immobilized ? theme.accent2 : theme.good}
            small
          />
        </div>
        {hex && (
          <div style={{ fontSize: 10, color: theme.textFaint }}>
            On {hex.locationId
              ? hex.locationId.replace(/[A-Z]/g, (c) => " " + c).trim()
              : hex.type} ({hex.id})
          </div>
        )}
        <div style={{ fontSize: 10, color: theme.textDim, lineHeight: 1.4 }}>
          Click a <span style={{ color: theme.good, fontWeight: 700 }}>green</span> hex to move.
          Open the location to Contest / Activate / Recruit.
        </div>
      </div>
    </div>
  );
}

function Stat({ label, base, total, color, small }) {
  const delta = typeof total === "number" && typeof base === "number" ? total - base : 0;
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <Label>{label}</Label>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span
          style={{
            fontFamily: theme.fontDisplay,
            fontSize: small ? 13 : 18,
            fontWeight: 700,
            color,
          }}
        >
          {total}
        </span>
        {delta > 0 && (
          <span style={{ fontSize: 9, color: theme.good, fontWeight: 700 }}>+{delta}</span>
        )}
      </div>
    </div>
  );
}
