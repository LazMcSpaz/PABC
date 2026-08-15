// The board's zoomed-out level of detail: every tile as one flat tinted
// hexagon, all of them in a single SVG.
//
// This replaces the entire per-hex tile stack — see boardLod.js for why, and
// for where the threshold lives. What matters here is that it is ONE element
// with N polygons rather than N elements each carrying images, a CSS mask and
// two blend layers: on a huge map that is the difference between ~900 DOM nodes
// and ~150, and between ~254 compositing layers and none.
//
// Everything it draws comes from the same source of truth the detailed tile
// uses — `holoTint`/`tintStrength` for colour, `hexRing` for the outline,
// `topFacePolygon` for the shape — so the two representations agree about who
// owns what, and a tile does not appear to change hands when you zoom.
import { holoTint, tintStrength, hexRing } from "./holoTint.js";
import { HEX_H, topFacePolygon } from "./hexProjection.js";
import { theme } from "./data.js";

// Unexplored ground keeps a cold unlit face, exactly as the detailed tile does,
// so the map's extent still reads when you zoom out to look at its shape —
// which is the main reason to zoom out at all.
const UNEXPLORED_FILL = "rgba(12,20,26,0.55)";
const UNEXPLORED_STROKE = "rgba(120,150,170,0.22)";

export default function FlatTileLayer({
  order,
  hexes,
  centers,
  width,
  height,
  selectedHexId,
  reachable,
}) {
  const rings = [];
  const marks = [];

  const faces = order.map((hexId) => {
    const hex = hexes[hexId];
    if (!hex) return null;
    const c = centers[hexId];
    const unexplored = hex.fog === "unexplored";
    const tint = holoTint(hex);
    const strength = tintStrength(hex, tint);

    // Rings and marks are collected as we go and painted in their own passes
    // afterwards, so a later tile's face can never cover an earlier tile's
    // outline. Within the face pass, paint order is still screen-y order.
    const ring = hexRing(hex, {
      selected: hexId === selectedHexId,
      reachable: reachable?.has(hexId) || false,
    });
    if (ring) {
      rings.push(
        <polygon
          key={`ring-${hexId}`}
          points={topFacePolygon(0.06, c.x, c.y)}
          fill="none"
          stroke={ring.color}
          strokeWidth={ring.width}
          strokeDasharray={ring.dash || undefined}
          opacity={ring.opacity}
        />,
      );
    }

    if (!unexplored && hex.type === "encounter") {
      marks.push(
        <text
          key={`enc-${hexId}`}
          x={c.x}
          y={c.y - HEX_H * 0.34}
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily={theme.fontDisplay}
          fontSize={26}
          fontWeight={700}
          fill="#9fd8ff"
          opacity={0.9}
        >
          ?
        </text>,
      );
    }
    if (!unexplored && hex.loot > 0) {
      // Salvage is a "go there" signal, so it survives the zoom-out; it just
      // loses the chrome of its full-detail badge and becomes a dot.
      marks.push(
        <circle
          key={`loot-${hexId}`}
          cx={c.x}
          cy={c.y + HEX_H * 0.34}
          r={5}
          fill={theme.accent}
          opacity={0.9}
        />,
      );
    }

    if (unexplored) {
      return (
        <polygon
          key={hexId}
          points={topFacePolygon(0.02, c.x, c.y)}
          fill={UNEXPLORED_FILL}
          stroke={UNEXPLORED_STROKE}
          strokeWidth={1.1}
        />
      );
    }

    return (
      <polygon
        key={hexId}
        points={topFacePolygon(0.02, c.x, c.y)}
        fill={tint.color}
        fillOpacity={strength * 0.82}
        stroke={tint.color}
        strokeOpacity={strength * 0.5}
        strokeWidth={1}
      />
    );
  });

  return (
    <svg
      width={width}
      height={height}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      // The tinted faces are flat paint, not a projection, so there is nothing
      // here that wants antialiasing off; the default is right.
    >
      {faces}
      {rings}
      {marks}
    </svg>
  );
}
