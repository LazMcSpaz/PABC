// Delivery-once invariant.
//
//   node scripts/check-delivery-once.mjs <content.json> [--campaigns 12] [--rounds 40]
//
// Why this test exists.
//
// Twenty of the 35 opening beats carry a `not has_flag seen_X` self-guard —
// the content's own "don't show me twice" check. Of the 96 NON-opening beats,
// zero do. Every gate they use reads a permanent flag that, once set, never
// stops being true.
//
// So for 96 of 131 beats, "each beat is shown once" is held up entirely by
// engine bookkeeping — `activeQuests[q].deliveredBeats` and `completedBeats`
// — with no content-side backstop whatsoever. If that record is ever bypassed,
// mutated or lost, those beats repeat indefinitely and their effects reapply.
//
// That is not hypothetical. A re-entrancy bug in exactly this loop was found
// and fixed during the import build: a stale iteration re-delivered a beat
// after its quest had completed. And there is no save/load yet — when there
// is, a round-trip that drops or reorders these arrays is the first thing
// that breaks, and it will present as content repeating rather than as a
// serialisation fault.
//
// Three checks:
//   1. STATIC   — measure the asymmetry, so the claim stays true as content changes.
//   2. DYNAMIC  — play real games and assert no beat is ever delivered twice.
//   3. EXPOSURE — clear the bookkeeping deliberately and confirm the beat DOES
//                 repeat, proving there is no second line of defence.

import fs from "node:fs";
import { assemble } from "./build-content.mjs";
import { createGame } from "../src/game/setup.js";
import { startTurn, endTurn } from "../src/game/turn.js";
import { registerQuest } from "../src/game/quests.js";
import { pendingEncountersFor, resolvePendingEncounter, resolveMarkerOnHex,
         registerWorldEncounter, registerFieldEncounter } from "../src/game/encounters.js";

const contentPath = process.argv[2];
if (!contentPath) { console.error("usage: node scripts/check-delivery-once.mjs <content.json>"); process.exit(1); }
const flag = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
const CAMPAIGNS = flag("campaigns", 12), ROUNDS = flag("rounds", 40);

const doc = JSON.parse(fs.readFileSync(contentPath, "utf8"));
const snap = assemble(doc);
for (const q of snap.quests) registerQuest(q);
for (const w of snap.worldEncounters) registerWorldEncounter(w);
for (const f of snap.fieldEncounters) registerFieldEncounter(f);

const failures = [];
const check = (name, ok, detail) => {
  if (!ok) failures.push({ name, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail && !ok ? ` — ${detail}` : ""}`);
};

// ---------- 1. STATIC ----------
const decode = (v) => { try { return typeof v === "string" ? JSON.parse(v) : v; } catch { return null; } };
const openerOf = {};
for (const b of doc.quest_beats) {
  const cur = openerOf[b.questId];
  if (!cur || (b.ordinal ?? 0) < (cur.ordinal ?? 0)) openerOf[b.questId] = b;
}
const openerIds = new Set(Object.values(openerOf).map((b) => b.id));
const hasSelfGuard = (b) => {
  const g = decode(b.deliverCondition);
  if (!g) return false;
  let found = false;
  (function walk(c) {
    if (!c || typeof c !== "object") return;
    if (c.not?.has_flag?.flag) found = true;
    for (const v of Object.values(c)) {
      if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") walk(v);
    }
  })(g);
  return found;
};
const openersGuarded = [...openerIds].filter((id) => hasSelfGuard(doc.quest_beats.find((b) => b.id === id)));
const nonOpeners = doc.quest_beats.filter((b) => !openerIds.has(b.id));
const nonOpenersGuarded = nonOpeners.filter(hasSelfGuard);

// The invariant is NOT "no non-opener carries a self-guard". That was the
// original wording and it was too literal. Re-parenting `qb_cro_blowback` into
// q_baron pushed `qb_bar_1` from ordinal 0 to ordinal 1, so a former opener
// carried its `not has_flag seen_baron_word` guard across the opener line.
// Nothing about the risk changed — the same beat has the same guard — but the
// check went red, which is a tripwire firing on a move rather than on a
// regression.
//
// What actually matters is stated twice, in the two directions that can hurt:
//
//   LOAD-BEARING — the great majority of non-opening beats still have no
//   content-side backstop, so `deliveredBeats` / `completedBeats` is what is
//   holding "shown once" up. If that ever stops being true the risk profile
//   has genuinely changed and the rest of this file needs rewriting.
//
//   NEVER LOSE ONE — a self-guard appearing is a safety improvement and is
//   allowed to happen freely. A self-guard DISAPPEARING is the regression, and
//   is what the floor below catches. Raise SELF_GUARD_FLOOR deliberately when
//   content adds guards; never lower it to make this pass.
const SELF_GUARD_FLOOR = 20; // measured at PABC-Encounter-Map 6fe0b3f and 33884fd
const totalGuarded = openersGuarded.length + nonOpenersGuarded.length;

console.log(`\n  openers: ${openerIds.size}, self-guarded: ${openersGuarded.length}`);
console.log(`  non-openers: ${nonOpeners.length}, self-guarded: ${nonOpenersGuarded.length}`);
console.log(`  total self-guarded: ${totalGuarded} (floor ${SELF_GUARD_FLOOR})`);
check("engine bookkeeping is still load-bearing (most non-openers have no content backstop)",
  nonOpenersGuarded.length <= nonOpeners.length / 2,
  `${nonOpenersGuarded.length} of ${nonOpeners.length} non-openers now self-guard — `
  + "content has grown a second line of defence and this file's premise needs revisiting");
check("no self-guard has been lost",
  totalGuarded >= SELF_GUARD_FLOOR,
  `${totalGuarded} self-guarded beats, down from ${SELF_GUARD_FLOOR} — a beat that used to `
  + "refuse a repeat delivery no longer does");

// ---------- 2. DYNAMIC ----------
const FACTIONS = ["versari", "goldgrass", "lakers", "plainers"];
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

let doubleDeliveries = [];
for (let n = 0; n < CAMPAIGNS; n++) {
  const human = FACTIONS[n % FACTIONS.length];
  const pick = rng(31 + n * 7919);
  const g = createGame({ seed: 300 + n, humanFactionId: human });
  startTurn(g);
  for (let r = 0; r < ROUNDS; r++) {
    for (const hex of Object.keys(g.world?.encounterMarkers || {})) {
      const u = Object.values(g.units).find((x) => x.owner === human);
      if (!u) break;
      u.node = hex;
      try { resolveMarkerOnHex(g, hex, u, {}); } catch { delete g.world.encounterMarkers[hex]; }
    }
    let guard = 200;
    for (;;) {
      const q = pendingEncountersFor(g, human);
      if (!q.length || guard-- <= 0) break;
      const card = q[0];
      const c = card.choices[Math.floor(pick() * card.choices.length)] || card.choices[0];
      try { resolvePendingEncounter(g, card.id, c.id, {}); } catch { break; }
    }
    try { endTurn(g); } catch { break; }
  }
  // Counted per (beat, RECIPIENT). Quest runs are per player now, so the same
  // opener legitimately appears once for each player who takes that quest —
  // that is the point of the fix, not a repeat. The invariant this file
  // protects is unchanged in substance: no player is ever shown the same beat
  // twice. Counting per beat alone would have quietly made this test assert
  // "only one player may ever play a quest", which is the defect it would
  // then be defending.
  const seen = new Map();
  for (const e of g.log) {
    if (e.name !== "encounter_delivered") continue;
    const beatId = String(e.payload.encounter);
    if (!beatId.startsWith("quest:")) continue;
    const id = `${beatId}@${e.payload.recipient}`;
    seen.set(id, (seen.get(id) || 0) + 1);
  }
  for (const [id, n2] of seen) if (n2 > 1) doubleDeliveries.push({ campaign: n, beat: id, times: n2 });
}
check(`no beat delivered twice in one game (${CAMPAIGNS} campaigns x ${ROUNDS} rounds)`,
  doubleDeliveries.length === 0,
  doubleDeliveries.slice(0, 5).map((d) => `${d.beat} x${d.times}`).join(", "));

// ---------- 3. EXPOSURE ----------
// Deliberately clear the bookkeeping and confirm the beat repeats. If this
// ever starts PASSING as "did not repeat", the content has grown a backstop
// and the risk profile has changed — which is worth knowing either way.
{
  const g = createGame({ seed: 777, humanFactionId: "versari" });
  startTurn(g);
  registerQuest({
    id: "q_repeat_probe", mode: "single-player", title: "probe",
    beats: [
      { id: "p1", ordinal: 0, deliver: "auto", text: "one",
        choices: [{ id: "pc1", label: "go", effects: [
          { type: "SET_PLAYER_FLAG", flag: "probe_done", value: true, target: "active" }] }] },
      { id: "p2", ordinal: 1, deliver: "conditional", prerequisites: ["p1"],
        deliverCondition: { has_flag: { player: "active", flag: "probe_done" } },
        text: "two", choices: [{ id: "pc2", label: "go", effects: [] }] },
    ],
    completion: { rewardForClaimant: [], sharedSideEffects: [] },
  });
  const drain = () => {
    let guard = 50;
    for (;;) {
      const q = pendingEncountersFor(g, "versari");
      if (!q.length || guard-- <= 0) break;
      resolvePendingEncounter(g, q[0].id, q[0].choices[0].id, {});
    }
  };
  const { applyEffect } = await import("../src/game/effects.js");
  applyEffect(g, { type: "START_QUEST", questId: "q_repeat_probe", claimant: "active" }, { sourcePlayer: "versari" });
  drain(); for (let i = 0; i < 8; i++) { endTurn(g); drain(); }
  const first = g.log.filter((e) => e.name === "encounter_delivered"
    && String(e.payload.encounter).endsWith(":beat:p2")).length;

  // Model a PARTIAL loss, which is the realistic failure: the quest is still
  // in progress and its prerequisite is still satisfied, but the record that
  // this one beat was already shown has gone. Wiping everything would also
  // wipe the prerequisite and the beat would be held back for the wrong
  // reason — which is not the risk being measured.
  // Quest runs are keyed per (quest, player) — this rebuilds versari's run.
  g.activeQuests["q_repeat_probe|versari"] = {
    questId: "q_repeat_probe", claimant: "versari",
    completedBeats: ["p1"],   // prerequisite still met
    deliveredBeats: [],       // ...but "p2 was already shown" is gone
    startedAt: g.round,
  };
  for (let i = 0; i < 8; i++) { endTurn(g); drain(); }
  const second = g.log.filter((e) => e.name === "encounter_delivered"
    && String(e.payload.encounter).endsWith(":beat:p2")).length;

  const repeated = second > first;
  console.log(`\n  beat p2 delivered ${first}x, then ${second}x after the record was cleared`);
  check("EXPOSURE: a gated beat repeats when the delivered-once record is lost",
    repeated,
    "it did not repeat — content may have grown a backstop; re-read the reasoning in this file");
}

console.log(`\n${failures.length ? `${failures.length} FAILED` : "all checks passed"}`);
process.exit(failures.length ? 1 : 0);
