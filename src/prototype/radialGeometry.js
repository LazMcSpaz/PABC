// The floating Loyalty radial's screen footprint.
//
// Kept out of FloatingControlMeter.jsx, and JSX-free, for the same reason
// hexProjection.js is: the token layer needs these numbers to route units out
// from behind a radial, and the tests need them without a DOM.
//
// The radial is painted ABOVE the token layer and hangs FLOAT_LIFT px over its
// own hex, which puts it squarely over units standing on the hex behind. A unit
// there is not dimmed or clipped — it is simply invisible.
import { FLOAT_LIFT } from "./hexProjection.js";

export const METER = 58;

// The floating cluster is a centred column: name label, radial, garrison pill.
// These mirror the markup in FloatingControlMeter.jsx.
const LABEL_H = 16;
const PILL_H = 13;
const STACK_GAP = 3;
const RADIAL_H = LABEL_H + STACK_GAP + METER + STACK_GAP + PILL_H;
const RADIAL_W = METER + 14; // a little wider than the dial, for the name label

// Board-space box this radial covers, given the centre of the hex it hangs over.
export function radialBox(x, y) {
  const cy = y - FLOAT_LIFT;
  return {
    x0: x - RADIAL_W / 2,
    x1: x + RADIAL_W / 2,
    y0: cy - RADIAL_H / 2,
    y1: cy + RADIAL_H / 2,
  };
}

// Which hexes actually draw one — must match the guard in HexBoard3D.
export function hasRadial(hex) {
  return !!hex && hex.type === "location" && hex.fog !== "unexplored" && !!hex.control;
}
