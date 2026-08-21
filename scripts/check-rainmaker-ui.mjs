// The Rainmaker on screen, driven through the real app.
//
// Two things this guards, both of which are invisible until somebody plays a
// whole game and reaches the ending:
//
//   1. Every rainmaker event has a feed line, and every feed line names the
//      faction it is about. The feed falls back to printing a RAW EVENT NAME
//      for anything unformatted, and a formatter that reads the wrong payload
//      key prints a sentence with a hole where the faction should be — which
//      is how "— has reached the machine" shipped. Both are caught here by
//      firing every event with its real payload and reading the screen.
//   2. The device draws on the board as its OWN object, in each of its states,
//      and does NOT draw where the viewer cannot see it.
//
//   npm run dev                        # in one shell
//   node scripts/check-rainmaker-ui.mjs
import { chromium } from "playwright";

const BASE = (process.env.SHOT_BASE || "http://localhost:5173/PABC").replace(/\/$/, "");
const VIEWPORT = { width: Number(process.env.SHOT_W) || 1700, height: Number(process.env.SHOT_H) || 1050 };

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
const errors = [];
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text());
});

await page.goto(`${BASE}/?board=holo`, { waitUntil: "domcontentloaded" });
await page.locator("button").filter({ hasText: "NEW GAME" }).first().click({ timeout: 20000 });
await page.locator("button").filter({ hasText: "VERSARI KORAD" }).first().click();
await page.locator("button").filter({ hasText: "BEGIN" }).first().click();
await page.getByText("End Turn").waitFor({ timeout: 30000 });
await page.waitForTimeout(700);

// --- 1. every event has a line, and every line is complete ---------------
const feed = await page.evaluate(async () => {
  const g = window.__ashland;
  const { EVENT_NAMES, emit } = await import("/PABC/src/game/events.js");
  const R = await import("/PABC/src/game/rainmaker.js");
  g.rules.fogOfWar = false;
  g.visibility = {};
  const me = g.humanFactionId;
  const foe = g.turnOrder.find((f) => f !== me);
  const rm = R.rainmakerState(g);
  const hex = rm.siteHex;
  // Every rainmaker event, with the payload the engine actually emits.
  const fired = {
    rainmaker_myth: { round: g.round },
    rainmaker_joined: { player: me, round: g.round, hunting: false },
    rainmaker_advanced: { player: me, from: 1, to: 2 },
    rainmaker_found: { player: foe, hex, how: "entered the hex", round: g.round },
    rainmaker_exclusive: { holder: foe, converted: [me] },
    rainmaker_site_worked: { player: me, turns: 2 },
    rainmaker_extracted: { player: foe, hex, damaged: true },
    rainmaker_hauled: { player: me, unit: "u1", hex },
    rainmaker_claimed: { player: me, hex },
    rainmaker_claim_released: { player: me, reason: "attacker repulsed" },
    rainmaker_loose: { hex, from: foe, reason: "escort lost" },
    rainmaker_taken: { player: me, from: foe, hex, reason: "seized" },
    rainmaker_delivered: { player: me, hex },
    rainmaker_installing: { player: me, turns: 2, needed: 4 },
    rainmaker_specialist_secured: { player: me, from: foe, how: "taken" },
    rainmaker_specialist_lost: { reason: "killed" },
    rainmaker_activated: { player: foe, hex, round: g.round, holdRounds: 3 },
    rainmaker_siege: { holder: foe, besiegers: [me] },
    rainmaker_siege_force: { faction: "versari-splinter", units: 3, hex },
    splinter_rose: { faction: "versari-splinter", against: foe, from: "versari", units: 3 },
    rainmaker_hold_broken: { player: foe },
    rainmaker_destroyed: { player: me, reason: "denied" },
    rainmaker_won: { player: foe, round: g.round },
    // Bookkeeping rather than news — fired here too, so "every event is
    // covered" means every event, and so a formatter added for one of these
    // later cannot slip in unnoticed.
    rainmaker_site_cramped: { hex, distance: 2, target: 4, capitals: 4, hexes: 30 },
    rainmaker_disposition: { player: foe, kind: "block", at: 1 },
  };
  const names = [...EVENT_NAMES].filter((n) => /^(rainmaker|splinter)/.test(n));
  const unfired = names.filter((n) => !(n in fired));
  for (const [name, payload] of Object.entries(fired)) emit(g, name, payload);
  window.__ashlandBump();
  return { fired: Object.keys(fired), unfired, names: names.length };
});
await page.waitForTimeout(900);

check("every rainmaker event is exercised by this check",
  feed.unfired.length === 0, feed.unfired.join(", ") || `${feed.names} events`);

const feedText = await page.evaluate(() => {
  const el = [...document.querySelectorAll("*")].find((d) => /EVENT LOG/i.test(d.textContent || "")
    && d.querySelectorAll("*").length < 300);
  return (el || document.body).innerText;
});
const raw = feed.fired.filter((n) => feedText.includes(n));
check("no event falls through to its raw name in the feed",
  raw.length === 0, raw.join(", ") || "all formatted");
// A formatter reading the wrong payload key prints a sentence starting with a
// blank where a faction name should be.
const holes = (feedText.split("\n") || []).filter((l) => /^\s*(—|-)\s+has\b/.test(l) || /\bundefined\b/.test(l));
check("no feed line has a hole where a faction name should be",
  holes.length === 0, holes.slice(0, 2).join(" | ") || "all named");

// --- 2. the device draws as its own object -------------------------------
async function deviceState(setup) {
  await page.evaluate(async (s) => {
    const g = window.__ashland;
    const R = await import("/PABC/src/game/rainmaker.js");
    const rm = R.rainmakerState(g);
    rm.device.status = s.status;
    rm.device.owner = s.owner === "me" ? g.humanFactionId : s.owner;
    rm.device.hex = rm.siteHex;
    rm.device.damaged = !!s.damaged;
    rm.phase = "exclusive";
    rm.foundBy = g.humanFactionId;
    g.rules.fogOfWar = s.fog === false ? false : true;
    if (s.fog === false) g.visibility = {};
    window.__ashlandBump();
  }, setup);
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const el = document.querySelector("[data-rainmaker]");
    return el ? { status: el.getAttribute("data-rainmaker"), owner: el.getAttribute("data-rainmaker-owner") } : null;
  });
}

const carried = await deviceState({ status: "carried", owner: "me", fog: false });
check("a device being hauled draws on the board, in its holder's name",
  carried?.status === "carried" && carried.owner !== "none", JSON.stringify(carried));
const loose = await deviceState({ status: "loose", owner: null, fog: false });
check("a device nobody holds draws too — that is the whole point of it",
  loose?.status === "loose" && loose.owner === "none", JSON.stringify(loose));
const damaged = await deviceState({ status: "carried", owner: "me", damaged: true, fog: false });
check("a damaged device still draws, so a rival can see what it is chasing is hurt",
  damaged?.status === "carried", JSON.stringify(damaged));

// Fog: the design promises routes stay unknown until within sight range, so a
// board drawn from omniscient state would break that quietly.
const hidden = await page.evaluate(async () => {
  const g = window.__ashland;
  const R = await import("/PABC/src/game/rainmaker.js");
  const V = await import("/PABC/src/game/visibility.js");
  const rm = R.rainmakerState(g);
  g.rules.fogOfWar = true;
  for (const f of g.turnOrder) V.recomputeVisibility(g, f, { emitEvents: false });
  // Park it somewhere the viewer certainly cannot see.
  const vis = g.visibility[g.humanFactionId];
  const dark = Object.keys(g.board.hexes).find((h) => !vis.visible.has(h));
  rm.device.status = "carried";
  rm.device.owner = g.turnOrder.find((f) => f !== g.humanFactionId);
  rm.device.hex = dark;
  window.__ashlandBump();
  return dark;
});
await page.waitForTimeout(400);
const drawnInDark = await page.evaluate(() => !!document.querySelector("[data-rainmaker]"));
check("a convoy the viewer cannot see is not drawn for them",
  drawnInDark === false, `hidden at ${hidden}`);

// --- 3. the second clock -------------------------------------------------
const dial = await page.evaluate(async () => {
  const g = window.__ashland;
  const R = await import("/PABC/src/game/rainmaker.js");
  const rm = R.rainmakerState(g);
  rm.mythOpened = g.round;
  rm.device.status = "installed";
  rm.device.owner = g.humanFactionId;
  rm.activatedBy = g.humanFactionId;
  rm.activatedRound = g.round;
  g.rules.fogOfWar = false; g.visibility = {};
  window.__ashlandBump();
  return true;
});
await page.waitForTimeout(500);
// By its mark rather than its label: the label CHANGES to a countdown once the
// clock is running, which is exactly the state this is checking.
const dials = await page.evaluate(() => ({
  rainmaker: !!document.querySelector('[data-dial="rainmaker"]'),
  dominion: !!document.querySelector('[data-dial="dominion"]'),
  label: document.querySelector('[data-dial="rainmaker"]')?.innerText || "",
}));
check("the Rainmaker gets its own clock beside the Dominion one",
  dials.rainmaker && dials.dominion, JSON.stringify(dials));
check("…and it counts down to the win once the thing is switched on",
  /to rain/i.test(dials.label), dials.label.replace(/\n/g, " "));

// --- 4. the player can actually play it ----------------------------------
// Every beat that asks the player for a decision needs its button, or the third
// way to win is something only the AI can do.
async function openPanel() {
  // Close whatever is open first — the windows are modal and their backdrop
  // eats clicks. Dispatched on window rather than typed, because
  // page.keyboard.press needs a focused document and the modal may hold it.
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
  await page.waitForTimeout(250);
  await page.locator("text=MENU").first().click();
  await page.waitForTimeout(400);
  // By its key, not its label: the HUD dial also reads "Rainmaker".
  await page.locator('[data-radial="rainmaker"]').first().click();
  await page.waitForTimeout(400);
}
const btn = (label) => page.locator("button").filter({ hasText: label }).first();

// Before the myth there is nothing to do and nothing to spoil.
await page.evaluate(async () => {
  const g = window.__ashland;
  const R = await import("/PABC/src/game/rainmaker.js");
  const rm = R.rainmakerState(g);
  rm.mythOpened = null;
  rm.foundBy = null;
  rm.progress = {};
  rm.device = { status: "buried", hex: rm.siteHex, owner: null, carrierUid: null };
  rm.activatedBy = null;
  rm.phase = "parallel";
  g.rules.fogOfWar = false; g.visibility = {};
  window.__ashlandBump();
});
await openPanel();
const quiet = await page.evaluate(() => document.body.innerText);
check("before the myth the panel offers nothing and gives nothing away",
  /rumour/i.test(quiet) && !/Put people on it/i.test(quiet));

// The myth opens: committing is a button, and it commits.
await page.evaluate(async () => {
  const g = window.__ashland;
  const R = await import("/PABC/src/game/rainmaker.js");
  R.openMyth(g);
  window.__ashlandBump();
});
await openPanel();
await btn("Put people on it").click();
await page.waitForTimeout(500);
const joined = await page.evaluate(() => Object.keys(window.__ashland.world.rainmaker.progress));
check("committing to the myth is a button, and it commits",
  joined.includes(await page.evaluate(() => window.__ashland.humanFactionId)));

// On site: the second path at Stage 4 is a button, and it damages the device.
await page.evaluate(async () => {
  const g = window.__ashland;
  const R = await import("/PABC/src/game/rainmaker.js");
  const me = g.humanFactionId;
  R.findSite(g, me, "check");
  const rm = R.rainmakerState(g);
  const u = Object.values(g.units).find((x) => x.owner === me);
  u.node = rm.siteHex;
  R.advanceStage(g, me, R.STAGE.SITE);
  R.progressFor(g, me).siteTurns = 1;
  window.__ashlandBump();
});
await openPanel();
await btn("Tear it loose now").click();
await page.waitForTimeout(500);
const torn = await page.evaluate(() => {
  const rm = window.__ashland.world.rainmaker;
  return { status: rm.device.status, damaged: !!rm.device.damaged };
});
check("tearing it loose early is a button, and the device pays for it",
  torn.status === "carried" && torn.damaged === true, JSON.stringify(torn));

// Stage 7 and 8: the engineer, and the switch.
await page.evaluate(async () => {
  const g = window.__ashland;
  const R = await import("/PABC/src/game/rainmaker.js");
  const me = g.humanFactionId;
  const rm = R.rainmakerState(g);
  const home = R.capitalHexOf(g, me);
  rm.device.status = "installed";
  rm.device.hex = home;
  rm.device.owner = me;
  R.advanceStage(g, me, R.STAGE.INSTALL);
  R.advanceStage(g, me, R.STAGE.SPECIALIST);
  g.players[me].resource = 500;
  window.__ashlandBump();
});
await openPanel();
const hire = page.locator("button").filter({ hasText: /Hire them|Outbid/ }).first();
check("the engineer can be bought from the panel", await hire.count() === 1);
await hire.click();
await page.waitForTimeout(500);
const secured = await page.evaluate(() => window.__ashland.world.rainmaker.specialist?.heldBy);
check("…and buying them actually secures them",
  secured === await page.evaluate(() => window.__ashland.humanFactionId), String(secured));

await page.evaluate(async () => {
  const g = window.__ashland;
  const R = await import("/PABC/src/game/rainmaker.js");
  R.tickSpecialist(g);
  window.__ashlandBump();
});
await openPanel();
await btn("Throw the switch").click();
await page.waitForTimeout(500);
const live = await page.evaluate(() => {
  const rm = window.__ashland.world.rainmaker;
  return { by: rm.activatedBy, at: rm.activatedRound };
});
check("throwing the switch is a button, and it starts the clock",
  !!live.by && live.at != null, JSON.stringify(live));

// A device lying in the open: take it, or end the line for everybody.
await page.evaluate(async () => {
  const g = window.__ashland;
  const R = await import("/PABC/src/game/rainmaker.js");
  const me = g.humanFactionId;
  const u = Object.values(g.units).find((x) => x.owner === me);
  R.looseDevice(g, { hex: u.node, reason: "check" });
  window.__ashlandBump();
});
await openPanel();
check("standing on an unowned device offers both the taking and the ending of it",
  await btn("Pick it up").count() === 1 && await btn("Destroy it").count() === 1);
await btn("Destroy it").click();
await page.waitForTimeout(500);
const dead = await page.evaluate(() => window.__ashland.world.rainmaker.device.status);
check("…and destroying it ends the line", dead === "destroyed");
await openPanel();
const epitaph = await page.evaluate(() => document.body.innerText);
check("…which the panel says plainly rather than going blank",
  /there is not another/i.test(epitaph));

check("no console/page errors", errors.length === 0, errors.slice(0, 2).join(" | ") || "clean");

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
