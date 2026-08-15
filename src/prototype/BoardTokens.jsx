// Unit and ghost tokens for the holographic board.
//
// These live in their own layer above the tiles rather than inside each
// HexTile, because the route network has to paint over the tiles but under the
// tokens, and a tile is its own stacking context — nothing inside one can rise
// above a sibling tile. The cost is that a nearer tile no longer occludes a
// farther tile's tokens; the gain is that a unit is never buried under the
// mountain in front of it, which matters more for something you have to click.
import { FACTIONS, ownerColor, theme } from "./data.js";
import { HEX_W, HEX_H } from "./hexProjection.js";

// Tokens stand on the near apron of the top face, not out on the terrain.
// Baked art carries no depth buffer, so nothing knows how tall the ground is
// under an arbitrary point — a token over a summit would float or sink. The
// apron is the one region that is the ground plane on every tile in the set.
//
// Slots are laid out symmetrically about the centre for however many tokens
// are actually present, so a lone unit stands in the middle of its tile
// instead of clinging to one edge. `y` bows inward with `x` to follow the
// apron's near boundary.
const MAX_SLOTS = 5;
const SLOT_SPACING = 0.155;

export function slotPos(i, count) {
  const n = Math.min(count || 1, MAX_SLOTS);
  const idx = Math.min(i, n - 1);
  const x = (idx - (n - 1) / 2) * SLOT_SPACING;
  const y = 0.44 - Math.abs(x) * 0.45;
  return { left: x * HEX_W, top: y * HEX_H };
}

export function UnitToken({ unit, selected, slot = 0, count = 1, onClick, dim = false }) {
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

export function GhostToken({ ghost, slot = 0, count = 1 }) {
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
      }}
    >
      <span style={{ fontFamily: theme.fontDisplay, fontSize: 11, fontWeight: 700, color: "#e8e2d4" }}>?</span>
    </div>
  );
}

// One positioned group per hex, so token slots stay relative to a hex centre.
export default function BoardTokens({ order, hexes, units, centers, selectedUnitId, dimmedUnitUid, onUnitClick }) {
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
        return (
          <div key={`tok-${hexId}`} style={{ position: "absolute", left: c.x, top: c.y }}>
            {here.map((u, i) => (
              <UnitToken
                key={u.uid}
                unit={u}
                slot={i}
                count={here.length}
                selected={u.uid === selectedUnitId}
                dim={u.uid === dimmedUnitUid}
                onClick={onUnitClick}
              />
            ))}
            {ghosts.map((g, i) => (
              <GhostToken key={`ghost-${i}`} ghost={g} slot={i} count={ghosts.length} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
