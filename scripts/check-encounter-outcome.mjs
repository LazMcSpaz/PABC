// The four things a playtest of q_massacre exposed, each pinned here:
//
//   1. the card had no title — it printed its own synthetic id
//   2. beat 3 was served before beat 1, because it carried no prerequisite
//   3. the CONTEST behind "Challenge them for the spoils" resolved unseen
//   4. nothing wrapped it up — the authored outcome text never reached a screen
//
// Runs against the real authored content, not a fixture, because three of the
// four were content-shaped: the engine was correct in the abstract and wrong
// about what had actually been written.
import { createGame } from "../src/game/setup.js";
import { startTurn, endTurn } from "../src/game/turn.js";
import { CONFIG } from "../src/game/config.js";
import { applyEffect } from "../src/game/effects.js";
import { getQuest, activeQuestFor, registerQuest } from "../src/game/quests.js";
import {
  pendingEncountersFor, resolvePendingEncounter, markerQueue, resolveMarkerOnHex,
} from "../src/game/encounters.js";
import { summarizeResolution } from "../src/prototype/encounterOutcome.js";

let fail = 0;
const check = (n, ok, d) => { if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : "\n        " + d}`); };

const HUMAN = "plainers";
function fresh(seed = 1126) {
  const g = createGame({ seed, humanFactionId: HUMAN });
  startTurn(g);
  return g;
}
// Every marker on the board that belongs to this quest run, as {hex, beatId}.
function markersOf(g, questId, pid) {
  const out = [];
  for (const hex of Object.keys(g.world.encounterMarkers || {})) {
    for (const m of markerQueue(g, hex, false)) {
      if (m.questId === questId && (!m.claimant || m.claimant === pid)) out.push({ hex, beatId: m.beatId });
    }
  }
  return out;
}
// Walk a unit onto a marker hex without a Move — the placement rules are not
// what is under test here, only what the marker delivers.
function discover(g, hex, pid = HUMAN) {
  const unit = Object.values(g.units).find((u) => u.owner === pid);
  unit.node = hex;
  return resolveMarkerOnHex(g, hex, unit, {});
}

// --- 1. the title -------------------------------------------------------
{
  const g = fresh();
  applyEffect(g, { type: "START_QUEST", questId: "q_massacre", claimant: HUMAN },
    { sourcePlayer: HUMAN, asPlayer: HUMAN });
  const marks = markersOf(g, "q_massacre", HUMAN);
  discover(g, marks[0].hex);
  const card = pendingEncountersFor(g, HUMAN)[0];
  check("1. a quest beat reaches the UI carrying its quest's title",
    card?.title === getQuest("q_massacre").title,
    `title was ${JSON.stringify(card?.title)}, wanted ${JSON.stringify(getQuest("q_massacre").title)}`);
  check("2. …and never falls back to the synthetic beat id",
    !String(card?.title || "").includes("quest:"),
    JSON.stringify(card?.title));
}

// --- 2. beat order ------------------------------------------------------
{
  const g = fresh();
  applyEffect(g, { type: "START_QUEST", questId: "q_massacre", claimant: HUMAN },
    { sourcePlayer: HUMAN, asPlayer: HUMAN });
  const marks = markersOf(g, "q_massacre", HUMAN);
  check("3. starting q_massacre places exactly its opener, not beat 3 as well",
    marks.length === 1 && marks[0].beatId === "qb_mas_1",
    JSON.stringify(marks));

  // …and the compound opens once the opener has actually been played.
  discover(g, marks[0].hex);
  const card = pendingEncountersFor(g, HUMAN)[0];
  resolvePendingEncounter(g, card.id, "ch_mas_follow", {});
  const after = markersOf(g, "q_massacre", HUMAN).map((m) => m.beatId);
  check("4. following the tracks is what opens the compound",
    after.includes("qb_mas_compound"), JSON.stringify(after));
}

// Nothing else in the corpus loses a beat to the same rule: every quest must
// still be able to start, and every beat must still be reachable in principle.
{
  const g = fresh();
  let stuck = [];
  for (const qid of Object.keys((await import("../src/game/content/index.js")).QUESTS)) {
    const q = getQuest(qid);
    const openers = (q.beats || []).filter((b) => !(b.prerequisites || []).length);
    if (!openers.length) stuck.push(`${qid}: no prerequisite-free beat at all`);
  }
  check("5. every authored quest still has an opener", !stuck.length, stuck.join("\n        "));
}

// --- 3 + 4. the contest is seen, and the card wraps up ------------------
{
  const g = fresh();
  applyEffect(g, { type: "START_QUEST", questId: "q_massacre", claimant: HUMAN },
    { sourcePlayer: HUMAN, asPlayer: HUMAN });
  const opener = markersOf(g, "q_massacre", HUMAN)[0];
  discover(g, opener.hex);
  const first = pendingEncountersFor(g, HUMAN)[0];
  resolvePendingEncounter(g, first.id, "ch_mas_follow", {});

  const compound = markersOf(g, "q_massacre", HUMAN).find((m) => m.beatId === "qb_mas_compound");
  check("6. the compound is reachable by walking into it", !!compound, JSON.stringify(markersOf(g, "q_massacre", HUMAN)));
  discover(g, compound.hex);
  const card = pendingEncountersFor(g, HUMAN).find((p) => p.ctx.beatId === "qb_mas_compound");
  const chosen = card.choices.find((c) => c.id === "ch_mas_challenge");

  // This is exactly what the UI does: mark the log, resolve, read the slice.
  const from = g.log.length;
  resolvePendingEncounter(g, card.id, "ch_mas_challenge", {});
  const summary = summarizeResolution(g.log.slice(from), g, HUMAN);

  check("7. the challenge produces a contest the player can be shown",
    !!summary.contest, "no narrative_contest_resolved in the resolution");
  check("8. …with both dice, both totals and the verdict",
    summary.contest
      && Number.isInteger(summary.contest.die)
      && Number.isInteger(summary.contest.opponentDie)
      && summary.contest.total === summary.contest.own + summary.contest.ally + summary.contest.die
      && summary.contest.against === summary.contest.opponent + summary.contest.opponentDie,
    JSON.stringify(summary.contest));
  check("9. the outcome carries the authored closing text",
    typeof chosen.outcomeText === "string" && chosen.outcomeText.length > 0,
    JSON.stringify(chosen.outcomeText));
  check("10. losing narrates the loss rather than leaving it to be inferred",
    summary.contest.won
      ? summary.lines.some((l) => /Scrap|scrap/.test(l.text))
      : summary.lines.some((l) => /destroyed/i.test(l.text)),
    JSON.stringify(summary.lines));
}

// Every choice in the corpus has something to say when it is over — this is
// the promise the outcome card is built on.
{
  const { QUESTS } = await import("../src/game/content/index.js");
  const { FIELD_ENCOUNTERS, WORLD_ENCOUNTERS } = await import("../src/game/content/index.js");
  const missing = [];
  for (const [qid, q] of Object.entries(QUESTS)) {
    for (const b of q.beats || []) {
      for (const c of b.choices || []) {
        if (!c.outcomeText) missing.push(`${qid}/${b.id}/${c.id}`);
      }
    }
  }
  check("11. every quest choice carries outcome text for the wrap-up",
    !missing.length, `${missing.length} without: ${missing.slice(0, 6).join(", ")}`);

  const encMissing = [];
  for (const src of [FIELD_ENCOUNTERS, WORLD_ENCOUNTERS]) {
    for (const [eid, e] of Object.entries(src)) {
      for (const c of e.choices || []) if (!c.outcomeText) encMissing.push(`${eid}/${c.id}`);
    }
  }
  check("12. …and so does every field and world encounter choice",
    !encMissing.length, `${encMissing.length} without: ${encMissing.slice(0, 6).join(", ")}`);
}

// --- a card the UI cannot answer must be parked, never auto-resolved -----
{
  const g = fresh();
  applyEffect(g, { type: "START_QUEST", questId: "q_massacre", claimant: HUMAN },
    { sourcePlayer: HUMAN, asPlayer: HUMAN });
  const opener = markersOf(g, "q_massacre", HUMAN)[0];
  const unit = Object.values(g.units).find((u) => u.owner === HUMAN);
  unit.node = opener.hex;
  // An `interact` channel opened for some OTHER card — the shape a Move that
  // draws a field encounter creates.
  resolveMarkerOnHex(g, opener.hex, unit, { interact: () => undefined });
  const parked = pendingEncountersFor(g, HUMAN).some((p) => p.ctx.beatId === "qb_mas_1");
  const resolved = g.log.some((e) => e.name === "encounter_resolved"
    && String(e.payload.encounter).includes("qb_mas_1"));
  check("13. a beat the open channel cannot answer is parked, not silently taken",
    parked && !resolved, `parked=${parked} resolved=${resolved}`);
}

// --- settlement beats are a scene at home, a journey abroad ---------------
//
// q_hire opens at a Goldgrass settlement and is gated `active != goldgrass`,
// so it is a journey to every faction — until one of them takes a Goldgrass
// town, at which point the news of raided villages reaches them there.
{
  const g = fresh();
  const kansit = Object.keys(g.locations).find(
    (h) => g.locations[h].locationId === "kansit");
  g.locations[kansit].controller = HUMAN;
  applyEffect(g, { type: "START_QUEST", questId: "q_hire", claimant: HUMAN },
    { sourcePlayer: HUMAN, asPlayer: HUMAN });
  const card = pendingEncountersFor(g, HUMAN).find((c) => c.ctx.beatId === "qb_hire_1");
  check("14. a settlement opener set where you already hold is delivered, not placed",
    !!card, `markers instead: ${JSON.stringify(markersOf(g, "q_hire", HUMAN))}`);
  check("15. …at that settlement, so `encounter-hex` and the prose agree",
    card?.ctx.sourceHex === kansit, `sourceHex=${card?.ctx.sourceHex} wanted ${kansit}`);
}
{
  // The same quest, for a player holding no Goldgrass town: still a journey.
  const g = fresh();
  applyEffect(g, { type: "START_QUEST", questId: "q_hire", claimant: HUMAN },
    { sourcePlayer: HUMAN, asPlayer: HUMAN });
  check("16. …and stays a map marker for a player who holds no such place",
    markersOf(g, "q_hire", HUMAN).length === 1
      && !pendingEncountersFor(g, HUMAN).some((c) => c.ctx.beatId === "qb_hire_1"),
    JSON.stringify(markersOf(g, "q_hire", HUMAN)));
}
{
  // `notControlledBy: "active"` is the author saying "somewhere that is not
  // yours". It must never resolve at home, and must never be PLACED at home
  // either — the token used to be dropped by the filter entirely.
  const g = fresh();
  applyEffect(g, { type: "START_QUEST", questId: "q_signal", claimant: HUMAN },
    { sourcePlayer: HUMAN, asPlayer: HUMAN });
  const placed = markersOf(g, "q_signal", HUMAN);
  check("17. a beat set at a place you do NOT hold is never delivered at home",
    !pendingEncountersFor(g, HUMAN).some((c) => c.ctx.beatId === "qb_sig_1"),
    "qb_sig_1 was handed over without travel");
  check("18. …nor placed on a settlement you control",
    placed.every((m) => g.locations[m.hex]?.controller !== HUMAN),
    JSON.stringify(placed.map((m) => [m.hex, g.locations[m.hex]?.controller])));
}
{
  // The explicit authoring mode, which is not restricted to openers.
  registerQuest({
    id: "q_hall", mode: "single-player", title: "The Hall",
    beats: [
      { id: "hb1", ordinal: 0, deliver: "auto", text: "You hear of it.",
        choices: [{ id: "hc1", label: "Go", effects: [] }] },
      { id: "hb2", ordinal: 1, deliver: "settlement", prerequisites: ["hb1"],
        placementFilter: { type: "location" }, text: "You put it to the hall.",
        choices: [{ id: "hc2", label: "Speak", effects: [] }] },
    ],
    completion: { rewardForClaimant: [], sharedSideEffects: [] },
  });
  const g = fresh();
  applyEffect(g, { type: "START_QUEST", questId: "q_hall", claimant: HUMAN },
    { sourcePlayer: HUMAN, asPlayer: HUMAN });
  const first = pendingEncountersFor(g, HUMAN).find((c) => c.ctx.beatId === "hb1");
  resolvePendingEncounter(g, first.id, "hc1", {});
  const second = pendingEncountersFor(g, HUMAN).find((c) => c.ctx.beatId === "hb2");
  check("19. `deliver: settlement` delivers at a held settlement, opener or not",
    !!second && g.locations[second.ctx.sourceHex]?.controller === HUMAN,
    `queued=${JSON.stringify(pendingEncountersFor(g, HUMAN).map((c) => c.ctx.beatId))}`);
}

// --- three beats a turn, counted across every delivery mode ---------------
{
  const cap = CONFIG.quests.beatsPerTurn;
  const child = (i) => ({
    id: `fb${i}`, ordinal: i, deliver: "auto", text: `beat ${i}`,
    prerequisites: ["fb0"],
    choices: [{ id: `fc${i}`, label: "ok", effects: [] }],
  });
  // An opener that fans out to six parallel beats — the shape that used to
  // hand a player a whole quest in one pass.
  registerQuest({
    id: "q_flood", mode: "single-player", title: "Flood",
    beats: [
      { id: "fb0", ordinal: 0, deliver: "auto", text: "the opener",
        choices: [{ id: "fc0", label: "ok", effects: [] }] },
      ...[1, 2, 3, 4, 5, 6].map(child),
    ],
    completion: { rewardForClaimant: [], sharedSideEffects: [] },
  });
  const g = fresh();
  const delivered = () => g.log.filter((e) => e.name === "encounter_delivered"
    && String(e.payload.encounter).startsWith("quest:q_flood")).length;
  const seen = () => pendingEncountersFor(g, HUMAN).filter((c) => c.ctx.questId === "q_flood");

  applyEffect(g, { type: "START_QUEST", questId: "q_flood", claimant: HUMAN },
    { sourcePlayer: HUMAN, asPlayer: HUMAN });
  const opener = seen()[0];
  resolvePendingEncounter(g, opener.id, "fc0", {}); // opens the fan-out
  const total = delivered() + seen().length;
  check(`20. a player is handed at most ${cap} beats in a turn, fan-out included`,
    total === cap, `${total} beats reached the player in one turn (cap ${cap})`);
  check("21. …and the rest are recorded as held, not dropped",
    g.log.some((e) => e.name === "quest_beat_held" && e.payload.questId === "q_flood"),
    "nothing was recorded as held");

  // A marker walked onto spends from the same allowance, and when there is
  // none left it stays on its hex rather than being consumed unseen.
  applyEffect(g, { type: "START_QUEST", questId: "q_massacre", claimant: HUMAN },
    { sourcePlayer: HUMAN, asPlayer: HUMAN });
  const mark = markersOf(g, "q_massacre", HUMAN)[0];
  const before = markerQueue(g, mark.hex, false).length;
  const r = discover(g, mark.hex);
  check("22. a marker found over the cap is held, and stays on its hex",
    r?.held === true && markerQueue(g, mark.hex, false).length === before,
    `result=${JSON.stringify(r)} queue ${before} → ${markerQueue(g, mark.hex, false).length}`);

  // Next turn: fresh allowance, held beats come through.
  let guard = 40;
  for (;;) {
    const q = pendingEncountersFor(g, HUMAN);
    if (!q.length || guard-- <= 0) break;
    resolvePendingEncounter(g, q[0].id, q[0].choices[0].id, {});
  }
  for (let i = 0; i < g.turnOrder.length; i++) { try { endTurn(g); } catch { break; } }
  check("23. a fresh turn delivers the beats that were held",
    pendingEncountersFor(g, HUMAN).some((c) => c.ctx.questId === "q_flood"),
    "the held beats never arrived");
}

console.log(fail ? `\n${fail} check(s) failed` : "\nall checks passed");
process.exit(fail ? 1 : 0);
