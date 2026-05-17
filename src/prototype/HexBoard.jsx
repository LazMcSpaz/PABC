// The hex field — a 3/4/5/4/3 layout. Pointy-top hexes tile flush
// within a row; rows overlap vertically and centred rows interlock.
import Hex, { HEX_H } from "./Hex.jsx";
import { theme } from "./data.js";

const ROW_OVERLAP = Math.round(HEX_H * 0.25);

export default function HexBoard({ state, selectedHexId, onSelect }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "10px 0",
      }}
    >
      {state.rows.map((row, rowIdx) => (
        <div
          key={rowIdx}
          style={{
            display: "flex",
            justifyContent: "center",
            marginTop: rowIdx === 0 ? 0 : -ROW_OVERLAP,
          }}
        >
          {row.map((hexId) => {
            const hex = state.hexes[hexId];
            const unit = hex.unitId ? state.units[hex.unitId] : null;
            return (
              <Hex
                key={hexId}
                hex={hex}
                unit={unit}
                selected={hexId === selectedHexId}
                onClick={() => onSelect(hexId)}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
