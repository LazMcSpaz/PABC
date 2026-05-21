// Quest engine (mechanical-spec §15.7). Reads QUESTS from the content
// snapshot, walks beats with prerequisite gating, dispatches each beat
// as an encounter through encounters.js, and handles completion
// rewards. Single-player exclusivity and global broadcast per the spec.
// Registers START_QUEST / ADVANCE_QUEST / COMPLETE_QUEST handlers onto
// the shared EFFECTS map (same pattern as encounters.js).
import { QUESTS } from "./content/index.js";
import { normalizeQuest } from "./content-loader.js";
import { deliverEncounterDef } from "./encounters.js";
import { applyEffects, EFFECTS } from "./effects.js";
import { evalCond } from "./dsl.js";
import { resolveTargets } from "./targeting.js";
import { emit } from "./events.js";

// One-time normalisation; harness / test code can inject via
// registerQuest() at any time.
const registry = {};
for (const [id, def] of Object.entries(QUESTS)) registry[id] = normalizeQuest(def);

export function registerQuest(def) {
  if (!def?.id) return;
  registry[def.id] = normalizeQuest(def);
}
export function getQuest(id) {
  return registry[id] || null;
}

function prereqsMet(beat, aq) {
  return (beat.prerequisites || []).every((p) => aq.completedBeats.includes(p));
}
function readyBeats(quest, aq) {
  const ready = [];
  for (const beat of quest.beats || []) {
    if (aq.completedBeats.includes(beat.id)) continue;
    if (aq.deliveredBeats.includes(beat.id)) continue;
    if (!prereqsMet(beat, aq)) continue;
    ready.push(beat);
  }
  return ready;
}

// The beat IS the encounter — same fields (art, text, choices). The
// auto-ADVANCE_QUEST effect appended to each choice means resolving any
// choice progresses the quest, freeing authors from having to remember.
function beatAsEncounter(quest, beat) {
  return {
    ...beat,
    id: `quest:${quest.id}:beat:${beat.id}`,
    mode: beat.mode || (quest.mode === "global" ? "public" : "private"),
    choices: (beat.choices || []).map((c) => ({
      ...c,
      effects: [
        ...(c.effects || []),
        { type: "ADVANCE_QUEST", questId: quest.id, beatId: beat.id },
      ],
    })),
  };
}

function deliverBeat(state, quest, beat, aq, ctx) {
  aq.deliveredBeats.push(beat.id);
  const enc = beatAsEncounter(quest, beat);
  const beatCtx = { ...ctx, claimant: aq.claimant, questId: quest.id, beatId: beat.id };
  if (beat.deliver === "discovered") {
    return deliverEncounterDef(state, enc, { mode: "placement", hexFilter: beat.placementFilter }, beatCtx);
  }
  return deliverEncounterDef(state, enc, { recipient: beat.recipient }, beatCtx);
}

function evaluateBeatDelivery(state, questId, ctx) {
  const aq = state.activeQuests[questId];
  const quest = getQuest(questId);
  if (!aq || !quest) return;
  for (const beat of readyBeats(quest, aq)) {
    if (beat.deliver === "conditional") {
      // Conditional beats wait for the round-end pulse so they can react
      // to deferred effects + trigger fires from the same round.
      continue;
    }
    deliverBeat(state, quest, beat, aq, ctx);
  }
}

// Round-end pulse — re-evaluate conditional beats now that the
// round-end has run (deferred sweep + trigger eval already done).
export function evaluateConditionalBeats(state, ctx = {}) {
  for (const aq of Object.values(state.activeQuests)) {
    const quest = getQuest(aq.questId);
    if (!quest) continue;
    for (const beat of readyBeats(quest, aq)) {
      if (beat.deliver !== "conditional") continue;
      const beatCtx = { ...ctx, claimant: aq.claimant };
      if (beat.condition && !evalCond(state, beat.condition, beatCtx)) continue;
      deliverBeat(state, quest, beat, aq, ctx);
    }
  }
}

// --- effect handlers (registered into the shared EFFECTS map) ---

EFFECTS.START_QUEST = function (state, e, ctx) {
  const quest = getQuest(e.questId);
  if (!quest) return;
  const claimantPid = resolveTargets(state, e.claimant, ctx)[0] || null;

  // Single-player exclusivity (§15.7) — already-claimed = no-op.
  if (quest.mode === "single-player" && state.activeQuests[e.questId]?.claimant) return;

  state.activeQuests[e.questId] = state.activeQuests[e.questId] || {
    questId: e.questId,
    claimant: null,
    completedBeats: [],
    deliveredBeats: [],
    startedAt: state.round,
  };
  if (quest.mode === "single-player") {
    state.activeQuests[e.questId].claimant = claimantPid;
  }
  emit(state, "quest_started", {
    questId: e.questId, mode: quest.mode,
    claimant: state.activeQuests[e.questId].claimant,
  });
  evaluateBeatDelivery(state, e.questId, ctx);
};

EFFECTS.ADVANCE_QUEST = function (state, e, ctx) {
  const aq = state.activeQuests[e.questId];
  if (!aq) return;
  if (!aq.completedBeats.includes(e.beatId)) aq.completedBeats.push(e.beatId);
  aq.deliveredBeats = aq.deliveredBeats.filter((b) => b !== e.beatId);
  emit(state, "quest_advanced", { questId: e.questId, beatId: e.beatId });

  const quest = getQuest(e.questId);
  const allDone = quest && (quest.beats || []).every((b) => aq.completedBeats.includes(b.id));
  if (allDone) {
    applyEffects(state, [{ type: "COMPLETE_QUEST", questId: e.questId }], ctx);
    return;
  }
  evaluateBeatDelivery(state, e.questId, ctx);
};

EFFECTS.COMPLETE_QUEST = function (state, e, ctx) {
  const aq = state.activeQuests[e.questId];
  const quest = getQuest(e.questId);
  if (!aq || !quest) return;

  // Global quests: claimant locks in when COMPLETE_QUEST fires (first
  // player to finish the final beat). For single-player it was set
  // at START_QUEST.
  if (!aq.claimant && ctx.sourcePlayer) aq.claimant = ctx.sourcePlayer;

  if (aq.claimant) {
    applyEffects(state, quest.completion?.rewardForClaimant || [], {
      ...ctx, sourcePlayer: aq.claimant, claimant: aq.claimant,
    });
    if (state.players[aq.claimant]) {
      state.players[aq.claimant].completedQuests[e.questId] = {
        round: state.round, claimant: aq.claimant,
      };
    }
  }
  applyEffects(state, quest.completion?.sharedSideEffects || [], ctx);

  delete state.activeQuests[e.questId];
  emit(state, "quest_completed", { questId: e.questId, claimant: aq.claimant });
};
