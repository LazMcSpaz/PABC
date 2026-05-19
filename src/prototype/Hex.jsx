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

function UnitToken({ unit }) {
  const faction = FACTIONS[unit.owner];
  return (
    <div
      title={`${unit.name} — ${faction.name}`}
      style={{
        position: "absolute",
        top: "50%",
        right: "7%",
        transform: "translateY(-50%)",
        width: 30,
        height: 30,
        borderRadius: "50%",
        background: `radial-gradient(circle at 36% 30%, ${faction.color}, #14110c 145%)`,
        border: "2px solid #100d09",
        boxShadow: `0 3px 6px rgba(0,0,0,0.6), 0 0 9px ${faction.color}99, inset 0 1px 2px rgba(255,255,255,0.3)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 3,
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

export default function Hex({ hex, unit, selected, onClick }) {
  const isLocation = hex.type === "location";
  const loc = isLocation ? LOCATIONS[hex.locationId] : null;
  const ctrl = isLocation ? fullController(hex.control?.sections) : null;

  let rim = "#4a4231";
  if (hex.type === "encounter") rim = "#3c5b65";
  else if (isLocation) rim = ctrl ? ownerColor(ctrl) : "#5a5040";
  if (selected) rim = theme.accent;

  let filter = "drop-shadow(0 4px 4px rgba(0,0,0,0.55))";
  if (selected) filter = `drop-shadow(0 0 9px ${theme.accent}) ` + filter;
  else if (ctrl) filter = `drop-shadow(0 0 6px ${ownerColor(ctrl)}88) ` + filter;

  return (
    <div
      className="pc-hex-cell"
      onClick={onClick}
      style={{ width: HEX_W, height: HEX_H, position: "relative", filter }}
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
              foothold={hex.control.foothold}
              footholdCap={hex.control.footholdCap}
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
      {unit && <UnitToken unit={unit} />}
    </div>
  );
}
