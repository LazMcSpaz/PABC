// Motion capture — the feedback loop for *animation* (stills can't show it).
//
// Opens the radial menu on the /#hud showcase and records a webm of the
// entrance spring, the idle scanner ring, and the periodic glitch, plus a
// burst of PNG stills through the entrance (which can be read back to verify
// the motion progresses).
//
//   npm run dev      # in one shell (or background)
//   npm run motion
//
// NOTE: Chromium's screencast (used by recordVideo) downscales the frame into
// a corner when a full-screen backdrop-filter is present — a known recording
// quirk, NOT a bug in the live UI (page.screenshot and real browsers render it
// full-size). We neutralise backdrop-filter for the recording only.

import { chromium } from "playwright";
import { mkdir, rename } from "node:fs/promises";

const BASE = (process.env.SHOT_BASE || "http://localhost:5173").replace(/\/$/, "");
const OUT = "screenshots/motion";
const VIEWPORT = { width: 1440, height: 900 };
const KILL_BACKDROP = "*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;}";

async function run() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    recordVideo: { dir: OUT, size: VIEWPORT },
  });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/#hud`, { waitUntil: "domcontentloaded" });
  await page.getByText("HUD Look Pass").waitFor({ timeout: 15000 });
  await page.addStyleTag({ content: KILL_BACKDROP });
  await page.waitForTimeout(400);

  // Open the radial menu and burst-capture the entrance (stills are always
  // full-scale, independent of the screencast quirk above).
  await page.getByText("MENU", { exact: true }).click();
  for (let i = 0; i < 9; i++) {
    await page.screenshot({ path: `${OUT}/open-${String(i).padStart(2, "0")}.png` });
    await page.waitForTimeout(55);
  }

  // Hold long enough for the video to capture the idle ring + one glitch
  // (the glitch fires ~4.6s into the 5.5s cycle).
  await page.waitForTimeout(5200);

  const video = page.video();
  await page.close();
  const videoPath = video ? await video.path() : null;
  await ctx.close();
  await browser.close();
  if (videoPath) await rename(videoPath, `${OUT}/radial-menu.webm`).catch(() => {});

  console.log(`Motion captured in ${OUT}/ — open-*.png + radial-menu.webm`);
}

run().catch((err) => {
  console.error("Motion capture failed:", err.message);
  console.error(`Is the dev server up at ${BASE}? Start it with: npm run dev`);
  process.exit(1);
});
