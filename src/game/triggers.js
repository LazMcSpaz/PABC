// End-of-round trigger evaluation (mechanical-spec §15.4). The
// world-encounter content table is treated as a trigger registry —
// one row, one trigger, wrapping (condition, strength, cooldown,
// encounter). On each round-end:
//
//   1. Filter out triggers on cooldown or whose condition is false.
//   2. Score the rest with their `strength` expression (1..5).
//   3. Fire the top FIRE_PER_ROUND; ties at the cutoff broken by the
//      seeded RNG. Each fired trigger sets cooldown.
//
// Encounter delivery itself is a stub here — encounters.js (Layer 5.3)
// wraps this with the real private / public / placement dispatch.
// Until then, `trigger_fired` + `encounter_delivered` events log that
// a trigger picked up an encounter, but no choices are presented.
import { worldEncounters, deliverEncounter } from "./encounters.js";
import { evalCond, evalStrength } from "./dsl.js";
import { emit } from "./events.js";
import { CONFIG } from "./config.js";


// How many world triggers fire at each round end. The default lives in
// CONFIG; a game may lower it (or set 0 to switch world encounters off
// entirely) from the setup screen without the content going anywhere.
const FIRE_PER_ROUND = CONFIG.encounters.worldPerRound;
const firePerRound = (state) =>
  state.rules?.worldEncountersPerRound ?? FIRE_PER_ROUND;

function getTriggers() {
  const out = [];
  for (const [id, def] of Object.entries(worldEncounters())) {
    out.push({
      id,
      cooldown: def.triggerCooldown || 0,
      condition: def.triggerCondition,
      strength: def.triggerStrength,
      // Rarity multiplier — content authors expose this as the 5-tier
      // dropdown (Common 2.0, Normal 1.0, Uncommon 0.6, Rare 0.3,
      // Mythic 0.1). Missing weight = 1.0 (back-compat for existing
      // content). Final score = strength × weight.
      weight: def.triggerWeight == null ? 1 : Number(def.triggerWeight) || 1,
      encounter: def,
    });
  }
  return out;
}

export function evaluateTriggers(state, ctx = {}) {
  const registry = getTriggers();
  if (!registry.length) return [];

  // Evaluate every trigger ONCE PER PLAYER.
  //
  // A world encounter asks a per-player question — "have you seen this
  // before", "how often have you been raided", "is your Honor low" — and its
  // recipient is authored as `active`. But this runs from the round-end
  // pipeline, where activeIndex has already wrapped to seat 0. Evaluated
  // once with no player context, every condition was tested against seat 0
  // and every delivery went to seat 0: measured over six games, all 108
  // world-encounter deliveries landed on the first faction and the other
  // three received none, ever. The human player never saw one unless they
  // happened to hold that seat.
  //
  // Scoring per player also makes the strength expressions mean what they
  // say: a trigger that escalates with YOUR raid count now scores against
  // each player's own count rather than the first seat's.
  const eligible = [];
  for (const t of registry) {
    const cooldownUntil = state.triggerCooldowns[t.id] || 0;
    if (cooldownUntil > state.round) continue;
    for (const pid of state.turnOrder) {
      if (state.players[pid]?.eliminated) continue;
      const pctx = { ...ctx, asPlayer: pid, sourcePlayer: pid };
      if (t.condition != null && !evalCond(state, t.condition, pctx)) continue;
      const strength = t.strength == null ? 1 : evalStrength(state, t.strength, pctx);
      if (strength <= 0) continue;
      const score = strength * t.weight;
      if (score <= 0) continue;
      eligible.push({ trigger: t, strength, score, recipient: pid });
    }
  }

  // One firing per trigger per round: the same encounter should not land on
  // two factions in the same breath just because both qualified. Where
  // several players tie for the best score — which is every trigger whose
  // strength does not vary per player — the recipient is drawn with the
  // seeded RNG rather than taken in turn order. Taking the first would
  // reintroduce the seat-0 bias this whole change exists to remove, just
  // quietly enough to pass a distribution check on content that happens to
  // differentiate.
  const byTrigger = new Map();
  for (const e of eligible) {
    const cur = byTrigger.get(e.trigger.id);
    if (!cur || e.score > cur[0].score) byTrigger.set(e.trigger.id, [e]);
    else if (e.score === cur[0].score) cur.push(e);
  }
  const unique = [...byTrigger.values()].map(
    (tied) => (tied.length === 1 ? tied[0] : state.rng.pick(tied)));
  unique.sort((a, b) => b.score - a.score);
  const fired = pickTopK(state, unique, firePerRound(state));

  for (const { trigger, strength, score, recipient } of fired) {
    state.triggerCooldowns[trigger.id] = state.round + trigger.cooldown;
    emit(state, "trigger_fired", {
      trigger: trigger.id, strength, weight: trigger.weight, score,
      round: state.round, recipient,
    });
    // Real delivery — encounters.js routes by mode (private / public /
    // placement) and emits encounter_delivered itself. The recipient is
    // passed explicitly AND as `asPlayer`, so an authored `active` inside
    // the encounter's choices and effects resolves to the player being
    // shown the card.
    deliverEncounter(state, trigger.encounter.id, { recipient },
      { ...ctx, asPlayer: recipient, sourcePlayer: recipient });
  }
  return fired;
}

// Take the top k from a descending-sorted list. Entries above the cutoff
// strength are definite picks; entries tied at the cutoff are shuffled
// via the seeded RNG so reproducibility is preserved.
function pickTopK(state, sorted, k) {
  if (sorted.length <= k) return sorted;
  const cutoff = sorted[k - 1].score;
  const above = sorted.filter((e) => e.score > cutoff);
  const tied = sorted.filter((e) => e.score === cutoff);
  const slots = k - above.length;
  if (slots >= tied.length) return [...above, ...tied];
  const shuffled = state.rng.shuffle(tied);
  return [...above, ...shuffled.slice(0, slots)];
}
