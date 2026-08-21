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
// Every shot walks the real flow a player does — title screen, New Game,
// setup, Begin — so a change that breaks that flow fails the harness rather
// than silently screenshotting the wrong screen.
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

// The app opens on the title screen, not the setup screen — every shot that
// wants the setup screen or the board has to click through New Game first.
// (This harness predated the title screen and went straight to setup, which
// is why three of its four shots timed out.)
async function openSetup(page) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.getByText("New Game", { exact: true }).click();
  await page.getByText("Select faction", { exact: false }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(400);
}

// Drive the setup screen into a live game with a deterministic seed. The seed
// field lives inside the collapsed "Additional Settings" section, so it is
// only present once that is open — expand it if the field isn't showing.
async function enterGame(page) {
  await openSetup(page);
  const seed = page.getByPlaceholder("random");
  if ((await seed.count()) === 0) {
    await page.getByText("Additional Settings", { exact: false }).click();
    await page.waitForTimeout(250);
  }
  if (await seed.count()) await seed.fill(SEED);
  await page.getByRole("button", { name: /Begin/ }).click();
  await page.getByText("End Turn", { exact: false }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(900); // let entrance animations settle
}

const SHOTS = [
  {
    name: "00-title",
    async go(page) {
      await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
      await page.getByText("New Game", { exact: true }).waitFor({ timeout: 15000 });
      // The menu items stagger in; 400ms caught them mid-fade.
      await page.waitForTimeout(1600);
    },
  },
  {
    name: "01-setup",
    go: openSetup,
  },
  {
    name: "06-lore",
    async go(page) {
      await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
      await page.getByText("Lore", { exact: true }).click({ timeout: 15000 });
      await page.getByText(/Archive/i).first().waitFor({ timeout: 15000 });
      await page.waitForTimeout(500);
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
  {
    name: "05-tech-wheel",
    async go(page) {
      await enterGame(page);
      await page.getByText("MENU", { exact: true }).click();
      await page.waitForTimeout(500);
      // The radial's sectors are SVG wedges with no accessible name, and the
      // RESEARCH caption over the top one is `pointer-events: none` — so
      // locate the caption for its position but click through it with the
      // mouse, which lands on the wedge underneath.
      // Rendered as "Research" and uppercased by CSS, so match the DOM text.
      const label = page.getByText(/^Research$/i).first();
      const box = await label.boundingBox();
      if (!box) throw new Error("radial RESEARCH sector not found");
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.getByText(/^Level \d+ \/ \d+/i).waitFor({ timeout: 10000 });
      await page.waitForTimeout(700);
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
