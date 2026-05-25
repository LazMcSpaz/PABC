// One board tile. Locations show a mini control meter; encounter tiles
// draw an encounter on arrival; terrain is passable filler.
import { LOCATIONS, FACTIONS, fullController, ownerColor, theme } from "./data.js";
import ControlMeter from "./ControlMeter.jsx";
import GarrisonValue from "./GarrisonValue.jsx";

const HEX_W = 150;
const HEX_H = Math.round(HEX_W * 1.1547);

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

function UnitToken({ unit, selected, slot = 0, onClick }) {
  const faction = FACTIONS[unit.owner];
  const pos = TOKEN_SLOTS[Math.min(slot, TOKEN_SLOTS.length - 1)];
  return (
    <div
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

export default function Hex({ hex, units, selected, reachable, selectedUnitId, onClick, onUnitClick }) {
  const isLocation = hex.type === "location";
  const loc = isLocation ? LOCATIONS[hex.locationId] : null;
  const ctrl = isLocation ? fullController(hex.control?.sections) : null;

  let rim = "#4a4231";
  if (hex.type === "encounter") rim = "#3c5b65";
  else if (isLocation) rim = ctrl ? ownerColor(ctrl) : "#5a5040";
  if (reachable) rim = theme.good;
  if (selected) rim = theme.accent;

  let filter = "drop-shadow(0 4px 4px rgba(0,0,0,0.55))";
  if (selected) filter = `drop-shadow(0 0 9px ${theme.accent}) ` + filter;
  else if (reachable) filter = `drop-shadow(0 0 8px ${theme.good}cc) ` + filter;
  else if (ctrl) filter = `drop-shadow(0 0 6px ${ownerColor(ctrl)}88) ` + filter;

  const cursor = reachable ? "pointer" : undefined;

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
          background: FILLS[hex.type],
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 5,
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
        {hex.type === "encounter" && (
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
        {hex.type === "terrain" && (
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
      {(units || []).map((u, i) => (
        <UnitToken
          key={u.uid}
          unit={u}
          slot={i}
          selected={u.uid === selectedUnitId}
          onClick={onUnitClick}
        />
      ))}
    </div>
  );
}
