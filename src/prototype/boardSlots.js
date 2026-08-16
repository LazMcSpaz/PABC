// Where tokens stand on a hex, and which of those positions are actually usable.
//
// Split out of BoardTokens.jsx and kept JSX-free for the same reason
// hexProjection.js is: it is pure geometry, so it stays importable headless and
// can be tested without a DOM.
//
// Tokens stand on the near apron of the top face, not out on the terrain. Baked
// art carries no depth buffer, so nothing knows how tall the ground is under an
// arbitrary point — a token over a summit would float or sink. The apron is the
// one region that is the ground plane on every tile in the set.
//
// Slots are laid out symmetrically about the centre for however many tokens are
// actually present, so a lone unit stands in the middle of its tile instead of
// clinging to one edge. `y` bows inward with `x` to follow the apron's near
// boundary.
import { HEX_W, HEX_H } from "./hexProjection.js";

export const MAX_SLOTS = 5;
export const SLOT_SPACING = 0.155;

// Candidates are drawn from a wider set than we will ever fill, so a unit that
// would stand behind a floating radial has somewhere to step to. Radials are
// painted above the token layer and hang 78 px over their own hex, which puts
// them squarely over units standing on the hex behind — a unit there is not
// dimmed or clipped, it is simply invisible. Rather than reorder the layers (the
// radial has to stay readable) the space behind one is treated as not a
// placeable position at all.
// Extra stances offered on each side of the natural row. They sit on the same
// lattice as the row itself — offsets are measured from the row's own centre —
// so when nothing is blocked the most-central `count` candidates ARE the
// natural layout, and an even-numbered group keeps straddling the centre line
// instead of snapping to it.
const EXTRA_SLOTS = 2;

// How far out a token may stand, as a fraction of hex width. The apron narrows
// as it approaches the near vertices, so past this a token is off the tile it
// belongs to. Two steps of SLOT_SPACING (0.31) is the widest the five-slot row
// ever reaches, and this leaves just enough room to step past it.
const MAX_OFFSET = 0.34;

export function slotAt(x) {
  const y = 0.44 - Math.abs(x) * 0.45;
  return { left: x * HEX_W, top: y * HEX_H };
}

export function slotPos(i, count) {
  const n = Math.min(count || 1, MAX_SLOTS);
  const idx = Math.min(i, n - 1);
  return slotAt((idx - (n - 1) / 2) * SLOT_SPACING);
}

// How much of `box` the worst occluder covers, 0..1.
//
// A fraction rather than a boolean because the apron is not always big enough
// to clear everyone: a radial sits over the middle of it, and once a hex holds
// more than a couple of units somebody has to stand in the shadow. Ranking by
// how hidden a position is puts the unavoidable overflow in the least-covered
// spot instead of the most central one.
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

// Positions for `count` tokens on one hex, avoiding every box in `occluders`.
//
// Candidates are ranked by how central they are, so with nothing in the way the
// result is the same tidy symmetric row as before; a blocked middle just pushes
// the group outward instead of burying a unit. `boxFor(x, y)` returns the
// board-space box a token at that point would cover.
// Every stance available to a group of `n`, in lattice order. Exported so tests
// can assert the chosen set is the best available rather than re-deriving the
// lattice and drifting from it. Offsets are measured from the natural row's own
// centre, which is what keeps even-numbered groups straddling the centre line.
export function candidateSlots(n) {
  const out = [];
  for (let i = -EXTRA_SLOTS; i < n + EXTRA_SLOTS; i++) {
    const x = (i - (n - 1) / 2) * SLOT_SPACING;
    if (Math.abs(x) > MAX_OFFSET) continue;
    out.push(slotAt(x));
  }
  return out;
}

export function chooseSlots(count, center, occluders, boxFor) {
  const n = Math.min(count || 1, MAX_SLOTS);
  const all = candidateSlots(n).map((pos) => ({
    pos,
    hidden: occlusionOf(boxFor(center.x + pos.left, center.y + pos.top), occluders),
  }));
  // Clearest first, then most central, then left-to-right so ties are stable.
  // With nothing in the way every candidate scores 0 and this collapses to the
  // old centrality ordering, which is what keeps the unblocked layout identical.
  all.sort((a, b) =>
    a.hidden - b.hidden
    || Math.abs(a.pos.left) - Math.abs(b.pos.left)
    || a.pos.left - b.pos.left);
  return all.slice(0, n).sort((a, b) => a.pos.left - b.pos.left).map((c) => c.pos);
}
