// Does the soundtrack actually behave?
//
// The rules are easy to state and easy to break silently: the title theme is
// pinned to the menu, a match shuffles all four cuts, and there are ten
// seconds of quiet between songs. None of that shows up in a build, and
// waiting out two-minute tracks is not a test — so this drives the real
// player through its real state machine, firing the <audio> element's own
// "ended" event to move time along.
//
//   npm run dev                     # in one shell
//   node scripts/check-audio.mjs
//
// Chromium runs with the autoplay policy relaxed for the main pass; the last
// check deliberately opens a second browser WITH the policy on, to prove the
// blocked → first-click → playing path still works.

import { chromium } from "playwright";

const BASE = (process.env.SHOT_BASE || "http://localhost:5173/PABC").replace(/\/$/, "");
const GAP_MS = 10_000;

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const status = (page) => page.evaluate(() => window.__ashlandAudio.music.getStatus());
const gapLeft = (page) => page.evaluate(() => window.__ashlandAudio.music.getGapRemainingMs());
const audioSrc = (page) => page.evaluate(() => window.__ashlandAudio.music.audio.currentSrc || "");
const endTrack = (page) =>
  page.evaluate(() => window.__ashlandAudio.music.audio.dispatchEvent(new Event("ended")));
const playNow = (page) => page.evaluate(() => window.__ashlandAudio.music.playNow());

async function waitForState(page, want, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await status(page);
    if (s.state === want) return s;
    await page.waitForTimeout(100);
  }
  return status(page);
}

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

const errors = [];
const failedAudio = [];
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text());
});
page.on("response", (r) => {
  if (/\/assets\/audio\//.test(r.url()) && !r.ok()) failedAudio.push(`${r.status()} ${r.url()}`);
});

console.log(`\naudio checks against ${BASE}\n`);

// ── 1. the title screen ────────────────────────────────────────────────────
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => !!window.__ashlandAudio, null, { timeout: 20000 });

let s = await waitForState(page, "playing");
check("menu scene plays", s.state === "playing", `state=${s.state}`);
check("title song is the wtv4 cut", s.trackId === "main-theme", `trackId=${s.trackId}`);
check("scene is menu", s.scene === "menu", `scene=${s.scene}`);
check("serving the right file", /main-theme\.mp3$/.test(await audioSrc(page)), await audioSrc(page));

// ── 2. ten seconds of quiet between songs ──────────────────────────────────
await endTrack(page);
s = await status(page);
const left = await gapLeft(page);
check("track end opens a gap", s.state === "gap", `state=${s.state}`);
check(
  "gap is ~10s",
  left > GAP_MS - 600 && left <= GAP_MS,
  `${(left / 1000).toFixed(2)}s (want ~${GAP_MS / 1000}s)`,
);

// ── 3. the title theme repeats on the menu — every time ────────────────────
await playNow(page);
s = await waitForState(page, "playing");
check("menu repeats the title song", s.trackId === "main-theme", `trackId=${s.trackId}`);

// ── 4. starting a match hands over to the four-cut rotation ────────────────
await page.locator("button").filter({ hasText: "NEW GAME" }).first().click({ timeout: 20000 });
await page.locator("button").filter({ hasText: "VERSARI KORAD" }).first().click();
await page.locator("button").filter({ hasText: /^BEGIN|START|LAUNCH/i }).first().click()
  .catch(async () => {
    // Fall back to whatever the confirm control is called on this build.
    await page.locator("button").last().click();
  });
await page.waitForTimeout(600);
s = await status(page);
check("match switches scene", s.scene === "game", `scene=${s.scene}`);

await playNow(page);
s = await waitForState(page, "playing");
check(
  "match does not open with the title song again",
  s.trackId !== "main-theme",
  `first in-game cut = ${s.trackId}`,
);

// ── 5. the rotation covers all four, then reshuffles ───────────────────────
const seen = [s.trackId];
for (let i = 0; i < 3; i++) {
  await endTrack(page);
  const g = await gapLeft(page);
  if (g < GAP_MS - 600) check(`gap #${i + 2} is ~10s`, false, `${(g / 1000).toFixed(2)}s`);
  await playNow(page);
  seen.push((await waitForState(page, "playing")).trackId);
}
check(
  "one rotation plays all four cuts, no repeats",
  new Set(seen).size === 4,
  seen.join(" → "),
);
await endTrack(page);
await playNow(page);
const fifth = (await waitForState(page, "playing")).trackId;
check("rotation reshuffles instead of stopping", !!fifth, `5th = ${fifth}`);
check("reshuffle does not repeat the cut that just played", fifth !== seen[3], `${seen[3]} → ${fifth}`);

// ── 6. mute, volume, and the effects bus ───────────────────────────────────
await page.evaluate(() => { window.__ashlandAudio.music.setMuted(true); });
await page.waitForTimeout(400); // longer than the 70ms level ramp
const mutedGain = await page.evaluate(() => window.__ashlandAudio.music.gain?.gain.value ?? -1);
check("mute drops the music bus to silence", mutedGain >= 0 && mutedGain < 0.005, `gain=${mutedGain}`);
await page.evaluate(() => { window.__ashlandAudio.music.setMuted(false); });
await page.waitForTimeout(200);
const liveGain = await page.evaluate(() => window.__ashlandAudio.music.gain?.gain.value ?? -1);
check("unmute restores it", liveGain > 0.05, `gain=${liveGain.toFixed(3)}`);

for (const cue of ["diplomacyAlert", "diplomacyOpen", "windowOpen", "radialAmbience", "contestRoll"]) {
  const loaded = await page.evaluate(async (name) => {
    const p = window.__ashlandAudio.sfx;
    await p.load(name);
    const b = p._buffers.get(name);
    return b ? { dur: b.duration, rate: b.sampleRate } : null;
  }, cue);
  check(`${cue} cue decodes`, !!loaded, loaded ? `${loaded.dur.toFixed(2)}s @ ${loaded.rate}Hz` : "not decoded");
}

// ── 7. cues fire on the moments they belong to ─────────────────────────────
// Wrap play() rather than listening for sound: what we care about is that the
// interaction reaches the audio layer at all.
await page.evaluate(() => {
  const p = window.__ashlandAudio.sfx;
  window.__sfxFired = [];
  const orig = p.play.bind(p);
  p.play = (name, opts) => { window.__sfxFired.push(name); return orig(name, opts); };
});
const fired = () => page.evaluate(() => window.__sfxFired.slice());
const clearFired = () => page.evaluate(() => { window.__sfxFired.length = 0; });

// A location the player can see — clicking it opens the detail window.
const hexId = await page.evaluate(() => {
  const g = window.__ashland;
  const me = g.turnOrder[g.activeIndex];
  const loc = Object.values(g.locations).find((l) => l.controller === me)
    || Object.values(g.locations)[0];
  return loc?.hexId ?? null;
});
const clickHex = async (h) => {
  const at = await page.evaluate((id) => {
    const el = document.querySelector(`[data-hex="${id}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, h);
  if (!at) return false;
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(500);
  return true;
};

if (hexId && (await clickHex(hexId))) {
  check("selecting a location fires the window cue", (await fired()).includes("windowOpen"), (await fired()).join(","));

  // Close and reselect the SAME hex: the cue must fire again. A once-ever
  // dedupe here would leave every second click on a location silent.
  await clearFired();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await clickHex(hexId);
  check("reselecting the same location fires it again", (await fired()).includes("windowOpen"), (await fired()).join(","));
  await page.keyboard.press("Escape");
} else {
  check("selecting a location fires the window cue", false, "no clickable location hex found");
}

// The radial menu's held ambience, and the diplomacy drawer behind it.
const looping = () => page.evaluate(() => window.__ashlandAudio.sfx._sustained.has("radialAmbience"));
await clearFired();
check("nothing looping before the radial opens", !(await looping()));

await page.locator("button[title='Menu']").first().click();
await page.waitForTimeout(500);
check("opening the radial starts its ambience", await looping());

await page.keyboard.press("Escape"); // closes the radial with nothing picked
await page.waitForTimeout(600);
check("closing the radial stops it", !(await looping()));

// Re-open and pick Diplomacy: the bed must stop and the drawer's cue fire.
await page.locator("button[title='Menu']").first().click();
await page.waitForTimeout(400);
await clearFired();
await page.locator("text=Diplomacy").first().click();
await page.waitForTimeout(700);
check("picking a sector stops the ambience", !(await looping()));
check("opening the diplomacy drawer fires its cue", (await fired()).includes("diplomacyOpen"), (await fired()).join(","));
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

// A conflict roll. Stage one the player can actually declare: their unit
// standing on a location somebody else holds, on their own turn.
await clearFired();
const held = () => page.evaluate(() => window.__ashlandAudio.sfx._sustained.has("contestRoll"));
const contestHex = await page.evaluate(() => {
  const g = window.__ashland;
  const me = g.turnOrder[g.activeIndex];
  const other = g.turnOrder.find((f) => f !== me);
  // Take a location the player already holds and hand it to someone else,
  // rather than picking one they don't hold: a location they never held is
  // fogged, and a fogged hex opens no window at all.
  const loc = Object.values(g.locations).find((l) => l.controller === me);
  const u = Object.values(g.units).find((x) => x.owner === me);
  if (!loc || !u) return null;
  // The window derives "who holds this" from the influence sections, not
  // from loc.controller, so both have to move.
  loc.controller = other;
  if (Array.isArray(loc.sections)) loc.sections = loc.sections.map(() => other);
  u.node = loc.hexId;
  g.players[me].actions.remaining = 9;
  window.__ashlandBump?.();
  return loc.hexId;
});

if (contestHex && (await clickHex(contestHex))) {
  const contestBtn = page.locator("button").filter({ hasText: /^Contest$/ }).first();
  if (await contestBtn.count()) {
    check("nothing sounding before the roll", !(await held()));
    await contestBtn.click();
    // Attacking someone you are not at war with asks first.
    await page.locator("button").filter({ hasText: /^ATTACK$/i }).first()
      .click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(800);
    check("a conflict roll sounds the battle stinger", await held());

    // The overlay is a ~6.3s dramatisation and the cue runs 7.4s. Closing it
    // early must take the sound with it rather than leaving a battle playing
    // over a quiet board.
    await page.keyboard.press("Escape");
    await page.locator("button").filter({ hasText: /^(Exit|Close|Done)$/i }).first()
      .click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(900);
    check("closing the roll releases it", !(await held()));
  } else {
    check("a conflict roll sounds the battle stinger", false, "no Contest button on the staged location");
  }
} else {
  check("a conflict roll sounds the battle stinger", false, "could not stage a contest");
}
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// The envoy audience.
await clearFired();
const envoyStaged = await page.evaluate(() => {
  const g = window.__ashland;
  const me = g.turnOrder[g.activeIndex];
  const other = g.turnOrder.find((f) => f !== me);
  g.diplomacy = g.diplomacy || {};
  g.diplomacy.pendingWarnings = [{
    id: "warn-audio-check", round: g.round, from: other, to: me,
    fromName: "Test Envoy", kind: "standing", reason: "menace",
    temperament: "honorable", canPlacate: false, placateScrap: 5,
  }];
  window.__ashlandBump?.();
  return true;
});
await page.waitForTimeout(600);
check("envoy modal opened", envoyStaged && (await page.getByText("An Envoy Arrives").count()) > 0);
check("the diplomacy alert fires with it", (await fired()).includes("diplomacyAlert"), (await fired()).join(","));

check("no audio asset 404s", failedAudio.length === 0, failedAudio.join(", "));
check("no page errors", errors.length === 0, errors.slice(0, 2).join(" | "));

// ── 8. the autoplay-blocked path, with the real policy on ──────────────────
const strict = await chromium.launch(); // default policy: gesture required
const sp = await strict.newContext({ viewport: { width: 1200, height: 800 } }).then((c) => c.newPage());
await sp.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await sp.waitForFunction(() => !!window.__ashlandAudio, null, { timeout: 20000 });
await sp.waitForTimeout(1200);
const blocked = await sp.evaluate(() => window.__ashlandAudio.music.getStatus());
check("autoplay policy parks us in blocked, not dead", blocked.state === "blocked", `state=${blocked.state}`);
await sp.mouse.click(600, 700);
const after = await waitForState(sp, "playing", 6000);
check("first click starts the music", after.state === "playing", `state=${after.state}, track=${after.trackId}`);
await strict.close();

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
