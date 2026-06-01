// Screenshot harness — the visual feedback loop for UI work.
//
// Renders the running dev server in headless Chromium and saves PNGs of
// each key screen/state to screenshots/, so UI changes can be reviewed and
// iterated against the design references instead of edited blind.
//
//   npm run dev            # in one shell (or background)
//   npm run shots          # capture every shot
//   npm run shots board    # capture only shots whose name contains "board"
//
// Env: SHOT_BASE (default http://localhost:5173), SHOT_W / SHOT_H viewport.

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = (process.env.SHOT_BASE || "http://localhost:5173").replace(/\/$/, "");
const OUT = "screenshots";
const VIEWPORT = {
  width: Number(process.env.SHOT_W) || 1440,
  height: Number(process.env.SHOT_H) || 900,
};
// Fixed seed → the board lays out identically every run, so before/after
// shots are comparable.
const SEED = "424242";
const filter = process.argv[2];

// Drive the setup screen into a live game with a deterministic seed.
async function enterGame(page) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("random").fill(SEED);
  await page.getByRole("button", { name: "Begin" }).click();
  await page.getByText("End Turn").waitFor({ timeout: 20000 });
  await page.waitForTimeout(900); // let entrance animations settle
}

const SHOTS = [
  {
    name: "01-setup",
    async go(page) {
      await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
      await page.getByText("Pick your faction").waitFor({ timeout: 15000 });
      await page.waitForTimeout(400);
    },
  },
  {
    name: "02-hud-showcase",
    async go(page) {
      await page.goto(`${BASE}/#hud`, { waitUntil: "domcontentloaded" });
      await page.getByText("HUD Look Pass").waitFor({ timeout: 15000 });
      await page.waitForTimeout(600);
    },
  },
  {
    name: "03-board",
    go: enterGame,
  },
  {
    name: "04-radial-menu",
    async go(page) {
      await enterGame(page);
      await page.getByText("MENU", { exact: true }).click();
      await page.waitForTimeout(500);
    },
  },
];

async function run() {
  await mkdir(OUT, { recursive: true });
  const shots = filter ? SHOTS.filter((s) => s.name.includes(filter)) : SHOTS;
  if (shots.length === 0) {
    console.error(`No shots match "${filter}". Available: ${SHOTS.map((s) => s.name).join(", ")}`);
    process.exit(1);
  }

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });

  let failures = 0;
  for (const shot of shots) {
    const page = await ctx.newPage();
    const path = `${OUT}/${shot.name}.png`;
    try {
      await shot.go(page);
      await page.screenshot({ path });
      console.log(`  ok   ${path}`);
    } catch (err) {
      failures++;
      console.error(`  FAIL ${shot.name}: ${err.message.split("\n")[0]}`);
      // Capture whatever rendered, to aid debugging.
      await page.screenshot({ path: `${OUT}/${shot.name}-FAILED.png` }).catch(() => {});
    } finally {
      await page.close();
    }
  }

  await browser.close();
  console.log(failures ? `\nDone with ${failures} failure(s).` : `\nDone — ${shots.length} shot(s) in ${OUT}/`);
  if (failures) process.exit(1);
}

run().catch((err) => {
  console.error("Screenshot run crashed:", err.message);
  console.error(`Is the dev server up at ${BASE}? Start it with: npm run dev`);
  process.exit(1);
});
