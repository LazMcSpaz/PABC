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
import { LOCATIONS, FACTIONS, ownerColor, theme } from "./data.js";
import { holoTint, tintStrength } from "./holoTint.js";
import {
  FRAME, HEX_W, HEX_H, SKIRT_H, UNIT, layerUrl, tileFor, topFacePolygon,
} from "./hexProjection.js";

// Unit tokens sit on the near apron of the top face, not out on the terrain.
// Baked art carries no depth information, so there is no way to know how tall
// the ground is under an arbitrary point — a token placed over a summit would
// float or sink. The apron is the one region whose height is the ground plane
// on every tile in the set.
// Slots are laid out symmetrically about the centre for however many tokens
// are actually here, so a lone unit stands in the middle of its tile instead
// of clinging to the left edge. `y` bows outward with `x` to follow the
// apron's near boundary.
const MAX_SLOTS = 5;
const SLOT_SPACING = 0.155;

function slotPos(i, count) {
  const n = Math.min(count || 1, MAX_SLOTS);
  const idx = Math.min(i, n - 1);
  const x = (idx - (n - 1) / 2) * SLOT_SPACING;
  const y = 0.44 - Math.abs(x) * 0.45;
  return { left: x * HEX_W, top: y * HEX_H };
}

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
        top: layer.dy * UNIT,
        width: layer.w * UNIT,
        height: layer.h * UNIT,
        pointerEvents: "none",
        ...style,
      }}
    />
  );
}

export default function HexTile({
  hex,
  units,
  selected,
  reachable,
  selectedUnitId,
  dimmedUnitUid,
  factionHighlight,
  onUnitClick,
}) {
  const fog = hex.fog || "visible";
  const isUnexplored = fog === "unexplored";
  const isLocation = hex.type === "location" && !isUnexplored;
  const loc = isLocation ? LOCATIONS[hex.locationId] : null;

  const tile = tileFor(hex, loc?.value);
  const tint = holoTint(hex);
  const strength = tintStrength(hex, tint);

  // Selection and reachability ride the top face itself, so the highlight
  // traces the ground the click will actually land on.
  let ring = null;
  if (selected) ring = { color: theme.accent, width: 2.6, dash: null };
  else if (reachable) ring = { color: theme.good, width: 2.2, dash: null };
  else if (hex.zocOwner && !isUnexplored) {
    // Dashed = influence, solid = ownership. Hotter when one of YOUR units is
    // standing on someone else's ground.
    ring = {
      color: ownerColor(hex.zocOwner),
      width: hex.zocTrespassing ? 2.6 : 1.6,
      dash: hex.zocTrespassing ? "6 4" : "8 6",
      opacity: hex.zocTrespassing ? 1 : 0.7,
    };
  }

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
              top: tile.layers.holo.dy * UNIT,
              width: tile.layers.holo.w * UNIT,
              height: tile.layers.holo.h * UNIT,
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
        {!isUnexplored && hex.road && (
          <line
            x1={-HEX_W * 0.44} y1={HEX_H * 0.06} x2={HEX_W * 0.44} y2={HEX_H * 0.06}
            stroke="#b9a47e" strokeWidth={HEX_H * 0.07} strokeLinecap="round"
            opacity={0.5} strokeDasharray="9 7"
          />
        )}
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

      {!isUnexplored && (units || []).map((u, i) => (
        <UnitToken
          key={u.uid}
          unit={u}
          slot={i}
          count={units.length}
          selected={u.uid === selectedUnitId}
          dim={u.uid === dimmedUnitUid}
          onClick={onUnitClick}
        />
      ))}
      {(hex.ghosts || []).map((g, i, all) => (
        <GhostToken key={`ghost-${i}`} ghost={g} slot={i} count={all.length} />
      ))}

      {hex.type === "encounter" && !isUnexplored && <EncounterMark />}
      {hex.loot > 0 && !isUnexplored && <LootMarker count={hex.loot} />}
    </div>
  );
}

// A token standing on the plinth's near apron, with a contact ellipse so it
// reads as resting on the tile rather than hovering over it.
function UnitToken({ unit, selected, slot = 0, count = 1, onClick, dim = false }) {
  const faction = FACTIONS[unit.owner] || { name: unit.owner || "Unknown", color: "#888" };
  const pos = slotPos(slot, count);
  const size = selected ? 30 : 27;
  return (
    <div
      data-unit-uid={unit.uid}
      title={`${unit.name} — ${faction.name}`}
      onClick={(e) => {
        if (!onClick) return;
        e.stopPropagation();
        onClick(unit);
      }}
      style={{
        position: "absolute",
        left: pos.left,
        top: pos.top,
        transform: "translate(-50%, -100%)",
        pointerEvents: "auto",
        cursor: onClick ? "pointer" : undefined,
        opacity: dim ? 0.3 : 1,
        filter: dim ? "saturate(0.6) brightness(0.85)" : undefined,
        transition: "opacity .18s ease, filter .18s ease",
        zIndex: selected ? 4 : 3,
      }}
    >
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: `radial-gradient(circle at 36% 30%, ${faction.color}, #14110c 145%)`,
          border: selected ? `2px solid ${theme.accent}` : "2px solid #100d09",
          boxShadow: selected
            ? `0 3px 6px rgba(0,0,0,0.6), 0 0 16px ${theme.accent}`
            : `0 3px 6px rgba(0,0,0,0.6), 0 0 9px ${faction.color}99`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ fontFamily: theme.fontDisplay, fontSize: 12, fontWeight: 700, color: "#fff" }}>
          {unit.name[0]}
        </span>
      </div>
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: -3,
          transform: "translateX(-50%)",
          width: size * 0.9,
          height: size * 0.9 * (HEX_H / HEX_W),
          borderRadius: "50%",
          background: `radial-gradient(ellipse, ${faction.color}55, transparent 70%)`,
        }}
      />
    </div>
  );
}

function GhostToken({ ghost, slot = 0, count = 1 }) {
  const color = ownerColor(ghost.owner);
  const pos = slotPos(slot, count);
  return (
    <div
      title={`Last seen: ${FACTIONS[ghost.owner]?.name || ghost.owner} (Str ${ghost.strength}, round ${ghost.round})${ghost.false ? " — unverified" : " — may have moved"}`}
      style={{
        position: "absolute",
        left: pos.left,
        top: pos.top,
        transform: "translate(-50%, -100%)",
        width: 24,
        height: 24,
        borderRadius: "50%",
        background: `radial-gradient(circle at 36% 30%, ${color}66, #14110c 150%)`,
        border: `2px dashed ${color}aa`,
        opacity: 0.55,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        filter: "grayscale(0.3)",
        zIndex: 3,
      }}
    >
      <span style={{ fontFamily: theme.fontDisplay, fontSize: 11, fontWeight: 700, color: "#e8e2d4" }}>?</span>
    </div>
  );
}

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
