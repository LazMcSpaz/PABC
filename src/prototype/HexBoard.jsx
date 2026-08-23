// The hex field. Pointy-top hexes tile flush within a row; rows
// overlap vertically and centred rows interlock.
import Hex, { HEX_H } from "./Hex.jsx";
import { fullController } from "./data.js";

const ROW_OVERLAP = Math.round(HEX_H * 0.25);

// A location hex held by `fid` (full controller). Used to paint the
// diplomacy-drawer's "show me what they hold" glow without taking
// permanent space in the hex render.
function isHeldBy(hex, fid) {
  if (!hex || hex.type !== "location" || !hex.control) return false;
  return fullController(hex.control.sections) === fid;
}

export default function HexBoard({
  state,
  selectedHexId,
  selectedUnitId,
  dimmedUnitUid,
  highlightedFactionId,
  reachable,
  showInfluence,
  influenceThreshold,
  onSelect,
  onUnitClick,
}) {
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
            position: "relative",
            // Explicit, row-index-driven stacking so a row further
            // "south" always paints over the row(s) above it — needed
            // once isometric tile art with real height (a tower, a
            // hill) bleeds upward past its own hex box and needs to
            // visually overlap the tile behind it. Verified this is
            // NOT currently load-bearing: every Hex.jsx cell already
            // sets a non-"none" CSS `filter` (its drop-shadow), which
            // independently creates a stacking context per cell, so
            // cross-row order already falls out correctly from plain
            // DOM order today. This makes that ordering an explicit,
            // documented contract instead of a side effect of every
            // cell always having a filter — safe hardening, not a fix
            // for an observed bug.
            zIndex: rowIdx,
          }}
        >
          {row.map((hexId) => {
            const hex = state.hexes[hexId];
            const units = (hex.unitIds || []).map((id) => state.units[id]).filter(Boolean);
            return (
              <Hex
                key={hexId}
                hex={hex}
                units={units}
                selected={hexId === selectedHexId}
                reachable={reachable?.has(hexId) || false}
                selectedUnitId={selectedUnitId}
                dimmedUnitUid={dimmedUnitUid}
                factionHighlight={highlightedFactionId && isHeldBy(hex, highlightedFactionId)}
                showInfluence={showInfluence}
                influenceThreshold={influenceThreshold}
                onClick={() => onSelect(hexId)}
                onUnitClick={onUnitClick}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
