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
const musicRequests = [];
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text());
});
page.on("response", (r) => {
  if (/\/assets\/audio\//.test(r.url()) && !r.ok()) failedAudio.push(`${r.status()} ${r.url()}`);
});
// An aborted request never produces a response, so the handler above cannot
// see one. That is how a duplicate fetch of the theme — one of the pair left
// to be cancelled by the browser — sat in the console unnoticed.
page.on("requestfailed", (r) => {
  if (!/\/assets\/audio\//.test(r.url())) return;
  failedAudio.push(`${r.failure()?.errorText || "failed"} ${r.url().split("/").pop()}`);
});
page.on("request", (r) => {
  if (/\/assets\/audio\/music\//.test(r.url())) musicRequests.push(r.url());
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

// The theme is a 1.6 MB file and the menu plays exactly one cut. Two requests
// for it here is the shape the abort came in — the preloader warming the very
// track already streaming — so assert the shape, not just the symptom. Checked
// before the playlist advances, since the theme legitimately recurs in the
// in-game rotation later.
const themeFetches = musicRequests.filter((u) => /main-theme\.mp3/.test(u)).length;
check("the menu fetches its theme once", themeFetches <= 1, `${themeFetches} request(s)`);

// ── 1b. sound is actually coming OUT ───────────────────────────────────────
// Not "the player says playing" and not "the gain node reads 0.55" — both of
// those were true for the entire time the music was silent. The element sits
// upstream of the gain node, so its own volume can be zero while every piece
// of state downstream looks perfect. Only tapping the bus catches that.
await page.evaluate(() => {
  const m = window.__ashlandAudio.music;
  const an = m.ctx.createAnalyser();
  an.fftSize = 2048;
  m.gain.connect(an);
  window.__an = an;
  window.__anBuf = new Float32Array(an.fftSize);
});
const busPeak = (which, ms) =>
  page.evaluate(async ([w, d]) => {
    const an = w === "sfx" ? window.__sfxAn : window.__an;
    const buf = window.__anBuf;
    let pk = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < d) {
      await new Promise((r) => setTimeout(r, 20));
      an.getFloatTimeDomainData(buf);
      for (const v of buf) { const a = Math.abs(v); if (a > pk) pk = a; }
    }
    return pk;
  }, [which, ms]);

// Seek past the theme's soft intro so a healthy reading is unambiguous.
await page.evaluate(() => { window.__ashlandAudio.music.audio.currentTime = 40; });
await page.waitForTimeout(500);
const musicPeak = await busPeak("music", 1400);
check("the music bus carries signal", musicPeak > 0.02, `peak=${musicPeak.toFixed(4)}`);

const elemVol = await page.evaluate(() => window.__ashlandAudio.music.audio.volume);
check(
  "the element feeding the graph is at unity",
  elemVol === 1,
  `audio.volume=${elemVol} (anything below 1 attenuates before the gain node)`,
);

await page.evaluate(() => window.__ashlandAudio.music.setVolume(0));
await page.waitForTimeout(350);
const zeroPeak = await busPeak("music", 700);
check("volume 0 silences the bus", zeroPeak < 0.001, `peak=${zeroPeak.toFixed(4)}`);

await page.evaluate(() => window.__ashlandAudio.music.setVolume(1));
await page.waitForTimeout(350);
const fullPeak = await busPeak("music", 1400);
check("the level actually scales the signal", fullPeak > musicPeak * 1.4, `0.55 → ${musicPeak.toFixed(3)}, 1.0 → ${fullPeak.toFixed(3)}`);
await page.evaluate(() => window.__ashlandAudio.music.setVolume(0.55));
await page.waitForTimeout(250);

// Everything above is steady state: the page loaded and the menu played its
// theme. Any request failure up to here is a real defect, not the cost of a
// deliberate track change.
const idleFailures = failedAudio.length;

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

for (const cue of ["uiSelect", "windowOpen", "envoyArrival", "diplomacyAlert", "radialAmbience", "contestRoll"]) {
  const loaded = await page.evaluate(async (name) => {
    const p = window.__ashlandAudio.sfx;
    await p.load(name);
    const b = p._buffers.get(name);
    return b ? { dur: b.duration, rate: b.sampleRate } : null;
  }, cue);
  check(`${cue} cue decodes`, !!loaded, loaded ? `${loaded.dur.toFixed(2)}s @ ${loaded.rate}Hz` : "not decoded");
}

// The effects bus, same treatment. A held cue rather than a one-shot: a 0.16s
// blip can slip between analyser polls and read as silence when it is fine.
await page.evaluate(() => {
  const s = window.__ashlandAudio.sfx;
  const an = window.__ashlandAudio.music.ctx.createAnalyser();
  an.fftSize = 2048;
  s._bus().connect(an);
  window.__sfxAn = an;
});
await page.evaluate(() => window.__ashlandAudio.sfx.hold("contestRoll"));
const sfxPeak = await busPeak("sfx", 1400);
await page.evaluate(() => window.__ashlandAudio.sfx.release("contestRoll"));
await page.waitForTimeout(500);
check("the effects bus carries signal", sfxPeak > 0.02, `peak=${sfxPeak.toFixed(4)}`);

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

// Re-open and pick the Diplomacy sector. Three things have to happen: the bed
// stops, the sector itself clicks, and the drawer it opened gets the window
// cue. The drawer is the destination least like the others (not a
// TitledWindow), so it is the one most likely to be missed.
await page.locator("button[title='Menu']").first().click();
await page.waitForTimeout(400);
await clearFired();
await page.locator('[data-sfx="select"]').filter({ hasText: /Diplomacy/i }).first().click();
await page.waitForTimeout(700);
check("picking a sector stops the ambience", !(await looping()));
check("a radial sector clicks", (await fired()).includes("uiSelect"), (await fired()).join(","));
check("the diplomacy drawer gets the window cue", (await fired()).includes("windowOpen"), (await fired()).join(","));
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

// The click cue on an ordinary button, and the audio widget's opt-out.
await clearFired();
await page.locator("button[title='Menu']").first().click();
await page.waitForTimeout(250);
check("an ordinary button clicks", (await fired()).includes("uiSelect"), (await fired()).join(","));
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

await clearFired();
await page.locator("button[aria-label='Sound controls']").click();
await page.waitForTimeout(300);
const sliderCount = await page.locator('[data-sfx="none"] input[type="range"]').count();
check("the audio widget shows exactly the two sliders", sliderCount === 2, `${sliderCount} slider(s)`);
check(
  "no now-playing readout in the widget",
  (await page.locator('[data-sfx="none"]').innerText()).toLowerCase().includes("main theme") === false,
);
await page.locator('[data-sfx="none"] input[type="range"]').first().click();
await page.waitForTimeout(250);
check("the audio widget's own controls stay silent", !(await fired()).includes("uiSelect"), (await fired()).join(","));
await page.locator("button[aria-label='Sound controls']").click(); // close
await page.waitForTimeout(300);

// Volume controls in the in-game Settings window. Settings is not a radial
// sector — it hangs off the top bar's gear.
await page.locator("button[title='Settings']").first().click();
await page.waitForTimeout(700);
const settingsSliders = await page
  .locator('input[type="range"][aria-label="Music volume"], input[type="range"][aria-label="Sound Effects volume"]')
  .count();
check("settings offers both volume sliders", settingsSliders >= 2, `${settingsSliders} found`);
const volBefore = await page.evaluate(() => window.__ashlandAudio.music.volume);
await page.locator('input[type="range"][aria-label="Music volume"]').last().fill("22");
await page.waitForTimeout(300);
const volAfter = await page.evaluate(() => window.__ashlandAudio.music.volume);
check("the settings slider actually moves the level", Math.abs(volAfter - 0.22) < 0.02, `${volBefore} → ${volAfter}`);
await page.evaluate(() => window.__ashlandAudio.music.setVolume(0.55));
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

// A conflict roll. Stage one the player can actually declare: their unit
// standing on a location somebody else holds, on their own turn.
await clearFired();
const held = () => page.evaluate(() => window.__ashlandAudio.sfx._sustained.has("contestRoll"));
// Stage against candidate locations until one actually offers the button.
// Betting on the first location the seed happens to give back made this check
// fail about one run in three — the board is generated, so which locations the
// player holds, and what else is standing on them, differs every time.
const stageContest = (i) => page.evaluate((idx) => {
  const g = window.__ashland;
  const me = g.turnOrder[g.activeIndex];
  const other = g.turnOrder.find((f) => f !== me);
  // Locations the player already holds: one they never held is fogged, and a
  // fogged hex opens no window at all. Control has two representations, and at
  // the start of a game only the influence sections are populated — filtering
  // on `controller` alone found nothing on roughly one seed in eight.
  const mine = (l) =>
    l.controller === me ||
    (Array.isArray(l.sections) && l.sections.length && l.sections.every((x) => x === me));
  const held = Object.values(g.locations).filter(mine);
  const u = Object.values(g.units).find((x) => x.owner === me);
  // Last resort: wherever the player's unit already stands. Its own vision
  // keeps that hex unfogged whoever holds it.
  if (!held.length && u) {
    const atUnit = Object.values(g.locations).find((l) => l.hexId === u.node);
    if (atUnit) held.push(atUnit);
  }
  const loc = held[idx];
  if (!loc || !u) {
    return idx === 0
      ? { error: `${held.length} candidate location(s), unit=${u ? u.uid : "none"}` }
      : null;
  }
  // The window derives "who holds this" from the influence sections, not from
  // loc.controller, so both have to move.
  loc.controller = other;
  if (Array.isArray(loc.sections)) loc.sections = loc.sections.map(() => other);
  // Anything else standing here would take the hex's unit slot and hide the
  // player's attacker from the view-model.
  for (const x of Object.values(g.units)) if (x !== u && x.node === loc.hexId) x.node = null;
  u.node = loc.hexId;
  g.players[me].actions.remaining = 9;
  window.__ashlandBump?.();
  return { hex: loc.hexId, candidates: held.length };
}, i);

let contestHex = null;
let contestBtn = null;
let stageError = "";
for (let i = 0; i < 4; i++) {
  const staged = await stageContest(i);
  if (!staged) break;
  if (staged.error) { stageError = staged.error; break; }
  if (!(await clickHex(staged.hex))) continue;
  const btn = page.locator("button").filter({ hasText: /^Contest$/ }).first();
  if (await btn.count()) { contestHex = staged.hex; contestBtn = btn; break; }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  if (i + 1 >= staged.candidates) break;
}

if (contestHex) {
  {
    check("nothing sounding before the roll", !(await held()));
    await contestBtn.click();
    // Attacking someone you are not at war with asks first.
    await page.locator("button").filter({ hasText: /^ATTACK$/i }).first()
      .click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(800);
    check("a conflict roll sounds the battle stinger", await held());

    // Closing the overlay must take the sound with it rather than leaving a
    // battle playing over a quiet board. The overlay's Exit button is part of
    // its timeline and only appears with the winner banner at ~6.3s, so wait
    // for it rather than guessing — clicking early is how this check used to
    // pass by accident.
    const exitBtn = page.locator("button").filter({ hasText: /^Exit$/i }).first();
    await exitBtn.waitFor({ state: "visible", timeout: 12000 }).catch(() => {});
    await exitBtn.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(700);
    // _heldWanted is cleared only by release(), never by a cue ending on its
    // own — so it, not _sustained, is what proves the wiring let go.
    const stillWanted = await page.evaluate(() =>
      [...window.__ashlandAudio.sfx._heldWanted].includes("contestRoll"));
    check("closing the roll releases it", !stillWanted && !(await held()));
  }
} else {
  check("a conflict roll sounds the battle stinger", false, `could not stage a contest — ${stageError || "no held location offered the button"}`);
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
check("the envoy's arrival cue fires with it", (await fired()).includes("envoyArrival"), (await fired()).join(","));

// A herald banner — the small option-less callout at the top of the screen.
await page.locator("button").filter({ hasText: /Hear them out/i }).first()
  .click({ timeout: 2000 }).catch(() => {});
await page.waitForTimeout(400);
await clearFired();
const heraldStaged = await page.evaluate(() => {
  const g = window.__ashland;
  const me = g.turnOrder[g.activeIndex];
  const [a, b] = g.turnOrder.filter((f) => f !== me);
  if (!a || !b) return false;
  // A war between two OTHER powers: heraldFromLog skips moves the human
  // initiated, so the player must not be either side of it.
  g.log.push({ name: "war_declared", payload: { a, b } });
  window.__ashlandBump?.();
  return true;
});
await page.waitForTimeout(700);
check("a herald banner appears", heraldStaged && (await page.getByText(/declares war on/i).count()) > 0);
check("the diplomacy alert fires with it", (await fired()).includes("diplomacyAlert"), (await fired()).join(","));

// Two different questions, because they have two different answers.
//
// Nothing may fail while the menu just sits there playing its theme — that
// window is steady state, and the duplicate-fetch bug lived exactly there.
// `idleFailures` is snapshotted before the suite starts fast-forwarding.
check("nothing fails while the menu just plays", idleFailures === 0, failedAudio.slice(0, 2).join(", "));

// Across the whole run, aborts are allowed but nothing else is: assigning a
// new src to a media element cancels whatever it was fetching, so every
// deliberate skip aborts the outgoing track's download by design. A 404 or a
// real network error is never by design.
const hardFailures = failedAudio.filter((f) => !/ERR_ABORTED/.test(f));
check("no audio asset 404s or network errors", hardFailures.length === 0, hardFailures.join(", "));

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
