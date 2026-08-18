// Where tokens stand on a hex, and which of those positions are actually usable.
//
// Split out of BoardTokens.jsx and kept JSX-free for the same reason
// hexProjection.js is: it is pure geometry, so it stays importable headless and
// can be tested without a DOM.
//
// Tokens stand in a RING on the top face rather than shoulder to shoulder along
// the near edge. The row was set for a 20%-of-hex infantry footprint and fell
// apart as soon as a hex held more than three: at 15.5% spacing six units
// overlapped into an unreadable smear, and the vehicles are wider still. A ring
// spends the tile's depth as well as its width, so neighbours separate in y
// instead of stacking sideways.
//
// The ring is a circle on the ground, so on screen it is an ellipse squashed by
// the same HEX_H/HEX_W the contact shadows use. It sits slightly forward of the
// hex centre, which keeps the group on the flatter near half of the top face —
// baked tile art carries no depth buffer, so a token parked on a painted summit
// would read as floating.
import { HEX_W, HEX_H, HEX_FLAT } from "./hexProjection.js";

// Ring radii, as fractions of hex width and height, plus how far forward of the
// hex centre the ring sits. RX is sized so a tier-2 vehicle at the ring's widest
// point stays inside the top face.
//
// RY is deliberately deeper than the HEX_H/HEX_W squash would give. A true
// ground circle projects to an ellipse only 0.487 as tall as it is wide, which
// leaves the side-by-side pairs in a six-unit ring barely 28 px apart in y —
// tighter than the row it replaced. Stretching the ring front-to-back costs
// nothing anyone can see and buys the depth the layout is here for.
const RING_RX = 0.27;
const RING_RY = 0.32;
const RING_CY = 0.10;

// Rotations tried when a radial is in the way. The ring keeps its even spacing
// and turns as a whole, so units dodge the radial without bunching up.
const ROTATIONS = 24;

// A pair reads better side by side than one-in-front-of-the-other, so small
// groups span a front arc instead of the full circle.
const PAIR_ARC = (100 * Math.PI) / 180;

// Half-width of the projected top face at height `y` from its centre. The face
// is a flat-top hexagon: widest at its own centre line, tapering to the flat
// edges front and back.
function faceHalfWidth(y) {
  const t = Math.min(1, Math.abs(y) / (HEX_H / 2));
  return HEX_W / 2 - t * (HEX_W / 2 - HEX_FLAT / 2);
}

// Screen-space point on the ring. Angle 90 degrees is the front of the tile,
// nearest the camera; angles increase anticlockwise on the ground. `rx` lets a
// caller shrink the ring — see fitRadius.
export function ringPos(angle, rx = RING_RX * HEX_W) {
  const ry = (rx / (RING_RX * HEX_W)) * RING_RY * HEX_H;
  return {
    left: Math.cos(angle) * rx,
    top: RING_CY * HEX_H + Math.sin(angle) * ry,
  };
}

// The widest ring that keeps a token of half-width `halfW` on the top face.
//
// Infantry never hits this — the default radius already clears — but a tier-2
// vehicle is 74 px across, and at full radius its flanks hang off the tile onto
// the neighbouring one. Pulling the ring in is the right trade: a hex crowded
// with landships has less room to spread, and saying so with the layout beats
// drawing them over the wrong tile.
const radiusCache = new Map();
export function fitRadius(halfW) {
  const key = Math.round(halfW);
  if (radiusCache.has(key)) return radiusCache.get(key);
  let rx = RING_RX * HEX_W;
  for (let guard = 0; guard < 40; guard++) {
    let ok = true;
    for (let i = 0; i < 36 && ok; i++) {
      const p = ringPos((i * 2 * Math.PI) / 36, rx);
      ok = Math.abs(p.top) <= HEX_H / 2 && Math.abs(p.left) + halfW <= faceHalfWidth(p.top);
    }
    if (ok) break;
    rx *= 0.94;
  }
  radiusCache.set(key, rx);
  return rx;
}

const FRONT = Math.PI / 2;

// The evenly spaced angles a group of `n` wants, before any rotation.
export function ringAngles(n) {
  if (n <= 1) return [FRONT];
  if (n === 2) return [FRONT - PAIR_ARC / 2, FRONT + PAIR_ARC / 2];
  return Array.from({ length: n }, (_, i) => FRONT + (i * 2 * Math.PI) / n);
}

// How much of `box` the worst occluder covers, 0..1.
//
// A fraction rather than a boolean because the ring cannot always clear
// everyone: a radial hangs over the back of the tile, and a large enough group
// has to put somebody there. Ranking by how hidden a position is puts the
// unavoidable overflow in the least-covered spot.
export function occlusionOf(box, occluders) {
  const area = (box.x1 - box.x0) * (box.y1 - box.y0);
  if (area <= 0) return 0;
  let worst = 0;
  for (const o of occluders || []) {
    const ox = Math.min(box.x1, o.x1) - Math.max(box.x0, o.x0);
    const oy = Math.min(box.y1, o.y1) - Math.max(box.y0, o.y0);
    if (ox > 0 && oy > 0) worst = Math.max(worst, (ox * oy) / area);
  }
  return worst;
}

// Cheap reject: is any occluder close enough to this hex to matter? Skips the
// rotation search on the overwhelming majority of hexes, which have no radial
// anywhere near them.
function nearbyOccluders(center, occluders) {
  if (!occluders || !occluders.length) return null;
  const rx = RING_RX * HEX_W + HEX_W;
  const ry = RING_RY * HEX_H + HEX_H;
  const near = occluders.filter((o) =>
    o.x1 > center.x - rx && o.x0 < center.x + rx
    && o.y1 > center.y - ry && o.y0 < center.y + ry);
  return near.length ? near : null;
}

// Positions for `count` tokens on one hex.
//
// Returns exactly `count` positions — never fewer. Handing back a short list
// used to leave the overflow with no position at all, and the token fell back
// to the lone-unit slot, which is how a sixth unit ended up standing on top of
// the first.
//
// `boxFor(x, y)` returns the board-space box a token at that point would cover.
// Results are ordered back to front, so painting them in order lets a nearer
// unit overlap a farther one the way the tiles themselves do.
export function chooseSlots(count, center, occluders, boxFor) {
  const n = Math.max(1, count || 1);
  const angles = ringAngles(n);
  const probe = boxFor(0, 0);
  const rx = fitRadius((probe.x1 - probe.x0) / 2);
  const near = nearbyOccluders(center, occluders);

  let best = 0;
  if (near) {
    // Turn the whole ring, keeping its spacing, and keep the angle that leaves
    // the least of the group hidden. Ties go to the smallest rotation so the
    // canonical front-weighted layout wins when nothing is gained by turning.
    let bestScore = Infinity;
    for (let r = 0; r < ROTATIONS; r++) {
      const turn = (r * 2 * Math.PI) / ROTATIONS;
      let score = 0;
      for (const a of angles) {
        const p = ringPos(a + turn, rx);
        score += occlusionOf(boxFor(center.x + p.left, center.y + p.top), near);
      }
      if (score < bestScore - 1e-9) { bestScore = score; best = turn; }
      if (bestScore <= 1e-9) break; // fully clear; no better rotation exists
    }
  }

  return angles
    .map((a) => ringPos(a + best, rx))
    .sort((p, q) => p.top - q.top);
}

// Kept for callers that want a position without the occlusion pass (the token
// components' own fallback). Same ring, no rotation.
export function slotPos(i, count) {
  const n = Math.max(1, count || 1);
  const angles = ringAngles(n);
  return ringPos(angles[Math.min(i, angles.length - 1)]);
}
