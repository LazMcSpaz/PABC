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
import { WORLD_ENCOUNTERS } from "./content/index.js";
import { evalCond, evalStrength } from "./dsl.js";
import { emit } from "./events.js";
import { deliverEncounter } from "./encounters.js";

const FIRE_PER_ROUND = 2;

function getTriggers() {
  const out = [];
  for (const [id, def] of Object.entries(WORLD_ENCOUNTERS)) {
    out.push({
      id,
      cooldown: def.triggerCooldown || 0,
      condition: def.triggerCondition,
      strength: def.triggerStrength,
      encounter: def,
    });
  }
  return out;
}

export function evaluateTriggers(state, ctx = {}) {
  const registry = getTriggers();
  if (!registry.length) return [];

  const eligible = [];
  for (const t of registry) {
    const cooldownUntil = state.triggerCooldowns[t.id] || 0;
    if (cooldownUntil > state.round) continue;
    if (t.condition != null && !evalCond(state, t.condition, ctx)) continue;
    const strength = t.strength == null ? 1 : evalStrength(state, t.strength, ctx);
    if (strength <= 0) continue;
    eligible.push({ trigger: t, strength });
  }

  eligible.sort((a, b) => b.strength - a.strength);
  const fired = pickTopK(state, eligible, FIRE_PER_ROUND);

  for (const { trigger, strength } of fired) {
    state.triggerCooldowns[trigger.id] = state.round + trigger.cooldown;
    emit(state, "trigger_fired", {
      trigger: trigger.id, strength, round: state.round,
    });
    // Real delivery — encounters.js routes by mode (private / public /
    // placement) and emits encounter_delivered itself.
    deliverEncounter(state, trigger.encounter.id, {}, ctx);
  }
  return fired;
}

// Take the top k from a descending-sorted list. Entries above the cutoff
// strength are definite picks; entries tied at the cutoff are shuffled
// via the seeded RNG so reproducibility is preserved.
function pickTopK(state, sorted, k) {
  if (sorted.length <= k) return sorted;
  const cutoff = sorted[k - 1].strength;
  const above = sorted.filter((e) => e.strength > cutoff);
  const tied = sorted.filter((e) => e.strength === cutoff);
  const slots = k - above.length;
  if (slots >= tied.length) return [...above, ...tied];
  const shuffled = state.rng.shuffle(tied);
  return [...above, ...shuffled.slice(0, slots)];
}
