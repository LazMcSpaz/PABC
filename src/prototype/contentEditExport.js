// The deliverable of Content Edit Mode: a patch file describing every change
// made in a play session, in a form that can be applied to the authored
// source without guessing.
//
// Three things make it applicable rather than merely informative:
//
//   from/to per field    A note saying "made the reward bigger" needs the
//                        reader to find the reward. A `from` that matches
//                        the current source is a checkable claim; a `from`
//                        that does NOT match says the source moved under the
//                        edit, which is exactly the thing worth catching.
//   authoring shape      Effects go back out as `{type, params:{…}}`, the
//                        shape the content JSON and src/game/content/*.js
//                        both use. The engine flattens on the way in
//                        (content-loader.js); this un-flattens on the way out
//                        so the file drops straight into the source.
//   ids, not positions   Every change names its quest, beat and choice by id.
//                        Nothing depends on array order, which the corpus
//                        reorders freely.
import { getQuest, getQuestSource, allQuestSources } from "../game/quests.js";
import { getEncounter, getEncounterSource, allEncounterSources } from "../game/encounters.js";
import { allPatches, beatKey, getPatch } from "../game/contentPatch.js";

export const EXPORT_KIND = "pabc-content-edits";
export const EXPORT_VERSION = 1;

// Engine-flat `{type, …params}` → authoring `{type, params:{…}}`. Recurses
// into the nested branches that carry effect lists of their own, mirroring
// content-loader.js normalizeEffect in the other direction.
const PASSTHROUGH = new Set(["type", "id", "ordinal"]);
const BRANCHES = ["effects", "onSuccess", "onFail", "onWin", "onLose", "onMissed"];

export function denormalizeEffect(raw) {
  if (!raw || typeof raw !== "object") return raw;
  // Already in authoring shape — recurse into it and leave it alone.
  if (raw.params && typeof raw.params === "object" && !Array.isArray(raw.params)) {
    const params = { ...raw.params };
    for (const b of BRANCHES) {
      if (Array.isArray(params[b])) params[b] = params[b].map(denormalizeEffect);
    }
    return { ...raw, params };
  }
  const params = {};
  for (const [k, v] of Object.entries(raw)) {
    if (PASSTHROUGH.has(k)) continue;
    params[k] = BRANCHES.includes(k) && Array.isArray(v) ? v.map(denormalizeEffect) : v;
  }
  if (Array.isArray(raw.options)) {
    params.options = raw.options.map((o) => ({ ...o, effects: (o.effects || []).map(denormalizeEffect) }));
  }
  const out = { type: raw.type, params };
  if (raw.id) out.id = raw.id;
  return out;
}

// Split `quest:q_x:beat:qb_y` back into its parts; null for an encounter id.
function parseBeatKey(key) {
  const m = /^quest:([^:]+):beat:(.+)$/.exec(key);
  return m ? { questId: m[1], beatId: m[2] } : null;
}

// The authored entity a patch key refers to, so `from` can be filled in.
function sourceFor(key) {
  const parsed = parseBeatKey(key);
  if (!parsed) {
    const enc = getEncounterSource(key);
    return enc ? { kind: "encounter", def: enc, label: enc.title || key } : null;
  }
  const quest = getQuestSource(parsed.questId);
  const beat = (quest?.beats || []).find((b) => b.id === parsed.beatId);
  if (!beat) return null;
  return {
    kind: "quest-beat", def: beat, quest, ...parsed,
    label: `${quest.title || parsed.questId} — ${parsed.beatId}`,
  };
}

/**
 * Everything the editor needs about one entity, by patch key.
 *
 * `live` is what the game is currently running (edits applied) and `source`
 * is what was authored — the editor shows the first and reverts to the
 * second, and the export diffs one against the other.
 */
export function resolveEntity(id) {
  const src = sourceFor(id);
  if (!src) return null;
  const live = src.kind === "quest-beat"
    ? (getQuest(src.questId)?.beats || []).find((b) => b.id === src.beatId)
    : getEncounter(id);
  return { ...src, id, source: src.def, live: live || src.def, patch: getPatch(id) };
}

/**
 * Every editable entity, for the browser: each quest's beats in authored
 * order, then field and world encounters. `edited` marks the ones carrying
 * live changes so a session's work is findable again.
 */
export function contentIndex() {
  const groups = [];
  for (const q of Object.values(allQuestSources())) {
    groups.push({
      kind: "quest",
      id: q.id,
      title: q.title || q.id,
      items: (q.beats || []).map((b) => ({
        id: beatKey(q.id, b.id),
        label: b.title || b.id,
        subtitle: (b.text || "").slice(0, 80),
        edited: !!getPatch(beatKey(q.id, b.id)),
      })),
    });
  }
  const { field, world } = allEncounterSources();
  for (const [title, map] of [["Field encounters", field], ["World encounters", world]]) {
    groups.push({
      kind: "encounters",
      id: title,
      title,
      items: Object.values(map).map((e) => ({
        id: e.id,
        label: e.title || e.id,
        subtitle: (e.text || "").slice(0, 80),
        edited: !!getPatch(e.id),
      })),
    });
  }
  return groups;
}

const CHOICE_FIELDS = ["label", "outcomeText", "condition", "effects"];
const ENTITY_FIELDS = ["title", "text", "deliverCondition", "condition"];

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** One entity's patch → a list of `{field, from, to}`, dropping no-ops. */
function changesFor(src, patch) {
  const out = [];
  for (const f of ENTITY_FIELDS) {
    if (!(f in patch)) continue;
    if (same(src.def[f], patch[f])) continue;
    out.push({ field: f, from: src.def[f] ?? null, to: patch[f] ?? null });
  }
  for (const [cid, cp] of Object.entries(patch.choices || {})) {
    const base = (src.def.choices || []).find((c) => c.id === cid);
    for (const f of CHOICE_FIELDS) {
      if (!(f in cp)) continue;
      const from = base?.[f];
      if (same(from, cp[f])) continue;
      const wrap = (v) => (f === "effects" ? (v || []).map(denormalizeEffect) : v ?? null);
      out.push({ field: `choices.${cid}.${f}`, choiceId: cid, from: wrap(from), to: wrap(cp[f]) });
    }
  }
  return out;
}

/**
 * Build the export document.
 *
 * `state` is the live game, used only for the session block — the seed and
 * round a change was made under are the difference between "this reward is
 * too small" and "this reward is too small at round 2 with three units".
 */
export function buildContentEdits(state) {
  const edits = [];
  let skipped = 0;
  for (const [key, patch] of Object.entries(allPatches())) {
    const src = sourceFor(key);
    if (!src) { skipped += 1; continue; } // patch for content that no longer exists
    const changes = changesFor(src, patch);
    if (!changes.length && !patch.note) continue;
    edits.push({
      id: key,
      entity: src.kind,
      ...(src.questId ? { questId: src.questId, questTitle: src.quest?.title ?? null, beatId: src.beatId } : {}),
      ...(src.kind === "encounter" ? { encounterId: key } : {}),
      label: src.label,
      ...(patch.note ? { note: patch.note } : {}),
      changes,
    });
  }
  return {
    kind: EXPORT_KIND,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    session: state ? {
      seed: state.seed ?? null,
      round: state.round ?? null,
      playing: state.humanFactionId ?? null,
    } : null,
    // Read this before applying: a `from` that does not match the source means
    // the content moved after the edit was made.
    appliesTo: "src/game/content/*.js (generated) and the authoring JSON they are built from",
    counts: { entities: edits.length, changes: edits.reduce((n, e) => n + e.changes.length, 0), skipped },
    edits,
  };
}

/** True when there is anything worth downloading. */
export function hasContentEdits(state) {
  return buildContentEdits(state).edits.length > 0;
}

// Same client-side download as the playtest log — Blob, object URL, a
// throwaway <a download>. Works on static hosting and opens the share sheet
// on iPad Safari.
export function downloadContentEdits(state) {
  const doc = buildContentEdits(state);
  if (!doc.edits.length) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pabc-content-edits-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return doc;
}

// Unused by the app, exported for the check script: the whole authored corpus
// as a flat list of editable entities, which is what the browser lists.
export function editableEntities() {
  const out = [];
  for (const q of Object.values(allQuestSources())) {
    for (const b of q.beats || []) {
      out.push({ id: beatKey(q.id, b.id), kind: "quest-beat", questId: q.id, beatId: b.id,
                 label: `${q.title || q.id} — ${b.id}` });
    }
  }
  return out;
}
