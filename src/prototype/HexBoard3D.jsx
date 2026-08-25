// The holographic board. Tiles are absolutely positioned at their projected
// centres and painted strictly in screen-y order, so a nearer tile always
// overlaps a farther one and tall art can bleed upward over the tile behind
// it — which is the whole point of moving off the flat top-down grid.
//
// Three stacked layers, in paint order:
//
//   tiles    the art, one HexTile per hex, z-ordered by y
//   routes   the road / rail network, over the tiles
//   hits     one invisible polygon per hex, taking clicks on bare ground
//   meters   the Loyalty radials, floating above the tiles
//   tokens   units and ghosts, top of the stack — above the hit layer so they
//            take their own clicks, and above the radials so a nearer city's
//            radial cannot bury a unit standing on the row behind it
//
// The hit layer exists because tiles overlap heavily now: rectangular tile
// boxes would steal each other's clicks, and a tall mountain's bounding box
// covers half the board. Hit-testing against the projected TOP FACE means you
// select the ground you pointed at, and the top faces never overlap each other
// at this spacing, so there is no ambiguity left to resolve.
//
// The tile layer has two representations. Zoomed in it is the art, one HexTile
// per hex. Zoomed out it collapses to a single SVG of flat tinted polygons
// (FlatTileLayer) — see boardLod.js. Only the TILE layer swaps: routes, tokens,
// radials and hit polygons are vector already and are drawn the same way at
// either level of detail.
import { useMemo } from "react";
import { LOCATIONS, fullController } from "./data.js";
import HexTile from "./HexTile.jsx";
import FlatTileLayer from "./FlatTileLayer.jsx";
import FloatingControlMeter from "./FloatingControlMeter.jsx";
import RouteNetwork, { useRouteNetwork } from "./RouteNetwork.jsx";
import BlockadeSprites from "./BlockadeSprites.jsx";
import BoardTokens from "./BoardTokens.jsx";
import InfluenceOverlay from "./InfluenceOverlay.jsx";
import PostMark from "./PostMark.jsx";
import SiteMark from "./SiteMark.jsx";
import { LOD_FLAT, useBoardLod } from "./boardLod.js";
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
  showInfluence,
  influenceThreshold,
  onSelect,
  onUnitClick,
}) {
  const lod = useBoardLod();
  // Geometry is a pure function of the row shape, which only changes when a new
  // game is set up — but the board re-renders on every tick, selection and
  // hover, so recomputing all three each time is pure waste on a 127-hex map.
  const { geom, order, coast } = useMemo(() => {
    const g = buildHexGeometry(state.rows);
    return {
      geom: g,
      order: paintOrder(g.centers),
      // The sea is off the map's east edge, so only rim hexes may draw the
      // (oriented) coast tiles.
      coast: eastRimHexes(state.rows),
    };
  }, [state.rows]);

  // One route network for the whole board. The road layer draws from it and the
  // blockades stand on its nodes, so building it twice would put the chain walk
  // and the curve fitting back on the hot path for nothing.
  const routeNet = useRouteNetwork(state.rows, state.hexes, geom.centers);

  return (
    <div
      className="pc-board3d"
      style={{ position: "relative", width: geom.width, height: geom.height }}
    >
      {lod === LOD_FLAT ? (
        <FlatTileLayer
          order={order}
          hexes={state.hexes}
          centers={geom.centers}
          width={geom.width}
          height={geom.height}
          selectedHexId={selectedHexId}
          reachable={reachable}
        />
      ) : (
        order.map((hexId, i) => {
          const hex = state.hexes[hexId];
          if (!hex) return null;
          const c = geom.centers[hexId];
          return (
            <div key={hexId} style={{ position: "absolute", left: c.x, top: c.y, zIndex: i + 1 }}>
              <HexTile
                hex={hex}
                selected={hexId === selectedHexId}
                reachable={reachable?.has(hexId) || false}
                factionHighlight={!!(highlightedFactionId && isHeldBy(hex, highlightedFactionId))}
                onCoast={coast.has(hexId)}
              />
            </div>
          );
        })
      )}

      {/* §11 — the influence heatmap, under the routes so a road still reads
          over it, over the tiles so the field is legible on art. Off by
          default: it answers a question the player asks deliberately. */}
      {showInfluence && (
        <InfluenceOverlay
          order={order}
          hexes={state.hexes}
          centers={geom.centers}
          width={geom.width}
          height={geom.height}
          threshold={influenceThreshold}
        />
      )}

      <RouteNetwork
        net={routeNet}
        rows={state.rows}
        hexes={state.hexes}
        centers={geom.centers}
        width={geom.width}
        height={geom.height}
      />

      {/* Blockades stand on their road, between the route lines and the units,
          so a unit posted at one reads as being in front of it. */}
      <BlockadeSprites
        hexes={state.hexes}
        centers={geom.centers}
        nodes={routeNet.road.nodes}
      />

      {/* §17.7 — listening posts. Their own layer, between the blockades and
          the unit tokens: a post is a structure a unit can stand next to, and
          it should not be buried under one. Concealment already decided which
          of these reach the adapter at all. */}
      <div style={{ position: "absolute", inset: 0, zIndex: 8900, pointerEvents: "none" }}>
        {order.map((hexId) => {
          const hex = state.hexes[hexId];
          const c = geom.centers[hexId];
          if (!hex?.post || !c) return null;
          return (
            <div key={hexId} style={{ position: "absolute", left: c.x - 10, top: c.y - 26 }}>
              <PostMark post={hex.post} size={20} />
            </div>
          );
        })}
      </div>

      {/* Quest sites you have been told about. Its own pass rather than a
          branch inside the post pass: a hex can carry both, and offsetting
          the two by a few pixels is the whole difference between "two things
          are standing here" and one silently drawing over the other.
          zIndex alongside the posts, for the same reason: the first version
          had none and the tile art drew straight over it — the mark was on
          the board and invisible, which is the exact bug this whole feature
          exists to fix. */}
      <div style={{ position: "absolute", inset: 0, zIndex: 8905, pointerEvents: "none" }}>
        {order.map((hexId) => {
          const hex = state.hexes[hexId];
          const c = geom.centers[hexId];
          if (!hex?.site || !c) return null;
          return (
            <div key={hexId} style={{ position: "absolute", left: c.x + 8, top: c.y - 28 }}>
              <SiteMark site={hex.site} size={22} />
            </div>
          );
        })}
      </div>

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
              ready={hex.fog === "visible" ? (hex.actionsReady || 0) : 0}
              dim={hex.fog === "explored"}
            />
          );
        })}
      </div>

      {/* Hit layer. It sits BELOW the tokens (8500), not on top: an SVG
          polygon with `fill="transparent"` is still painted as far as
          hit-testing is concerned, so a hit layer above the tokens silently
          swallowed every unit click. Above the routes so the whole hex stays
          clickable, below anything a player is meant to click directly. */}
      <svg
        width={geom.width}
        height={geom.height}
        style={{ position: "absolute", inset: 0, zIndex: 8200 }}
      >
        {order.map((hexId) => {
          const c = geom.centers[hexId];
          const hex = state.hexes[hexId];
          // Only a Location has anything to say in a tooltip. Emitting an empty
          // <title> for the rest doubled this layer's node count (117 of the
          // 127 on a huge map) to produce a blank tooltip on hover.
          const label = hex?.type === "location" ? LOCATIONS[hex.locationId]?.name : null;
          return (
            <polygon
              key={`hit-${hexId}`}
              points={topFacePolygon(0, c.x, c.y)}
              fill="transparent"
              style={{ cursor: reachable?.has(hexId) ? "pointer" : "default" }}
              onClick={() => onSelect(hexId)}
            >
              {label ? <title>{label}</title> : null}
            </polygon>
          );
        })}
      </svg>
    </div>
  );
}
