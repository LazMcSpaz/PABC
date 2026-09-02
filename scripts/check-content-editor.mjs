// Content Edit Mode, end to end and without a browser: an edit reaches the
// engine, a card delivered afterwards carries it, and the export says exactly
// what changed.
//
// The first two checks exist because of how this feature was nearly built. The
// standalone editor (editor/src/lib/schema.js, last touched 2026-08-11) keeps a
// hand-maintained list of effect types, and it has fallen 26 behind the engine
// — it cannot represent ROLL, CONTEST, ADJUST_HONOR, ADJUST_MENACE or any
// diplomacy verb, roughly a hundred effects in the live corpus. A list a human
// must remember to update is a list that goes stale, so the in-game editor
// derives its form from the data and its prose from the live engine, and these
// two checks are what keep that honest: they fail the day content reaches for
// something the editor cannot read back.
import { createGame } from "../src/game/setup.js";
import { startTurn } from "../src/game/turn.js";
import { applyEffect } from "../src/game/effects.js";
import { EFFECTS } from "../src/game/effects.js";
import { getQuest, getQuestSource } from "../src/game/quests.js";
import { getEncounter, getEncounterSource, pendingEncountersFor, resolveMarkerOnHex, markerQueue } from "../src/game/encounters.js";
import { setPatch, clearPatch, beatKey, getPatch, loadPatches, allPatches } from "../src/game/contentPatch.js";
import { QUESTS, FIELD_ENCOUNTERS, WORLD_ENCOUNTERS } from "../src/game/content/index.js";
import { describeEffect, describeCondition } from "../src/prototype/effectText.js";
import { buildContentEdits, resolveEntity, contentIndex, denormalizeEffect } from "../src/prototype/contentEditExport.js";

let fail = 0;
const check = (n, ok, d) => { if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : "\n        " + d}`); };

const HUMAN = "plainers";
const MAS = beatKey("q_massacre", "qb_mas_compound");

// --- 1. the renderer covers what live content and the live engine hold ----
{
  const used = new Map();
  const walk = (list) => { for (const e of list || []) {
    if (!e?.type) continue;
    used.set(e.type, (used.get(e.type) || 0) + 1);
    for (const b of ["effects", "onWin", "onLose", "onSuccess", "onFail", "onMissed"]) walk(e[b]);
    for (const o of e.options || []) walk(o.effects);
  } };
  const conds = [];
  for (const q of Object.values(QUESTS)) {
    for (const b of q.beats || []) {
      if (b.deliverCondition) conds.push(b.deliverCondition);
      for (const c of b.choices || []) { walk(c.effects); if (c.condition) conds.push(c.condition); }
    }
    walk(q.completion?.rewardForClaimant); walk(q.completion?.sharedSideEffects);
  }
  for (const src of [FIELD_ENCOUNTERS, WORLD_ENCOUNTERS]) for (const e of Object.values(src)) {
    if (e.condition) conds.push(e.condition);
    for (const c of e.choices || []) { walk(c.effects); if (c.condition) conds.push(c.condition); }
  }
  // A type "falls back" when all the renderer can say is its own name.
  const bare = [...used.keys()].filter((t) => {
    const txt = describeEffect({ type: t }).text;
    return txt === t || txt.startsWith(`${t} (`);
  });
  check(`1. every effect type in live content reads back in English (${used.size} types)`,
    !bare.length, `no wording for: ${bare.join(", ")}`);
  const raw = conds.filter((c) => describeCondition(c) === JSON.stringify(c));
  check(`2. every gate in live content reads back in English (${conds.length} gates)`,
    !raw.length, `${raw.length} still raw JSON, e.g. ${JSON.stringify(raw[0])}`);
  const unknown = [...used.keys()].filter((t) => !EFFECTS[t]);
  check("3. content uses no effect type the engine cannot run",
    !unknown.length, unknown.join(", "));
}

// --- 2. an edit reaches the engine ----------------------------------------
{
  clearPatch(null);
  const before = getQuest("q_massacre").beats.find((b) => b.id === "qb_mas_compound");
  setPatch(MAS, { text: "A wall of welded haulers, and a man on it." });
  const after = getQuest("q_massacre").beats.find((b) => b.id === "qb_mas_compound");
  check("4. an edited beat reads back edited through getQuest",
    after.text === "A wall of welded haulers, and a man on it.", after.text);
  check("5. …while the authored source is left alone",
    getQuestSource("q_massacre").beats.find((b) => b.id === "qb_mas_compound").text === before.text,
    "the shipped content was mutated");

  setPatch("fe_the_silo", { title: "The Tower" });
  check("6. an encounter edit reads back through getEncounter",
    getEncounter("fe_the_silo").title === "The Tower" && getEncounterSource("fe_the_silo").title === "The Silo",
    `${getEncounter("fe_the_silo").title} / ${getEncounterSource("fe_the_silo").title}`);
  clearPatch(null);
}

// --- 3. an edited beat is DELIVERED edited --------------------------------
{
  clearPatch(null);
  setPatch(MAS, {
    text: "EDITED SCENE",
    choices: { ch_mas_challenge: {
      label: "EDITED LABEL",
      effects: [{ type: "ADJUST_RESOURCE", resource: "Resource", amount: 99, target: "active" }],
    } },
  });
  const g = createGame({ seed: 1126, humanFactionId: HUMAN });
  startTurn(g);
  applyEffect(g, { type: "START_QUEST", questId: "q_massacre", claimant: HUMAN },
    { sourcePlayer: HUMAN, asPlayer: HUMAN });
  const opener = Object.keys(g.world.encounterMarkers || {})
    .flatMap((hex) => markerQueue(g, hex, false).map((m) => ({ hex, ...m })))
    .find((m) => m.questId === "q_massacre");
  const unit = Object.values(g.units).find((u) => u.owner === HUMAN);
  unit.node = opener.hex;
  resolveMarkerOnHex(g, opener.hex, unit, {});
  const first = pendingEncountersFor(g, HUMAN)[0];
  // Follow the tracks, which opens the compound.
  const { resolvePendingEncounter } = await import("../src/game/encounters.js");
  resolvePendingEncounter(g, first.id, "ch_mas_follow", {});
  const compound = Object.keys(g.world.encounterMarkers || {})
    .flatMap((hex) => markerQueue(g, hex, false).map((m) => ({ hex, ...m })))
    .find((m) => m.beatId === "qb_mas_compound");
  unit.node = compound.hex;
  resolveMarkerOnHex(g, compound.hex, unit, {});
  const card = pendingEncountersFor(g, HUMAN).find((p) => p.ctx.beatId === "qb_mas_compound");
  check("7. a beat delivered after an edit carries the edited prose",
    card?.text === "EDITED SCENE", JSON.stringify(card?.text?.slice(0, 60)));
  check("8. …and the edited choice label",
    card?.choices.some((c) => c.label === "EDITED LABEL"),
    JSON.stringify(card?.choices.map((c) => c.label)));

  const scrapBefore = g.players[HUMAN].resource;
  resolvePendingEncounter(g, card.id, "ch_mas_challenge", {});
  check("9. …and the edited grant is what actually pays out",
    g.players[HUMAN].resource === scrapBefore + 99,
    `${scrapBefore} → ${g.players[HUMAN].resource}, wanted +99`);
  clearPatch(null);
}

// --- 4. the export --------------------------------------------------------
{
  clearPatch(null);
  setPatch(MAS, {
    text: "New scene.",
    choices: { ch_mas_challenge: { effects: [{ type: "ADJUST_RESOURCE", resource: "Resource", amount: 12, target: "active" }] } },
    note: "reward felt thin for losing a unit",
  });
  const doc = buildContentEdits({ seed: 1126, round: 2, humanFactionId: HUMAN });
  const edit = doc.edits[0];
  check("10. the export names the quest, the beat and the choice by id",
    edit.questId === "q_massacre" && edit.beatId === "qb_mas_compound"
      && edit.changes.some((c) => c.choiceId === "ch_mas_challenge"),
    JSON.stringify(edit).slice(0, 200));
  const textChange = edit.changes.find((c) => c.field === "text");
  check("11. …carries the authored value it replaced, so it can be verified",
    textChange.from === getQuestSource("q_massacre").beats.find((b) => b.id === "qb_mas_compound").text,
    `from=${JSON.stringify(textChange.from?.slice(0, 40))}`);
  const effChange = edit.changes.find((c) => c.field.endsWith(".effects"));
  check("12. …and writes effects back in the authoring {type, params} shape",
    effChange.to[0].params?.amount === 12 && !("amount" in effChange.to[0]),
    JSON.stringify(effChange.to));
  check("13. …with the note attached", edit.note === "reward felt thin for losing a unit", edit.note);

  // A field set back to its authored value is not a change.
  setPatch(MAS, { text: getQuestSource("q_massacre").beats.find((b) => b.id === "qb_mas_compound").text });
  const doc2 = buildContentEdits(null);
  check("14. a field edited back to what it was is not exported as a change",
    !doc2.edits[0].changes.some((c) => c.field === "text"),
    JSON.stringify(doc2.edits[0].changes.map((c) => c.field)));
  clearPatch(null);
}

// --- 5. round-trip through storage, and the browser -----------------------
{
  clearPatch(null);
  setPatch(MAS, { text: "kept" });
  const saved = JSON.parse(JSON.stringify(allPatches()));
  clearPatch(null);
  check("15. edits survive being written out and read back",
    getPatch(MAS) === null, "clear did not clear");
  loadPatches(saved);
  check("16. …and are live again on restore",
    getQuest("q_massacre").beats.find((b) => b.id === "qb_mas_compound").text === "kept",
    "restore did not reach the engine");

  const idx = contentIndex();
  const total = idx.reduce((n, gr) => n + gr.items.length, 0);
  const beats = Object.values(QUESTS).reduce((n, q) => n + (q.beats || []).length, 0);
  const encs = Object.keys(FIELD_ENCOUNTERS).length + Object.keys(WORLD_ENCOUNTERS).length;
  check(`17. the browser lists every editable thing (${total})`,
    total === beats + encs, `listed ${total}, corpus has ${beats + encs}`);
  check("18. …and marks the edited ones",
    idx.some((gr) => gr.items.some((it) => it.id === MAS && it.edited)),
    "the edited beat is not flagged in the browser");
  check("19. every listed entity resolves to something editable",
    idx.every((gr) => gr.items.every((it) => {
      const e = resolveEntity(it.id);
      return e && e.live && Array.isArray(e.live.choices);
    })), "some listed entity does not resolve");
  clearPatch(null);
}

// --- 6. a patch cannot inject structure the engine did not author ---------
{
  clearPatch(null);
  loadPatches({ [MAS]: { id: "hacked", beats: [], choices: { nope: { label: "ghost" } } } });
  const beat = getQuest("q_massacre").beats.find((b) => b.id === "qb_mas_compound");
  check("20. a patch cannot rename an id, add beats, or invent a choice",
    beat.id === "qb_mas_compound" && !beat.choices.some((c) => c.id === "nope"),
    JSON.stringify({ id: beat.id, choices: beat.choices.map((c) => c.id) }));
  clearPatch(null);
}

console.log(fail ? `\n${fail} check(s) failed` : "\nall checks passed");
process.exit(fail ? 1 : 0);
