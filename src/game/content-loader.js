// Bridge between the editor's content snapshot format
// (src/game/content/*.js, auto-generated) and the engine's effect /
// targeting conventions. The editor emits effects shaped
// `{ id, type, params: { ... } }` and targeting tokens from the
// content-schema vocabulary (`active`, …); the engine expects effects
// shaped `{ type, ...params }` and tokens like `active_player`. This
// module reads the snapshot, normalises both, and reports which
// effect types are still unsupported by the current engine.
import { FIELD_ENCOUNTERS, WORLD_ENCOUNTERS, QUESTS } from "./content/index.js";
import { EFFECTS } from "./effects.js";

// Content-schema §3 → engine §11 token aliases.
const TOKEN_ALIASES = {
  active: "active_player",
  // `controller`, `triggering_player`, `each_opponent`, etc. already
  // match between vocabularies; add aliases here as new ones appear.
};

function aliasToken(token) {
  return typeof token === "string" ? (TOKEN_ALIASES[token] || token) : token;
}

// Flatten `{ type, params: { … } }` → `{ type, … }`, alias tokens, and
// recurse into nested effect lists (FORCE_CHOICE options,
// QUEUE_DEFERRED.effects).
export function normalizeEffect(raw) {
  if (!raw || typeof raw !== "object") return raw;
  const { type, params = {} } = raw;
  const out = { type };
  for (const [k, v] of Object.entries(params)) {
    if (k === "target" || k === "chooser" || k === "from" || k === "to") {
      out[k] = aliasToken(v);
    } else if (k === "effects" && Array.isArray(v)) {
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

export function normalizeChoice(raw) {
  return {
    id: raw.id,
    label: raw.label,
    outcomeText: raw.outcomeText,
    condition: raw.condition,
    deferredDelay: raw.deferredDelay,
    effects: (raw.effects || []).map(normalizeEffect),
  };
}

export function normalizeEncounter(raw) {
  return {
    id: raw.id,
    art: raw.art,
    text: raw.text,
    copies: raw.copies,
    choices: (raw.choices || []).map(normalizeChoice),
  };
}

// Walk every effect (including nested) and collect any `type` that has
// no handler in `EFFECTS`. Used by the smoke test to report what's
// pending engine support without crashing on it.
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
