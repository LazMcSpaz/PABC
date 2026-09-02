// Board level-of-detail.
//
// A full-detail tile is expensive by construction (see the board plan, P11):
// two `<img>`s, a CSS-masked div, two `mix-blend-mode: plus-lighter` layers and
// its own stacking context — per hex. That is fine at 30 hexes and it is the
// whole point of the art. On a 127-hex `huge` map, fully explored, it is ~254
// blend layers and ~127 masked elements, and every one of those is a separate
// compositing operation the browser cannot batch.
//
// The observation that makes this cheap to fix: below roughly 0.6 zoom a tile
// is under 130 px across, and the hologram detail the three layers exist to
// carry is already mush at that size (P13). Nothing is lost by dropping it —
// and the thing you actually read when zoomed out, which is *territory colour*,
// gets clearer without the art's own texture fighting it.
//
// So below the threshold the whole tile layer collapses to one SVG with a flat
// tinted polygon per hex. Same tint source of truth, same hexagon, no images,
// no masks, no blend layers.
//
// LOD is exposed as a QUANTIZED level rather than the raw scale, deliberately:
// the context value then only changes when the threshold is actually crossed,
// so panning and ordinary zooming never re-render the board.
import { createContext, useContext } from "react";

// Enter flat mode below `FLAT_BELOW`; return to full detail only once back
// above `FULL_ABOVE`. The gap is hysteresis — a pinch-zoom is continuous and
// can otherwise park exactly on a single threshold, flipping the whole tile
// layer between representations on every pointer frame. Wheel zoom steps by
// 1.15x and could never land there, but touch can.
export const FLAT_BELOW = 0.62;
export const FULL_ABOVE = 0.68;

export const LOD_FULL = "full";
export const LOD_FLAT = "flat";

// `?lod=full` / `?lod=flat` pins one level for the session, the same way
// `?board=holo|flat` pins a renderer. Two reasons it exists: a screenshot run
// needs a level it can depend on, and profiling the worst case means holding a
// huge map at full detail even though it fits on screen well below the
// threshold and would otherwise never render that way.
export function lodOverride() {
  try {
    const q = typeof location !== "undefined" && new URLSearchParams(location.search).get("lod");
    return q === LOD_FULL || q === LOD_FLAT ? q : null;
  } catch {
    return null;
  }
}

// Pure, and exported for the perf script and for tests: given the level we are
// currently showing and a new scale, which level should we show?
export function nextLod(prev, scale) {
  const pinned = lodOverride();
  if (pinned) return pinned;
  if (scale < FLAT_BELOW) return LOD_FLAT;
  if (scale > FULL_ABOVE) return LOD_FULL;
  return prev || LOD_FULL; // inside the band: whatever we were already doing
}

// Default FULL, so anything rendering the board outside a BoardViewport (the
// HUD showcase, a test harness) keeps the detailed art it had before.
export const BoardLodContext = createContext(LOD_FULL);

export function useBoardLod() {
  return useContext(BoardLodContext);
}
