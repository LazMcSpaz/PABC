// Directed beat-path finder — construct a witness, don't wait for one.
//
//   node scripts/find-beat-paths.mjs <content.json> [--boards 6] [--rounds 70] [--only qb_x,qb_y]
//
// The campaign walk answers "was this beat reached?". This answers "HOW is it
// reached?" — and it does so by construction rather than by exploration.
//
// Random walking hits diminishing returns because most of its budget goes on
// re-treading beats it has already seen. Instead, for each target beat this
// reads its delivery gate, solves backwards through the flag-writer map to
// find which choices set the flags it needs (and, transitively, what THOSE
// beats need), and then drives a campaign with a policy that steers toward
// exactly those choices and away from anything that sets a flag the gate
// negates.
//
// Output per beat is a witness: the ordered list of (round, quest, beat,
// choice) that produced it. That is the artifact — it answers "is there a
// path" with an actual path, and it doubles as a regression baseline, since
// a future change that breaks a route makes a named witness fail.
//
// Board variance is reported honestly: a beat that only appears on some
// generated boards is "reachable on N of M boards", not "reached".

import fs from "node:fs";
import { assemble } from "./build-content.mjs";
import { createGame } from "../src/game/setup.js";
import { startTurn, endTurn } from "../src/game/turn.js";
import { registerQuest } from "../src/game/quests.js";
import { takeAITurn } from "../src/game/ai.js";
import { assignTechNode } from "../src/game/stats.js";
import { pendingEncountersFor, resolvePendingEncounter, resolveMarkerOnHex,
         registerWorldEncounter, registerFieldEncounter, pickHexByFilter } from "../src/game/encounters.js";

const contentPath = process.argv[2];
if (!contentPath) { console.error("usage: node scripts/find-beat-paths.mjs <content.json> [--boards N] [--rounds R] [--only ids]"); process.exit(1); }
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const BOARDS = Number(arg("boards", 6));
const ROUNDS = Number(arg("rounds", 70));
const ONLY = arg("only", null)?.split(",").map((s) => s.trim()).filter(Boolean) ?? null;

const doc = JSON.parse(fs.readFileSync(contentPath, "utf8"));
const snap = assemble(doc);
for (const q of snap.quests) registerQuest(q);
for (const w of snap.worldEncounters) registerWorldEncounter(w);
for (const f of snap.fieldEncounters) registerFieldEncounter(f);

const decode = (v) => { try { return typeof v === "string" ? JSON.parse(v) : v; } catch { return null; } };
const beatMeta = Object.fromEntries(doc.quest_beats.map((b) => [b.id, b]));
const beatOfChoice = {}, choicesOfBeat = {};
for (const c of doc.choices) {
  if (c.parentKind !== "quest_beat") continue;
  beatOfChoice[c.id] = c.parentId;
  (choicesOfBeat[c.parentId] ||= []).push(c.id);
}
const effByChoice = {};
for (const e of doc.effects) (effByChoice[e.parentId] ||= []).push(e);

// --- what each choice writes, and where each beat routes -------------
// 158 of the corpus's effects live inside a nested list — `effects` (the
// QUEUE_DEFERRED payload), `onSuccess`/`onFail` (ROLL), `onWin`/`onLose`
// (CONTEST) and `options[].effects` (FORCE_CHOICE). 96 of those are
// SET_PLAYER_FLAG, so a scan that does not descend cannot see most of what
// the corpus writes.
//
// Descending is necessary but not sufficient: a write behind a 30% roll is
// not the same promise as a write that always happens, and scoring them
// equally makes the policy prefer a coin-flip over a certainty whenever they
// tie on array order. Each write therefore carries the probability of the
// branch it sits in, and the scorer weights by it.
// Every key under which an effect can nest another effect list. Adding a new
// one to the engine and forgetting it here is not a quiet undercount — it
// produces a confident WRONG answer: `onMissed` was added for deadlines, this
// list was not updated, and the next run declared two beats IMPOSSIBLE on the
// grounds that `tempest_siege_over` had no writer. It has three, all inside
// `onMissed`. A proven-unreachable that isn't is the worst output this tool
// can produce, so the corpus is checked against this list below rather than
// trusted to match it.
const NEST_KEYS = ["effects", "onSuccess", "onFail", "onWin", "onLose", "onMissed"];

const writesOf = {}, routesOf = {};
function scan(type, params, choiceId, conf = 1) {
  if (!params) return;
  if (type === "SET_PLAYER_FLAG" && params.flag) {
    const m = (writesOf[choiceId] ||= new Map());
    m.set(params.flag, Math.max(m.get(params.flag) ?? 0, conf));
  }
  if (type === "ADVANCE_QUEST" && params.beatId && params.beatId !== beatOfChoice[choiceId]) {
    routesOf[choiceId] = params.beatId;
  }
  // QUEUE_DEFERRED's payload is certain, only late. A ROLL's branches split
  // by its authored `chance`; a CONTEST's outcome is not statically knowable,
  // so both sides are treated as even money rather than as promises.
  const p = Number(params.chance);
  const roll = Number.isFinite(p) ? p / 100 : 0.5;
  // `onMissed` is the deadline branch — it fires when the player did NOT meet
  // the deadline. Not a die, so not statically knowable; even money, like a
  // contest outcome.
  const w = { effects: 1, onSuccess: roll, onFail: 1 - roll, onWin: 0.5, onLose: 0.5, onMissed: 0.5 };
  for (const k of NEST_KEYS)
    for (const s of params[k] || []) scan(s.type, decode(s.paramsJson) ?? s.params ?? s, choiceId, conf * w[k]);
  // Headless resolution always takes options[0] (encounters.js headlessPick).
  (params.options || []).forEach((o, i) => {
    for (const s of o.effects || []) scan(s.type, decode(s.paramsJson) ?? s.params ?? s, choiceId, conf * (i === 0 ? 1 : 0));
  });
}
for (const e of doc.effects) scan(e.type, decode(e.paramsJson) ?? e.params, e.parentId);

// Fail loudly if the content nests effects under a key this scanner does not
// walk. Silence here is how a writer becomes invisible and a reachable beat
// gets reported as impossible.
{
  const unknown = new Set();
  (function sweep(params) {
    if (!params || typeof params !== "object") return;
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v) && v.length && v.every((x) => x && typeof x === "object" && "type" in x)) {
        if (!NEST_KEYS.includes(k)) unknown.add(k);
        for (const s of v) sweep(decode(s.paramsJson) ?? s.params ?? {});
      } else if (Array.isArray(v)) {
        for (const x of v) if (x && typeof x === "object") sweep(x);
      } else if (v && typeof v === "object") sweep(v);
    }
  })({ effects: doc.effects.map((e) => ({ type: e.type, params: decode(e.paramsJson) ?? e.params })) });
  if (unknown.size) {
    console.error(`find-beat-paths: content nests effects under unknown key(s) `
      + `${[...unknown].join(", ")} — add them to NEST_KEYS or every write inside `
      + `them is invisible to this search.`);
    process.exit(2);
  }
}

const writersOfFlag = {};
for (const [cid, flags] of Object.entries(writesOf))
  for (const f of flags.keys()) (writersOfFlag[f] ||= new Set()).add(cid);

// Which choices END the quest. This is the single most important thing the
// scorer was blind to: 111 COMPLETE_QUEST effects are authored across the
// corpus, and a deep beat typically sits behind one surviving choice whose
// siblings close the line. A policy that does not know which doors are exits
// walks out of the story long before it reaches what it was looking for.
const endsQuest = new Set();
const advancesQuest = new Set();
for (const e of doc.effects) {
  if (e.type === "COMPLETE_QUEST") endsQuest.add(e.parentId);
  if (e.type === "ADVANCE_QUEST") advancesQuest.add(e.parentId);
}

// How narrow a beat is: of the choices it offers, how many end the quest.
function narrownessOf(beatId) {
  const cs = choicesOfBeat[beatId] || [];
  if (!cs.length) return null;
  const exits = cs.filter((c) => endsQuest.has(c)).length;
  return { total: cs.length, exits, surviving: cs.length - exits };
}

// --- gate analysis ---------------------------------------------------
function gateFlags(cond) {
  const need = new Set(), avoid = new Set();
  (function walk(c, negated) {
    if (!c || typeof c !== "object") return;
    if (c.has_flag?.flag) { (negated ? avoid : need).add(c.has_flag.flag); return; }
    if (c.not !== undefined) return walk(c.not, !negated);
    for (const v of Object.values(c)) {
      if (Array.isArray(v)) v.forEach((x) => walk(x, negated));
      else if (v && typeof v === "object") walk(v, negated);
    }
  })(cond, false);
  return { need, avoid };
}

// Which wheel nodes a condition asks for. The AI reaches these through
// `maybeAssignTech`; a directed search should reach them the same way, by
// spending an earned Ability Point on the node the gate names.
const TECH_ENTRY = { military: "mil", logistics: "log", economy: "eco", intelligence: "int" };
function techNeeds(cond, acc = new Set()) {
  if (!cond || typeof cond !== "object") return acc;
  const t = cond.has_tech || cond.count_tech;
  if (t) {
    if (t.node) acc.add(t.node);
    else if (t.path && TECH_ENTRY[t.path]) {
      const p = TECH_ENTRY[t.path];
      acc.add(`${p}-entry`);
      acc.add(`${p}-${t.branch || "a"}1`);
    }
  }
  for (const v2 of Object.values(cond)) {
    if (Array.isArray(v2)) v2.forEach((x) => techNeeds(x, acc));
    else if (v2 && typeof v2 === "object") techNeeds(v2, acc);
  }
  return acc;
}

// Transitive requirement closure for a target beat.
function requirementsFor(beatId) {
  const need = new Set(), avoid = new Set(), tech = new Set(), viaBeats = new Set([beatId]);
  const queue = [beatId]; const seen = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue; seen.add(id);
    const m = beatMeta[id]; if (!m) continue;
    const g = gateFlags(decode(m.deliverCondition));
    g.avoid.forEach((f) => avoid.add(f));
    // Choice conditions gate reaching a beat just as hard as the beat's own
    // deliverCondition does, and reading only the latter is why a required
    // capability was invisible and why an upstream sibling that writes a flag
    // a later choice negates looked like a free pick.
    for (const cid of choicesOfBeat[id] || []) {
      const cc = decode((doc.choices.find((c) => c.id === cid) || {}).condition);
      if (!cc) continue;
      const cg = gateFlags(cc);
      cg.avoid.forEach((f) => avoid.add(f));
      for (const t of techNeeds(cc)) tech.add(t);
    }
    for (const f of g.need) {
      need.add(f);
      for (const cid of writersOfFlag[f] || []) {
        const b = beatOfChoice[cid];
        if (b) { viaBeats.add(b); queue.push(b); }
      }
    }
    // prerequisites are beats too
    for (const p of doc.quest_beat_prereqs.filter((p) => p.beatId === id))
      { viaBeats.add(p.prereqBeatId); queue.push(p.prereqBeatId); }
  }
  return { need, avoid, tech, viaBeats };
}

// --- directed campaign ------------------------------------------------
const FACTIONS = ["versari", "goldgrass", "lakers", "plainers"];
function attempt(targetId, req, seed, human, applyEffect) {
  const g = createGame({ seed, humanFactionId: human });
  startTurn(g);
  const witness = [];
  let found = false;

  // Claim every quest on the path for the seat we are steering.
  //
  // Without this the search is blind: the choice policy only answers cards
  // shown to the human, but quests are offered to whichever seat is active
  // when their gate first passes — so a target quest claimed by an AI has
  // its beats auto-resolved at choice 0 and the policy never gets a vote.
  // That is why the first run of this tool reported flags like
  // `signal_acknowledged` as unreachable when the choice that writes them
  // was sitting on a beat an AI had already answered.
  const questsOnPath = new Set([beatMeta[targetId]?.questId]);
  for (const b of req.viaBeats) if (beatMeta[b]) questsOnPath.add(beatMeta[b].questId);
  for (const qid of questsOnPath) {
    if (!qid) continue;
    try { applyEffect(g, { type: "START_QUEST", questId: qid, claimant: human },
                      { sourcePlayer: human, asPlayer: human }); } catch { /* not startable yet */ }
  }

  const targetQuest = beatMeta[targetId]?.questId;
  const score = (card, c) => {
    let s = 0;
    const w = writesOf[c.id] || new Map();
    for (const [f, conf] of w) {
      if (req.need.has(f)) s += 12 * conf;
      if (req.avoid.has(f)) s -= 50 * conf;
    }
    const route = routesOf[c.id];
    if (route && req.viaBeats.has(route)) s += 25;
    if (route && !req.viaBeats.has(route)) s -= 8;
    // Don't walk out of the story we are trying to reach the end of.
    if (endsQuest.has(c.id) && card.ctx.questId === targetQuest) s -= 200;
    // All else equal, keep the line alive.
    if (advancesQuest.has(c.id)) s += 3;
    return s;
  };

  // `--rounds` means GAME rounds, not endTurn calls. endTurn advances the
  // SEAT; a round is one pass through turnOrder. The earlier loop called
  // endTurn once per iteration, so `--rounds 80` delivered 20 game rounds and
  // silently truncated every deferred timer and every `round >= N` trigger.
  const SEATS = g.turnOrder.length;
  for (let r = 0; r < ROUNDS * SEATS && !found; r++) {
    for (const hex of Object.keys(g.world?.encounterMarkers || {})) {
      const u = Object.values(g.units).find((x) => x.owner === human);
      if (!u) break;
      u.node = hex;
      try { resolveMarkerOnHex(g, hex, u, {}); } catch { delete g.world.encounterMarkers[hex]; }
    }
    let guard = 300;
    for (;;) {
      const q = pendingEncountersFor(g, human);
      if (!q.length || guard-- <= 0) break;
      const card = q[0];
      const beat = card.ctx.beatId;
      const best = [...card.choices].sort((a, b) => score(card, b) - score(card, a))[0];
      witness.push({ round: g.round, quest: card.ctx.questId, beat, choice: best.label });
      if (beat === targetId) found = true;
      try { resolvePendingEncounter(g, card.id, best.id, {}); } catch { break; }
      if (found) break;
    }
    if (found) break;
    // Spend any earned Ability Point on the node this route needs, through the
    // same engine call the AI uses (`assignTechNode`). Prerequisites are
    // enforced by the engine, so entry-then-branch is tried in order and a
    // point is never spent on something unreachable.
    for (const node of req.tech) {
      if (g.players[human].techWheel.includes(node)) continue;
      if (assignTechNode(g, human, node).ok) break;
    }
    // Play the seat that holds the turn the way the game plays it: economy,
    // builds and research all run here. takeAITurn ends the turn itself, so
    // only fall back to endTurn if it did not.
    const before = g.activeIndex;
    try { takeAITurn(g); } catch { /* keep the campaign alive */ }
    if (g.activeIndex === before) { try { endTurn(g); } catch { break; } }
    // Re-claim: a quest whose gate only opens later should still land on
    // the steered seat rather than whichever AI happens to be active.
    // Do NOT re-claim a quest the seat has already finished. `activeQuests`
    // drops the record on completion, so the old unconditional re-claim
    // restarted finished quests roughly once per round and replayed them from
    // beat 1 with the same policy — burning the whole round budget on a loop
    // that could never explore a different branch.
    if (r % (5 * SEATS) === 5 * SEATS - 1) {
      for (const qid of questsOnPath) {
        if (!qid || g.activeQuests[qid]) continue;
        if (g.players[human]?.completedQuests?.[qid]) continue;
        try { applyEffect(g, { type: "START_QUEST", questId: qid, claimant: human },
                          { sourcePlayer: human, asPlayer: human }); } catch { /* ignore */ }
      }
    }
  }
  // beats delivered to AI seats count as reachable too - check the log
  if (!found) {
    found = g.log.some((e) => e.name === "encounter_delivered"
      && String(e.payload.encounter).endsWith(`:beat:${targetId}`));
  }
  // On failure, say WHY rather than leaving the caller to guess: which
  // required flags never got set, whether the beat that writes each one was
  // ever delivered, and what was chosen when it was.
  let diag = null;
  if (!found) {
    const deliveredBeats = new Set(g.log
      .filter((e) => e.name === "encounter_delivered")
      .map((e) => String(e.payload.encounter).split(":beat:")[1]).filter(Boolean));
    const flags = g.players[human]?.flags || {};
    const missing = [...req.need].filter((f) => !flags[f]?.value);
    diag = {
      questStarted: !!g.log.some((e) => e.name === "quest_started"
        && e.payload.questId === beatMeta[targetId]?.questId),
      questCompletedEarly: !!g.log.some((e) => e.name === "quest_completed"
        && e.payload.questId === beatMeta[targetId]?.questId),
      missingFlags: missing.map((f) => {
        const writers = [...(writersOfFlag[f] || [])];
        return {
          flag: f,
          writerBeats: [...new Set(writers.map((c) => beatOfChoice[c]).filter(Boolean))],
          writerBeatDelivered: writers.some((c) => deliveredBeats.has(beatOfChoice[c])),
          chosenInstead: witness.filter((w) => writers.some((c) => beatOfChoice[c] === w.beat))
            .map((w) => w.choice).slice(0, 3),
        };
      }),
    };
  }
  return { found, witness, diag };
}

// --- run --------------------------------------------------------------
const { applyEffect } = await import("../src/game/effects.js");
const targets = ONLY ?? doc.quest_beats.map((b) => b.id);
const report = [];
for (const t of targets) {
  const meta = beatMeta[t];
  const req = requirementsFor(t);
  // A gate needing a flag nobody writes can never open - that is a proof.
  const unwritable = [...req.need].filter((f) => !(writersOfFlag[f]?.size));
  if (unwritable.length) {
    report.push({ beat: t, quest: meta.questId, status: "IMPOSSIBLE",
      reason: `gate needs flag(s) no choice ever writes: ${unwritable.join(", ")}` });
    continue;
  }
  // Seat and board are INDEPENDENT variables and must be measured that way.
  //
  // An earlier version cycled the seat with the board index, so a beat gated
  // on `ne active versari` scored 2/3 at three boards and 4/6 at six — the
  // identical ratio, because the figure was reporting "three of four seats
  // qualify", not "map-dependent". Conflating them made the middle category
  // meaningless: raising the board count could never converge a number that
  // was never about boards.
  let best = null, lastDiag = null;
  const perSeat = {};
  for (const human of FACTIONS) {
    let hits = 0;
    for (let b = 0; b < BOARDS; b++) {
      const res = attempt(t, req, 1100 + b * 13, human, applyEffect);
      if (res.found) { hits++; if (!best) best = { seed: 1100 + b * 13, human, witness: res.witness }; }
      else if (res.diag) lastDiag = res.diag;
    }
    perSeat[human] = hits;
  }
  const seatsThatWork = FACTIONS.filter((f) => perSeat[f] > 0);
  // Board-dependence is only meaningful for a seat that can reach it at all.
  const bestSeatHits = Math.max(...FACTIONS.map((f) => perSeat[f]));
  const hits = seatsThatWork.length ? 1 : 0;
  // How many correct picks the route demands: beats on the chain where at
  // least one sibling choice would have ended the quest instead.
  // Exclude the target itself: its own choices may end the quest, but that
  // happens AFTER it has been reached and so does not gate reaching it.
  const chain = [...req.viaBeats].filter((b) => beatMeta[b] && b !== t);
  const gauntlet = chain.map((b) => ({ beat: b, ...narrownessOf(b) }))
    .filter((n) => n.exits > 0);
  const oddsOfBlindWalk = gauntlet.reduce((p, n) => p * (n.surviving / n.total), 1);

  report.push(hits
    ? { beat: t, quest: meta.questId,
        status: (bestSeatHits === BOARDS && seatsThatWork.length === FACTIONS.length)
          ? "REACHED"
          : (bestSeatHits === BOARDS ? "REACHED_SEAT_LIMITED" : "REACHED_SOMETIMES"),
        boards: `${bestSeatHits}/${BOARDS} on its best seat`,
        seats: `${seatsThatWork.length}/${FACTIONS.length} (${seatsThatWork.join(",")})`,
        seed: best.seed, seat: best.human,
        correctPicksRequired: gauntlet.length,
        blindWalkOdds: Number(oddsOfBlindWalk.toFixed(3)),
        exitsOnTheWay: gauntlet,
        pathLength: best.witness.length,
        finalRound: best.witness[best.witness.length - 1]?.round ?? null,
        path: best.witness.slice(-8) }
    : { beat: t, quest: meta.questId, status: "NOT_FOUND",
        correctPicksRequired: gauntlet.length,
        blindWalkOdds: Number(oddsOfBlindWalk.toFixed(3)),
        exitsOnTheWay: gauntlet,
        needs: [...req.need].slice(0, 6), avoids: [...req.avoid].slice(0, 4),
        diagnosis: lastDiag });
}

const byStatus = report.reduce((o, r) => ((o[r.status] = (o[r.status] || 0) + 1), o), {});
console.log(JSON.stringify({
  totals: byStatus, targets: targets.length, boardsPerBeat: BOARDS, roundsPerAttempt: ROUNDS,
  impossible: report.filter((r) => r.status === "IMPOSSIBLE"),
  notFound: report.filter((r) => r.status === "NOT_FOUND"),
  sometimes: report.filter((r) => r.status === "REACHED_SOMETIMES")
    .map((r) => ({ beat: r.beat, boards: r.boards })),
  sampleWitness: report.find((r) => r.path)?.path ?? null,
}, null, 1));
fs.writeFileSync("beat-paths.json", JSON.stringify(report, null, 1));

// --- markdown artifact ------------------------------------------------
const esc = (x) => String(x ?? "").replace(/\|/g, "\\|");
const lines = [];
lines.push("# Beat reachability — a route to every beat, or the reason there isn't one");
lines.push("");
lines.push(`Generated by \`scripts/find-beat-paths.mjs\` — ${BOARDS} boards per beat, `
  + `${ROUNDS} game rounds per attempt, seats rotated.`);
lines.push("");
lines.push("Three outcomes, kept distinct on purpose:");
lines.push("");
lines.push("- **REACHED** — a witness exists on every board tried.");
lines.push("- **REACHED SEAT LIMITED** — reliable on every board, but only for some factions. "
  + "Usually an authored faction gate, not a fault.");
lines.push("- **REACHED SOMETIMES** — genuinely map-dependent: even on its best seat it only "
  + "appears on some boards. The frequency is stated. This is not the same as reached.");
lines.push("- **NO ROUTE FOUND** — this search did not construct one. Not a proof of impossibility.");
lines.push("- **IMPOSSIBLE** — proven: the gate needs a flag no choice in the corpus ever writes.");
lines.push("");
lines.push("`correct picks` counts beats on the route where at least one sibling choice would have "
  + "ended the quest instead. `blind odds` is the chance a player choosing at random survives all of "
  + "them — a rough measure of how narrow the road is.");
lines.push("");
const order = { REACHED: 0, REACHED_SOMETIMES: 1, NOT_FOUND: 2, IMPOSSIBLE: 3 };
for (const status of ["REACHED", "REACHED_SEAT_LIMITED", "REACHED_SOMETIMES", "NOT_FOUND", "IMPOSSIBLE"]) {
  const rows = report.filter((r) => r.status === status);
  if (!rows.length) continue;
  lines.push(`## ${status.replace(/_/g, " ")} — ${rows.length}`);
  lines.push("");
  lines.push("| beat | quest | boards (best seat) | seats | correct picks | blind odds | final round | route (last steps) |");
  lines.push("|---|---|---|---|---:|---:|---:|---|");
  for (const r of rows.sort((a, b) => a.quest.localeCompare(b.quest))) {
    const route = (r.path || []).map((p) => `${p.beat ?? "?"} → “${esc(p.choice)}”`).join("<br>");
    lines.push(`| \`${r.beat}\` | ${r.quest} | ${r.boards ?? "—"} | ${r.seats ?? "—"} | ${r.correctPicksRequired ?? "—"} `
      + `| ${r.blindWalkOdds ?? "—"} | ${r.finalRound ?? "—"} | ${route || esc(r.reason || "")} |`);
  }
  lines.push("");
}
fs.writeFileSync("docs/encounter-import/beat-paths.md", lines.join("\n"));
console.error("artifact written to docs/encounter-import/beat-paths.md");
