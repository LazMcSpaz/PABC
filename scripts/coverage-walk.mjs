// Campaign-level reachability walk.
//
//   node scripts/coverage-walk.mjs <content.json> [--campaigns 24] [--rounds 60] [--seed 1]
//
// Answers one question: which authored beats can a player actually be shown?
//
// The per-quest walk this replaces could not answer it. Eight quests open on
// a flag another quest writes, so they need several quests running in the
// same game. Two gate on `active != versari`, so they need seats other than
// the first. The `count_flags` gates read a ledger written by fifteen
// separate sources, so they need a campaign long enough to accumulate one.
// None of that is reachable by driving one quest in isolation.
//
// Method: play whole games. Every faction takes a turn as the human seat,
// under several different choice policies, for a long horizon. Encounters
// parked for the human are drained the way the UI drains them; markers are
// walked the way a player eventually walks onto them. The union of every
// beat delivered across every campaign is the proven-reachable set.
//
// Output is three categories, deliberately:
//   DELIVERED    — seen by a player in at least one campaign. Proven.
//   UNREACHABLE  — proven blocked, with the cause named.
//   NOT REACHED  — this harness did not get there. Honest, not a verdict.
//
// The third category is the important one. A beat sitting in it is not
// proven to be broken and is not proven to be fine.

import fs from "node:fs";
import { assemble } from "./build-content.mjs";
import { createGame } from "../src/game/setup.js";
import { startTurn, endTurn } from "../src/game/turn.js";
import { registerQuest } from "../src/game/quests.js";
import { pendingEncountersFor, resolvePendingEncounter, resolveMarkerOnHex,
         pickHexByFilter, registerWorldEncounter, registerFieldEncounter } from "../src/game/encounters.js";
import { unknownConditionForms } from "../src/game/dsl.js";

const args = process.argv.slice(2);
const contentPath = args[0];
if (!contentPath) {
  console.error("usage: node scripts/coverage-walk.mjs <content.json> [--campaigns N] [--rounds R] [--seed S]");
  process.exit(1);
}
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i > 0 ? Number(args[i + 1]) : def;
};
const CAMPAIGNS = flag("campaigns", 24);
const ROUNDS = flag("rounds", 60);
const SEED0 = flag("seed", 1);

const doc = JSON.parse(fs.readFileSync(contentPath, "utf8"));
const snap = assemble(doc);
for (const q of snap.quests) registerQuest(q);
// World encounters matter here for two reasons: they are 18 authored cards
// in their own right, and eight quests open on flags that only a world
// encounter writes. Without them the moral ledger cannot accumulate and
// those quests are untestable.
for (const w of snap.worldEncounters) registerWorldEncounter(w);
for (const f of snap.fieldEncounters) registerFieldEncounter(f);

const allBeats = doc.quest_beats.map((b) => b.id);
const beatMeta = Object.fromEntries(doc.quest_beats.map((b) => [b.id, b]));
const FACTIONS = ["versari", "goldgrass", "lakers", "plainers"];

// A tiny seeded RNG so a campaign's choice policy is reproducible.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const delivered = new Set();
const worldSeen = new Set();
const errors = [];
let maxLedger = 0;
let ledgerGateTripped = false;

function runCampaign(n) {
  const human = FACTIONS[n % FACTIONS.length];
  const pick = rng(SEED0 * 7919 + n * 104729);
  const g = createGame({ seed: SEED0 + n, humanFactionId: human });
  startTurn(g);

  for (let round = 0; round < ROUNDS; round++) {
    // Walk onto whatever is waiting on the map. A player would take several
    // turns to do this; the question here is reachability, not pacing.
    for (const hex of Object.keys(g.world?.encounterMarkers || {})) {
      const u = Object.values(g.units).find((x) => x.owner === human);
      if (!u) break;
      u.node = hex;
      try { resolveMarkerOnHex(g, hex, u, {}); }
      catch (e) { errors.push(e.message.slice(0, 140)); delete g.world.encounterMarkers[hex]; }
    }
    // Drain the player's queue exactly as the UI does.
    let guard = 200;
    for (;;) {
      const q = pendingEncountersFor(g, human);
      if (!q.length || guard-- <= 0) break;
      const card = q[0];
      const choice = card.choices[Math.floor(pick() * card.choices.length)] || card.choices[0];
      try { resolvePendingEncounter(g, card.id, choice.id, {}); }
      catch (e) { errors.push(e.message.slice(0, 140)); break; }
    }
    // Track the moral ledger, which is what the count_flags gates read.
    const flags = g.players[human]?.flags || {};
    const ruleCount = Object.keys(flags).filter((k) => k.startsWith("rule_") && flags[k]?.value).length;
    if (ruleCount > maxLedger) maxLedger = ruleCount;
    if (ruleCount >= 2) ledgerGateTripped = true;

    try { endTurn(g); } catch (e) { errors.push(e.message.slice(0, 140)); break; }
  }

  for (const e of g.log) {
    if (e.name !== "encounter_delivered") continue;
    const id = String(e.payload.encounter);
    if (id.startsWith("quest:")) delivered.add(id.split(":beat:")[1]);
    else worldSeen.add(id);
  }
  return { human, seed: SEED0 + n };
}

const ran = [];
for (let i = 0; i < CAMPAIGNS; i++) ran.push(runCampaign(i));

// --- classify what never arrived -------------------------------------
// A placement filter that matches no hex on ANY generated board is a proven
// blocker, not a gap in the walk. Sampled across several boards so a single
// unlucky layout is not mistaken for an impossible filter.
const probes = [0, 1, 2, 3, 4].map((k) => createGame({ seed: 900 + k }));
function placementImpossible(beat) {
  const f = beat.placementFilter && (typeof beat.placementFilter === "string"
    ? JSON.parse(beat.placementFilter) : beat.placementFilter);
  if (!f) return null;
  for (const p of probes) {
    try { if (pickHexByFilter(p, f, {})) return null; } catch { /* treat as no match */ }
  }
  const why = f.terrain ? `placementFilter needs terrain "${f.terrain}", which no hex carries `
      + `(hex.terrain is unset until the terrain work track lands)`
    : f.hasRoad != null ? `placementFilter needs hasRoad=${f.hasRoad}, which no hex carries yet`
    : `placementFilter ${JSON.stringify(f)} matches no hex on any sampled board`;
  return why;
}

// Blocked causes propagate. A quest whose OPENING beat cannot be placed can
// never start, so none of its later beats can be reached either — that is a
// proven blockage with a named cause, not a gap in the search. Likewise a
// quest that opens on a flag only an unreachable beat writes.
const decode = (v) => {
  if (v == null || v === "") return null;
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return null; }
};
const openerOfQuest = {};
for (const b of doc.quest_beats) {
  const cur = openerOfQuest[b.questId];
  if (!cur || (b.ordinal ?? 0) < (cur.ordinal ?? 0)) openerOfQuest[b.questId] = b;
}
// Which beats write which flags (choice effects, including nested branches).
const effByChoice = {};
for (const e of doc.effects) (effByChoice[e.parentId] ||= []).push(e);
const beatOfChoice = {};
for (const c of doc.choices) if (c.parentKind === "quest_beat") beatOfChoice[c.id] = c.parentId;
const writersOfFlag = {};
function noteWrites(type, params, beatId) {
  if (!beatId || !params) return;
  if ((type === "SET_PLAYER_FLAG" || type === "SET_FLAG") && params.flag) {
    (writersOfFlag[params.flag] ||= new Set()).add(beatId);
  }
  for (const k of ["effects", "onSuccess", "onFail", "onWin", "onLose"]) {
    for (const sub of params[k] || []) noteWrites(sub.type, decode(sub.paramsJson) ?? sub.params ?? sub, beatId);
  }
  for (const o of params.options || []) for (const sub of o.effects || [])
    noteWrites(sub.type, decode(sub.paramsJson) ?? sub.params ?? sub, beatId);
}
for (const e of doc.effects) noteWrites(e.type, decode(e.paramsJson) ?? e.params, beatOfChoice[e.parentId]);

function flagsReadBy(cond) {
  const out = new Set();
  (function walk(c) {
    if (!c || typeof c !== "object") return;
    if (c.has_flag?.flag) out.add(c.has_flag.flag);
    for (const v of Object.values(c)) {
      if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") walk(v);
    }
  })(cond);
  return [...out];
}

const directBlock = {};
for (const id of allBeats) {
  const why = placementImpossible(beatMeta[id]);
  if (why) directBlock[id] = why;
}

const unreachable = [];
const notReached = [];
for (const id of allBeats) {
  if (delivered.has(id)) continue;
  const meta = beatMeta[id];
  let cause = directBlock[id] || null;
  if (!cause) {
    const opener = openerOfQuest[meta.questId];
    if (opener && opener.id !== id && directBlock[opener.id]) {
      cause = `quest cannot start — its opening beat ${opener.id} is blocked: ${directBlock[opener.id]}`;
    }
  }
  if (!cause) {
    // Opens on a flag that only unreachable beats write.
    const opener = openerOfQuest[meta.questId];
    const gate = decode(opener?.deliverCondition);
    const needed = gate ? flagsReadBy(gate) : [];
    for (const f of needed) {
      const writers = [...(writersOfFlag[f] || [])];
      if (writers.length && writers.every((w) => directBlock[w])) {
        cause = `quest opens on flag "${f}", written only by ${writers.join(", ")}, `
              + `which is blocked: ${directBlock[writers[0]]}`;
        break;
      }
    }
  }
  if (cause) unreachable.push({ beat: id, quest: meta.questId, cause });
  else notReached.push({ beat: id, quest: meta.questId, deliver: meta.deliver });
}

const byQuest = {};
for (const b of doc.quest_beats) {
  const q = (byQuest[b.questId] ||= { total: 0, delivered: 0 });
  q.total++;
  if (delivered.has(b.id)) q.delivered++;
}

console.log(JSON.stringify({
  campaigns: CAMPAIGNS, roundsEach: ROUNDS, seatsPlayed: [...new Set(ran.map((r) => r.human))],
  totalBeats: allBeats.length,
  DELIVERED: delivered.size,
  UNREACHABLE_with_cause: unreachable.length,
  NOT_REACHED_by_this_harness: notReached.length,
  worldEncountersSeen: `${worldSeen.size} / ${doc.world_encounters.length}`,
  moralLedger: { maxRuleFlagsHeld: maxLedger, twoFlagGateReachable: ledgerGateTripped },
  unknownConditionForms: unknownConditionForms(probes[0]),
  runtimeErrors: errors.length,
  distinctErrors: [...new Set(errors)].slice(0, 8),
  unreachable,
  notReached,
  perQuest: Object.fromEntries(Object.entries(byQuest)
    .map(([k, v]) => [k, `${v.delivered}/${v.total}`])),
}, null, 1));
