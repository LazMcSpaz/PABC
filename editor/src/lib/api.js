// CRUD layer for the seven content tables.
// All DSL / HexFilter fields are stored as JSON strings in SQLite-shaped
// columns per docs/content-schema-v0.1.md §1.

import { requireSupabase } from "./supabase.js";

const sb = () => requireSupabase();

const encodeJson = (v) => (v == null ? null : JSON.stringify(v));
const decodeJson = (v) => {
  if (v == null || v === "") return null;
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};

// ----- Navigator index -----

export async function listAll() {
  const [worlds, fields, quests] = await Promise.all([
    sb().from("world_encounters").select("id, mode").order("id"),
    sb().from("field_encounters").select("id").order("id"),
    sb().from("quests").select("id, title, mode").order("id"),
  ]);
  if (worlds.error) throw worlds.error;
  if (fields.error) throw fields.error;
  if (quests.error) throw quests.error;
  return {
    worldEncounters: worlds.data ?? [],
    fieldEncounters: fields.data ?? [],
    quests: quests.data ?? [],
  };
}

// ----- World encounters -----

export async function loadWorldEncounter(id) {
  const { data: row, error } = await sb()
    .from("world_encounters")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  const choices = await loadChoices("world_encounter", id);
  return {
    ...row,
    publicGroupChoice: Boolean(row.publicGroupChoice),
    triggerCondition: decodeJson(row.triggerCondition),
    triggerStrength: decodeJson(row.triggerStrength),
    placementFilter: decodeJson(row.placementFilter),
    choices,
  };
}

export async function saveWorldEncounter(enc) {
  const { choices = [], ...rest } = enc;
  const row = {
    ...rest,
    publicGroupChoice: rest.publicGroupChoice ? 1 : 0,
    triggerCondition: encodeJson(rest.triggerCondition),
    triggerStrength: encodeJson(rest.triggerStrength),
    placementFilter: encodeJson(rest.placementFilter),
  };
  const { error } = await sb().from("world_encounters").upsert(row);
  if (error) throw error;
  await replaceChoices("world_encounter", enc.id, choices);
}

export async function deleteWorldEncounter(id) {
  await deleteChoicesFor("world_encounter", id);
  const { error } = await sb().from("world_encounters").delete().eq("id", id);
  if (error) throw error;
}

// ----- Field encounters -----

export async function loadFieldEncounter(id) {
  const { data: row, error } = await sb()
    .from("field_encounters")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  const choices = await loadChoices("field_encounter", id);
  return { ...row, choices };
}

export async function saveFieldEncounter(enc) {
  const { choices = [], ...rest } = enc;
  const { error } = await sb().from("field_encounters").upsert(rest);
  if (error) throw error;
  await replaceChoices("field_encounter", enc.id, choices);
}

export async function deleteFieldEncounter(id) {
  await deleteChoicesFor("field_encounter", id);
  const { error } = await sb().from("field_encounters").delete().eq("id", id);
  if (error) throw error;
}

// ----- Quests -----

export async function loadQuest(id) {
  const [{ data: quest, error: e1 }, { data: beats, error: e2 }, { data: prereqs, error: e3 }] =
    await Promise.all([
      sb().from("quests").select("*").eq("id", id).single(),
      sb().from("quest_beats").select("*").eq("questId", id).order("ordinal"),
      sb().from("quest_beat_prereqs").select("*"),
    ]);
  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;

  const beatIds = new Set((beats ?? []).map((b) => b.id));
  const filteredPrereqs = (prereqs ?? []).filter(
    (p) => beatIds.has(p.beatId) && beatIds.has(p.prereqBeatId),
  );

  const beatsWithChildren = await Promise.all(
    (beats ?? []).map(async (b) => ({
      ...b,
      deliverCondition: decodeJson(b.deliverCondition),
      placementFilter: decodeJson(b.placementFilter),
      choices: await loadChoices("quest_beat", b.id),
    })),
  );

  const [claimRewards, sharedRewards] = await Promise.all([
    loadEffects("quest_claim_reward", id),
    loadEffects("quest_shared_reward", id),
  ]);

  return {
    ...quest,
    beats: beatsWithChildren,
    prereqs: filteredPrereqs,
    claimRewards,
    sharedRewards,
  };
}

export async function saveQuest(quest) {
  const {
    beats = [],
    prereqs = [],
    claimRewards = [],
    sharedRewards = [],
    ...rest
  } = quest;

  const { error: e1 } = await sb().from("quests").upsert(rest);
  if (e1) throw e1;

  // Upsert beats; delete beats removed from the editor.
  const { data: existingBeats, error: e2 } = await sb()
    .from("quest_beats")
    .select("id")
    .eq("questId", quest.id);
  if (e2) throw e2;
  const keepIds = new Set(beats.map((b) => b.id));
  const drop = (existingBeats ?? [])
    .map((b) => b.id)
    .filter((id) => !keepIds.has(id));

  if (drop.length) {
    for (const beatId of drop) {
      await deleteChoicesFor("quest_beat", beatId);
    }
    const { error } = await sb()
      .from("quest_beats")
      .delete()
      .in("id", drop);
    if (error) throw error;
  }

  for (const beat of beats) {
    const { choices = [], ...beatRow } = beat;
    const row = {
      ...beatRow,
      questId: quest.id,
      deliverCondition: encodeJson(beatRow.deliverCondition),
      placementFilter: encodeJson(beatRow.placementFilter),
    };
    const { error } = await sb().from("quest_beats").upsert(row);
    if (error) throw error;
    await replaceChoices("quest_beat", beat.id, choices);
  }

  // Replace prereq rows for these beats.
  if (drop.length || beats.length) {
    const allBeatIds = beats.map((b) => b.id);
    if (allBeatIds.length) {
      const { error } = await sb()
        .from("quest_beat_prereqs")
        .delete()
        .in("beatId", allBeatIds);
      if (error) throw error;
    }
    if (prereqs.length) {
      const valid = prereqs.filter(
        (p) => keepIds.has(p.beatId) && keepIds.has(p.prereqBeatId),
      );
      if (valid.length) {
        const { error } = await sb().from("quest_beat_prereqs").upsert(valid);
        if (error) throw error;
      }
    }
  }

  await replaceEffects("quest_claim_reward", quest.id, claimRewards);
  await replaceEffects("quest_shared_reward", quest.id, sharedRewards);
}

export async function deleteQuest(id) {
  const { data: beats } = await sb()
    .from("quest_beats")
    .select("id")
    .eq("questId", id);
  for (const b of beats ?? []) {
    await deleteChoicesFor("quest_beat", b.id);
  }
  await sb().from("quest_beat_prereqs").delete().in(
    "beatId",
    (beats ?? []).map((b) => b.id).concat(["__noop__"]),
  );
  await sb().from("quest_beats").delete().eq("questId", id);
  await deleteEffectsFor("quest_claim_reward", id);
  await deleteEffectsFor("quest_shared_reward", id);
  const { error } = await sb().from("quests").delete().eq("id", id);
  if (error) throw error;
}

// ----- Choices (polymorphic) -----

async function loadChoices(parentKind, parentId) {
  const { data, error } = await sb()
    .from("choices")
    .select("*")
    .eq("parentKind", parentKind)
    .eq("parentId", parentId)
    .order("ordinal");
  if (error) throw error;
  const out = [];
  for (const c of data ?? []) {
    out.push({
      ...c,
      condition: decodeJson(c.condition),
      effects: await loadEffects("choice", c.id),
    });
  }
  return out;
}

async function replaceChoices(parentKind, parentId, choices) {
  await deleteChoicesFor(parentKind, parentId);
  for (const [i, ch] of choices.entries()) {
    const { effects = [], ...rest } = ch;
    const row = {
      ...rest,
      parentKind,
      parentId,
      ordinal: i,
      condition: encodeJson(rest.condition),
    };
    const { error } = await sb().from("choices").upsert(row);
    if (error) throw error;
    await replaceEffects("choice", ch.id, effects);
  }
}

async function deleteChoicesFor(parentKind, parentId) {
  const { data, error } = await sb()
    .from("choices")
    .select("id")
    .eq("parentKind", parentKind)
    .eq("parentId", parentId);
  if (error) throw error;
  for (const c of data ?? []) {
    await deleteEffectsFor("choice", c.id);
  }
  const { error: e2 } = await sb()
    .from("choices")
    .delete()
    .eq("parentKind", parentKind)
    .eq("parentId", parentId);
  if (e2) throw e2;
}

// ----- Effects (polymorphic) -----

async function loadEffects(parentKind, parentId) {
  const { data, error } = await sb()
    .from("effects")
    .select("*")
    .eq("parentKind", parentKind)
    .eq("parentId", parentId)
    .order("ordinal");
  if (error) throw error;
  return (data ?? []).map((e) => ({
    ...e,
    params: decodeJson(e.paramsJson) ?? {},
  }));
}

async function replaceEffects(parentKind, parentId, effects) {
  await deleteEffectsFor(parentKind, parentId);
  for (const [i, e] of effects.entries()) {
    const row = {
      id: e.id,
      parentKind,
      parentId,
      ordinal: i,
      type: e.type,
      paramsJson: encodeJson(e.params ?? {}),
    };
    const { error } = await sb().from("effects").upsert(row);
    if (error) throw error;
  }
}

async function deleteEffectsFor(parentKind, parentId) {
  const { error } = await sb()
    .from("effects")
    .delete()
    .eq("parentKind", parentKind)
    .eq("parentId", parentId);
  if (error) throw error;
}
