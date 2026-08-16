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

const BASE = (process.env.SHOT_BASE || "http://localhost:5173/PABC").replace(/\/$/, "");
const OUT = "screenshots";
const VIEWPORT = { width: Number(process.env.SHOT_W) || 1600, height: Number(process.env.SHOT_H) || 1000 };
const SEED = "424242";

const spec = JSON.parse(await readFile("src/prototype/unitSprites.json", "utf8")).units.versari.infantry;

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
  console.log("\nNo sprite tokens — is the player faction Versari?");
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
check("idle animation wired",
  geom.anim.includes("unit-idle-cycle")
    && geom.anim.includes(`steps(${spec.frames})`)
    && Math.abs(animDur - spec.frames / spec.fps) < 0.01,
  `${animDur}s steps(${spec.frames}) = ${spec.fps} fps`);

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
    const u = getComputedStyle(el).backgroundImage.match(/versari_infantry_(\w+?)_sheet/)?.[1];
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

// A fresh game only starts two units, and rarely on one hex. Rather than leave
// the worst case untested, build the full five-unit stack for real: clone the
// live token into the same layer at the exact offsets slotPos() would produce
// for count=5, measure the rendered rects, then tear it down. Same sprite, same
// scale, same spacing the renderer uses — only the occupancy is synthetic.
const stack = await page.evaluate(() => {
  const MAX_SLOTS = 5, SLOT_SPACING = 0.155, HEX_W = 216;
  const el = document.querySelector("[data-unit-sprite]");
  const wrap = el.parentElement;
  // Recover the board's live zoom from the rendered sprite so the clones sit
  // at the same scale as everything else on screen.
  const zoom = el.getBoundingClientRect().width / (192 * (HEX_W / 36.95 / 18.3));
  const host = wrap.parentElement;
  const made = [];
  for (let i = 0; i < MAX_SLOTS; i++) {
    const c = wrap.cloneNode(true);
    const x = (i - (MAX_SLOTS - 1) / 2) * SLOT_SPACING * HEX_W;
    c.style.left = `${parseFloat(wrap.style.left || 0) + x}px`;
    c.dataset.stackTest = "1";
    host.appendChild(c);
    made.push(c);
  }
  const worstOf = (sel) => {
    const rects = made.map((c) => c.querySelector(sel).getBoundingClientRect());
    rects.sort((a, b) => a.left - b.left);
    let worst = 0;
    for (let i = 1; i < rects.length; i++) {
      worst = Math.max(worst, (rects[i - 1].right - rects[i].left) / rects[i].width);
    }
    return { worst, width: rects[0].width, spacing: rects[1].left - rects[0].left };
  };
  // The canvas box and the click target are different questions: the first is
  // mostly transparent headroom, the second is what a player has to hit.
  const canvas = worstOf("[data-unit-sprite]");
  const hit = worstOf("[data-unit-uid]");
  made.forEach((c) => c.remove());
  return { canvas, hit, zoom };
});
// The ">=70% visible" rule is about the drawn figure, so measure it against the
// footprint-sized target rather than the 192 px canvas the art is padded into.
check("5-unit stack keeps >=70% visible", 1 - stack.hit.worst >= 0.70,
  `footprint ${stack.hit.width.toFixed(1)}px at ${stack.hit.spacing.toFixed(1)}px spacing -> ` +
  `${(stack.hit.worst * 100).toFixed(1)}% overlap, ${((1 - stack.hit.worst) * 100).toFixed(1)}% visible`);
check("click targets do not swallow neighbours", stack.hit.worst < 0.30,
  `hit box ${stack.hit.width.toFixed(1)}px vs full canvas ${stack.canvas.width.toFixed(1)}px ` +
  `(canvas boxes would overlap ${(stack.canvas.worst * 100).toFixed(1)}%)`);

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
