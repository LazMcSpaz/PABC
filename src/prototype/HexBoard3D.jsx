// The holographic board. Tiles are absolutely positioned at their projected
// centres and painted strictly in screen-y order, so a nearer tile always
// overlaps a farther one and tall art can bleed upward over the tile behind
// it — which is the whole point of moving off the flat top-down grid.
//
// Three stacked layers, in paint order:
//
//   tiles    the art, one HexTile per hex, z-ordered by y
//   overlay  the Loyalty radials, floating above every tile
//   hits     one invisible polygon per hex, taking all the clicks
//
// The hit layer exists because tiles overlap heavily now: rectangular tile
// boxes would steal each other's clicks, and a tall mountain's bounding box
// covers half the board. Hit-testing against the projected TOP FACE means you
// select the ground you pointed at, and the top faces never overlap each other
// at this spacing, so there is no ambiguity left to resolve.
import { LOCATIONS, fullController } from "./data.js";
import HexTile from "./HexTile.jsx";
import FloatingControlMeter from "./FloatingControlMeter.jsx";
import { buildHexGeometry, paintOrder, topFacePolygon } from "./hexProjection.js";

function isHeldBy(hex, fid) {
  if (!hex || hex.type !== "location" || !hex.control) return false;
  return fullController(hex.control.sections) === fid;
}

export default function HexBoard3D({
  state,
  selectedHexId,
  selectedUnitId,
  dimmedUnitUid,
  highlightedFactionId,
  reachable,
  onSelect,
  onUnitClick,
}) {
  const geom = buildHexGeometry(state.rows);
  const order = paintOrder(geom.centers);

  return (
    <div
      className="pc-board3d"
      style={{ position: "relative", width: geom.width, height: geom.height }}
    >
      {order.map((hexId, i) => {
        const hex = state.hexes[hexId];
        if (!hex) return null;
        const c = geom.centers[hexId];
        const units = (hex.unitIds || []).map((id) => state.units[id]).filter(Boolean);
        return (
          <div key={hexId} style={{ position: "absolute", left: c.x, top: c.y, zIndex: i + 1 }}>
            <HexTile
              hex={hex}
              units={units}
              selected={hexId === selectedHexId}
              reachable={reachable?.has(hexId) || false}
              selectedUnitId={selectedUnitId}
              dimmedUnitUid={dimmedUnitUid}
              factionHighlight={highlightedFactionId && isHeldBy(hex, highlightedFactionId)}
              onUnitClick={onUnitClick}
            />
          </div>
        );
      })}

      {/* Radials float in their own layer above every tile. That means a
          nearer tile never occludes a farther tile's meter — a deliberate
          trade of a little depth realism for a reading you need every turn. */}
      <div style={{ position: "absolute", inset: 0, zIndex: 9000, pointerEvents: "none" }}>
        {order.map((hexId) => {
          const hex = state.hexes[hexId];
          if (!hex || hex.type !== "location" || hex.fog === "unexplored" || !hex.control) return null;
          const c = geom.centers[hexId];
          return (
            <FloatingControlMeter
              key={`meter-${hexId}`}
              x={c.x}
              y={c.y}
              name={LOCATIONS[hex.locationId]?.name}
              control={hex.control}
              locationId={hex.locationId}
              dim={hex.fog === "explored"}
            />
          );
        })}
      </div>

      <svg
        width={geom.width}
        height={geom.height}
        style={{ position: "absolute", inset: 0, zIndex: 9500 }}
      >
        {order.map((hexId) => {
          const c = geom.centers[hexId];
          const hex = state.hexes[hexId];
          return (
            <polygon
              key={`hit-${hexId}`}
              points={topFacePolygon(0, c.x, c.y)}
              fill="transparent"
              style={{ cursor: reachable?.has(hexId) ? "pointer" : "default" }}
              onClick={() => onSelect(hexId)}
            >
              <title>{hex?.type === "location" ? LOCATIONS[hex.locationId]?.name || "" : ""}</title>
            </polygon>
          );
        })}
      </svg>
    </div>
  );
}
