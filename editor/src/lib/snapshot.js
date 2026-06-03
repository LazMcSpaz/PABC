// Full-snapshot loader for the export pipeline.
//
// Reads every row from the seven content tables, reassembles polymorphic
// relations (choices under their parent encounter/beat; effects under
// their parent choice or quest reward bucket), and parses every TEXT-of-
// JSON column back into a real object so the engine can consume the
// result without any further deserialisation.

import { requireSupabase } from "./supabase.js";

const decodeJson = (v) => {
  if (v == null || v === "") return null;
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};

export async function loadSnapshot() {
  const sb = requireSupabase();

  const [
    we, fe, q, qb, qbp, ch, ef,
  ] = await Promise.all([
    sb.from("world_encounters").select("*").order("id"),
    sb.from("field_encounters").select("*").order("id"),
    sb.from("quests").select("*").order("id"),
    sb.from("quest_beats").select("*").order("questId").order("ordinal"),
    sb.from("quest_beat_prereqs").select("*"),
    sb.from("choices").select("*").order("ordinal"),
    sb.from("effects").select("*").order("ordinal"),
  ]);

  for (const r of [we, fe, q, qb, qbp, ch, ef]) {
    if (r.error) throw r.error;
  }

  // Index effects by parent.
  const effectsByParent = new Map();
  for (const e of ef.data ?? []) {
    const key = `${e.parentKind}:${e.parentId}`;
    if (!effectsByParent.has(key)) effectsByParent.set(key, []);
    effectsByParent.get(key).push({
      id: e.id,
      type: e.type,
      params: decodeJson(e.paramsJson) ?? {},
    });
  }

  // Index choices by parent, attach effects.
  const choicesByParent = new Map();
  for (const c of ch.data ?? []) {
    const key = `${c.parentKind}:${c.parentId}`;
    if (!choicesByParent.has(key)) choicesByParent.set(key, []);
    choicesByParent.get(key).push({
      id: c.id,
      label: c.label,
      outcomeText: c.outcomeText ?? null,
      condition: decodeJson(c.condition),
      deferredDelay: c.deferredDelay,
      effects: effectsByParent.get(`choice:${c.id}`) ?? [],
    });
  }

  // Title resolution: a blank title falls back to a prettified id.
  // Sub-beats (id contains "__b") inherit their head's title.
  const worldTitleByHead = titleByHead(we.data ?? []);
  const fieldTitleByHead = titleByHead(fe.data ?? []);

  const worldEncounters = (we.data ?? []).map((row) => ({
    id: row.id,
    title: resolveTitle(row.id, worldTitleByHead),
    mode: row.mode,
    recipient: row.recipient,
    expiresIn: row.expiresIn,
    publicGroupChoice: Boolean(row.publicGroupChoice),
    art: row.art,
    imagePath: row.imagePath ?? null,
    text: row.text,
    triggerCondition: decodeJson(row.triggerCondition),
    triggerStrength: decodeJson(row.triggerStrength),
    triggerCooldown: row.triggerCooldown,
    triggerWeight: row.triggerWeight == null ? 1 : Number(row.triggerWeight),
    placementFilter: decodeJson(row.placementFilter),
    choices: choicesByParent.get(`world_encounter:${row.id}`) ?? [],
  }));

  const fieldEncounters = (fe.data ?? []).map((row) => ({
    id: row.id,
    title: resolveTitle(row.id, fieldTitleByHead),
    copies: row.copies,
    art: row.art,
    imagePath: row.imagePath ?? null,
    text: row.text,
    choices: choicesByParent.get(`field_encounter:${row.id}`) ?? [],
  }));

  // Index prereqs by beat.
  const prereqsByBeat = new Map();
  for (const p of qbp.data ?? []) {
    if (!prereqsByBeat.has(p.beatId)) prereqsByBeat.set(p.beatId, []);
    prereqsByBeat.get(p.beatId).push(p.prereqBeatId);
  }

  // Index beats by quest.
  const beatsByQuest = new Map();
  for (const b of qb.data ?? []) {
    if (!beatsByQuest.has(b.questId)) beatsByQuest.set(b.questId, []);
    beatsByQuest.get(b.questId).push({
      id: b.id,
      ordinal: b.ordinal,
      prerequisites: prereqsByBeat.get(b.id) ?? [],
      deliver: b.deliver,
      deliverCondition: decodeJson(b.deliverCondition),
      placementFilter: decodeJson(b.placementFilter),
      mode: b.mode,
      recipient: b.recipient,
      art: b.art,
      imagePath: b.imagePath ?? null,
      text: b.text,
      choices: choicesByParent.get(`quest_beat:${b.id}`) ?? [],
    });
  }

  const quests = (q.data ?? []).map((row) => ({
    id: row.id,
    title: row.title || prettifyId(row.id),
    mode: row.mode,
    beats: beatsByQuest.get(row.id) ?? [],
    completion: {
      rewardForClaimant: effectsByParent.get(`quest_claim_reward:${row.id}`) ?? [],
      sharedSideEffects: effectsByParent.get(`quest_shared_reward:${row.id}`) ?? [],
    },
  }));

  return { worldEncounters, fieldEncounters, quests };
}

// Strip the "__b<n>" sub-beat suffix to find the head id.
function headIdOf(id) {
  const idx = id.indexOf("__b");
  return idx >= 0 ? id.slice(0, idx) : id;
}

// Build a map of head id → stored title (only head rows carry one).
function titleByHead(rows) {
  const map = new Map();
  for (const row of rows) {
    if (headIdOf(row.id) === row.id && row.title) {
      map.set(row.id, row.title);
    }
  }
  return map;
}

// Resolve the display title for any encounter row: the head's stored
// title, else a prettified id.
function resolveTitle(id, titleMap) {
  const head = headIdOf(id);
  return titleMap.get(head) || prettifyId(head);
}

// fe_grain_silo → "Grain Silo". Strips a leading type prefix
// (fe_/we_/q_/quest_/beat_/qb_) then title-cases the remaining words.
function prettifyId(id) {
  let s = String(id || "");
  s = s.replace(/^(fe|we|q|qb|quest|beat)_/i, "");
  s = s.replace(/[_-]+/g, " ").trim();
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
