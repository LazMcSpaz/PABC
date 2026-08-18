// Does the setup screen actually configure the game?
//
// Every option on it was collected into an object and then mostly thrown away:
// `bootGame` took only (seed, humanFactionId, mapSize), so the faction count
// and the minor-faction toggle changed nothing at all. A settings screen that
// silently ignores its own settings is worse than one that omits them.
//
// This drives the real screen and reads the resulting game, so a regression
// shows up as "you asked for 2 factions and got 4" rather than as a passing
// unit test over a mock.
//
//   npm run dev                        # in one shell
//   node scripts/check-setup-screen.mjs

import { chromium } from "playwright";

const BASE = (process.env.SHOT_BASE || "http://localhost:5173/PABC").replace(/\/$/, "");
const VIEWPORT = { width: Number(process.env.SHOT_W) || 1600, height: Number(process.env.SHOT_H) || 1000 };

// The four playable majors, from the engine registry — anything else in the
// turn order is a minor faction seeded alongside them.
const MAJOR_IDS = ["versari", "goldgrass", "lakers", "plainers"];

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
const errors = [];
const EXTERNAL = /fonts\.(googleapis|gstatic)\.com/;

// Walk the setup screen with a given set of slider positions, start the game,
// and report what the engine actually built.
async function play({ sizeIndex, densityIndex, factions, toggleOff = [] }) {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  page.on("requestfailed", (r) => { if (!EXTERNAL.test(r.url())) errors.push(`REQ ${r.url()}`); });

  await page.goto(`${BASE}/?board=holo`, { waitUntil: "domcontentloaded" });
  await page.locator("button").filter({ hasText: "NEW GAME" }).first().click({ timeout: 20000 });
  await page.locator("button").filter({ hasText: "VERSARI KORAD" }).first().click();
  await page.locator("button").filter({ hasText: "ADDITIONAL SETTINGS" }).first().click().catch(() => {});
  await page.waitForTimeout(400);

  // The two board sliders, by their accessible labels.
  const setSlider = async (label, value) => {
    const el = page.locator(`input[type="range"][aria-label="${label}"]`).first();
    if (!(await el.count())) return false;
    await el.fill(String(value));
    await page.waitForTimeout(200);
    return true;
  };
  const hasSize = await setSlider("map size", sizeIndex);
  const hasDensity = await setSlider("settlements", densityIndex);

  // Faction count is a stepper. Click its minus down to the target, stopping
  // the moment the control disables itself at its floor.
  for (let i = 4; i > factions; i--) {
    const minus = page.locator("button").filter({ hasText: /^[−-]$/ }).first();
    if (!(await minus.count()) || !(await minus.isEnabled())) break;
    await minus.click();
    await page.waitForTimeout(200);
  }

  // Switch off any named toggle (Fog of War, Conquest, …). Each Toggle is a
  // pill button sitting immediately before its label, so find the label and
  // walk back to the control.
  for (const label of toggleOff) {
    await page.evaluate((want) => {
      const row = [...document.querySelectorAll("div")].find((d) => {
        const b = d.querySelector(":scope > button");
        return b && d.textContent.trim().startsWith(want);
      });
      row?.querySelector(":scope > button")?.click();
    }, label);
    await page.waitForTimeout(200);
  }

  const summary = await page.evaluate(() => document.body.innerText);
  await page.locator("button").filter({ hasText: "BEGIN" }).first().click();
  await page.getByText("End Turn").waitFor({ timeout: 30000 });
  await page.waitForTimeout(800);

  const built = await page.evaluate((MAJOR_IDS) => {
    const g = window.__ashland;
    return {
      hexes: Object.keys(g.board.hexes).length,
      locations: Object.keys(g.locations).length,
      // `tier` lives on the faction DEF, not the player record — the four
      // majors are exactly the ids in the major registry.
      majors: g.turnOrder.filter((f) => MAJOR_IDS.includes(f)).length,
      turnOrder: [...g.turnOrder],
      rules: JSON.parse(JSON.stringify(g.rules || null)),
      // Fog OFF is the ABSENCE of per-faction records, so measure that rather
      // than a flag the screen could set without the engine honouring it.
      fogRecords: Object.keys(g.visibility || {}).length,
      encounterHexes: Object.values(g.board.hexes).filter((h) => h.type === "encounter").length,
    };
  }, MAJOR_IDS);
  await page.close();
  return { built, summary, hasSize, hasDensity };
}

// --- 1. the sliders exist and drive the board ----------------------------
const small = await play({ sizeIndex: 0, densityIndex: 0, factions: 4 });
check("the board has a map-size slider", small.hasSize);
check("the board has a settlement-density slider", small.hasDensity);
check("small + low density builds a small, sparse board",
  small.built.hexes === 30 && small.built.locations === 4,
  `${small.built.hexes} hexes, ${small.built.locations} settlements`);

const dense = await play({ sizeIndex: 0, densityIndex: 3, factions: 4 });
check("density alone changes settlement count at the same size",
  dense.built.hexes === 30 && dense.built.locations === 10,
  `${dense.built.hexes} hexes, ${dense.built.locations} settlements`);

const big = await play({ sizeIndex: 3, densityIndex: 0, factions: 4 });
check("size alone changes the board at the same density",
  big.built.hexes === 127 && big.built.locations === 10,
  `${big.built.hexes} hexes, ${big.built.locations} settlements`);

// --- 2. the faction count is no longer ignored ---------------------------
const two = await play({ sizeIndex: 0, densityIndex: 1, factions: 2 });
check("asking for 2 major factions gives 2",
  two.built.majors === 2, `${two.built.majors} majors: ${two.built.turnOrder.join(", ")}`);
check("the human's faction is always seated",
  two.built.turnOrder.includes("versari"), two.built.turnOrder.join(", "));

// --- 3. the rule switches reach the engine -------------------------------
// Every one of these was a control that looked live and changed nothing, so
// each check reads the BUILT GAME rather than the screen's own state.
{
  const on = small;
  check("fog on by default — the engine builds per-faction visibility",
    on.built.fogRecords > 0, `${on.built.fogRecords} record(s)`);

  const noFog = await play({ sizeIndex: 0, densityIndex: 0, factions: 4, toggleOff: ["Fog of War"] });
  check("fog off — no visibility records are built at all",
    noFog.built.fogRecords === 0 && noFog.built.rules?.fogOfWar === false,
    `${noFog.built.fogRecords} record(s)`);

  const noConquest = await play({ sizeIndex: 0, densityIndex: 0, factions: 4, toggleOff: ["Conquest"] });
  check("a victory condition switched off reaches the engine's rules",
    noConquest.built.rules?.victory?.conquest === false &&
    noConquest.built.rules?.victory?.elimination === true);

  check("encounter cadence lands on the board and the rules",
    on.built.encounterHexes > 0 &&
    typeof on.built.rules?.worldEncountersPerRound === "number",
    `${on.built.encounterHexes} encounter hexes, world ${on.built.rules?.worldEncountersPerRound}/round`);
}

check("no console/page errors", errors.length === 0, errors.slice(0, 2).join(" | ") || "clean");

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
