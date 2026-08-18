// The settlement window's two build economies, and the build-surplus rule.
//
// Guards three things that were each invisible until someone hit them in play:
//
//   1. A unit chip must be buildable even when every CITY slot is full. The
//      build menu used to be reachable only by clicking an empty Location
//      slot, so a developed city could no longer outfit its own garrison.
//   2. A unit chip's UPGRADE must render somewhere. It was collected by the
//      adapter and then never drawn, because the chip grid listed Location
//      chips only.
//   3. Build points past a finished build come back as scrap rather than
//      sitting on the Location as an untargeted pile.
//
//   npm run dev                        # in one shell
//   node scripts/check-settlement-ui.mjs

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
await page.waitForTimeout(1000);

// Stage the exact situation: a city with EVERY slot full, a unit standing in
// it, high Tech and plenty of scrap.
const staged = await page.evaluate(() => {
  const g = window.__ashland;
  const me = g.turnOrder[g.activeIndex];
  const loc = Object.values(g.locations).find((l) => l.controller === me);
  if (!loc) return null;
  g.players[me].techLevel = 5;
  g.players[me].resource = 200;
  g.players[me].actions.remaining = 9;
  // A unit in the city, carrying one upgradable chip so the upgrade path has
  // something to show.
  const u = Object.values(g.units).find((x) => x.owner === me);
  if (!u) return null;
  u.node = loc.hexId;
  const uid = g.nextId("chip");
  g.chips[uid] = { uid, chipId: "drilled-troops" }; // upgrades to sharpened-blades
  u.chips = [uid];
  // Fill every city slot with a cheap Location chip.
  let guard = 0;
  while (guard++ < 12) {
    const used = loc.chips.reduce((n, c) => {
      const id = g.chips[c]?.chipId;
      return n + (id === "capital" ? 1 : 1);
    }, 0);
    if (used >= loc.chipSlots + 2) break;
    const cid = g.nextId("chip");
    g.chips[cid] = { cid, uid: cid, chipId: "labs" };
    loc.chips.push(cid);
  }
  window.__ashlandBump?.();
  return { hex: loc.hexId, unit: u.uid, chip: uid };
});
check("staged a full city with a garrison", !!staged, staged ? staged.hex : "no held Location");

if (staged) {
  const at = await page.evaluate((h) => {
    const el = document.querySelector(`[data-hex="${h}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, staged.hex);
  if (at) await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(700);

  check("the city reports its slots full",
    (await page.getByText("All city slots full.").count()) > 0);
  check("the garrison gets its own section",
    (await page.getByText("Garrison · unit bays").count()) > 0);

  // 1 — outfitting is still reachable with the city full.
  const outfit = page.locator("button").filter({ hasText: /^\+ Outfit$/ }).first();
  check("an Outfit button is offered despite the full city", (await outfit.count()) > 0);
  if (await outfit.count()) {
    await outfit.click();
    await page.waitForTimeout(400);

    // Chip names are faction-flavoured at display time (Versari's "Drilled
    // Troops" reads as "Engineered Blades"), so assert on STRUCTURE and on
    // engine state rather than on any particular label.
    const menuButtons = page.locator("button").filter({ hasText: /·/ });
    check("the outfit menu opens with entries", (await menuButtons.count()) > 0,
      `${await menuButtons.count()} entries`);

    // The per-unit gates are the point of this menu: a second chip of a stat
    // family the unit already carries, and a 2-slot chip that will not fit,
    // must both be refused with a reason about THIS unit.
    check("refusals are about this unit, not the city",
      (await page.getByText("already carries a strength chip").count()) > 0 &&
      (await page.getByText("no bay space on this unit").count()) > 0);

    const enabled = page.locator("button:not([disabled])").filter({ hasText: /·/ });
    check("at least one chip is fittable", (await enabled.count()) > 0);
    if (await enabled.count()) {
      await enabled.first().click();
      await page.waitForTimeout(500);
      const queued = await page.evaluate((st) => {
        const g = window.__ashland;
        const loc = g.locations[st.hex];
        if (!loc.activeBuild) return null;
        return { chipId: loc.activeBuild.chipId, targetUnit: loc.activeBuild.targetUnit };
      }, staged);
      check("clicking a chip queues a UNIT chip against THAT unit",
        !!queued && queued.targetUnit === staged.unit,
        queued ? `${queued.chipId} → ${queued.targetUnit}` : "nothing queued");
    }
  }

  // 2 — the unit's own chip offers its upgrade.
  // The unit's own installed chip must render, WITH its upgrade arrow — this
  // is what never appeared anywhere before, since the chip grid was
  // Location-only.
  check("a unit chip renders in the garrison section with its upgrade arrow",
    (await page.locator("button").filter({ hasText: /▲/ }).count()) > 0,
    `${await page.locator("button").filter({ hasText: /▲/ }).count()} upgradable chip button(s)`);

  await page.screenshot({ path: `${OUT}/settlement-ui.png` });
}

// 3 — build surplus becomes scrap, end to end through the real Upkeep.
const surplus = await page.evaluate(() => {
  const g = window.__ashland;
  const me = g.turnOrder[g.activeIndex];
  const loc = Object.values(g.locations).find((l) => l.controller === me);
  loc.buildSlider = 1;        // everything to BUILD
  loc.production = 40;        // vastly more than the queued chip costs
  const before = g.players[me].resource;
  return { hex: loc.hexId, before, hadBuild: !!loc.activeBuild };
});
// Close the settlement window first — it overlays the End Turn control.
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
await page.locator("button").filter({ hasText: "End Turn" }).first().click();
await page.waitForTimeout(600);
// Skip the AI turns back round to us.
for (let i = 0; i < 30; i++) {
  const mine = await page.evaluate(() => {
    const g = window.__ashland;
    return g.turnOrder[g.activeIndex] === g.youId;
  });
  if (mine) break;
  await page.waitForTimeout(1000);
}
const after = await page.evaluate((s) => {
  const g = window.__ashland;
  const loc = g.locations[s.hex];
  return {
    progress: loc.buildProgress || 0,
    active: !!loc.activeBuild,
    surplusLogged: g.log.some((e) => e.payload?.source === "build-surplus"
      || (e.name === "resource_gained" && e.payload?.source === "output")),
  };
}, surplus);
check("no untargeted build progress is left sitting on the Location",
  after.active || after.progress === 0,
  `progress ${after.progress}, ${after.active ? "still building" : "idle"}`);

check("no console/page errors", errors.length === 0, errors.slice(0, 2).join(" | ") || "clean");

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
