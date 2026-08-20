// Unit and ghost tokens for the holographic board.
//
// These live in their own layer above the tiles rather than inside each
// HexTile, because the route network has to paint over the tiles but under the
// tokens, and a tile is its own stacking context — nothing inside one can rise
// above a sibling tile. The cost is that a nearer tile no longer occludes a
// farther tile's tokens; the gain is that a unit is never buried under the
// mountain in front of it, which matters more for something you have to click.
import { useMemo } from "react";
import { FACTIONS, ownerColor, theme } from "./data.js";
import { HEX_W, HEX_H } from "./hexProjection.js";
import { radialBox, hasRadial } from "./radialGeometry.js";
import { slotPos, chooseSlots } from "./boardSlots.js";
import {
  spriteFor, variantFor, spriteStyle, spriteScale, hitBoxStyle, drawnBox, ensureIdleKeyframes,
} from "./unitSprites.js";

// Tokens stand on the near apron of the top face, not out on the terrain.
// Baked art carries no depth buffer, so nothing knows how tall the ground is
// under an arbitrary point — a token over a summit would float or sink. The
// apron is the one region that is the ground plane on every tile in the set.
//
// Slots are laid out symmetrically about the centre for however many tokens
// are actually present, so a lone unit stands in the middle of its tile
// instead of clinging to one edge. `y` bows inward with `x` to follow the
// apron's near boundary.
export { slotPos, chooseSlots } from "./boardSlots.js";

// Sprite-sheet token. Drawn for any faction that has unit art built into
// `unitSprites.json`; everyone else falls back to the coloured disc below, so
// the board stays readable while the other three factions are still being
// modelled.
//
// Layout note: the wrapper is a zero-size div sitting exactly on the unit's
// ground point, and both children hang off that origin. The sprite is offset by
// its anchor rather than its bottom edge, which is the whole reason it lines up
// with the contact ellipse.
function SpriteToken({ unit, spec, faction, selected, pos, onClick, dim, ready }) {
  ensureIdleKeyframes(spec);
  const s = spriteScale(spec);
  const style = spriteStyle(spec, variantFor(unit, spec), { uid: unit.uid });
  // Ground ellipse, squashed to the projection. §6 of the pipeline doc keeps
  // shadows out of the render precisely so this can scale with the board. It
  // tracks the unit's footprint, so a vehicle's contact patch is wider.
  const shadowW = spec.footprintMetres * spec.pixelsPerMetre * s * 0.82;
  return (
    <div
      style={{
        position: "absolute",
        left: pos.left,
        top: pos.top,
        width: 0,
        height: 0,
        opacity: dim ? 0.3 : 1,
        filter: dim ? "saturate(0.6) brightness(0.85)" : undefined,
        transition: "opacity .18s ease, filter .18s ease",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: shadowW,
          height: shadowW * (HEX_H / HEX_W),
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          background: selected
            ? `radial-gradient(ellipse, ${theme.accent}88, transparent 70%)`
            : `radial-gradient(ellipse, ${faction.color}55, transparent 70%)`,
        }}
      />
      {/* §4 of vp-and-actions-design — this unit still has its action.
          Same filled dot the HUD's READY strip uses, so the symbol is learned
          once; pinned at the unit's feet rather than over its head because
          sprite heights differ and a marker that floats has to be hunted for.
          Marking what is READY (not what is spent) means the board quietly
          empties as the turn does. */}
      {ready && (
        <div
          data-ready-dot=""
          style={{
            position: "absolute",
            // Centred just under the contact ellipse: a status light at the
            // unit's feet. Off to one side it sat half-outside the sprite's
            // footprint and read as board noise.
            left: 0,
            top: shadowW * 0.34,
            width: 9,
            height: 9,
            transform: "translate(-50%, -50%)",
            borderRadius: "50%",
            background: theme.ready,
            border: "1.5px solid rgba(4,10,10,0.85)",
            boxShadow: `0 0 7px ${theme.ready}, 0 1px 2px rgba(0,0,0,0.7)`,
          }}
        />
      )}
      <div
        data-unit-sprite=""
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          // The cell is mostly transparent headroom; clicks are taken by the
          // footprint-sized target below instead, so tokens do not steal each
          // other's clicks where their canvases overlap.
          pointerEvents: "none",
          ...style,
          // Selection reads as a glow on the figure itself; a border would
          // frame the transparent cell, not the unit.
          filter: selected
            ? `drop-shadow(0 0 3px ${theme.accent}) drop-shadow(0 0 6px ${theme.accent})`
            : "drop-shadow(0 1px 1px rgba(0,0,0,0.55))",
        }}
      />
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
          left: 0,
          top: 0,
          ...hitBoxStyle(spec),
          pointerEvents: "auto",
          cursor: onClick ? "pointer" : undefined,
        }}
      />
    </div>
  );
}

export function UnitToken({ unit, selected, slot = 0, count = 1, pos: posIn, onClick, dim = false, ready = false }) {
  const faction = FACTIONS[unit.owner] || { name: unit.owner || "Unknown", color: "#888" };
  const pos = posIn || slotPos(slot, count);
  // The unit itself picks the model: movement chips promote it from infantry to
  // a vehicle, so this cannot be resolved from the faction alone.
  const spec = spriteFor(unit.owner, unit);
  if (spec) {
    return (
      <SpriteToken
        unit={unit}
        spec={spec}
        faction={faction}
        selected={selected}
        pos={pos}
        onClick={onClick}
        dim={dim}
        ready={ready}
      />
    );
  }
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
      {/* contact shadow, squashed to the projection so the token reads as
          resting on the tile rather than hovering over it */}
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

export function GhostToken({ ghost, slot = 0, count = 1, pos: posIn }) {
  const color = ownerColor(ghost.owner);
  const pos = posIn || slotPos(slot, count);
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
      }}
    >
      <span style={{ fontFamily: theme.fontDisplay, fontSize: 11, fontWeight: 700, color: "#e8e2d4" }}>?</span>
    </div>
  );
}

// A token's board-space box, used only for the radial-occlusion test. Sprites
// know their own drawn extent; the fallback disc is a 27 px circle sitting on
// its slot point.
//
// One hex can hold a mix of models — a walking squad beside a landship — and the
// slot chooser takes a single box for the group, so use the largest present.
// Overstating it only makes the group avoid radials a little more eagerly.
function tokenBox(occupants) {
  let widest = null;
  for (const u of occupants || []) {
    const spec = u && spriteFor(u.owner, u);
    if (spec && (!widest || spec.footprintMetres > widest.footprintMetres)) widest = spec;
  }
  if (widest) return (x, y) => drawnBox(widest, x, y);
  return (x, y) => ({ x0: x - 15, x1: x + 15, y0: y - 30, y1: y + 3 });
}

// One positioned group per hex, so token slots stay relative to a hex centre.
export default function BoardTokens({ order, hexes, units, centers, selectedUnitId, dimmedUnitUid, onUnitClick }) {
  // Every radial on the board, in board space. Built once per render rather
  // than per hex: a radial hangs over its own tile and reaches the hex behind,
  // so a hex has to be checked against its neighbours' radials, not just its own.
  const occluders = useMemo(
    () => order
      .filter((id) => hasRadial(hexes[id]) && centers[id])
      .map((id) => radialBox(centers[id].x, centers[id].y)),
    [order, hexes, centers],
  );

  return (
    // Above the Loyalty radials (9000), not below. A radial floats 28-128px
    // ABOVE its own hex centre while tokens sit 19-46px BELOW theirs, and rows
    // are only ~110px apart — so a nearer Location's radial lands exactly on
    // the tokens of the row behind it and hides them completely. A unit you
    // cannot see is a unit you lose; the radial is readable in the Location
    // window either way, and in practice a token never reaches high enough to
    // cover one back.
    <div style={{ position: "absolute", inset: 0, zIndex: 9200, pointerEvents: "none" }}>
      {order.map((hexId) => {
        const hex = hexes[hexId];
        if (!hex || hex.fog === "unexplored") return null;
        const c = centers[hexId];
        const here = (hex.unitIds || []).map((id) => units[id]).filter(Boolean);
        const ghosts = hex.ghosts || [];
        if (!here.length && !ghosts.length) return null;
        const unitSlots = chooseSlots(here.length, c, occluders, tokenBox(here));
        // Ghosts are remembered enemies, drawn as discs — there is no model to
        // size them from, so tokenBox falls through to the disc box.
        const ghostSlots = chooseSlots(ghosts.length, c, occluders, tokenBox(null));
        return (
          <div key={`tok-${hexId}`} style={{ position: "absolute", left: c.x, top: c.y }}>
            {here.map((u, i) => (
              <UnitToken
                key={u.uid}
                unit={u}
                pos={unitSlots[i]}
                selected={u.uid === selectedUnitId}
                dim={u.uid === dimmedUnitUid}
                ready={!!u.canAct}
                onClick={onUnitClick}
              />
            ))}
            {ghosts.map((g, i) => (
              <GhostToken key={`ghost-${i}`} ghost={g} pos={ghostSlots[i]} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
