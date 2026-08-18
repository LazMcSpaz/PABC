// Ring layout tests — do units spread around the hex, and dodge the radials?
//
// The in-game harness can only confirm that whatever board a given seed
// produces happens to look right, which passes trivially when no hex is
// crowded. These tests construct the awkward cases directly.
//
//   node scripts/check-slot-occlusion.mjs

import { chooseSlots, ringPos, ringAngles, occlusionOf, fitRadius, facingFor, capacityFor, MAX_DRAWN } from "../src/prototype/boardSlots.js";
import { HEX_W, HEX_H, ROW_STEP, topFacePoints } from "../src/prototype/hexProjection.js";
import { radialBox } from "../src/prototype/radialGeometry.js";

let failures = 0;
function check(name, pass, detail) {
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const CENTER = { x: 1000, y: 1000 };
// A unit's drawn extent at rest scale, matching unitSprites.js for infantry.
const box = (x, y) => ({ x0: x - 20.1, x1: x + 20.1, y0: y - 41.5, y1: y + 10.5 });
// Widest thing that can stand on a hex: the tier-2 vehicle.
const bigBox = (x, y) => ({ x0: x - 36.9, x1: x + 36.9, y0: y - 56.2, y1: y + 17.9 });

const GROUPS = [1, 2, 3, 4, 5, 6, 7, 8, 10];

console.log("--- every unit gets its own position ---");
for (const n of GROUPS) {
  const ps = chooseSlots(n, CENTER, [], box);
  check(`${n} unit(s): ${n} position(s) returned`, ps.length === n, `got ${ps.length}`);
  const keys = new Set(ps.map((p) => `${p.left.toFixed(2)},${p.top.toFixed(2)}`));
  check(`${n} unit(s): all distinct`, keys.size === n, `${keys.size} unique`);
  check(`${n} unit(s): none undefined`, ps.every((p) => p && Number.isFinite(p.left) && Number.isFinite(p.top)));
}

console.log("\n--- the group spreads in depth, not just across ---");
for (const n of GROUPS.filter((n) => n >= 3)) {
  const ps = chooseSlots(n, CENTER, [], box);
  const span = Math.max(...ps.map((p) => p.top)) - Math.min(...ps.map((p) => p.top));
  check(`${n} unit(s) use the tile's depth`, span > 40, `${span.toFixed(0)}px of y spread`);
}

console.log("\n--- units at the same depth do not smear together ---");
// Vertical overlap between ranks reads as depth and is fine. What ruins
// legibility is two units at the same y overlapping horizontally.
for (const n of GROUPS) {
  const ps = chooseSlots(n, CENTER, [], box);
  let worst = Infinity;
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      if (Math.abs(ps[i].top - ps[j].top) < 12) worst = Math.min(worst, Math.abs(ps[i].left - ps[j].left));
    }
  }
  const width = 40.2;
  // Vertical overlap between ranks is depth. Only units at the same depth hide
  // each other, and there the 70%-visible rule applies.
  const visible = worst === Infinity ? 1 : Math.min(1, worst / width);
  check(`${n} unit(s): same-rank units stay >=70% visible`, visible >= 0.70,
    worst === Infinity ? "no two share a rank" : `${(visible * 100).toFixed(0)}% visible (${worst.toFixed(0)}px gap)`);
}

console.log("\n--- painted back to front ---");
for (const n of GROUPS) {
  const ps = chooseSlots(n, CENTER, [], box);
  check(`${n} unit(s) ordered by depth`, ps.every((p, i) => i === 0 || p.top >= ps[i - 1].top),
    ps.map((p) => p.top.toFixed(0)).join(" <= "));
}

console.log("\n--- everyone stays on the tile ---");
// topFacePoints gives the projected top face; a token must stand inside it, or
// it is hovering over the neighbouring tile's art.
const poly = topFacePoints(0, 0).map(([x, y]) => [x, y]);
function inside(px, py) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]; const [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
for (const [label, bx, half] of [["infantry", box, 20.1], ["tier-2 vehicle", bigBox, 36.9]]) {
  let off = 0;
  for (const n of GROUPS) {
    for (const p of chooseSlots(n, CENTER, [], bx)) {
      if (!inside(p.left, p.top) || !inside(p.left - half, p.top) || !inside(p.left + half, p.top)) off++;
    }
  }
  check(`${label}: every stance is on the top face`, off === 0, off ? `${off} off-tile` : "including full width");
}

console.log("\n--- radials ---");
// A radial belongs to the hex in FRONT and floats up over the units standing
// behind it, which is the case from the screenshot.
const real = radialBox(CENTER.x, CENTER.y + ROW_STEP);
const coverAt = (p, bx = box) => occlusionOf(bx(CENTER.x + p.left, CENTER.y + p.top), [real]);
for (const n of GROUPS) {
  const turned = chooseSlots(n, CENTER, [real], box);
  const rx = fitRadius(20.1);
  const straight = ringAngles(n).map((a) => ringPos(a.angle, rx * a.scale));
  const sum = (ps) => ps.reduce((s, p) => s + coverAt(p), 0);
  check(`${n} unit(s): rotation does not make it worse`, sum(turned) <= sum(straight) + 1e-9,
    `${(sum(turned) * 100).toFixed(0)}% covered vs ${(sum(straight) * 100).toFixed(0)}% unrotated`);
  check(`${n} unit(s): still ${n} placed under a radial`, turned.length === n);
}
// And the ring keeps its shape while turning — no bunching to dodge.
{
  const turned = chooseSlots(5, CENTER, [real], box);
  let worst = Infinity;
  for (let i = 0; i < turned.length; i++) {
    for (let j = i + 1; j < turned.length; j++) {
      worst = Math.min(worst, Math.hypot(turned[i].left - turned[j].left, turned[i].top - turned[j].top));
    }
  }
  check("rotating to dodge a radial keeps the spacing", worst > 25, `closest pair ${worst.toFixed(0)}px`);
}

console.log("\n--- degenerate input ---");
check("zero count still yields one position", chooseSlots(0, CENTER, [], box).length === 1);
const everywhere = { x0: -1e6, x1: 1e6, y0: -1e6, y1: 1e6 };
check("fully blocked hex still places every unit", chooseSlots(6, CENTER, [everywhere], box).length === 6,
  "falls back rather than dropping a unit");

console.log("\n--- capacity and the hard cap ---");
for (const n of [7, 8, 10]) {
  const ps = chooseSlots(n, CENTER, [], box);
  const radii = new Set(ps.map((p) => Math.round(Math.hypot(p.left, (p.top - 0.10 * HEX_H) * (0.27 / 0.32) * (HEX_W / HEX_H)))));
  check(`${n} unit(s): opens a second rank`, radii.size >= 2, `${radii.size} distinct radii`);
}
for (const [label, halfW, want] of [["infantry", 20.1, 10], ["tier-1 vehicle", 28.05, 6], ["tier-2 vehicle", 36.85, 6]]) {
  check(`${label}: fits ${want} per hex`, capacityFor(halfW) === want, `${capacityFor(halfW)}`);
}
for (const n of [MAX_DRAWN, MAX_DRAWN + 1, MAX_DRAWN + 7]) {
  check(`${n} requested: at most ${MAX_DRAWN} drawn`, chooseSlots(n, CENTER, [], box).length === MAX_DRAWN,
    `${chooseSlots(n, CENTER, [], box).length} positions`);
}

console.log("\n--- units face the middle of their hex ---");
// The bearing of a stance and the way it looks are opposites: a unit at the
// front of the ring is below the centre, so it must face away from the camera.
for (const [deg, want] of [[90, "n"], [270, "s"], [0, "w"], [180, "e"], [45, "nw"], [225, "se"]]) {
  const got = facingFor((deg * Math.PI) / 180);
  check(`stance at ${deg}deg faces ${want}`, got === want, got);
}
for (const n of GROUPS) {
  const ps = chooseSlots(n, CENTER, [], box);
  check(`${n} unit(s): every stance has a facing`, ps.every((p) => typeof p.facing === "string" && p.facing.length),
    [...new Set(ps.map((p) => p.facing))].join(","));
  // Whoever is nearest the camera must be looking away from it, and vice versa.
  const front = ps[ps.length - 1];
  const back = ps[0];
  if (n >= 3) {
    check(`${n} unit(s): front rank looks inward`, front.facing.includes("n"), front.facing);
    check(`${n} unit(s): back rank looks inward`, back.facing.includes("s"), back.facing);
  }
}

console.log(`\n${failures ? `${failures} FAILED` : "all ring-layout tests passed"}`);
process.exit(failures ? 1 : 0);
