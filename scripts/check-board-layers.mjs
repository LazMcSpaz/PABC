// Board paint order, and that routes survive the zoom-out.
//
// Two things this guards, both of which are invisible until they break:
//
//   1. Unit sprites must draw ABOVE roads and railways, and a blockade must
//      draw above the road it sits on but below the units standing on it.
//      These are plain z-index numbers spread across three files, so nothing
//      stops a later edit from silently reordering them.
//   2. The route network renders in TWO stacked svg layers (a dark trough
//      composited normally, and the light screened onto the board). If the
//      blend mode or the split is lost the routes go back to reading as flat
//      overlays, which is exactly what this pass was for.
//
//   npm run dev                       # in one shell
//   node scripts/check-board-layers.mjs
//
// Env: SHOT_BASE (default http://localhost:5173/PABC), SHOT_W / SHOT_H.

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = (process.env.SHOT_BASE || "http://localhost:5173/PABC").replace(/\/$/, "");
const OUT = "screenshots";
const VIEWPORT = { width: Number(process.env.SHOT_W) || 1600, height: Number(process.env.SHOT_H) || 1000 };
const SEED = "424242";

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
const EXTERNAL = /fonts\.(googleapis|gstatic)\.com/;
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text());
});
page.on("requestfailed", (r) => { if (!EXTERNAL.test(r.url())) errors.push(`REQ ${r.url()}`); });

await mkdir(OUT, { recursive: true });
await page.goto(`${BASE}/?board=holo`, { waitUntil: "domcontentloaded" });
await page.locator("button").filter({ hasText: "NEW GAME" }).first().click({ timeout: 20000 });
await page.locator("button").filter({ hasText: "VERSARI KORAD" }).first().click();
await page.locator("button").filter({ hasText: "ADDITIONAL SETTINGS" }).first().click().catch(() => {});
await page.waitForTimeout(300);
await page.getByPlaceholder("random").fill(SEED).catch(() => {});
await page.locator("button").filter({ hasText: "BEGIN" }).first().click();
await page.getByText("End Turn").waitFor({ timeout: 25000 });

// Light the whole map so the road network is actually on screen to measure.
await page.evaluate(() => {
  const g = window.__ashland;
  const me = g.turnOrder[g.activeIndex];
  const v = g.visibility?.[me];
  if (v) for (const h of Object.keys(g.board.hexes)) { v.explored.add(h); v.visible.add(h); }
  window.__ashlandBump?.();
});
await page.waitForTimeout(1000);

// --- 1. layer stack -------------------------------------------------------
const stack = await page.evaluate(() => {
  const zOf = (el) => {
    if (!el) return null;
    const z = getComputedStyle(el).zIndex;
    return z === "auto" ? null : Number(z);
  };
  const svgs = [...document.querySelectorAll("svg")].map((el) => ({
    z: zOf(el),
    blend: getComputedStyle(el).mixBlendMode,
    lines: el.querySelectorAll("line").length,
    rects: el.querySelectorAll("rect").length,
  })).filter((s) => s.z != null && s.z >= 7000 && s.z < 9000);
  const token = document.querySelector("[data-unit-sprite]");
  // Walk up from a sprite to whichever ancestor carries the layer z-index.
  let tokenZ = null;
  for (let el = token; el && !tokenZ; el = el.parentElement) tokenZ = zOf(el);
  return { svgs, tokenZ, sprites: document.querySelectorAll("[data-unit-sprite]").length };
});

const troughs = stack.svgs.filter((s) => s.blend === "normal" && s.lines > 0);
const lights = stack.svgs.filter((s) => s.blend === "screen" && s.lines > 0);

check("route strokes are on the board", troughs.length + lights.length > 0,
  `${stack.svgs.length} route-range svg layer(s)`);
check("routes render as a normal trough layer plus a screened light layer",
  troughs.length === 1 && lights.length === 1,
  `trough ${troughs.length}, screened ${lights.length}`);
check("the light layer sits above the trough",
  lights[0] && troughs[0] && lights[0].z > troughs[0].z,
  lights[0] && troughs[0] ? `trough z${troughs[0].z} < light z${lights[0].z}` : "missing a layer");

check("unit sprites are on the board", stack.sprites > 0, `${stack.sprites} sprite(s)`);
const routeMaxZ = Math.max(...stack.svgs.map((s) => s.z));
check("unit sprites draw ABOVE every route layer",
  stack.tokenZ != null && stack.tokenZ > routeMaxZ,
  `sprites z${stack.tokenZ} vs highest route z${routeMaxZ}`);

// --- 1b. a road and a rail on the same ground must both be visible -------
const parallel = await page.evaluate(() => {
  const g = window.__ashland;
  // Segments carried by BOTH, straight off the board data.
  const both = [];
  for (const [id, h] of Object.entries(g.board.hexes)) {
    if (!h.road || !h.rail) continue;
    for (const nb of g.board.adjacency[id] || []) {
      const n = g.board.hexes[nb];
      if (n?.road && n?.rail) both.push([id, nb]);
    }
  }
  if (!both.length) return { shared: 0 };

  // Every route stroke on screen, keyed by its endpoints rounded to the pixel.
  const lines = [];
  for (const svg of document.querySelectorAll("svg")) {
    const z = getComputedStyle(svg).zIndex;
    if (z === "auto" || Number(z) < 7000 || Number(z) >= 9000) continue;
    const blend = getComputedStyle(svg).mixBlendMode;
    for (const l of svg.querySelectorAll("line")) {
      lines.push({
        blend,
        x1: +l.getAttribute("x1"), y1: +l.getAttribute("y1"),
        x2: +l.getAttribute("x2"), y2: +l.getAttribute("y2"),
      });
    }
  }
  // The rail carries cross-ties (a dashed stroke), the road never does — so
  // the two kinds are separable on screen without reading colour.
  return { shared: both.length, lines: lines.length };
});
check("the board has ground carrying both a road and a rail",
  parallel.shared > 0, `${parallel.shared} shared segment(s)`);

// The real assertion: no two route strokes may sit exactly on top of each
// other. If the offset is lost, the road and rail collapse onto one line and a
// settlement served by both looks rail-only.
const overlap = await page.evaluate(() => {
  const seen = new Map();
  let collisions = 0;
  for (const svg of document.querySelectorAll("svg")) {
    const z = getComputedStyle(svg).zIndex;
    if (z === "auto" || Number(z) < 7000 || Number(z) >= 9000) continue;
    for (const l of svg.querySelectorAll("line")) {
      const k = [l.getAttribute("x1"), l.getAttribute("y1"),
                 l.getAttribute("x2"), l.getAttribute("y2")].map(Number)
        .map((n) => Math.round(n)).join(",");
      const w = Math.round(Number(l.getAttribute("stroke-width")) * 10);
      const key = `${k}`;
      const widths = seen.get(key) || new Set();
      // Strokes of the SAME width at the same place are the road and rail
      // collapsed; different widths are the trough/halo/core of one route.
      if (widths.has(w)) collisions += 1;
      widths.add(w);
      seen.set(key, widths);
    }
  }
  return collisions;
});
check("road and rail never collapse onto the same line",
  overlap === 0, `${overlap} colliding stroke pair(s)`);

// --- 2. blockades: above the road, below the units -----------------------
const blockade = await page.evaluate(() => {
  const g = window.__ashland;
  const me = g.turnOrder[g.activeIndex];
  // Drop a finished blockade on any road hex that is not a Location.
  const hex = Object.keys(g.board.hexes).find((h) => g.board.hexes[h].road && !g.locations[h]);
  if (!hex) return null;
  g.world = g.world || {};
  g.world.blockades = g.world.blockades || {};
  // Keyed `hex|edge`: a hex holds one blockade per road leaving it.
  const edge = (g.board.adjacency[hex] || []).find((n) => g.board.hexes[n]?.road) || null;
  g.world.blockades[`${hex}|${edge}`] = {
    hex, edge, owner: me, done: true, paid: true, progress: 4, cost: 4, chips: [], builder: null,
  };
  window.__ashlandBump?.();
  return hex;
});
await page.waitForTimeout(700);

const marks = await page.evaluate(() => {
  const zOf = (el) => {
    const z = getComputedStyle(el).zIndex;
    return z === "auto" ? null : Number(z);
  };
  // A FINISHED blockade draws as a tollbooth sprite in its own HTML layer;
  // only a construction site still uses the SVG mark, whose rects are the only
  // ones in the route-range svgs. Accept either, since both are "the blockade".
  const sprite = document.querySelector("[data-blockade-sprite]");
  if (sprite) {
    let layer = sprite.parentElement;
    while (layer && zOf(layer) == null) layer = layer.parentElement;
    if (layer) return [{ z: zOf(layer), kind: "sprite" }];
  }
  const svgs = [...document.querySelectorAll("svg")].filter((el) => {
    const z = zOf(el);
    return z != null && z >= 7000 && z < 9000 && el.querySelectorAll("rect").length > 0;
  });
  return svgs.map((el) => ({ z: zOf(el), rects: el.querySelectorAll("rect").length, kind: "mark" }));
});
check("a blockade renders", blockade != null && marks.length > 0,
  blockade ? `on ${blockade}${marks.length ? ` (${marks[0].kind})` : ""}` : "no road hex found");
if (marks.length) {
  check("the blockade draws ABOVE both route layers",
    marks[0].z > Math.max(...[...troughs, ...lights].map((s) => s.z)),
    `blockade z${marks[0].z}`);
  check("the blockade draws BELOW unit sprites — a unit at a blockade reads in front",
    stack.tokenZ != null && marks[0].z < stack.tokenZ,
    `blockade z${marks[0].z} < sprites z${stack.tokenZ}`);
}
await page.screenshot({ path: `${OUT}/board-layers.png` });

// --- 3. routes survive the zoom-out (flat level of detail) ---------------
for (let i = 0; i < 6; i++) {
  await page.locator("button").filter({ hasText: /^−$|^-$/ }).first().click().catch(() => {});
  await page.waitForTimeout(120);
}
await page.waitForTimeout(600);
const zoomed = await page.evaluate(() => {
  const zOf = (el) => { const z = getComputedStyle(el).zIndex; return z === "auto" ? null : Number(z); };
  let lines = 0;
  for (const el of document.querySelectorAll("svg")) {
    const z = zOf(el);
    if (z != null && z >= 7000 && z < 9000) lines += el.querySelectorAll("line").length;
  }
  return lines;
});
check("routes still render at the flat level of detail", zoomed > 0, `${zoomed} strokes`);
await page.screenshot({ path: `${OUT}/board-layers-zoomed.png` });

check("no console/page errors", errors.length === 0, errors.slice(0, 2).join(" | ") || "clean");

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
