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

// --- who is running which quest ---------------------------------------
//
// `state.activeQuests` used to hold ONE record per quest, so a quest was a
// global object with a single claimant. Combined with `offerQuests` claiming
// on a player's behalf at the start of their turn, that made quest access a
// race decided before anybody moved: seat 0 takes the first turn of the game,
// so every quest whose opener gate is already true at round 1 went to seat 0
// and single-player exclusivity locked the other three out permanently.
//
// Measured, three seat orders, human always seat 2: seat 0 claimed 25/30,
// 23/30 and 26/30 quests; the human claimed ZERO in all three. The reaching
// set followed seat 0, not any faction — rotate the order and the "only
// faction that can play these" rotates with it.
//
// So a record is per (quest, player). Exclusivity is preserved in the sense
// that matters — one player's run of a quest is their own, with their own
// beat progress — while availability stops being first-turn-wins.
const qkey = (questId, pid) => `${questId}|${pid}`;

/** This player's run of this quest, or null. */
export function activeQuestFor(state, questId, pid) {
  return state.activeQuests?.[qkey(questId, pid)] || null;
}
/** Every player's run of this quest. */
function runsOfQuest(state, questId) {
  return Object.values(state.activeQuests || {}).filter((r) => r.questId === questId);
}
// Which player an effect is acting for. The card-holder, not the seat whose
// turn it happens to be — the same rule the rest of this engine follows.
function actingPlayer(ctx, state) {
  return ctx?.claimant ?? ctx?.asPlayer ?? ctx?.sourcePlayer
    ?? state.turnOrder[state.activeIndex] ?? null;
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
  const authored = beat.choices || [];
  // A purely narrative beat — text, no options — is legitimate content, and
  // there will be a lot of it. It still has to be SHOWN and it still has to
  // advance the quest, and both of those ride on choices: `presentToPlayer`
  // skips an encounter with nothing eligible, and the `ADVANCE_QUEST` below is
  // appended per choice, so a beat with none would be invisible AND would
  // strand its quest forever at the prerequisite.
  //
  // So a choiceless beat gets one synthesised acknowledgement. Everything
  // downstream then works unchanged — eligibility, queueing for the human,
  // headless pick for AI seats, resolution, advance — because from here down
  // it is simply a beat with exactly one unconditional choice.
  //
  // Note what this does NOT do: a beat that HAS choices which all filter out
  // still presents nothing and is still correctly skipped. "Authored with no
  // choices" and "every choice gated away" look identical at the eligibility
  // check, and only the first is a card to show.
  const choices = authored.length ? authored : [{
    id: `ch_dismiss_${beat.id}`,
    label: "Continue",
    dismiss: true,          // the UI renders an acknowledgement, not an option
    condition: null,        // must never filter out — it is the only way through
    effects: [],
  }];
  return {
    ...beat,
    id: `quest:${quest.id}:beat:${beat.id}`,
    mode: beat.mode || (quest.mode === "global" ? "public" : "private"),
    choices: choices.map((c) => ({
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
  const beatCtx = {
    ...ctx, claimant: aq.claimant, questId: quest.id, beatId: beat.id,
    // A quest beat belongs to its CLAIMANT, not to whoever is mid-turn.
    // Beats are delivered from the round-end pulse, by which point
    // activeIndex has wrapped to seat 0 — so a beat whose recipient
    // resolves through `active` was handed to the wrong faction entirely,
    // who then answered it (headlessly, at choice 0) on the claimant's
    // behalf. The claimant never saw their own quest.
    asPlayer: aq.claimant ?? ctx.asPlayer ?? null,
    // Where this quest was found, for beats that reference "here" but were
    // not themselves delivered by walking onto a marker.
    sourceHex: ctx.sourceHex ?? aq.originHex ?? null,
  };
  if (beat.deliver === "discovered") {
    return deliverEncounterDef(state, enc, { mode: "placement", hexFilter: beat.placementFilter }, beatCtx);
  }
  return deliverEncounterDef(state, enc, { recipient: beat.recipient }, beatCtx);
}

// Deliver whatever should come next for this quest.
//
// Two selection modes, in priority order:
//
//   1. ROUTED — a choice named an explicit destination via
//      `ADVANCE_QUEST { beatId: <some other beat> }`. That is the authoring
//      model ("this choice leads to that beat") and it selects exactly one
//      successor. Prereqs are still honoured as an ordering guard, but the
//      route decides which of several eligible beats actually fires.
//
//   2. PREREQ — no route was named. Every beat whose prerequisites are met
//      becomes eligible. This fans out by design: it is how parallel and
//      converging beats work. It cannot express a branch, which is why
//      mode 1 exists.
//
// A routed beat is delivered even if it is `deliver: "conditional"` — the
// route IS the condition, and the gate on such beats guards the unrouted
// path. Its own condition is still checked first when present, so content
// that sets both (all of the authored content does) stays consistent.
function evaluateBeatDelivery(state, questId, pid, ctx) {
  const aq = activeQuestFor(state, questId, pid);
  const quest = getQuest(questId);
  if (!aq || !quest) return;

  // --- 1. routed
  if (aq.routeTo) {
    const targetId = aq.routeTo;
    aq.routeTo = null; // consume it either way, so a dead route can't loop
    const beat = (quest.beats || []).find((b) => b.id === targetId);
    if (beat && !aq.completedBeats.includes(beat.id) && !aq.deliveredBeats.includes(beat.id)
        && prereqsMet(beat, aq)) {
      const cond = beatCondition(beat);
      if (cond == null || evalCond(state, cond,
          { ...ctx, claimant: aq.claimant, asPlayer: aq.claimant ?? ctx.asPlayer })) {
        deliverBeat(state, quest, beat, aq,
          { ...ctx, asPlayer: aq.claimant ?? ctx.asPlayer ?? null });
        return;
      }
    }
    emit(state, "quest_route_missed", { questId, beatId: targetId });
    // fall through to prereq selection rather than stalling the quest
  }

  // --- 2. prereq fan-out.
  // Re-derive the ready set on every pass instead of iterating a snapshot:
  // deliverBeat resolves its choices synchronously, which fires ADVANCE_QUEST,
  // which re-enters this function and can run the rest of the quest to
  // completion. A snapshot goes stale mid-loop and re-delivers a beat that
  // has already been seen — previously even after the quest had completed
  // and been removed from state.activeQuests.
  let guard = (quest.beats || []).length + 1;
  for (;;) {
    const live = activeQuestFor(state, questId, pid);
    if (!live || guard-- <= 0) return;
    const beatCtx = { ...ctx, claimant: live.claimant, asPlayer: live.claimant ?? ctx.asPlayer ?? null };
    // A beat's gate applies WHATEVER its deliver mode. `conditional` only
    // says *when* the gate is re-checked (on the round-end pulse, so it can
    // see deferred effects that landed this round); it does not mean
    // "the only kind of beat that has a gate".
    //
    // This loop used to deliver any ready non-conditional beat outright,
    // ignoring `deliverCondition` entirely — and 39 of 131 beats are `auto`
    // or `discovered` WITH a gate. They all fired the moment their
    // prerequisite completed, so quests raced to the end in a single round:
    // q_runner showed beats 1, 2 and 3 back-to-back in round 1 and then
    // completed, while the deferred timer that beat 4 waits on was still
    // sitting in the queue. Nine of q_signal's ten beats are shaped this way.
    const next = readyBeats(quest, live).find(
      (b) => b.deliver !== "conditional" && gatePasses(state, b, beatCtx));
    if (!next) return;
    deliverBeat(state, quest, next, live, beatCtx);
  }
}

// A beat's delivery gate. The editor's export pipeline writes it as
// `deliverCondition` (editor/src/lib/snapshot.js) while this module used to
// read only `condition`, so every editor-authored gate was silently ignored:
// branches fanned out and multi-round pacing collapsed to "immediately".
// Both spellings are accepted now; `deliverCondition` is the canonical one.
function beatCondition(beat) {
  return beat.deliverCondition ?? beat.condition ?? null;
}

// True when a beat's gate is absent or currently satisfied.
function gatePasses(state, beat, ctx) {
  const cond = beatCondition(beat);
  return cond == null || evalCond(state, cond, ctx);
}

// Round-end pulse — re-evaluate conditional beats now that the
// round-end has run (deferred sweep + trigger eval already done).
export function evaluateConditionalBeats(state, ctx = {}) {
  for (const aq of Object.values(state.activeQuests)) {
    const quest = getQuest(aq.questId);
    if (!quest) continue;
    for (const beat of readyBeats(quest, aq)) {
      // The pulse re-checks anything still waiting on a gate — `conditional`
      // beats by definition, and also `auto` / `discovered` beats whose gate
      // was not yet true when their prerequisite completed. Without the
      // second case a gated auto beat that missed its moment would never be
      // retried, because evaluateBeatDelivery only runs on quest start and
      // on advance.
      const gated = beat.deliver === "conditional" || beatCondition(beat) != null;
      if (!gated) continue;
      // Evaluate as the quest's claimant, not as whichever seat happens to
      // be active when the round-end pipeline runs.
      const beatCtx = { ...ctx, claimant: aq.claimant, asPlayer: aq.claimant ?? ctx.asPlayer };
      const cond = beatCondition(beat);
      if (cond != null && !evalCond(state, cond, beatCtx)) continue;
      deliverBeat(state, quest, beat, aq, beatCtx);
    }
  }
}

// --- quest offering --------------------------------------------------
//
// Nothing in the authored corpus emits START_QUEST: 1,133 effects contain
// 191 ADVANCE_QUEST and 111 COMPLETE_QUEST and zero START_QUEST. Quests are
// written to become available on their own terms — every opening beat has no
// prerequisites, and carries either a placement filter ("discovered": the
// quest waits on the map to be walked into) or a delivery gate reading like
// an availability test (`not seen_X AND active != versari AND round >= 4`).
//
// The engine had no pass that reads those. `evaluateConditionalBeats` only
// walks state.activeQuests, which only START_QUEST populates — so with no
// START_QUEST anywhere, no opener was ever evaluated and no quest could
// begin. This is that missing pass.
//
// It runs at the START of a player's turn rather than at round end, so
// `active` inside an opener gate means the player being offered the quest.
// Evaluating at round end would test every gate against whichever seat
// happened to be active, and only ever offer to that one.
export function offerQuests(state, ctx = {}) {
  const pid = state.turnOrder[state.activeIndex];
  if (!pid) return [];
  const started = [];

  for (const quest of Object.values(registry)) {
    if (!quest?.id) continue;
    if (activeQuestFor(state, quest.id, pid)) continue;        // they already have it
    if (alreadyFinished(state, quest.id, pid)) continue;       // they already finished it

    // A faction quest exists so a player can engage with a faction that is
    // NOT theirs — "you meet a Versari caravan" is not a story the Versari
    // can be told. So a quest declaring a `subjectFaction` is never offered
    // to that faction, and is offered to everyone else.
    //
    // Two quests (q_works, q_runner) already express this as an authored
    // opener gate, `ne active lakers`, and those keep working untouched —
    // this is the declarative form for the ones that don't carry one, and it
    // states the fact about the quest rather than repeating it per beat.
    if (quest.subjectFaction && quest.subjectFaction === pid) continue;

    const opener = openerOf(quest);
    if (!opener) continue;

    const cond = beatCondition(opener);
    if (cond != null && !evalCond(state, cond, { ...ctx, sourcePlayer: pid, asPlayer: pid })) continue;

    applyEffects(state, [{
      type: "START_QUEST", questId: quest.id, claimant: pid,
    }], { ...ctx, sourcePlayer: pid, asPlayer: pid });
    started.push(quest.id);
  }
  return started;
}

// The opening beat: lowest ordinal, and no prerequisites. Prereqs are the
// reliable half of that test — an opener by definition waits on nothing.
function openerOf(quest) {
  const beats = (quest.beats || []).filter((b) => !(b.prerequisites || []).length);
  if (!beats.length) return null;
  return beats.reduce((a, b) => ((b.ordinal ?? 0) < (a.ordinal ?? 0) ? b : a));
}

// A single-player quest that somebody has already claimed and finished is
// done with; the `seen_*` flags most openers gate on express the same intent
// per player, but not every opener carries one, so this is the backstop that
// stops a completed quest re-offering itself every turn.
// Per player: THIS player having finished a quest is what stops it being
// re-offered to them. It used to be "anybody finished it", which is the same
// global-quest assumption that made access a race — one seat completing a
// quest retired it for the whole table.
function alreadyFinished(state, questId, pid) {
  return !!state.players?.[pid]?.completedQuests?.[questId];
}

// --- effect handlers (registered into the shared EFFECTS map) ---

EFFECTS.START_QUEST = function (state, e, ctx) {
  const quest = getQuest(e.questId);
  if (!quest) return;
  const claimantPid = resolveTargets(state, e.claimant, ctx)[0]
    || actingPlayer(ctx, state);
  if (!claimantPid) return;

  // §15.7 exclusivity, re-scoped: a player cannot start the same quest twice.
  // It no longer means "nobody else may ever play this" — that reading is what
  // handed every quest to whoever moved first.
  if (activeQuestFor(state, e.questId, claimantPid)) return;

  const key = qkey(e.questId, claimantPid);
  state.activeQuests[key] = {
    questId: e.questId,
    claimant: claimantPid,
    completedBeats: [],
    deliveredBeats: [],
    startedAt: state.round,
  };
  emit(state, "quest_started", {
    questId: e.questId, mode: quest.mode, claimant: claimantPid,
  });
  evaluateBeatDelivery(state, e.questId, claimantPid, ctx);
};

// ADVANCE_QUEST does two jobs, distinguished by which beat it names.
//
//   ADVANCE_QUEST { beatId: <the beat being resolved> }
//     Advance. This is the copy `beatAsEncounter` appends to every choice,
//     so resolving any choice always progresses the quest.
//
//   ADVANCE_QUEST { beatId: <some other beat> }
//     ROUTE. The author is saying "this choice leads to that beat" — the
//     editor's beat graph emits exactly this when a choice handle is dragged
//     onto a target beat. It records the destination and returns; the
//     appended advance (which always runs last, because the append happens
//     after the authored effects) performs the advance and consumes the
//     route, by which point the choice's other effects — the flags the
//     target's gate reads — have already been applied.
//
// Read the other way round, a forward-naming ADVANCE_QUEST used to mark the
// destination COMPLETE without ever delivering it: the player was routed
// away from the branch they picked and into one they didn't. That inversion
// is what this distinction fixes.
EFFECTS.ADVANCE_QUEST = function (state, e, ctx) {
  // Advance the run belonging to whoever is answering the card.
  const pid = actingPlayer(ctx, state);
  const aq = activeQuestFor(state, e.questId, pid);
  if (!aq) return;

  const current = ctx?.beatId ?? null;
  if (e.beatId && current && e.beatId !== current) {
    aq.routeTo = e.beatId;
    emit(state, "quest_routed", { questId: e.questId, from: current, to: e.beatId });
    return;
  }

  if (!aq.completedBeats.includes(e.beatId)) aq.completedBeats.push(e.beatId);
  aq.deliveredBeats = aq.deliveredBeats.filter((b) => b !== e.beatId);
  emit(state, "quest_advanced", { questId: e.questId, beatId: e.beatId });

  const quest = getQuest(e.questId);
  const allDone = quest && (quest.beats || []).every((b) => aq.completedBeats.includes(b.id));
  if (allDone) {
    applyEffects(state, [{ type: "COMPLETE_QUEST", questId: e.questId }], ctx);
    return;
  }
  evaluateBeatDelivery(state, e.questId, pid, ctx);
};

EFFECTS.COMPLETE_QUEST = function (state, e, ctx) {
  const pid = actingPlayer(ctx, state);
  const aq = activeQuestFor(state, e.questId, pid);
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

  delete state.activeQuests[qkey(e.questId, aq.claimant)];
  emit(state, "quest_completed", { questId: e.questId, claimant: aq.claimant });
};
