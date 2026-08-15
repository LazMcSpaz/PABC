// The holographic board. Tiles are absolutely positioned at their projected
// centres and painted strictly in screen-y order, so a nearer tile always
// overlaps a farther one and tall art can bleed upward over the tile behind
// it — which is the whole point of moving off the flat top-down grid.
//
// Three stacked layers, in paint order:
//
//   tiles    the art, one HexTile per hex, z-ordered by y
//   routes   the road / rail network, over the tiles
//   tokens   units and ghosts, over the routes
//   meters   the Loyalty radials, floating above everything
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
import RouteNetwork from "./RouteNetwork.jsx";
import BoardTokens from "./BoardTokens.jsx";
import { buildHexGeometry, eastRimHexes, paintOrder, topFacePolygon } from "./hexProjection.js";

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
  // The sea is off the map's east edge, so only rim hexes may draw the
  // (oriented) coast tiles.
  const coast = eastRimHexes(state.rows);

  return (
    <div
      className="pc-board3d"
      style={{ position: "relative", width: geom.width, height: geom.height }}
    >
      {order.map((hexId, i) => {
        const hex = state.hexes[hexId];
        if (!hex) return null;
        const c = geom.centers[hexId];
        return (
          <div key={hexId} style={{ position: "absolute", left: c.x, top: c.y, zIndex: i + 1 }}>
            <HexTile
              hex={hex}
              selected={hexId === selectedHexId}
              reachable={reachable?.has(hexId) || false}
              factionHighlight={highlightedFactionId && isHeldBy(hex, highlightedFactionId)}
              onCoast={coast.has(hexId)}
            />
          </div>
        );
      })}

      <RouteNetwork
        rows={state.rows}
        hexes={state.hexes}
        centers={geom.centers}
        width={geom.width}
        height={geom.height}
      />

      <BoardTokens
        order={order}
        hexes={state.hexes}
        units={state.units}
        centers={geom.centers}
        selectedUnitId={selectedUnitId}
        dimmedUnitUid={dimmedUnitUid}
        onUnitClick={onUnitClick}
      />

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
