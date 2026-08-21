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
import { CONFIG } from "../game/config.js";

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

// How many stand on one ring before a second, inner ring opens. Past this the
// outer ring's neighbours close to within a sprite width of each other.
const PER_RING = 6;

// Inner ring radius, as a fraction of the outer. Its angles sit in the gaps
// between the outer ring's, so the two read as concentric ranks rather than a
// blur — "the spaces in between", one step closer to the middle.
const INNER_SCALE = 0.5;

// A hex draws at most this many units, and it is the ENGINE's stacking cap
// rather than a display constant of its own. The two exist for the same reason
// — the tile runs out of room to draw a bigger stack legibly — so reading the
// rule here means the board can never promise a capacity the rules do not
// allow, or hide units the rules do.
//
// The badge is still worth keeping: a hex can hold fewer than the cap when the
// units on it are wide (see capacityFor), and it is the honest way to say so.
export const MAX_DRAWN = CONFIG.hexUnitCap;

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
// with tier-2 vehicles has less room to spread, and saying so with the layout beats
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

// The stances a group of `n` wants, before any rotation: an angle and which
// ring it stands on. Up to PER_RING they share one ring; beyond that the
// remainder forms an inner ring, offset half a step so nobody is directly in
// front of anybody.
export function ringAngles(n) {
  const total = Math.min(Math.max(1, n), MAX_DRAWN);
  if (total === 1) return [{ angle: FRONT, scale: 1 }];
  if (total === 2) {
    return [
      { angle: FRONT - PAIR_ARC / 2, scale: 1 },
      { angle: FRONT + PAIR_ARC / 2, scale: 1 },
    ];
  }
  const outerCount = Math.min(total, PER_RING);
  const innerCount = total - outerCount;
  const step = (2 * Math.PI) / outerCount;
  const out = Array.from({ length: outerCount }, (_, i) => ({
    angle: FRONT + i * step,
    scale: 1,
  }));
  // The inner rank stands in the GAPS between the outer stances, not on its own
  // even division. Dividing 2*PI by the inner count independently lets an inner
  // unit land on the same bearing as an outer one — directly behind it — which
  // is exactly what the second rank exists to avoid.
  const mids = Array.from({ length: outerCount }, (_, i) => FRONT + (i + 0.5) * step);
  for (let i = 0; i < innerCount; i++) {
    out.push({
      angle: mids[Math.round((i * outerCount) / innerCount) % outerCount],
      scale: INNER_SCALE,
    });
  }
  return out;
}

// Which of the sheet's eight orientation rows a unit at `angle` should draw, so
// it faces the middle of its own hex rather than the camera. The objective is
// the tile, so a ring of units looks inward at it.
//
// `angle` is the stance's bearing from the hex centre, in the frame ringPos
// uses: 0 is screen-right, increasing through screen-down.
//
// The row is that bearing directly, NOT its reverse. Reversing it is the
// intuitive reading of "faces the centre" and it is wrong — it turns every unit
// to face outward. The row names describe the aspect the camera sees, so the
// sheet named for a bearing is the one that shows a unit standing there and
// looking back at the middle. Verified against the art rather than reasoned
// from the names: at 180 degrees, west of the centre, the "w" row is the one
// whose vehicle points right, toward the middle.
const FACING_BY_SECTOR = ["e", "se", "s", "sw", "w", "nw", "n", "ne"];

export function facingFor(angle) {
  return FACING_BY_SECTOR[Math.round(angle / (Math.PI / 4)) & 7];
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

// The most units of a given size a hex can show while every one of them stays
// at least 70% visible — the readability bar the footprint figures in
// docs/unit-model-pipeline.md are set against.
//
// Vertical overlap between ranks is depth and does not count; only units at the
// same depth hide each other. Infantry reach the MAX_DRAWN ceiling; a hex full
// of tier-2 vehicles does not, because they are nearly twice as wide, so the overflow
// becomes a badge instead of an unreadable heap.
const capacityCache = new Map();
export function capacityFor(halfW) {
  const key = Math.round(halfW);
  if (capacityCache.has(key)) return capacityCache.get(key);
  const width = halfW * 2;
  let fits = 1;
  for (let n = MAX_DRAWN; n >= 1; n--) {
    const rx = fitRadius(halfW);
    const stances = ringAngles(n).map((a) => ringPos(a.angle, rx * a.scale));
    let worst = 0;
    for (let i = 0; i < stances.length; i++) {
      for (let j = i + 1; j < stances.length; j++) {
        if (Math.abs(stances[i].top - stances[j].top) >= 12) continue;
        const gap = Math.abs(stances[i].left - stances[j].left);
        if (gap < width) worst = Math.max(worst, (width - gap) / width);
      }
    }
    if (worst <= 0.30) { fits = n; break; }
  }
  capacityCache.set(key, fits);
  return fits;
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
        const p = ringPos(a.angle + turn, rx * a.scale);
        score += occlusionOf(boxFor(center.x + p.left, center.y + p.top), near);
      }
      if (score < bestScore - 1e-9) { bestScore = score; best = turn; }
      if (bestScore <= 1e-9) break; // fully clear; no better rotation exists
    }
  }

  return angles
    .map((a) => ({ ...ringPos(a.angle + best, rx * a.scale), facing: facingFor(a.angle + best) }))
    .sort((p, q) => p.top - q.top);
}

// Kept for callers that want a position without the occlusion pass (the token
// components' own fallback). Same ring, no rotation.
export function slotPos(i, count) {
  const angles = ringAngles(Math.max(1, count || 1));
  const a = angles[Math.min(i, angles.length - 1)];
  return { ...ringPos(a.angle, RING_RX * HEX_W * a.scale), facing: facingFor(a.angle) };
}
