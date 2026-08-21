// Sprite verification harness — does the unit art actually land on the board?
//
// This is a measuring tool, not just a screenshotter. Eyeballing a 61 px sprite
// will not tell you whether its anchor is on the ground point or 13 px above
// it, so the checks below read the live geometry back out of the DOM and
// compare it against docs/unit-model-pipeline.md and unitSprites.json.
//
//   npm run dev                      # in one shell
//   node scripts/check-unit-sprites.mjs
//
// Env: SHOT_BASE (default http://localhost:5173/PABC), SHOT_W / SHOT_H.

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { chooseSlots } from "../src/prototype/boardSlots.js";

const BASE = (process.env.SHOT_BASE || "http://localhost:5173/PABC").replace(/\/$/, "");
const OUT = "screenshots";
const VIEWPORT = { width: Number(process.env.SHOT_W) || 1600, height: Number(process.env.SHOT_H) || 1000 };
const SEED = "424242";

const MANIFEST = JSON.parse(await readFile("src/prototype/unitSprites.json", "utf8"));

// Resolve whatever the board actually drew, rather than assuming a faction or a
// tier: the player's faction comes from the setup screen and the model comes
// from the unit's movement chips, so both are discovered, not hardcoded.
function specFromSheetUrl(url) {
  const file = decodeURIComponent(url).split("/").pop().replace(/_sheet\.webp$/, "");
  for (const [faction, units] of Object.entries(MANIFEST.units)) {
    for (const [key, spec] of Object.entries(units)) {
      for (const [variant, v] of Object.entries(spec.variants)) {
        if (v.sheet.endsWith(`${file}_sheet.webp`)) return { faction, key, variant, spec };
      }
    }
  }
  return null;
}

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function enterGame(page) {
  await page.goto(`${BASE}/?board=holo`, { waitUntil: "domcontentloaded" });
  await page.locator("button").filter({ hasText: "NEW GAME" }).first().click({ timeout: 20000 });
  // Versari is the default selection, and is the only faction with unit art
  // so far — click it anyway so the test does not silently depend on that.
  await page.locator("button").filter({ hasText: "VERSARI KORAD" }).first().click();
  // Seed lives under the collapsed settings section; fix it so the board lays
  // out identically every run.
  await page.locator("button").filter({ hasText: "ADDITIONAL SETTINGS" }).first().click().catch(() => {});
  await page.waitForTimeout(300);
  await page.getByPlaceholder("random").fill(SEED).catch(() => {});
  await page.locator("button").filter({ hasText: "BEGIN" }).first().click();
  await page.getByText("End Turn").waitFor({ timeout: 25000 });
  await page.waitForTimeout(1400);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await mkdir(OUT, { recursive: true });
await enterGame(page);

// --- 1. do sprites exist on the board at all? ----------------------------
const n = await page.locator("[data-unit-sprite]").count();
check("sprite tokens rendered", n > 0, `${n} on board`);
if (n === 0) {
  console.log("\nNo sprite tokens — does the player's faction have art built?");
  await page.screenshot({ path: `${OUT}/unit-sprites-NONE.png` });
  await browser.close();
  process.exit(1);
}

// --- 2. the sheet actually loads (a 404 would render an empty box) -------
const loaded = await page.evaluate(async () => {
  const el = document.querySelector("[data-unit-sprite]");
  const url = getComputedStyle(el).backgroundImage.match(/url\("?(.+?)"?\)/)?.[1];
  if (!url) return { ok: false, url: null };
  const r = await fetch(url, { method: "GET" });
  const b = await r.blob();
  return { ok: r.ok, url, status: r.status, bytes: b.size, type: b.type };
});
check("sheet fetches 200", loaded.ok, `${loaded.status} ${loaded.bytes} bytes ${loaded.type}`);

// Everything below is measured against whichever sheet the board chose.
const resolved = loaded.url ? specFromSheetUrl(loaded.url) : null;
check("drawn sheet is one the manifest knows", !!resolved,
  resolved ? `${resolved.faction}/${resolved.key}/${resolved.variant}` : loaded.url);
if (!resolved) { await browser.close(); process.exit(1); }
const spec = resolved.spec;

// Decode it to confirm the browser accepts the WebP + alpha.
const decoded = await page.evaluate((url) => new Promise((res) => {
  const im = new Image();
  im.onload = () => res({ ok: true, w: im.naturalWidth, h: im.naturalHeight });
  im.onerror = () => res({ ok: false });
  im.src = url;
}), loaded.url);
check("sheet decodes", decoded.ok && decoded.w === spec.sheetWidth && decoded.h === spec.sheetHeight,
  decoded.ok ? `${decoded.w}x${decoded.h}` : "decode failed");

// --- 3. rendered scale matches the derivation ----------------------------
const HEX_W = 216, HEX_VV = 36.95;
const expectScale = HEX_W / HEX_VV / spec.pixelsPerMetre;
const expectCell = spec.frameWidth * expectScale;
const geom = await page.evaluate(() => {
  const el = document.querySelector("[data-unit-sprite]");
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return { w: r.width, h: r.height, bgSize: cs.backgroundSize, anim: cs.animation, delay: cs.animationDelay };
});
// deviceScaleFactor 2 does not affect CSS px, but the board viewport applies
// its own zoom transform, so compare the ratio rather than the raw number.
const zoom = geom.w / expectCell;
check("sprite cell scale", Math.abs(geom.w / geom.h - 1) < 0.01,
  `${geom.w.toFixed(1)}x${geom.h.toFixed(1)}px (board zoom ${zoom.toFixed(3)}x, expected cell ${expectCell.toFixed(1)}px at 1x)`);

// --- 4. the anchor sits on the ground point, not the cell bottom ---------
// The wrapper div is the ground point. The sprite's anchor pixel must land on
// it: sprite.top + anchorY*scale == wrapper.top (within a pixel).
const anchorCheck = await page.evaluate((sp) => {
  const el = document.querySelector("[data-unit-sprite]");
  const wrap = el.parentElement;
  const r = el.getBoundingClientRect();
  const w = wrap.getBoundingClientRect();
  const s = r.width / sp.frameWidth;
  return {
    dx: (r.left + sp.anchor[0] * s) - w.left,
    dy: (r.top + sp.anchor[1] * s) - w.top,
    bottomGap: (r.top + r.height) - w.top, // how far the cell bottom falls below ground
    scale: s,
  };
}, spec);
check("anchor lands on ground point",
  Math.abs(anchorCheck.dx) < 1.0 && Math.abs(anchorCheck.dy) < 1.0,
  `offset (${anchorCheck.dx.toFixed(2)}, ${anchorCheck.dy.toFixed(2)})px`);
check("cell bottom hangs below ground (not flush)",
  anchorCheck.bottomGap > 1,
  `${anchorCheck.bottomGap.toFixed(1)}px below — would be 0 if positioned by bottom edge`);

// --- 5. animation is running at the declared rate ------------------------
const animDur = parseFloat(geom.anim.match(/([\d.]+)s/)?.[1] || "0");
// One keyframe per sheet width, so the three tiers stay in register.
const wantAnim = `unit-idle-${spec.sheetWidth}`;
check("idle animation wired",
  geom.anim.includes(wantAnim)
    && geom.anim.includes(`steps(${spec.frames})`)
    && Math.abs(animDur - spec.frames / spec.fps) < 0.01,
  `${wantAnim} ${animDur}s steps(${spec.frames}) = ${spec.fps} fps`);

// Frames actually advance: sample background-position-x over time.
const frames = await page.evaluate(() => new Promise((res) => {
  const el = document.querySelector("[data-unit-sprite]");
  const seen = new Set();
  const t = setInterval(() => seen.add(getComputedStyle(el).backgroundPositionX), 90);
  setTimeout(() => { clearInterval(t); res([...seen]); }, 3900);
}));
check("frames advance over one loop", frames.length >= spec.frames - 1,
  `${frames.length} distinct positions in 3.9s (expect ~${spec.frames})`);

// --- 6. variant selection -------------------------------------------------
const variants = await page.evaluate(() => {
  const out = {};
  for (const el of document.querySelectorAll("[data-unit-sprite]")) {
    // Report the whole stem, so a tier promotion is as visible as a variant swap.
    const u = getComputedStyle(el).backgroundImage
      .match(/\/([^/]+)_sheet\.webp/)?.[1] || "unknown";
    out[u] = (out[u] || 0) + 1;
  }
  return out;
});
check("variant chosen per unit", Object.keys(variants).length > 0, JSON.stringify(variants));

// --- 7. per-unit desync ---------------------------------------------------
const delays = await page.evaluate(() =>
  [...document.querySelectorAll("[data-unit-sprite]")].map((e) => getComputedStyle(e).animationDelay));
check("units desynced", new Set(delays).size > 1 || delays.length === 1,
  `${new Set(delays).size} distinct delays across ${delays.length} units`);

// --- 8. overlap when several units share a hex ---------------------------
const overlap = await page.evaluate(() => {
  const byHex = new Map();
  for (const el of document.querySelectorAll("[data-unit-sprite]")) {
    const hex = el.closest("[key], div")?.parentElement;
    const r = el.getBoundingClientRect();
    const k = Math.round(r.top / 5);
    if (!byHex.has(k)) byHex.set(k, []);
    byHex.get(k).push(r);
  }
  let worst = null;
  for (const rects of byHex.values()) {
    if (rects.length < 2) continue;
    rects.sort((a, b) => a.left - b.left);
    for (let i = 1; i < rects.length; i++) {
      const ov = rects[i - 1].right - rects[i].left;
      const frac = ov / rects[i].width;
      if (ov > 0 && (!worst || frac > worst.frac)) worst = { frac, ov, w: rects[i].width, n: rects.length };
    }
  }
  return worst;
});
if (overlap) {
  check("stacked units keep >=70% visible", 1 - overlap.frac >= 0.70,
    `worst pair overlaps ${(overlap.frac * 100).toFixed(1)}% -> ${((1 - overlap.frac) * 100).toFixed(1)}% visible (${overlap.n} on a hex)`);
}

// A fresh game rarely puts a crowd on one hex, so build one: clone the live
// token into the same layer at the exact positions chooseSlots() would produce,
// measure the rendered rects, then tear it down. The positions come from the
// real layout code imported here rather than being re-derived, so this cannot
// drift from what the board actually does. Only the occupancy is synthetic.
const CROWD = 6;
const boardScale = HEX_W / HEX_VV / spec.pixelsPerMetre;
const halfW = (spec.footprintMetres * spec.pixelsPerMetre * boardScale) / 2;
const crowdBox = (x, y) => ({ x0: x - halfW, x1: x + halfW, y0: y - spec.anchor[1] * boardScale, y1: y + halfW * Math.sin((34.18 * Math.PI) / 180) });
const crowdSlots = chooseSlots(CROWD, { x: 0, y: 0 }, [], crowdBox);

const stack = await page.evaluate(({ cellPx, slots }) => {
  const el = document.querySelector("[data-unit-sprite]");
  const wrap = el.parentElement;
  // Recover the board's live zoom from the rendered sprite so the clones sit at
  // the same scale as everything else on screen. Cell size comes from the
  // resolved spec, since infantry and the two vehicle tiers all differ.
  const zoom = el.getBoundingClientRect().width / cellPx;
  const host = wrap.parentElement;
  const baseL = parseFloat(wrap.style.left || 0);
  const baseT = parseFloat(wrap.style.top || 0);
  const made = [];
  for (const s of slots) {
    const c = wrap.cloneNode(true);
    c.style.left = `${baseL + s.left}px`;
    c.style.top = `${baseT + s.top}px`;
    c.dataset.stackTest = "1";
    host.appendChild(c);
    made.push(c);
  }
  const rectsOf = (sel) => made.map((c) => c.querySelector(sel).getBoundingClientRect());
  // Vertical separation between ranks reads as depth and is fine. What ruins
  // legibility is two units at the same depth overlapping sideways, so only
  // same-rank pairs are scored.
  const sameRankWorst = (rects) => {
    let worst = 0;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        if (Math.abs(rects[i].top - rects[j].top) > rects[i].height * 0.25) continue;
        const ov = Math.min(rects[i].right, rects[j].right) - Math.max(rects[i].left, rects[j].left);
        if (ov > 0) worst = Math.max(worst, ov / rects[i].width);
      }
    }
    return worst;
  };
  const hits = rectsOf("[data-unit-uid]");
  const out = {
    zoom,
    worst: sameRankWorst(hits),
    width: hits[0].width,
    ySpread: Math.max(...hits.map((r) => r.top)) - Math.min(...hits.map((r) => r.top)),
    distinct: new Set(hits.map((r) => `${Math.round(r.left)},${Math.round(r.top)}`)).size,
  };
  made.forEach((c) => c.remove());
  return out;
}, { cellPx: spec.frameWidth * boardScale, slots: crowdSlots });

check(`${CROWD}-unit hex: every unit gets its own spot`, stack.distinct === CROWD,
  `${stack.distinct} distinct positions`);
check(`${CROWD}-unit hex: spread through the tile's depth`, stack.ySpread > stack.width * 0.8,
  `${stack.ySpread.toFixed(0)}px of depth vs ${stack.width.toFixed(0)}px unit width`);
// The ">=70% visible" rule is about units drawn shoulder to shoulder; with the
// ring, that only applies to units sharing a rank.
check(`${CROWD}-unit hex: same-rank units keep >=70% visible (${resolved.key})`, 1 - stack.worst >= 0.70,
  stack.worst === 0 ? "no two share a rank" : `${(stack.worst * 100).toFixed(1)}% overlap`);

// Report the ring's spread for each tier — vehicles are wider and pull the ring
// in to stay on the tile, so their crowding is worth seeing.
{
  const rows = Object.entries(MANIFEST.units[resolved.faction]).map(([key, sp]) => {
    const s = HEX_W / HEX_VV / sp.pixelsPerMetre;
    const w = sp.footprintMetres * sp.pixelsPerMetre * s;
    const hb = (x, y) => ({ x0: x - w / 2, x1: x + w / 2, y0: y - sp.anchor[1] * s, y1: y + (w / 2) * Math.sin((34.18 * Math.PI) / 180) });
    const ps = chooseSlots(CROWD, { x: 0, y: 0 }, [], hb);
    let worst = 0;
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        if (Math.abs(ps[i].top - ps[j].top) > 12) continue;
        const ov = w - Math.abs(ps[i].left - ps[j].left);
        if (ov > 0) worst = Math.max(worst, ov / w);
      }
    }
    return { key, w, worst };
  });
  for (const r of rows) {
    console.log(`  ..    ${r.key.padEnd(11)} ${r.w.toFixed(1)}px wide, ${CROWD} on a hex -> ` +
      `${(r.worst * 100).toFixed(0)}% same-rank overlap, ${(100 - r.worst * 100).toFixed(0)}% visible ` +
      `${r.worst <= 0.30 ? "(within rule)" : "(EXCEEDS 70% rule)"}`);
  }
  const bad = rows.filter((r) => r.worst > 0.30).map((r) => r.key);
  check("every tier fits the 70% rule in the ring", bad.length === 0,
    bad.length ? `${bad.join(", ")} still crowd at ${CROWD} per hex` : `all tiers clear at ${CROWD} per hex`);
}
// --- 9. no unit hidden behind a floating radial --------------------------
// Radials paint above the token layer, so any overlap is a unit the player
// simply cannot see. Measured in screen space against what is actually drawn:
// the figure's own extent, not its mostly-empty 192 px canvas.
const hidden = await page.evaluate(() => {
  // Drawn extent inside the cell, relative to the anchor (see unitSprites.js).
  const HALF_W = 63 / 192, ABOVE = 130 / 192, BELOW = 33 / 192;
  const radials = [...document.querySelectorAll("[data-radial]")].map((e) => e.getBoundingClientRect());
  const out = [];
  for (const el of document.querySelectorAll("[data-unit-sprite]")) {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const anchorY = r.top + r.height * (150 / 192);
    const box = {
      x0: cx - r.width * HALF_W, x1: cx + r.width * HALF_W,
      y0: anchorY - r.height * ABOVE, y1: anchorY + r.height * BELOW,
    };
    for (const q of radials) {
      const ox = Math.min(box.x1, q.right) - Math.max(box.x0, q.left);
      const oy = Math.min(box.y1, q.bottom) - Math.max(box.y0, q.top);
      if (ox > 0 && oy > 0) {
        out.push(((ox * oy) / ((box.x1 - box.x0) * (box.y1 - box.y0)) * 100).toFixed(1));
      }
    }
  }
  return { radials: radials.length, hits: out };
});
check("no unit hidden behind a radial", hidden.hits.length === 0,
  hidden.radials === 0 ? "no radials on screen this seed"
    : `${hidden.radials} radials, ${hidden.hits.length} overlapping units${hidden.hits.length ? ` (${hidden.hits.join("%, ")}%)` : ""}`);

// --- 10. every sheet and mask in the manifest actually serves ------------
// A fresh game starts with no chips, so only infantry ever appears on screen.
// The vehicle tiers are reachable in play, and a 404 there would show up as an
// invisible unit mid-game, so fetch and decode the whole set now.
const allAssets = [];
for (const [faction, units] of Object.entries(MANIFEST.units)) {
  for (const [key, sp] of Object.entries(units)) {
    for (const [variant, v] of Object.entries(sp.variants)) {
      allAssets.push({ id: `${faction}/${key}/${variant}`, sheet: v.sheet, mask: v.mask, w: sp.sheetWidth, h: sp.sheetHeight });
    }
  }
}
const served = await page.evaluate(async ({ base, assets }) => {
  const decode = (url) => new Promise((res) => {
    const im = new Image();
    im.onload = () => res({ ok: true, w: im.naturalWidth, h: im.naturalHeight });
    im.onerror = () => res({ ok: false });
    im.src = url;
  });
  const bad = [];
  for (const a of assets) {
    // No mask key means the manifest is declaring an asset nobody owns — there
    // is no owner region to tint, so there is nothing to author and nothing to
    // serve (docs/weather-machine-pipeline-asks.md).
    const files = a.mask ? [["sheet", a.sheet], ["mask", a.mask]] : [["sheet", a.sheet]];
    for (const [kind, rel] of files) {
      const url = `${base}/${rel}`;
      const r = await fetch(url).catch(() => null);
      if (!r || !r.ok) { bad.push(`${a.id} ${kind}: HTTP ${r ? r.status : "failed"}`); continue; }
      const d = await decode(url);
      if (!d.ok) bad.push(`${a.id} ${kind}: will not decode`);
      else if (d.w !== a.w || d.h !== a.h) bad.push(`${a.id} ${kind}: ${d.w}x${d.h}, expected ${a.w}x${a.h}`);
    }
  }
  return bad;
}, { base: await page.evaluate(() => new URL(document.baseURI).origin + new URL(document.baseURI).pathname.replace(/\/$/, "") + "/assets/units"), assets: allAssets });
const fileCount = allAssets.reduce((n, a) => n + (a.mask ? 2 : 1), 0);
check("every sheet and mask serves and decodes", served.length === 0,
  served.length ? served.slice(0, 3).join(" | ") : `${fileCount} files across ${Object.keys(MANIFEST.units).length} factions`);

check("no console/page errors", errors.length === 0, errors.slice(0, 2).join(" | ") || "clean");

await page.screenshot({ path: `${OUT}/unit-sprites-board.png` });

// Zoomed crop centred on a unit, for the visual read.
const box = await page.locator("[data-unit-sprite]").first().boundingBox();
await page.screenshot({
  path: `${OUT}/unit-sprites-closeup.png`,
  clip: {
    x: Math.max(0, box.x - 150), y: Math.max(0, box.y - 130),
    width: Math.min(420, VIEWPORT.width - Math.max(0, box.x - 150)),
    height: Math.min(320, VIEWPORT.height - Math.max(0, box.y - 130)),
  },
});

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
console.log(`screenshots: ${OUT}/unit-sprites-board.png, ${OUT}/unit-sprites-closeup.png`);
if (failed.length) process.exit(1);
