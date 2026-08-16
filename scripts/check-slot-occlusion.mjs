// Slot-occlusion tests — does a radial actually push units out from behind it?
//
// The in-game harness can only confirm that nothing is hidden on whatever board
// a given seed produces, which passes trivially if no unit ever stood behind a
// radial. These tests construct the bad case directly and assert the layout
// changes, so the fix is verified rather than assumed.
//
//   node scripts/check-slot-occlusion.mjs

import { chooseSlots, slotPos, candidateSlots, occlusionOf, MAX_SLOTS, SLOT_SPACING } from "../src/prototype/boardSlots.js";
import { HEX_W, ROW_STEP } from "../src/prototype/hexProjection.js";
import { radialBox } from "../src/prototype/radialGeometry.js";

let failures = 0;
function check(name, pass, detail) {
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const CENTER = { x: 1000, y: 1000 };
// A unit's drawn extent, matching unitSprites.js at rest scale (~0.319).
const S = 0.3194;
const box = (x, y) => ({ x0: x - 63 * S, x1: x + 63 * S, y0: y - 130 * S, y1: y + 33 * S });
const near = (a, b) => Math.abs(a - b) < 0.001;

// --- with nothing in the way, the layout is unchanged ---------------------
for (const n of [1, 2, 3, 4, 5]) {
  const got = chooseSlots(n, CENTER, [], box);
  const want = Array.from({ length: n }, (_, i) => slotPos(i, n));
  check(`${n} unit(s), no radial: unchanged layout`,
    got.length === n && got.every((p, i) => near(p.left, want[i].left) && near(p.top, want[i].top)),
    got.map((p) => p.left.toFixed(1)).join(", "));
}

// --- a radial over the centre pushes the unit aside ----------------------
// Place the occluder exactly over where a lone unit would stand.
const lone = slotPos(0, 1);
const onTop = (() => {
  const b = box(CENTER.x + lone.left, CENTER.y + lone.top);
  return { x0: b.x0 + 1, x1: b.x1 - 1, y0: b.y0 + 1, y1: b.y1 - 1 };
})();
const moved = chooseSlots(1, CENTER, [onTop], box);
check("1 unit behind a radial: relocated",
  !near(moved[0].left, lone.left),
  `centre slot ${lone.left.toFixed(1)} -> ${moved[0].left.toFixed(1)}`);
check("1 unit behind a radial: new spot is clear",
  !(() => {
    const b = box(CENTER.x + moved[0].left, CENTER.y + moved[0].top);
    return b.x0 < onTop.x1 && b.x1 > onTop.x0 && b.y0 < onTop.y1 && b.y1 > onTop.y0;
  })(),
  "no overlap with the occluder");

// --- a real radial over a real group -------------------------------------
// Use the actual radial geometry rather than an invented box: a radial belongs
// to the hex in FRONT and floats up over the units standing behind it, which is
// the case from the screenshot. One ROW_STEP down, then lifted by FLOAT_LIFT.
const front = { x: CENTER.x, y: CENTER.y + ROW_STEP };
const real = radialBox(front.x, front.y);
const coverAt = (p) => occlusionOf(box(CENTER.x + p.left, CENTER.y + p.top), [real]);

for (const n of [1, 2, 3, 5]) {
  const group = chooseSlots(n, CENTER, [real], box);
  const cover = group.map(coverAt);
  const hidden = cover.filter((c) => c > 0).length;

  // The apron is only so wide and a radial sits over the middle of it, so the
  // number of clear stances is a hard ceiling — and it depends on n, because
  // odd and even groups sit on different lattices.
  const avail = candidateSlots(n).map(coverAt).sort((a, b) => a - b);
  const clear = avail.filter((c) => c === 0).length;
  const best = avail.slice(0, n).reduce((s, c) => s + c, 0);

  check(`${n} unit(s) vs a real radial: all placed`, group.length === n,
    `${group.map((p) => p.left.toFixed(0)).join(", ")} — ${clear}/${avail.length} stances clear`);
  // Nobody stands in the shadow while a clear stance is still free. Past the
  // apron's capacity some overflow is unavoidable.
  check(`${n} unit(s) vs a real radial: no avoidable hiding`,
    hidden <= Math.max(0, n - clear),
    `${hidden} hidden, ${Math.max(0, n - clear)} unavoidable`);
  // And the set chosen is the least-hidden one available — the real contract,
  // which holds whether or not there was any choice to make.
  check(`${n} unit(s) vs a real radial: optimal placement`,
    Math.abs(cover.reduce((s, c) => s + c, 0) - best) < 1e-9,
    `total coverage ${(cover.reduce((s, c) => s + c, 0) * 100).toFixed(0)}% vs best ${(best * 100).toFixed(0)}%`);
}
const group = chooseSlots(5, CENTER, [real], box);

// --- slots stay distinct and ordered -------------------------------------
const xs = group.map((p) => p.left);
check("slots are distinct", new Set(xs.map((x) => x.toFixed(3))).size === xs.length);
check("slots are left-to-right", xs.every((x, i) => i === 0 || x > xs[i - 1]),
  "paint order matches screen order");

// --- spacing is preserved so the >=70% overlap rule still holds -----------
const gaps = xs.slice(1).map((x, i) => x - xs[i]);
check("spacing never tighter than SLOT_SPACING",
  gaps.every((g) => g >= SLOT_SPACING * HEX_W - 0.001),
  `min gap ${Math.min(...gaps).toFixed(1)}px vs ${(SLOT_SPACING * HEX_W).toFixed(1)}px`);

// --- degenerate case: everything blocked, nobody vanishes ----------------
const everywhere = { x0: -1e6, x1: 1e6, y0: -1e6, y1: 1e6 };
const crowded = chooseSlots(MAX_SLOTS, CENTER, [everywhere], box);
check("fully blocked apron still places every unit", crowded.length === MAX_SLOTS,
  "falls back rather than dropping a unit");

console.log(`\n${failures ? `${failures} FAILED` : "all slot-occlusion tests passed"}`);
process.exit(failures ? 1 : 0);
