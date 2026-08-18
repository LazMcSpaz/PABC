// Rail doc §3 — can a human actually raise and upgrade a blockade?
//
// The whole blockade system was engine-only: `build-blockade` and
// `upgrade-blockade` had no control anywhere in the interface, so a player
// could neither raise one nor fit the Signal Mast that stops units sneaking
// past it. Both now live in the UnitPanel, because a blockade sits on a plain
// road hex and a plain hex opens no window of its own — the unit standing
// there is the only handle a player has on it.
//
//   npm run dev                        # in one shell
//   node scripts/check-blockade-ui.mjs

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
await page.waitForTimeout(900);

const selectUnit = async () => {
  const at = await page.evaluate(() => {
    const g = window.__ashland;
    const me = g.turnOrder[g.activeIndex];
    const u = Object.values(g.units).find((x) => x.owner === me);
    const el = document.querySelector(`[data-hex="${u.node}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, unit: u.uid, hex: u.node };
  });
  if (!at) return null;
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(500);
  // Clicking a hex may open the Location window; the unit token itself opens
  // the UnitPanel, so click the sprite when the panel did not appear.
  if ((await page.getByText("Blockade", { exact: true }).count()) === 0) {
    // `[data-unit-sprite]` is the ART and is pointer-events:none — the hit
    // target is its sibling, keyed by unit uid. Click by coordinate because the
    // hex hit-polygon overlaps it.
    const box = await page.evaluate((uid) => {
      const el = document.querySelector(`[data-unit-uid="${uid}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, at.unit);
    if (box) { await page.mouse.click(box.x, box.y); await page.waitForTimeout(500); }
  }
  return at;
};

// Stage: put the player's unit on a plain road hex with supply and scrap.
const staged = await page.evaluate(() => {
  const g = window.__ashland;
  const me = g.turnOrder[g.activeIndex];
  const u = Object.values(g.units).find((x) => x.owner === me);
  const home = Object.values(g.locations).find((l) => l.controller === me);
  if (!u || !home) return null;
  // Nearest road hex to home that carries no Location.
  const seen = { [home.hexId]: 0 };
  const q = [home.hexId];
  let target = null;
  while (q.length && !target) {
    const cur = q.shift();
    for (const nb of g.board.adjacency[cur] || []) {
      if (seen[nb] !== undefined) continue;
      seen[nb] = seen[cur] + 1;
      if (g.board.hexes[nb].road && !g.locations[nb]) { target = nb; break; }
      q.push(nb);
    }
  }
  if (!target) return null;
  u.node = target;
  g.players[me].resource = 200;
  g.players[me].techLevel = 5;
  g.players[me].actions.remaining = 9;
  window.__ashlandBump?.();
  return { unit: u.uid, hex: target };
});
check("staged a unit on a supplied road hex", !!staged, staged ? staged.hex : "none found");

if (staged) {
  await selectUnit();
  check("the UnitPanel shows a Blockade section",
    (await page.getByText("Blockade", { exact: true }).count()) > 0);

  const raise = page.locator("button").filter({ hasText: /Raise blockade/ }).first();
  check("a Raise blockade button is offered", (await raise.count()) > 0);

  if (await raise.count()) {
    const enabled = await raise.isEnabled();
    check("the button is live when the engine would allow it", enabled);
    await page.screenshot({ path: `${OUT}/blockade-ui-build.png` });
    if (enabled) {
      await raise.click();
      await page.waitForTimeout(600);
      const site = await page.evaluate((h) => {
        const b = window.__ashland.world?.blockades?.[h];
        return b ? { done: b.done, cost: b.cost, builder: b.builder } : null;
      }, staged.hex);
      check("clicking it starts a real construction site in the engine",
        !!site && site.done === false && site.builder === staged.unit,
        site ? `cost ${site.cost}, builder ${site.builder}` : "nothing there");
    }
  }

  // Finish it, then check the chip-fitting half.
  await page.evaluate((h) => {
    const g = window.__ashland;
    const b = g.world.blockades[h];
    b.done = true; b.paid = true; b.progress = b.cost; b.builder = null;
    window.__ashlandBump?.();
  }, staged.hex);
  await page.waitForTimeout(500);
  await selectUnit();

  const fit = page.locator("button").filter({ hasText: /^\+ Fit$/ }).first();
  check("a finished blockade offers a Fit button", (await fit.count()) > 0);
  if (await fit.count()) {
    await fit.click();
    await page.waitForTimeout(400);
    const entries = page.locator("button:not([disabled])").filter({ hasText: /·/ });
    check("the fit menu lists blockade chips", (await entries.count()) > 0,
      `${await entries.count()} fittable`);
    if (await entries.count()) {
      await entries.first().click();
      await page.waitForTimeout(500);
      const queued = await page.evaluate((h) => {
        const b = window.__ashland.world.blockades[h];
        return b?.build ? { chipId: b.build.chipId, cost: b.build.cost } : null;
      }, staged.hex);
      check("clicking a chip queues it onto the blockade",
        !!queued, queued ? `${queued.chipId} (${queued.cost})` : "nothing queued");
    }
    await page.screenshot({ path: `${OUT}/blockade-ui-fit.png` });
  }
}

// §17.7 — the listening post shares the panel and the same reasoning.
{
  await page.evaluate(() => {
    const g = window.__ashland;
    const me = g.turnOrder[g.activeIndex];
    // Grant the tech that unlocks posts, and clear the blockade off the hex so
    // the post has somewhere legal to go.
    g.players[me].techWheel = ["int-entry", "int-a2"];
    const u = Object.values(g.units).find((x) => x.owner === me);
    for (const h of Object.keys(g.world?.blockades || {})) delete g.world.blockades[h];
    const plain = (g.board.adjacency[u.node] || []).find((h) => !g.locations[h]);
    if (plain) u.node = plain;
    g.players[me].resource = 200;
    window.__ashlandBump?.();
  });
  await page.waitForTimeout(500);
  await selectUnit();
  const btn = page.locator("button").filter({ hasText: /Build post/ }).first();
  check("a Build post button is offered once the tech is in hand",
    (await btn.count()) > 0);
  if (await btn.count()) {
    check("the post button is live", await btn.isEnabled());
    await btn.click();
    await page.waitForTimeout(600);
    const built = await page.evaluate(() => {
      const g = window.__ashland;
      const me = g.turnOrder[g.activeIndex];
      const u = Object.values(g.units).find((x) => x.owner === me);
      const posts = g.world?.listeningPosts || {};
      return Object.values(posts).some((p) => p.hex === u.node && p.owner === me);
    });
    check("clicking it builds a real listening post in the engine", built);
  }
}

check("no console/page errors", errors.length === 0, errors.slice(0, 2).join(" | ") || "clean");

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
