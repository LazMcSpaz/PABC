// Is every per-turn cost visible, and does the number quoted match the number
// the engine charges?
//
// Units, blockades, listening posts and a handful of chips all bill each
// Upkeep. Before this pass none of it appeared anywhere: a player recruited a
// fifth unit and only discovered the cost when their army starved. The risk
// with fixing that in five places is that the five numbers drift apart, so
// this checks the top bar's running total against a real Upkeep tick.
//
//   npm run dev                       # in one shell
//   node scripts/check-upkeep-ui.mjs

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

// --- 1. the top bar quotes a net per turn --------------------------------
const bar = await page.evaluate(() => {
  const txt = document.body.innerText;
  const m = txt.match(/SCRAP ([+-]\d+)\s*\/\s*TURN/i);
  return { shown: !!m, net: m ? Number(m[1]) : null };
});
check("the top bar quotes a net scrap-per-turn", bar.shown, bar.shown ? `${bar.net}/turn` : "not found");

// --- 2. that number matches a real Upkeep --------------------------------
// Stage a bill the player cannot miss: a blockade, a post, and a fully-chipped
// unit, then run a real Upkeep and compare the delta to what the bar promised.
const staged = await page.evaluate(() => {
  const g = window.__ashland;
  const me = g.turnOrder[g.activeIndex];
  g.players[me].resource = 500;
  g.players[me].techLevel = 5;
  const u = Object.values(g.units).find((x) => x.owner === me);
  // Fill its bay with a 2-slot chip that ALSO charges upkeep, so the unit pays
  // the doubled keep and the chip's own bill on top.
  const cid = g.nextId("chip");
  g.chips[cid] = { uid: cid, chipId: "bombard" };
  u.chips = [cid];
  // A finished blockade and a listening post on nearby road/plain hexes.
  // The blockade has to go somewhere the player can SEE — a blockade in the
  // fog is deliberately not selectable, so staging one there would test the
  // wrong thing.
  const vis = g.visibility?.[me]?.visible;
  const road = Object.keys(g.board.hexes).find(
    (h) => g.board.hexes[h].road && !g.locations[h] && (!vis || vis.has(h)),
  );
  g.world = g.world || {};
  g.world.blockades = g.world.blockades || {};
  g.world.blockades[road] = { hex: road, owner: me, done: true, paid: true, progress: 4, cost: 4, chips: [], builder: null };
  const plain = Object.keys(g.board.hexes).find(
    (h) => !g.locations[h] && h !== road && (!vis || vis.has(h)),
  );
  g.world.listeningPosts = g.world.listeningPosts || {};
  g.world.listeningPosts[plain] = { owner: me, hex: plain, strength: 5, paid: true, revealedTo: [] };
  window.__ashlandBump?.();
  return { me, unit: u.uid, road, plain };
});
await page.waitForTimeout(700);

const promised = await page.evaluate(() => {
  const m = document.body.innerText.match(/SCRAP ([+-]\d+)\s*\/\s*TURN/i);
  return m ? Number(m[1]) : null;
});
check("the total moves when structures and chips are added",
  promised !== null && promised !== bar.net, `${bar.net} → ${promised}`);

// Run one real Upkeep for this player, headlessly, and compare.
const actual = await page.evaluate((st) => {
  const g = window.__ashland;
  const before = g.players[st.me].resource;
  // The engine's own Upkeep, not a reimplementation of it.
  const mod = window.__ashlandUpkeep;
  if (!mod) return null;
  mod(g, st.me);
  return g.players[st.me].resource - before;
}, staged);
if (actual === null) {
  check("engine Upkeep reachable from the page", false, "no __ashlandUpkeep hook");
} else {
  check("the quoted net matches what the engine actually charges",
    actual === promised, `bar said ${promised}, Upkeep moved ${actual}`);
}

// --- 3. per-entity readouts ----------------------------------------------
const tok = await page.evaluate((uid) => {
  const el = document.querySelector(`[data-unit-uid="${uid}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}, staged.unit);
if (tok) { await page.mouse.click(tok.x, tok.y); await page.waitForTimeout(600); }
check("the unit panel states the unit's own per-turn cost",
  (await page.getByText(/SCRAP \/ TURN/i).count()) > 0);
await page.screenshot({ path: `${OUT}/upkeep-unit.png` });

// Deselect the unit: with one selected, clicking a hex is a MOVE order, not
// an inspect. Close the panel by its own × — more reliable than re-clicking
// the token, which the open panel can overlap.
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
check("Escape closes the unit panel",
  !/SELECTED/.test(await page.evaluate(() => document.body.innerText)));

// The blockade window states its own.
const at = await page.evaluate((h) => {
  const el = document.querySelector(`[data-hex="${h}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}, staged.road);
if (at) { await page.mouse.click(at.x, at.y); await page.waitForTimeout(700); }
check("the blockade window states its per-turn cost",
  (await page.getByText("Upkeep / turn").count()) > 0);

check("no console/page errors", errors.length === 0, errors.slice(0, 2).join(" | ") || "clean");

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
