// Board structural audit — how much DOM and how many compositing layers the
// holographic board builds, per map size and per level of detail.
//
//   npm run dev          # in one shell
//   npm run board-perf   # measure
//
// WHAT THIS DOES NOT MEASURE: frame time. Headless Chromium's requestAnimationFrame
// cadence is not driven by a real compositor — it produced nonsense here (a
// 127-hex board timing "faster" than a 30-hex one), so any number derived from
// it would be worse than no number. Frame time has to be profiled in a real
// browser on real hardware.
//
// What it measures instead is structural and completely deterministic: element
// counts, image counts, and the number of elements carrying a `mix-blend-mode`
// or a CSS mask. Those are the inputs to compositing cost rather than the cost
// itself — they do not tell you the board is fast, they tell you how much work
// it is handing the compositor, which is the thing the LOD swap changes.
//
// Fog is revealed before the "explored" pass because turn-1 fog hides most of
// the hologram layers: an unexplored hex draws its plinth and nothing else, so
// a first-turn measurement understates the steady-state board by roughly half.

import { chromium } from "playwright";

const BASE = (process.env.PERF_BASE || "http://localhost:5173").replace(/\/$/, "");
const VIEWPORT = {
  width: Number(process.env.PERF_W) || 1600,
  height: Number(process.env.PERF_H) || 950,
};
const SEED = "424242";
const SIZES = (process.env.PERF_SIZES || "small,medium,large,huge").split(",");

// Runs in the page. Counts are taken over the board subtree only, so HUD chrome
// never lands in the numbers.
function probe() {
  const board = document.querySelector(".pc-board3d");
  if (!board) return null;
  const all = [...board.querySelectorAll("*")];
  const isMasked = (s) => {
    const m = s.maskImage || s.webkitMaskImage;
    return !!m && m !== "none";
  };
  let blend = 0;
  let masked = 0;
  for (const el of all) {
    const s = getComputedStyle(el);
    if (s.mixBlendMode && s.mixBlendMode !== "normal") blend++;
    if (isMasked(s)) masked++;
  }
  // The viewport's transform carries the live zoom; read it back rather than
  // trusting whatever we asked for.
  const content = document.querySelector(".pc-board")?.firstElementChild;
  const m = content && new DOMMatrixReadOnly(getComputedStyle(content).transform);
  return {
    nodes: all.length,
    imgs: board.querySelectorAll("img").length,
    svgs: board.querySelectorAll("svg").length,
    blend,
    masked,
    scale: m ? Number(m.a.toFixed(3)) : null,
  };
}

async function enterGame(page, size, lod = null) {
  await page.goto(`${BASE}/${lod ? `?lod=${lod}` : ""}`, { waitUntil: "domcontentloaded" });
  // Title screen sits in front of setup.
  // Labels render uppercase via CSS; the DOM text is title case.
  await page.getByText("New Game", { exact: true }).click({ timeout: 20000 });
  await page.getByText("Select Faction").waitFor({ timeout: 20000 });
  // The seed lives behind the collapsed "Additional Settings" panel; a fixed
  // seed is what makes two runs comparable.
  await page.getByText("Additional Settings").click();
  await page.getByPlaceholder("random").fill(SEED);
  const sizeLabel = size[0].toUpperCase() + size.slice(1);
  await page.getByRole("button", { name: sizeLabel, exact: true }).click();
  await page.getByRole("button", { name: /^Begin/ }).click();
  await page.getByText("End Turn").waitFor({ timeout: 30000 });
  await page.waitForTimeout(900);
}

// Force every hex into the viewer's `visible` set. This is the steady-state
// board — what you are looking at for most of a game — rather than turn 1,
// where fog suppresses the hologram layers that cost the most.
async function revealFog(page) {
  await page.evaluate(() => {
    const g = window.__ashland;
    const vis = g?.visibility?.[g.humanFactionId];
    if (!vis) throw new Error("no visibility state on window.__ashland");
    for (const id of Object.keys(g.board.hexes)) {
      vis.visible.add(id);
      vis.explored.add(id);
    }
    window.__ashlandBump();
  });
  await page.waitForTimeout(700);
}

const pad = (s, n) => String(s).padEnd(n);
const num = (s, n) => String(s ?? "-").padStart(n);

// One pass = boot a game at `size` with the LOD pinned, measure turn-1 fog,
// then reveal the whole map and measure again. The pin matters for the large
// boards: they fit on screen well below the flat threshold, so without it the
// full-detail worst case is simply not reachable to measure.
async function pass(page, size, lod) {
  await enterGame(page, size, lod);
  const hexes = await page.evaluate(() => Object.keys(window.__ashland.board.hexes).length);
  const turn1 = await page.evaluate(probe);
  await revealFog(page);
  const explored = await page.evaluate(probe);
  return { hexes, turn1, explored };
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT });
  const rows = [];

  for (const size of SIZES) {
    const full = await pass(page, size, "full");
    const flat = await pass(page, size, "flat");
    rows.push({ size, hexes: full.hexes, full, flat });
  }

  await browser.close();

  console.log(`\nboard structure @ ${VIEWPORT.width}x${VIEWPORT.height}, seed ${SEED}`);
  console.log("zoom is fit-to-view for that board; LOD is pinned, not zoom-driven.\n");
  console.log(
    `${pad("map", 8)}${num("hexes", 6)}  ${pad("state", 24)}` +
      `${num("zoom", 6)}${num("nodes", 7)}${num("imgs", 6)}${num("svg", 5)}${num("blend", 7)}${num("masked", 8)}`,
  );
  console.log("-".repeat(88));
  for (const r of rows) {
    const line = (label, p) =>
      `${pad(r.size, 8)}${num(r.hexes, 6)}  ${pad(label, 24)}` +
      `${num(p.scale, 6)}${num(p.nodes, 7)}${num(p.imgs, 6)}${num(p.svgs, 5)}${num(p.blend, 7)}${num(p.masked, 8)}`;
    console.log(line("turn 1 fogged, full LOD", r.full.turn1));
    console.log(line("explored, full LOD", r.full.explored));
    console.log(line("explored, flat LOD", r.flat.explored));
    console.log("");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
