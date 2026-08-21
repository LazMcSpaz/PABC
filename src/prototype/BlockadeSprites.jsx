// Blockade art, drawn on the road it closes.
//
// A separate HTML layer rather than part of RouteNetwork's SVG, because the
// sheets are sprite-sheet backgrounds and an SVG <image> cannot window into one
// without a pattern per frame. It sits above the routes and below the unit
// tokens, so a unit standing at a blockade reads in front of it — which is the
// same order RouteNetwork already wanted for its own mark.
//
// Only finished blockades get the sprite. A construction site keeps the dashed
// SVG mark, because the thing it has to communicate is progress, and a solid
// booth would claim the road is shut when it is still open.
import { FACTIONS } from "./data.js";
import { blockadeStance } from "./blockadeStance.js";
import { structureFor, spriteStyle, ensureIdleKeyframes } from "./unitSprites.js";

export default function BlockadeSprites({ rows, hexes, centers }) {
  const drawn = [];
  for (const h of Object.values(hexes)) {
    if (!centers[h.id]) continue;
    // One per road out of the hex, each on its own road.
    for (const b of h.blockades || []) {
      if (!b.done) continue;
      const spec = structureFor(b.owner, "tollbooth");
      if (!spec) continue; // minor factions ship no blockade art
      const stance = blockadeStance(h.id, rows, hexes, centers, b.edge) || {
        // No road on this hex to stand on. Should not happen — a blockade is
        // built on a road — but drawing it at the centre beats not drawing the
        // thing that is stopping you.
        ...centers[h.id], facing: "s",
      };
      drawn.push({ hex: h, blockade: b, spec, stance });
    }
  }
  if (!drawn.length) return null;

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 8100, pointerEvents: "none" }}>
      {drawn.map(({ hex, blockade, spec, stance }) => {
        ensureIdleKeyframes(spec);
        const faction = FACTIONS[blockade.owner];
        const style = spriteStyle(spec, "base", { uid: hex.id, facing: stance.facing });
        return (
          <div
            key={`blockade-sprite-${hex.id}-${blockade.edge || "0"}`}
            data-blockade-sprite={hex.id}
            title={`Blockade — ${faction?.name || blockade.owner}`}
            style={{
              position: "absolute",
              left: stance.x,
              top: stance.y,
              width: 0,
              height: 0,
              // A dormant blockade is standing but unpaid: the road is open
              // through it, so it must not look like it is stopping anyone.
              opacity: blockade.paid === false ? 0.45 : 1,
              filter: blockade.paid === false ? "saturate(0.5)" : undefined,
            }}
          >
            <div style={{ position: "absolute", left: 0, top: 0, ...style }} />
          </div>
        );
      })}
    </div>
  );
}
