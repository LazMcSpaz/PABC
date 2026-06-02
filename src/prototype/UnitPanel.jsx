// Persistent floating panel for the currently-selected unit. Holographic
// chrome matching the rest of the redesign — corner brackets, a faction-
// colour top accent, glowing icon nodes for the stats, a holo close × and
// a holo Reinforce action. Bottom-left anchored so it stays out of the
// way of the inspector and the event feed.
import { motion } from "framer-motion";
import { FACTIONS as UI_FACTIONS } from "./data.js";
import { C, CornerBrackets } from "./HudChrome.jsx";

const A = import.meta.env.BASE_URL;
const ICON_STRENGTH = `${A}assets/ui/icons/stats/unit_strength_icon.png`;

// Per-stat colour identity (matches the rest of the redesign).
const STR_COLOR = "#e0654a";  // coral — military / combat
const MOV_COLOR = C.gold;     // gold — logistics / resource-ish
const READY = "#7bb255";      // green
const STOPPED = "#d2453f";    // warning red

function MovementGlyph({ color, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 7 L13 12 L5 17" />
      <path d="M11 7 L19 12 L11 17" />
    </svg>
  );
}

function StatusGlyph({ color, blocked, size = 16 }) {
  if (blocked) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
        stroke={color} strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M6 18 L18 6" />
      </svg>
    );
  }
  // Ready — pulsing dot
  return (
    <motion.div
      animate={{ opacity: [0.55, 1, 0.55] }}
      transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      style={{
        width: 9, height: 9, borderRadius: "50%",
        background: color, boxShadow: `0 0 8px ${color}, 0 0 14px ${color}99`,
      }}
    />
  );
}

function StatCell({ color, icon, label, value, delta }) {
  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
      gap: 5, minWidth: 0,
    }}>
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 30, height: 30, borderRadius: "50%",
        background: "radial-gradient(circle at 50% 40%, rgba(19,42,44,0.95), rgba(4,10,11,0.96))",
        border: `1px solid ${color}`,
        boxShadow: `0 0 8px ${color}77, inset 0 0 6px rgba(0,0,0,0.5)`,
        flexShrink: 0,
      }}>
        {icon}
      </span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 3, lineHeight: 1 }}>
        <span style={{
          fontFamily: C.font, fontSize: 15, fontWeight: 700,
          color: "#f4efe2", textShadow: `0 0 8px ${color}`, whiteSpace: "nowrap",
        }}>{value}</span>
        {delta > 0 && (
          <span style={{ fontFamily: C.font, fontSize: 9, color: READY, fontWeight: 700 }}>+{delta}</span>
        )}
      </div>
      <span style={{
        fontFamily: C.font, fontSize: 8, letterSpacing: 1.6, textTransform: "uppercase",
        color, fontWeight: 600,
      }}>{label}</span>
    </div>
  );
}

function Tag({ color, children }) {
  return (
    <span style={{
      fontFamily: C.font, fontSize: 9, letterSpacing: 1.4, textTransform: "uppercase",
      fontWeight: 700, color, padding: "2px 7px", borderRadius: 3,
      border: `1px solid ${color}cc`, background: `${color}22`,
      boxShadow: `0 0 6px ${color}55`,
    }}>{children}</span>
  );
}

export default function UnitPanel({ unit, hex, canAct, reinforce, scrap, onReinforce, onClose }) {
  if (!unit) return null;
  const faction = UI_FACTIONS[unit.owner];
  const factionColor = faction?.color || C.holo;
  const eff = {
    strength: unit.effectiveStrength ?? unit.strength,
    movement: unit.effectiveMovement ?? unit.movement,
  };
  const canReinforce = canAct && reinforce && reinforce.deficit > 0;
  const affordable = reinforce && scrap >= reinforce.cost;

  const locationLabel = hex?.locationId
    ? hex.locationId.replace(/[A-Z]/g, (c) => " " + c).trim()
    : hex?.type;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ type: "spring", stiffness: 280, damping: 26 }}
      style={{
        position: "absolute",
        left: 14,
        bottom: 58,
        width: 270,
        zIndex: 45,
        background: "linear-gradient(158deg, rgba(18,31,32,0.93), rgba(9,17,18,0.95) 60%, rgba(6,11,12,0.97))",
        border: `1px solid ${C.holo}`,
        borderTop: `2px solid ${factionColor}`,
        borderRadius: 8,
        boxShadow: `inset 0 0 26px rgba(86,211,198,0.06), 0 0 20px rgba(86,211,198,0.18), 0 10px 22px rgba(0,0,0,0.5)`,
        color: "#cfd6dc",
      }}
    >
      {/* Top faction-colour accent line */}
      <div style={{
        position: "absolute", top: 0, left: 16, right: 16, height: 2,
        background: `linear-gradient(90deg, transparent, ${factionColor}, transparent)`,
        opacity: 0.85, pointerEvents: "none",
      }} />
      <CornerBrackets color={C.holo} len={11} inset={5} w={1.4} />

      {/* Header — faction emblem + name + close × */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 12px 8px",
        borderBottom: "1px solid rgba(86,211,198,0.22)",
      }}>
        <span style={{
          width: 26, height: 26, borderRadius: "50%",
          background: `radial-gradient(circle at 36% 30%, ${factionColor}, #14110c 145%)`,
          border: "1.5px solid #100d09",
          boxShadow: `0 0 10px ${factionColor}aa, inset 0 1px 2px rgba(255,255,255,0.3)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: C.font, fontWeight: 700, color: "#fff", fontSize: 12.5,
          flexShrink: 0,
        }}>
          {unit.name?.[0] || "?"}
        </span>
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1, flex: 1, minWidth: 0 }}>
          <span style={{
            fontFamily: C.font, fontSize: 13.5, fontWeight: 700,
            letterSpacing: 0.8, textTransform: "uppercase", color: "#f4efe2",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            textShadow: `0 0 10px ${factionColor}66`,
          }}>{unit.name}</span>
          <span style={{
            fontFamily: C.font, fontSize: 8.5, letterSpacing: 1.6, textTransform: "uppercase",
            color: factionColor, fontWeight: 600, marginTop: 2,
          }}>
            {faction?.short || unit.owner} · Selected
          </span>
        </div>
        <button
          onClick={onClose}
          title="Deselect"
          className="hud-int"
          style={{
            width: 22, height: 22, borderRadius: "50%",
            background: "rgba(6,14,15,0.85)",
            border: `1px solid ${C.holo}aa`,
            color: C.holoHi, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: C.font, fontSize: 13, fontWeight: 700, lineHeight: 1,
            padding: 0,
            boxShadow: `0 0 6px rgba(86,211,198,0.28)`,
          }}
        >×</button>
      </div>

      {/* Body */}
      <div style={{ padding: "10px 12px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Stat row */}
        <div style={{ display: "flex", gap: 6 }}>
          <StatCell
            color={STR_COLOR}
            icon={<img src={ICON_STRENGTH} alt="" style={{ width: 16, height: 16, objectFit: "contain", filter: `brightness(1.1) drop-shadow(0 0 4px ${STR_COLOR}aa)` }} />}
            label="Strength"
            value={eff.strength}
            delta={typeof eff.strength === "number" && typeof unit.strength === "number" ? eff.strength - unit.strength : 0}
          />
          <StatCell
            color={MOV_COLOR}
            icon={<MovementGlyph color={MOV_COLOR} />}
            label="Moves"
            value={`${unit.moveRemaining ?? eff.movement}/${eff.movement}`}
          />
          <StatCell
            color={unit.immobilized ? STOPPED : READY}
            icon={<StatusGlyph color={unit.immobilized ? STOPPED : READY} blocked={unit.immobilized} />}
            label="Status"
            value={unit.immobilized ? "Held" : "Ready"}
          />
        </div>

        {/* Tags */}
        {(unit.veteran || unit.fortified) && (
          <div style={{ display: "flex", gap: 6 }}>
            {unit.veteran && <Tag color={C.gold}>Veteran</Tag>}
            {unit.fortified && <Tag color={READY}>Fortified</Tag>}
          </div>
        )}

        {/* Location */}
        {hex && (
          <div style={{
            fontFamily: C.font, fontSize: 9.5, letterSpacing: 1.4, textTransform: "uppercase",
            color: "rgba(143,246,234,0.55)", display: "flex", alignItems: "center", gap: 6,
          }}>
            <span style={{
              display: "inline-block", width: 4, height: 4, borderRadius: "50%",
              background: C.holo, boxShadow: `0 0 5px ${C.holo}`,
            }} />
            On {locationLabel}{hex.id ? ` · ${hex.id}` : ""}
          </div>
        )}

        {/* Reinforce action */}
        {canReinforce && (
          <button
            onClick={() => onReinforce(unit.uid, reinforce.onFriendlyLoc ? "instant" : "field")}
            disabled={!affordable || (!reinforce.onFriendlyLoc && !reinforce.canField)}
            className="hud-int"
            style={{
              fontFamily: C.font, fontSize: 11, fontWeight: 700,
              letterSpacing: 1.4, textTransform: "uppercase",
              color: "#08100f", padding: "8px 10px", borderRadius: 5,
              border: `1px solid ${C.holo}`,
              background: `linear-gradient(180deg, ${C.holoHi}, ${C.holo})`,
              boxShadow: `0 0 12px ${C.holo}55`,
              cursor: (affordable && (reinforce.onFriendlyLoc || reinforce.canField)) ? "pointer" : "not-allowed",
              opacity: (affordable && (reinforce.onFriendlyLoc || reinforce.canField)) ? 1 : 0.5,
              textAlign: "center",
            }}
          >
            {reinforce.onFriendlyLoc
              ? `Reinforce here · ${reinforce.cost} scrap`
              : reinforce.canField
              ? `Send reinforcements · ${reinforce.cost} · ETA ${reinforce.eta}`
              : "No supply route"}
          </button>
        )}

        {/* Helper text */}
        <div style={{
          fontFamily: C.font, fontSize: 9, letterSpacing: 0.6, lineHeight: 1.5,
          color: "rgba(143,246,234,0.45)",
          paddingTop: 6, borderTop: "1px solid rgba(86,211,198,0.14)",
        }}>
          Click a <span style={{ color: READY, fontWeight: 700 }}>green</span> hex to move.
          Open the location to <span style={{ color: C.holoHi }}>Contest / Activate / Recruit</span>.
        </div>
      </div>
    </motion.div>
  );
}
