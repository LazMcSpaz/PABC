// One holographic board tile: a warm plinth with a recolourable hologram
// projected above it.
//
// Three baked layers (built by scripts/hex-tiles/build_tiles.py), composited
// per hex:
//
//   base   the plinth skirt. Plain image, never recoloured — the map table is
//          one shared object, only the projection above it changes hands.
//   holo   hologram intensity in its alpha, used as a CSS mask over a flat
//          faction-coloured div, blended additively. This is the recolour.
//   core   the white-hot rim lines, added back on top at partial strength so
//          the glow still reads as HOT rather than as flat coloured paint.
//
// Everything is positioned in source-image units off the hex centre and scaled
// by UNIT, so the layout survives a re-export at a different resolution.
import { memo } from "react";
import { LOCATIONS, theme } from "./data.js";
import { holoTint, tintStrength, hexRing } from "./holoTint.js";
import {
  FRAME, HEX_W, HEX_H, SKIRT_H, UNIT, UNIT_Y, layerUrl, tileFor, topFacePolygon,
} from "./hexProjection.js";

function Layer({ layer, style, className }) {
  return (
    <img
      className={className}
      src={layerUrl(layer.file)}
      alt=""
      draggable={false}
      style={{
        position: "absolute",
        left: layer.dx * UNIT,
        top: layer.dy * UNIT_Y,
        width: layer.w * UNIT,
        height: layer.h * UNIT_Y,
        pointerEvents: "none",
        ...style,
      }}
    />
  );
}

function HexTile({
  hex,
  selected,
  reachable,
  factionHighlight,
  onCoast = false,
}) {
  const fog = hex.fog || "visible";
  const isUnexplored = fog === "unexplored";
  const isLocation = hex.type === "location" && !isUnexplored;
  const loc = isLocation ? LOCATIONS[hex.locationId] : null;

  const tile = tileFor(hex, loc?.value, onCoast);
  const tint = holoTint(hex);
  const strength = tintStrength(hex, tint);

  // Selection and reachability ride the top face itself, so the highlight
  // traces the ground the click will actually land on. Shared with the
  // zoomed-out board (see holoTint.js) so both draw the same ring.
  const ring = hexRing(hex, { selected, reachable });

  const svgW = HEX_W + 8;
  const svgH = HEX_H + 8;

  return (
    <div
      className="pc-hex-tile"
      data-hex={hex.id}
      data-loc={isLocation ? hex.locationId : undefined}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        // plus-lighter needs its own stacking context to add against the tile
        // rather than against whatever the board happens to paint behind it.
        isolation: "isolate",
        pointerEvents: "none",
      }}
    >
      {/* The plinth is always there. Fog turns the PROJECTION off, not the map
          table — an unexplored hex still has to read as a tile you haven't
          surveyed, or the board's shape disappears into the background. */}
      <Layer
        layer={tile.layers.base}
        style={isUnexplored ? { filter: "brightness(0.62) saturate(0.5)" } : undefined}
      />

      {strength > 0 && (
        <>
          {/* the recolour: flat faction colour, shaped by the hologram mask */}
          <div
            style={{
              position: "absolute",
              left: tile.layers.holo.dx * UNIT,
              top: tile.layers.holo.dy * UNIT_Y,
              width: tile.layers.holo.w * UNIT,
              height: tile.layers.holo.h * UNIT_Y,
              background: tint.color,
              WebkitMaskImage: `url(${layerUrl(tile.layers.holo.file)})`,
              maskImage: `url(${layerUrl(tile.layers.holo.file)})`,
              WebkitMaskSize: "100% 100%",
              maskSize: "100% 100%",
              WebkitMaskRepeat: "no-repeat",
              maskRepeat: "no-repeat",
              mixBlendMode: "plus-lighter",
              opacity: strength,
              pointerEvents: "none",
              // control changing hands should read as the projection retuning,
              // not as a hard cut
              transition: "background-color .45s ease, opacity .45s ease",
              animation: tint.contested ? "pc-holo-contested 2.4s ease-in-out infinite" : undefined,
            }}
          />
          <Layer
            layer={tile.layers.core}
            style={{ mixBlendMode: "plus-lighter", opacity: 0.58 * strength }}
          />
        </>
      )}

      {/* rings, road and badges live in one SVG anchored on the hex centre */}
      <svg
        width={svgW}
        height={svgH}
        viewBox={`${-svgW / 2} ${-svgH / 2} ${svgW} ${svgH}`}
        style={{ position: "absolute", left: -svgW / 2, top: -svgH / 2, overflow: "visible", pointerEvents: "none" }}
      >
        {isUnexplored && (
          // A cold, unlit top face so an unsurveyed tile still has a
          // silhouette. Without it the board's extent vanishes into the
          // background and you cannot tell where the map ends.
          <polygon
            points={topFacePolygon(0.02)}
            fill="rgba(12,20,26,0.55)"
            stroke="rgba(120,150,170,0.22)"
            strokeWidth={1.1}
          />
        )}
        {ring && (
          <polygon
            points={topFacePolygon(0.06)}
            fill="none"
            stroke={ring.color}
            strokeWidth={ring.width}
            strokeDasharray={ring.dash || undefined}
            opacity={ring.opacity ?? 1}
            style={{ filter: `drop-shadow(0 0 5px ${ring.color}aa)` }}
          />
        )}
        {factionHighlight && (
          <polygon
            points={topFacePolygon(0.02)}
            fill="none"
            stroke={tint.color}
            strokeWidth={3}
            opacity={0.9}
            style={{ filter: `drop-shadow(0 0 12px ${tint.color})` }}
          />
        )}
      </svg>


      {hex.type === "encounter" && !isUnexplored && <EncounterMark />}
      {hex.loot > 0 && !isUnexplored && <LootMarker count={hex.loot} />}
    </div>
  );
}

// Memoised because the board re-renders whole. `hex` is rebuilt by the adapter
// once per tick and is stable within one, and every other prop is a primitive,
// so selecting a hex or hovering a faction now re-renders the two tiles that
// changed rather than all 127 — each of which would otherwise rebuild an image
// pair, a masked div and two blend layers.
export default memo(HexTile);



// An unresolved projection — the hologram equivalent of the old flat "?" tile.
function EncounterMark() {
  return (
    <div
      title="Encounter — resolves on arrival"
      style={{
        position: "absolute",
        left: 0,
        top: -HEX_H * 0.34,
        transform: "translate(-50%, -50%)",
        fontFamily: theme.fontDisplay,
        fontSize: 26,
        fontWeight: 700,
        color: "#9fd8ff",
        textShadow: "0 0 14px rgba(159,216,255,0.85)",
        opacity: 0.9,
        animation: "pc-holo-flicker 3.6s steps(1, end) infinite",
      }}
    >
      ?
    </div>
  );
}

function LootMarker({ count }) {
  return (
    <div
      title={`${count} salvageable chip${count === 1 ? "" : "s"} dropped here`}
      style={{
        position: "absolute",
        left: 0,
        top: HEX_H / 2 + SKIRT_H * 0.35,
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
      <span style={{ fontSize: 11, lineHeight: 1 }}>⚙</span>
      <span style={{ fontFamily: theme.fontDisplay, fontSize: 10, fontWeight: 700, color: theme.accent }}>
        {count}
      </span>
    </div>
  );
}

export { FRAME };
