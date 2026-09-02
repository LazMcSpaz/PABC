// Camera + board geometry math for the AI cinematic replay. Pure functions,
// no React. The board is a flexbox hex grid (not an SVG viewBox), and the
// "camera" is the CSS translate/scale transform BoardViewport applies to the
// board content. This module maps hexes → content-space coordinates and eases
// the content translate so a target hex sits at the viewport centre.
import { HEX_W, HEX_H } from "../hexDims.js";
import { buildHexGeometry as buildHoloGeometry } from "../hexProjection.js";

// Layout constants mirrored from the render tree:
//   Prototype wraps the board in a `padding: 30` relative div,
//   HexBoard is a centred flex column with `padding: 10px 0`,
//   rows overlap vertically by round(HEX_H * 0.25) (HexBoard's ROW_OVERLAP).
const WRAP_PAD = 30;
const BOARD_PAD_TOP = 10;
const ROW_OVERLAP = Math.round(HEX_H * 0.25);
const ROW_STEP = HEX_H - ROW_OVERLAP;

// Map every hexId → its centre point in the un-transformed board content
// space (the same space BoardViewport translates/scales). `rows` is the
// adapter's `state.rows` ([[hexId, …], …], top-to-bottom, left-to-right).
//
// The two boards project hexes completely differently — the flat one tiles
// pointy-top rows, the holographic one transposes engine rows into flat-top
// screen columns — so the camera has to be told which one it is flying over.
// Getting this wrong doesn't break anything visibly; it just pans the replay
// camera to the wrong hex, which is why it's a parameter and not a guess.
export function buildHexGeometry(rows, { holo = false } = {}) {
  if (holo) {
    // Shift by the same `padding: 30` wrapper the flat board is offset by, so
    // both geometries speak the same content-space coordinates.
    const g = buildHoloGeometry(rows);
    for (const id in g.centers) {
      g.centers[id].x += WRAP_PAD;
      g.centers[id].y += WRAP_PAD;
    }
    return { ...g, width: g.width + WRAP_PAD * 2, height: g.height + WRAP_PAD * 2 };
  }
  const centers = {};
  const maxLen = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const boardWidth = maxLen * HEX_W;
  rows.forEach((row, r) => {
    const rowLeft = (boardWidth - row.length * HEX_W) / 2;
    row.forEach((hexId, c) => {
      centers[hexId] = {
        x: WRAP_PAD + rowLeft + c * HEX_W + HEX_W / 2,
        y: WRAP_PAD + BOARD_PAD_TOP + r * ROW_STEP + HEX_H / 2,
      };
    });
  });
  return {
    centers,
    width: boardWidth + WRAP_PAD * 2,
    height: rows.length ? WRAP_PAD * 2 + BOARD_PAD_TOP * 2 + (rows.length - 1) * ROW_STEP + HEX_H : 0,
  };
}

export function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Eased pan of the board `view` translate so content-space `target` centres
// in a (vw × vh) viewport at the current `scale`. Calls onFrame({x,y}) per
// rAF tick and onDone() at the end. Returns a stop() to cancel. durationMs<=0
// snaps instantly (skip mode / no-pan).
export function animatePan({ start, target, vw, vh, scale, durationMs, onFrame, onDone }) {
  const destX = vw / 2 - target.x * scale;
  const destY = vh / 2 - target.y * scale;
  if (durationMs <= 0) {
    onFrame({ x: destX, y: destY });
    onDone && onDone();
    return () => {};
  }
  const sx = start.x;
  const sy = start.y;
  const t0 = (typeof performance !== "undefined" ? performance : Date).now();
  let raf = 0;
  let stopped = false;
  const step = (now) => {
    if (stopped) return;
    const t = Math.min(1, (now - t0) / durationMs);
    const e = easeInOutCubic(t);
    onFrame({ x: sx + (destX - sx) * e, y: sy + (destY - sy) * e });
    if (t < 1) raf = requestAnimationFrame(step);
    else onDone && onDone();
  };
  raf = requestAnimationFrame(step);
  return () => { stopped = true; cancelAnimationFrame(raf); };
}
