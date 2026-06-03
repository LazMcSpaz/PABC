// One board tile. Locations show a mini control meter; encounter tiles
// draw an encounter on arrival; terrain is passable filler.
import { LOCATIONS, FACTIONS, fullController, ownerColor, theme } from "./data.js";
import ControlMeter from "./ControlMeter.jsx";
import GarrisonValue from "./GarrisonValue.jsx";
import { HEX_W, HEX_H } from "./hexDims.js";

export { HEX_W, HEX_H };

const FILLS = {
  terrain: "linear-gradient(165deg, #3b3526 0%, #211c14 100%)",
  encounter: "linear-gradient(165deg, #284149 0%, #131f27 100%)",
  location: "linear-gradient(165deg, #3f3526 0%, #221c13 100%)",
};

// Token slots around the upper arc of the hex, filled right → top →
// left with two in-between positions (1:30 and 10:30) so several units
// on one hex don't stack. Percentages are the token centre within the
// hex cell; translate(-50%,-50%) anchors on the point.
const TOKEN_SLOTS = [
  { left: "84%", top: "50%" }, // 3:00  (right)
  { left: "74%", top: "29%" }, // 1:30
  { left: "50%", top: "20%" }, // 12:00 (top)
  { left: "26%", top: "29%" }, // 10:30
  { left: "16%", top: "50%" }, // 9:00  (left)
];

function UnitToken({ unit, selected, slot = 0, onClick, dim = false }) {
  // Fall back for any faction id the UI table doesn't know (so an
  // unexpected owner never blanks the board).
  const faction = FACTIONS[unit.owner] || { name: unit.owner || "Unknown", color: "#888" };
  const pos = TOKEN_SLOTS[Math.min(slot, TOKEN_SLOTS.length - 1)];
  return (
    <div
      data-unit-uid={unit.uid}
      title={`${unit.name} — ${faction.name}`}
      onClick={(e) => {
        if (!onClick) return;
        e.stopPropagation();
        onClick(unit);
      }}
      style={{
        position: "absolute",
        top: pos.top,
        left: pos.left,
        transform: "translate(-50%, -50%)",
        width: selected ? 34 : 30,
        height: selected ? 34 : 30,
        borderRadius: "50%",
        background: `radial-gradient(circle at 36% 30%, ${faction.color}, #14110c 145%)`,
        border: selected ? `2px solid ${theme.accent}` : "2px solid #100d09",
        boxShadow: selected
          ? `0 3px 6px rgba(0,0,0,0.6), 0 0 16px ${theme.accent}, inset 0 1px 2px rgba(255,255,255,0.3)`
          : `0 3px 6px rgba(0,0,0,0.6), 0 0 9px ${faction.color}99, inset 0 1px 2px rgba(255,255,255,0.3)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: selected ? 4 : 3,
        cursor: onClick ? "pointer" : undefined,
        opacity: dim ? 0.3 : 1,
        filter: dim ? "saturate(0.6) brightness(0.85)" : undefined,
        transition: "opacity .18s ease, filter .18s ease",
      }}
    >
      <span style={{ fontFamily: theme.fontDisplay, fontSize: 13, fontWeight: 700, color: "#fff" }}>
        {unit.name[0]}
      </span>
    </div>
  );
}

function Plaque({ children }) {
  return (
    <div
      style={{
        fontFamily: theme.fontDisplay,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: 0.6,
        color: theme.text,
        background: "rgba(0,0,0,0.5)",
        border: "1px solid rgba(0,0,0,0.55)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
        padding: "1px 9px",
        borderRadius: 3,
      }}
    >
      {children}
    </div>
  );
}

export default function Hex({ hex, units, selected, reachable, selectedUnitId, dimmedUnitUid, factionHighlight, onClick, onUnitClick }) {
  // §19 fog state — "visible" (live) | "explored" (remembered, dimmed) |
  // "unexplored" (black). Drives whether live details render at all.
  const fog = hex.fog || "visible";
  const isUnexplored = fog === "unexplored";
  const isExplored = fog === "explored";
  const isLocation = hex.type === "location" && !isUnexplored;
  const loc = isLocation ? LOCATIONS[hex.locationId] : null;
  const ctrl = isLocation ? fullController(hex.control?.sections) : null;
  // §18.3 — soft ZoC tint (only present on visible hexes via the adapter).
  const zocColor = hex.zocOwner ? ownerColor(hex.zocOwner) : null;
  // Diplomacy drawer asks us to glow this faction-held Location while
  // its detail view is open.
  const factionGlow = factionHighlight && ctrl ? ownerColor(ctrl) : null;

  let rim = "#4a4231";
  if (isUnexplored) rim = "#1b1813";
  else if (hex.type === "encounter") rim = "#3c5b65";
  else if (isLocation) rim = ctrl ? ownerColor(ctrl) : "#5a5040";
  if (reachable) rim = theme.good;
  if (selected) rim = theme.accent;

  let filter = "drop-shadow(0 4px 4px rgba(0,0,0,0.55))";
  if (factionGlow) filter = `drop-shadow(0 0 14px ${factionGlow}) ` + filter;
  if (selected) filter = `drop-shadow(0 0 9px ${theme.accent}) ` + filter;
  else if (reachable) filter = `drop-shadow(0 0 8px ${theme.good}cc) ` + filter;
  else if (ctrl) filter = `drop-shadow(0 0 6px ${ownerColor(ctrl)}88) ` + filter;

  const cursor = reachable ? "pointer" : undefined;
  // Dim everything inside an explored-but-not-visible hex; black out the
  // unexplored. Live hexes render at full strength.
  const contentOpacity = isUnexplored ? 0 : isExplored ? 0.5 : 1;

  return (
    <div
      className="pc-hex-cell"
      data-hex={hex.id}
      onClick={onClick}
      style={{ width: HEX_W, height: HEX_H, position: "relative", filter, cursor }}
    >
      {/* beveled rim */}
      <div
        className="pc-hex"
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(160deg, rgba(255,255,255,0.16), rgba(0,0,0,0.4)), ${rim}`,
        }}
      />
      {/* fill */}
      <div
        className="pc-hex"
        style={{
          position: "absolute",
          inset: selected ? 4 : 3,
          background: isUnexplored ? "linear-gradient(165deg, #0d0b08 0%, #060504 100%)" : FILLS[hex.type],
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 5,
          // Dim explored hexes; the unexplored keep their opaque black fill
          // but render no inner detail (gated below).
          opacity: isExplored ? contentOpacity : 1,
          // §19.4 — a faint texture cue for known terrain features.
          filter: hex.elevation ? "brightness(1.15) contrast(1.1)" : hex.cover ? "saturate(1.4) brightness(0.92)" : undefined,
        }}
      >
        {isLocation && (
          <>
            <Plaque>{loc.name}</Plaque>
            <ControlMeter
              sections={hex.control.sections}
              loyalty={hex.control.loyalty}
              danger={hex.control.loyaltyDanger}
              size={54}
            />
            <GarrisonValue
              locationId={hex.locationId}
              control={hex.control}
              height={11}
              fontSize={11}
              pill
            />
          </>
        )}
        {hex.type === "encounter" && !isUnexplored && (
          <>
            <div
              style={{
                fontFamily: theme.fontDisplay,
                fontSize: 36,
                fontWeight: 700,
                color: "#7ab0c0",
                textShadow: "0 0 14px rgba(110,168,184,0.7)",
                lineHeight: 1,
              }}
            >
              ?
            </div>
            <div
              style={{
                fontSize: 9,
                letterSpacing: 1.4,
                textTransform: "uppercase",
                color: "#6b97a4",
                fontWeight: 600,
              }}
            >
              Encounter
            </div>
          </>
        )}
        {hex.type === "terrain" && !isUnexplored && (
          <div
            style={{
              fontSize: 9,
              letterSpacing: 1.6,
              textTransform: "uppercase",
              color: theme.textFaint,
              fontWeight: 600,
            }}
          >
            Wasteland
          </div>
        )}
      </div>
      {/* §16.2 road — a worn corridor across the hex (movement modifier).
          Drawn over the fill, under the ZoC tint and tokens. */}
      {!isUnexplored && hex.road && <RoadBand />}
      {/* §18.3 ZoC overlay — a faint inner tint + glow in the dominating
          faction's color, layered over the fill but under the tokens. */}
      {zocColor && (
        <div
          className="pc-hex"
          title={`Zone of Control — ${FACTIONS[hex.zocOwner]?.name || hex.zocOwner}`}
          style={{
            position: "absolute",
            inset: selected ? 4 : 3,
            background: `radial-gradient(circle at 50% 45%, ${zocColor}33 0%, ${zocColor}14 55%, transparent 78%)`,
            boxShadow: `inset 0 0 14px ${zocColor}55`,
            pointerEvents: "none",
            zIndex: 2,
          }}
        />
      )}
      {(units || []).map((u, i) => (
        <UnitToken
          key={u.uid}
          unit={u}
          slot={i}
          selected={u.uid === selectedUnitId}
          dim={u.uid === dimmedUnitUid}
          onClick={onUnitClick}
        />
      ))}
      {/* §19.2 ghosts — dimmed last-known enemy markers (stale intel). */}
      {(hex.ghosts || []).map((g, i) => (
        <GhostToken key={`ghost-${i}`} ghost={g} slot={i} />
      ))}
      {/* §19.4 terrain feature badge on known hexes. */}
      {!isUnexplored && (hex.elevation || hex.cover) && (
        <TerrainBadge elevation={hex.elevation} cover={hex.cover} />
      )}
      {hex.loot > 0 && <LootMarker count={hex.loot} />}
    </div>
  );
}

// A dimmed marker for an enemy unit last seen here — frozen at its
// last-known strength and round, so it reads as stale intel (§19.2).
function GhostToken({ ghost, slot = 0 }) {
  const color = ownerColor(ghost.owner);
  const pos = TOKEN_SLOTS[Math.min(slot, TOKEN_SLOTS.length - 1)];
  return (
    <div
      title={`Last seen: ${FACTIONS[ghost.owner]?.name || ghost.owner} (Str ${ghost.strength}, round ${ghost.round})${ghost.false ? " — unverified" : " — may have moved"}`}
      style={{
        position: "absolute",
        top: pos.top,
        left: pos.left,
        transform: "translate(-50%, -50%)",
        width: 26,
        height: 26,
        borderRadius: "50%",
        background: `radial-gradient(circle at 36% 30%, ${color}66, #14110c 150%)`,
        border: `2px dashed ${color}aa`,
        opacity: 0.55,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 3,
        filter: "grayscale(0.3)",
      }}
    >
      <span style={{ fontFamily: theme.fontDisplay, fontSize: 12, fontWeight: 700, color: "#e8e2d4" }}>?</span>
    </div>
  );
}

// §16.2 — a road corridor: a worn tan band with a dashed centre line crossing
// the hex. Purely cosmetic; the movement effect lives in board.movementField.
function RoadBand() {
  return (
    <div
      title="Road — ignores terrain movement cost (a fast, contestable lane)"
      style={{
        position: "absolute",
        top: "50%",
        left: "8%",
        right: "8%",
        height: 12,
        transform: "translateY(-50%)",
        borderRadius: 6,
        background: "linear-gradient(180deg, #b9a47e, #8a7757)",
        boxShadow: "inset 0 1px 1px rgba(255,255,255,0.25), 0 1px 2px rgba(0,0,0,0.5)",
        opacity: 0.9,
        zIndex: 1,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <div style={{ width: "100%", height: 2, background: "repeating-linear-gradient(90deg, rgba(40,32,20,0.7) 0 8px, transparent 8px 16px)" }} />
    </div>
  );
}

function TerrainBadge({ elevation, cover }) {
  return (
    <div
      title={elevation ? "High ground — extends sight, blocks line of sight behind it" : "Cover — reduces sight, conceals units"}
      style={{
        position: "absolute",
        top: "8%",
        left: "12%",
        fontSize: 13,
        lineHeight: 1,
        zIndex: 4,
        textShadow: "0 1px 2px rgba(0,0,0,0.8)",
        pointerEvents: "none",
      }}
    >
      {elevation ? "▲" : "🌲"}
    </div>
  );
}

// Dropped-chip pile sitting on a hex (v0.2). A unit ending its move here
// may claim it. Pinned to the lower arc so it clears the unit tokens.
function LootMarker({ count }) {
  return (
    <div
      title={`${count} salvageable chip${count === 1 ? "" : "s"} dropped here`}
      style={{
        position: "absolute",
        top: "78%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        display: "flex",
        alignItems: "center",
        gap: 3,
        padding: "1px 6px",
        borderRadius: 9,
        background: "rgba(20,17,13,0.92)",
        border: `1.5px solid ${theme.accent}`,
        boxShadow: `0 0 10px ${theme.accent}99`,
        zIndex: 5,
      }}
    >
      <span style={{ fontSize: 12, lineHeight: 1 }}>⚙</span>
      <span style={{ fontFamily: theme.fontDisplay, fontSize: 11, fontWeight: 700, color: theme.accent }}>
        {count}
      </span>
    </div>
  );
}
