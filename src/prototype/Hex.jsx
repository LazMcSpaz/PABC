// One board tile. Locations show a mini control meter; encounter tiles
// draw an encounter on arrival; terrain is passable filler.
import { LOCATIONS, FACTIONS, fullController, ownerColor, theme } from "./data.js";
import ControlMeter from "./ControlMeter.jsx";

const HEX_W = 116;
const HEX_H = Math.round(HEX_W * 1.1547);

export { HEX_W, HEX_H };

function UnitToken({ unit }) {
  const faction = FACTIONS[unit.owner];
  return (
    <div
      title={`${unit.name} — ${faction.name}`}
      style={{
        position: "absolute",
        left: "50%",
        bottom: "13%",
        transform: "translateX(-50%)",
        width: 24,
        height: 24,
        borderRadius: "50%",
        background: faction.color,
        border: "2px solid #14161a",
        boxShadow: "0 2px 4px rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 3,
      }}
    >
      <span style={{ fontSize: 10, fontWeight: 800, color: "#14161a" }}>
        {unit.name[0]}
      </span>
    </div>
  );
}

export default function Hex({ hex, unit, selected, onClick }) {
  const isLocation = hex.type === "location";
  const loc = isLocation ? LOCATIONS[hex.locationId] : null;
  const ctrl = isLocation ? fullController(hex.control?.sections) : null;

  let fill = "#262922";
  let border = "#373d33";
  if (hex.type === "encounter") {
    fill = "#1f2d33";
    border = "#36525c";
  } else if (isLocation) {
    fill = "#2c2a24";
    border = ctrl ? ownerColor(ctrl) : "#4c4c4c";
  }
  if (selected) border = theme.accent;

  return (
    <div
      className="pc-hex-cell"
      onClick={onClick}
      style={{
        width: HEX_W,
        height: HEX_H,
        position: "relative",
        filter: selected ? `drop-shadow(0 0 6px ${theme.accent})` : "none",
      }}
    >
      <div className="pc-hex" style={{ position: "absolute", inset: 0, background: border }} />
      <div
        className="pc-hex"
        style={{
          position: "absolute",
          inset: selected ? 4 : 3,
          background: fill,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 3,
        }}
      >
        {isLocation && (
          <>
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: theme.text,
                letterSpacing: 0.3,
                textShadow: "0 1px 2px #000",
              }}
            >
              {loc.name}
            </div>
            <ControlMeter
              sections={hex.control.sections}
              foothold={hex.control.foothold}
              footholdCap={hex.control.footholdCap}
              size={42}
            />
            <div style={{ fontSize: 9, color: theme.textDim, fontWeight: 700 }}>
              GAR {loc.garrison}
            </div>
          </>
        )}
        {hex.type === "encounter" && (
          <>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#5e8a99" }}>?</div>
            <div
              style={{
                fontSize: 8.5,
                letterSpacing: 1,
                textTransform: "uppercase",
                color: "#5e8a99",
                fontWeight: 700,
              }}
            >
              Encounter
            </div>
          </>
        )}
        {hex.type === "terrain" && (
          <div
            style={{
              fontSize: 8.5,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: theme.textFaint,
              fontWeight: 700,
            }}
          >
            Terrain
          </div>
        )}
      </div>
      {unit && <UnitToken unit={unit} />}
    </div>
  );
}
