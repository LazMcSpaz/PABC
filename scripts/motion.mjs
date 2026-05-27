// Motion capture — the feedback loop for *animation* (stills can't show it).
//
// Opens the radial menu on the /#hud showcase and records:
//   - a burst of PNG frames through the entrance animation (open-NN.png),
//     which can be read back as images to verify the motion progresses;
//   - two idle frames ~1.4s apart (idle-a/b.png) to show ambient rotation;
//   - a webm video of the whole thing (radial-menu.webm) to share.
//
//   npm run dev      # in one shell (or background)
//   npm run motion

import { chromium } from "playwright";
import { mkdir, rename } from "node:fs/promises";

const BASE = (process.env.SHOT_BASE || "http://localhost:5173").replace(/\/$/, "");
const OUT = "screenshots/motion";
const VIEWPORT = { width: 1440, height: 900 };

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
  await page.waitForTimeout(500);

  // Open the radial menu and burst-capture the entrance.
  await page.getByText("MENU", { exact: true }).click();
  for (let i = 0; i < 9; i++) {
    await page.screenshot({ path: `${OUT}/open-${String(i).padStart(2, "0")}.png` });
    await page.waitForTimeout(55);
  }

  // Idle: two frames far enough apart that the scanner ring's rotation shows.
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/idle-a.png` });
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${OUT}/idle-b.png` });

  const video = page.video();
  await page.close();
  const videoPath = video ? await video.path() : null;
  await ctx.close();
  await browser.close();
  if (videoPath) await rename(videoPath, `${OUT}/radial-menu.webm`).catch(() => {});

  console.log(`Motion captured in ${OUT}/ — open-*.png, idle-a/b.png, radial-menu.webm`);
}

run().catch((err) => {
  console.error("Motion capture failed:", err.message);
  console.error(`Is the dev server up at ${BASE}? Start it with: npm run dev`);
  process.exit(1);
});
