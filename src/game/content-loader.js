// Bridge between the editor's content snapshot format
// (src/game/content/*.js, auto-generated) and the engine's effect /
// applyEffect convention. The editor emits effects shaped
// `{ id, type, params: { … } }`; the engine expects `{ type, …params }`.
// This module flattens that shape and reports which effect types the
// snapshot uses but the engine doesn't yet implement.
//
// Token aliasing (`active` → `active_player`) lives in targeting.js so
// engine code and editor content share one resolver.
import { FIELD_ENCOUNTERS, WORLD_ENCOUNTERS, QUESTS } from "./content/index.js";
import { EFFECTS } from "./effects.js";

// Flatten `{ type, params: { … } }` → `{ type, … }`. Recurses into
// nested effect lists (FORCE_CHOICE.options, QUEUE_DEFERRED.effects).
export function normalizeEffect(raw) {
  if (!raw || typeof raw !== "object") return raw;
  const { type, params = {} } = raw;
  const out = { type };
  for (const [k, v] of Object.entries(params)) {
    if (k === "effects" && Array.isArray(v)) {
      out.effects = v.map(normalizeEffect);
    } else if (k === "options" && Array.isArray(v)) {
      out.options = v.map((o) => ({
        ...o,
        effects: (o.effects || []).map(normalizeEffect),
      }));
    } else {
      out[k] = v;
    }
  }
  return out;
}

// Pass-through normaliser: any field the editor adds (imagePath,
// outcomeText, …) flows through unchanged. The engine reads what it
// understands and ignores the rest.
export function normalizeChoice(raw) {
  return {
    ...raw,
    effects: (raw.effects || []).map(normalizeEffect),
  };
}

export function normalizeEncounter(raw) {
  return {
    ...raw,
    choices: (raw.choices || []).map(normalizeChoice),
  };
}

// Walk every effect (including nested) and collect any `type` that has
// no handler in EFFECTS. Used by the smoke test to report unsupported
// effect types without crashing on them.
export function findUnsupportedTypes(snapshot) {
  const missing = new Set();
  const walk = (eff) => {
    if (!eff || typeof eff !== "object") return;
    if (eff.type && !EFFECTS[eff.type]) missing.add(eff.type);
    for (const child of eff.effects || []) walk(child);
    for (const opt of eff.options || []) (opt.effects || []).forEach(walk);
  };
  for (const enc of Object.values(snapshot)) {
    for (const ch of enc.choices || []) ch.effects.forEach(walk);
  }
  return [...missing].sort();
}

// Choice is fully runnable today iff none of its effects (recursively)
// reference an unsupported type.
export function choiceIsRunnable(choice) {
  const ok = (eff) => {
    if (!eff?.type) return true;
    if (!EFFECTS[eff.type]) return false;
    if (eff.effects && !eff.effects.every(ok)) return false;
    if (eff.options && !eff.options.every((o) => (o.effects || []).every(ok))) return false;
    return true;
  };
  return (choice.effects || []).every(ok);
}

export function loadFieldEncounters() {
  const normalized = {};
  for (const [id, raw] of Object.entries(FIELD_ENCOUNTERS)) {
    normalized[id] = normalizeEncounter(raw);
  }
  return normalized;
}

export { FIELD_ENCOUNTERS as RAW_FIELD_ENCOUNTERS, WORLD_ENCOUNTERS, QUESTS };
