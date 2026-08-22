// Live edits to authored content, applied at read time.
//
// Content Edit Mode lets the designer rewrite a beat while playing it —
// its gate, its prose, its choices and what those choices grant — and see the
// change immediately rather than in the next build. The edits are captured
// for export (they are the deliverable; the game does not rewrite the shipped
// corpus) but they also have to APPLY, or "see what this choice grants" is a
// promise about a number you cannot change and re-read.
//
// So: a patch store, and two read-time merges. `getQuest` and `getEncounter`
// are the only doors into authored content anywhere in the engine, which is
// what makes this small — everything downstream (delivery, eligibility,
// effects, the AI's headless pick) reads the patched value without knowing
// there is a patch.
//
// Patches are keyed by the id the UI already shows: `fe_the_silo` for an
// encounter, `quest:q_massacre:beat:qb_mas_compound` for a beat — the same
// synthetic id quests.js builds for delivery. One namespace, no second
// vocabulary to keep in step.
//
// Deliberately no persistence here. This module is pure state so the harness
// and the check scripts can drive it; localStorage is the UI's business.

/** `quest:<questId>:beat:<beatId>` — the id a delivered beat carries. */
export const beatKey = (questId, beatId) => `quest:${questId}:beat:${beatId}`;

const patches = new Map();
// Bumped on every write. Consumers memoise against it rather than deep-
// comparing a patch tree on every getQuest call, and getQuest is on the hot
// path of quest delivery.
let version = 0;

export function patchVersion() {
  return version;
}

/** The patch for one entity, or null. */
export function getPatch(key) {
  return patches.get(key) || null;
}

/** Every patch, as plain data — this is what the export is built from. */
export function allPatches() {
  return Object.fromEntries([...patches.entries()].map(([k, v]) => [k, v]));
}

export function hasPatches() {
  return patches.size > 0;
}

/**
 * Merge `change` into the patch for `key`.
 *
 * Shallow at the top (text, title, deliverCondition, note) and one level deep
 * under `choices`, keyed by choice id — so editing a choice's label does not
 * discard the effects edit made a moment earlier.
 *
 * A field set to `undefined` is removed from the patch, which is how "revert
 * this field" is expressed. `null` is a legitimate authored value (an absent
 * gate is `null`, not missing) and is kept.
 */
export function setPatch(key, change) {
  const cur = patches.get(key) || {};
  const next = { ...cur, ...change };
  if (change.choices) {
    next.choices = { ...(cur.choices || {}) };
    for (const [cid, c] of Object.entries(change.choices)) {
      next.choices[cid] = { ...(cur.choices?.[cid] || {}), ...c };
      for (const [k, v] of Object.entries(next.choices[cid])) {
        if (v === undefined) delete next.choices[cid][k];
      }
      if (!Object.keys(next.choices[cid]).length) delete next.choices[cid];
    }
    if (!Object.keys(next.choices).length) delete next.choices;
  }
  for (const [k, v] of Object.entries(next)) if (v === undefined) delete next[k];

  if (!Object.keys(next).length) patches.delete(key);
  else patches.set(key, next);
  version += 1;
}

/** Drop one entity's edits, or all of them. */
export function clearPatch(key) {
  if (key == null) patches.clear();
  else patches.delete(key);
  version += 1;
}

/** Replace the whole store — used when the UI restores from localStorage. */
export function loadPatches(obj) {
  patches.clear();
  for (const [k, v] of Object.entries(obj || {})) {
    if (v && typeof v === "object") patches.set(k, v);
  }
  version += 1;
}

// --- read-time merge ---------------------------------------------------

// Only fields the editor offers are merged. A patch cannot invent structure
// — it cannot add a choice, rename an id, or reach a field nothing edits —
// which keeps a malformed restore from localStorage out of the engine.
const ENTITY_FIELDS = ["title", "text", "deliverCondition", "condition"];
const CHOICE_FIELDS = ["label", "outcomeText", "condition", "effects"];

function mergeFields(base, patch, fields) {
  if (!patch) return base;
  let out = base;
  for (const f of fields) {
    if (!(f in patch)) continue;
    if (out === base) out = { ...base };
    out[f] = patch[f];
  }
  return out;
}

/** Apply an encounter-shaped patch (used for both encounters and beats). */
export function applyPatchTo(def, patch) {
  if (!def || !patch) return def;
  let out = mergeFields(def, patch, ENTITY_FIELDS);
  if (patch.choices) {
    const choices = (def.choices || []).map((c) => mergeFields(c, patch.choices[c.id], CHOICE_FIELDS));
    if (choices.some((c, i) => c !== (def.choices || [])[i])) {
      out = out === def ? { ...def } : out;
      out.choices = choices;
    }
  }
  return out;
}

/**
 * A quest with every patched beat merged in.
 *
 * Returns the ORIGINAL object when nothing about this quest is patched, so
 * the common case allocates nothing and identity checks upstream still hold.
 */
export function applyQuestPatches(quest) {
  if (!quest || !patches.size) return quest;
  let beats = quest.beats || [];
  let touched = false;
  const merged = beats.map((b) => {
    const p = patches.get(beatKey(quest.id, b.id));
    if (!p) return b;
    touched = true;
    return applyPatchTo(b, p);
  });
  return touched ? { ...quest, beats: merged } : quest;
}
