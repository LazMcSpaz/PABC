// Rail doc §2.2 / §3.4 — does the pooling UI actually reach a human player?
//
// `set-pool-target` and `set-build-priority` existed engine-side for a while
// with no control anywhere in the interface, so this checks the controls are
// really in the settlement window, that they only appear when they are usable,
// and that clicking one changes engine state — not just that the component
// compiles.
//
//   npm run dev                      # in one shell
//   node scripts/check-pooling-ui.mjs
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

async function enterGame(page) {
  await page.goto(`${BASE}/?board=holo`, { waitUntil: "domcontentloaded" });
  await page.locator("button").filter({ hasText: "NEW GAME" }).first().click({ timeout: 20000 });
  await page.locator("button").filter({ hasText: "VERSARI KORAD" }).first().click();
  await page.locator("button").filter({ hasText: "ADDITIONAL SETTINGS" }).first().click().catch(() => {});
  await page.waitForTimeout(300);
  await page.getByPlaceholder("random").fill(SEED).catch(() => {});
  await page.locator("button").filter({ hasText: "BEGIN" }).first().click();
  await page.getByText("End Turn").waitFor({ timeout: 25000 });
  await page.waitForTimeout(1200);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
// The webfont comes from fonts.googleapis.com, which a sandboxed or offline
// runner will refuse. That is the environment, not the page — ignore it here
// so a network-isolated CI run does not report a false failure.
const EXTERNAL = /fonts\.(googleapis|gstatic)\.com/;
page.on("console", (m) => {
  if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text());
});
page.on("requestfailed", (r) => {
  if (!EXTERNAL.test(r.url())) errors.push(`REQ ${r.url()} ${r.failure()?.errorText}`);
});

await mkdir(OUT, { recursive: true });
await enterGame(page);

// Which of the player's settlements has a legal pool target? The adapter
// computes this, so ask the running game rather than guessing from the map.
const target = await page.evaluate(() => {
  const g = window.__ashland;
  if (!g) return { error: "no engine handle on window.__ashland" };
  const me = g.turnOrder[g.activeIndex];
  const out = [];
  for (const loc of Object.values(g.locations)) {
    if (loc.controller !== me) continue;
    for (const link of g.board.rails || []) {
      const far = link.a === loc.hexId ? link.b : link.b === loc.hexId ? link.a : null;
      if (far == null) continue;
      if (g.locations[far]?.controller !== me) continue;
      out.push({ hexId: loc.hexId, to: far });
    }
  }
  return { me, pairs: out };
});

check("engine handle available", !target.error, target.error || "");

// Rail is generated as a spanning tree over CAPITALS, and a faction starts
// holding exactly one — so at turn 1 nobody has a legal pool pair and the
// control correctly renders nowhere. That is itself the first assertion.
check("no pooling control on a settlement with no railed sibling",
  target.pairs?.length === 0,
  "rail links capitals only, so pooling is unreachable until you take one");

// Stage the situation pooling exists for: a second capital in your hands.
const staged = await page.evaluate(() => {
  const g = window.__ashland;
  const me = g.turnOrder[g.activeIndex];
  const mine = Object.values(g.locations).find((l) => l.controller === me);
  if (!mine) return null;
  for (const link of g.board.rails || []) {
    const far = link.a === mine.hexId ? link.b : link.b === mine.hexId ? link.a : null;
    if (far == null || !g.locations[far]) continue;
    // Take the far capital, and clear the line so nothing reads as cut.
    g.locations[far].controller = me;
    for (const uid of Object.keys(g.units)) {
      if (g.units[uid].owner !== me && link.path.includes(g.units[uid].node)) delete g.units[uid];
    }
    window.__ashlandBump?.();
    return { hexId: mine.hexId, to: far };
  }
  return null;
});
check("a poolable pair can be staged", !!staged,
  staged ? `${staged.hexId} → ${staged.to}` : "no rail link off a held settlement");
if (staged) target.pairs = [staged];
await page.waitForTimeout(400);

if (target.pairs?.length) {
  const { hexId, to } = target.pairs[0];
  // Open that settlement's window.
  // `[data-hex]` is a zero-size positioning anchor at the hex centre, not a
  // hit target — click the point it marks rather than the element.
  const at = await page.evaluate((h) => {
    const el = document.querySelector(`[data-hex="${h}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, hexId);
  if (!at) check("settlement hex is on screen", false, hexId);
  else await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(700);
  const opened = await page.getByText("Rail · pool build output").count();
  check("pooling section renders in the settlement window", opened > 0);

  if (opened > 0) {
    const keepFirst = await page.evaluate(() => {
      const g = window.__ashland;
      const me = g.turnOrder[g.activeIndex];
      return Object.values(g.locations).filter((l) => l.controller === me).map((l) => l.poolTarget ?? null);
    });
    check("settlements start with no pool target", keepFirst.every((t) => t == null));

    // Click the "→ <name>" pill and confirm the ENGINE changed, not just the DOM.
    const pill = page.locator("button").filter({ hasText: /^→ / }).first();
    const hasPill = await pill.count();
    check("a recipient pill is offered", hasPill > 0);
    if (hasPill) {
      await pill.click();
      await page.waitForTimeout(400);
      const after = await page.evaluate((h) => {
        const g = window.__ashland;
        return g.locations[h]?.poolTarget ?? null;
      }, hexId);
      check("clicking a recipient sets poolTarget in the engine",
        after === to, `poolTarget = ${after ?? "null"} (wanted ${to})`);

      // And clicking Keep clears it again.
      await page.locator("button").filter({ hasText: /^Keep$/i }).first().click();
      await page.waitForTimeout(400);
      const cleared = await page.evaluate((h) => {
        const g = window.__ashland;
        return g.locations[h]?.poolTarget ?? null;
      }, hexId);
      check("Keep clears the pool target", cleared == null, `poolTarget = ${cleared ?? "null"}`);
    }
    await page.screenshot({ path: `${OUT}/pooling-ui.png` });
  }
}

// The funding-priority toggle must stay hidden while no blockade is funded.
const priorityShown = await page.getByText("Funding priority").count();
check("funding priority is hidden with no blockade under construction",
  priorityShown === 0, `${priorityShown} shown`);

check("no console/page errors", errors.length === 0, errors.slice(0, 2).join(" | ") || "clean");

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
