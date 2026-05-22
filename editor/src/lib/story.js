// Multi-beat story support for field and world encounters.
//
// We don't add tables: an N-beat field/world story is the head encounter
// row plus N-1 linked encounter rows of the same kind, all reachable
// only via DELIVER_ENCOUNTER effects from a previous beat's choice.
// Sub-beats are flagged so they don't fire standalone:
//   - field: copies = 0 (never seeded into the deck)
//   - world: triggerCondition = false literal (never fires)
//
// The editor presents the whole chain as one story; this module
// handles the load / save / delete sequencing.

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

const encodeJson = (v) => (v == null ? null : JSON.stringify(v));

const KIND_TABLE = {
  field: "field_encounters",
  world: "world_encounters",
};

const KIND_PARENT = {
  field: "field_encounter",
  world: "world_encounter",
};

// A sub-beat is recognised by: parentBeatId set in memory, or — at load
// time — by being reachable via DELIVER_ENCOUNTER from another beat AND
// having the "off" sentinel for its kind.
//
// At storage time the sentinel is what marks it as a sub-beat:
const SUB_BEAT_SENTINELS = {
  field: { copies: 0 },
  world: { triggerCondition: false, triggerStrength: 1, triggerCooldown: 999999 },
};

export function subBeatId(headId, ordinal) {
  return `${headId}__b${ordinal}`;
}

// True if the row appears to be a sub-beat (rather than a standalone
// encounter). Used during the navigator listing to hide sub-beats.
export function looksLikeSubBeat(kind, row) {
  if (kind === "field") return row.copies === 0;
  if (kind === "world") {
    const cond = decodeJson(row.triggerCondition);
    return cond === false;
  }
  return false;
}

// ----- Loading -----

export async function loadStory(kind, id) {
  if (kind === "quest") {
    throw new Error("loadStory only handles field/world — quests use loadQuest");
  }
  const sb = requireSupabase();
  const table = KIND_TABLE[kind];
  if (!table) throw new Error(`unknown kind '${kind}'`);

  // Load head + transitively follow DELIVER_ENCOUNTER references.
  const beatRows = new Map(); // id → row
  const choicesByBeat = new Map(); // beatId → choices[]
  const queue = [id];
  const seen = new Set();

  while (queue.length) {
    const next = queue.shift();
    if (seen.has(next)) continue;
    seen.add(next);

    const { data: row, error } = await sb
      .from(table)
      .select("*")
      .eq("id", next)
      .single();
    if (error) {
      if (next === id) throw error;
      continue; // dangling reference; skip and keep going
    }
    beatRows.set(next, row);

    const choices = await loadChoicesWithEffects(KIND_PARENT[kind], next);
    choicesByBeat.set(next, choices);

    // Queue any DELIVER_ENCOUNTER targets within the same kind for
    // recursive load.
    for (const c of choices) {
      for (const e of c.effects ?? []) {
        if (
          e.type === "DELIVER_ENCOUNTER" &&
          typeof e.params?.encounterId === "string"
        ) {
          queue.push(e.params.encounterId);
        }
      }
    }
  }

  // Order beats: head first, then sub-beats reachable via BFS from the
  // head's choices. This makes the visual tree deterministic.
  const ordered = orderBeats(id, beatRows, choicesByBeat);

  // Materialise each beat into the shape the editor consumes.
  const beats = ordered.map((bid, idx) => {
    const row = beatRows.get(bid);
    const isHead = bid === id;
    return {
      id: bid,
      ordinal: idx,
      isHead,
      art: row.art ?? "",
      imagePath: row.imagePath ?? null,
      text: row.text ?? "",
      choices: choicesByBeat.get(bid) ?? [],
      // Layout hint (auto-positioning in the editor)
      _x: undefined,
      _y: undefined,
    };
  });

  // Head-level metadata (kind-specific).
  const head = beatRows.get(id);
  return {
    kind,
    id,
    // copies (field) / mode + trigger / placement (world) live on the
    // head only. We surface them at the top level of the story object;
    // sub-beats don't carry their own copies / trigger.
    ...kindHeadMeta(kind, head),
    beats,
  };
}

function kindHeadMeta(kind, head) {
  if (kind === "field") {
    return {
      title: head.title ?? "",
      copies: head.copies ?? 1,
    };
  }
  if (kind === "world") {
    return {
      title: head.title ?? "",
      mode: head.mode,
      recipient: head.recipient,
      expiresIn: head.expiresIn,
      publicGroupChoice: Boolean(head.publicGroupChoice),
      triggerCondition: decodeJson(head.triggerCondition),
      triggerStrength: decodeJson(head.triggerStrength),
      triggerCooldown: head.triggerCooldown,
      placementFilter: decodeJson(head.placementFilter),
    };
  }
  return {};
}

function orderBeats(headId, beatRows, choicesByBeat) {
  const order = [];
  const visited = new Set();
  const queue = [headId];
  while (queue.length) {
    const cur = queue.shift();
    if (visited.has(cur)) continue;
    if (!beatRows.has(cur)) continue;
    visited.add(cur);
    order.push(cur);
    for (const c of choicesByBeat.get(cur) ?? []) {
      for (const e of c.effects ?? []) {
        if (
          e.type === "DELIVER_ENCOUNTER" &&
          typeof e.params?.encounterId === "string" &&
          beatRows.has(e.params.encounterId)
        ) {
          queue.push(e.params.encounterId);
        }
      }
    }
  }
  // Any unreached beats (orphaned by a removed DELIVER_ENCOUNTER) tail.
  for (const id of beatRows.keys()) if (!visited.has(id)) order.push(id);
  return order;
}

async function loadChoicesWithEffects(parentKind, parentId) {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("choices")
    .select("*")
    .eq("parentKind", parentKind)
    .eq("parentId", parentId)
    .order("ordinal");
  if (error) throw error;

  const out = [];
  for (const c of data ?? []) {
    const { data: effects, error: e2 } = await sb
      .from("effects")
      .select("*")
      .eq("parentKind", "choice")
      .eq("parentId", c.id)
      .order("ordinal");
    if (e2) throw e2;
    out.push({
      id: c.id,
      label: c.label,
      outcomeText: c.outcomeText ?? null,
      condition: decodeJson(c.condition),
      deferredDelay: c.deferredDelay,
      effects: (effects ?? []).map((e) => ({
        id: e.id,
        type: e.type,
        params: decodeJson(e.paramsJson) ?? {},
      })),
    });
  }
  return out;
}

// ----- Saving -----

export async function saveStory(story) {
  const sb = requireSupabase();
  const kind = story.kind;
  if (!KIND_TABLE[kind]) throw new Error(`saveStory: bad kind ${kind}`);
  const table = KIND_TABLE[kind];

  // 1. For each beat in story.beats, write its row. Head gets the
  //    real metadata; sub-beats get the kind-specific sentinel.
  const headMeta = kindHeadMeta(kind, headRowFromStory(story));

  for (const beat of story.beats) {
    const isHead = beat.id === story.id;
    const baseRow = {
      id: beat.id,
      art: beat.art,
      imagePath: beat.imagePath,
      text: beat.text,
    };
    let row;
    if (kind === "field") {
      row = {
        ...baseRow,
        title: isHead ? story.title ?? null : null,
        copies: isHead ? story.copies ?? 1 : 0,
      };
    } else {
      // world
      row = {
        ...baseRow,
        title: isHead ? story.title ?? null : null,
        mode: isHead ? story.mode ?? "private" : "private",
        recipient: isHead ? story.recipient ?? null : null,
        expiresIn: isHead ? story.expiresIn ?? null : null,
        publicGroupChoice: isHead
          ? story.publicGroupChoice
            ? 1
            : 0
          : 0,
        triggerCondition: isHead
          ? encodeJson(story.triggerCondition)
          : encodeJson(false),
        triggerStrength: isHead ? encodeJson(story.triggerStrength) : encodeJson(1),
        triggerCooldown: isHead ? story.triggerCooldown ?? 0 : 999999,
        placementFilter: isHead ? encodeJson(story.placementFilter) : null,
      };
    }
    const { error } = await sb.from(table).upsert(row);
    if (error) throw error;
  }

  // 2. Drop any rows that were previously part of this story but the
  //    user removed in this session. We identify "part of this story"
  //    via sub-beat id prefix (`<headId>__b`). Defensive: only delete
  //    rows that match the prefix AND are sub-beats by sentinel.
  const allIds = new Set(story.beats.map((b) => b.id));
  const { data: candidates, error: e2 } = await sb
    .from(table)
    .select("id, copies, triggerCondition")
    .like("id", `${story.id}__b%`);
  if (e2) throw e2;
  const toDrop = (candidates ?? [])
    .filter((r) => !allIds.has(r.id))
    .filter((r) => looksLikeSubBeat(kind, r))
    .map((r) => r.id);
  if (toDrop.length) {
    for (const dropId of toDrop) {
      await deleteEncounterRowAndChildren(kind, dropId);
    }
  }

  // 3. Replace choices + effects for each beat.
  for (const beat of story.beats) {
    await replaceChoices(KIND_PARENT[kind], beat.id, beat.choices ?? []);
  }
}

function headRowFromStory(story) {
  // The kindHeadMeta function expects a "row" shaped like the DB row.
  // Story top-level fields already have the right shape; just pass-through.
  return story;
}

async function replaceChoices(parentKind, parentId, choices) {
  const sb = requireSupabase();
  // Delete existing choices for this parent (and their effects).
  const { data: existing, error } = await sb
    .from("choices")
    .select("id")
    .eq("parentKind", parentKind)
    .eq("parentId", parentId);
  if (error) throw error;
  for (const c of existing ?? []) {
    await sb.from("effects").delete().eq("parentKind", "choice").eq("parentId", c.id);
  }
  await sb
    .from("choices")
    .delete()
    .eq("parentKind", parentKind)
    .eq("parentId", parentId);

  for (const [i, ch] of choices.entries()) {
    const row = {
      id: ch.id,
      parentKind,
      parentId,
      ordinal: i,
      label: ch.label,
      outcomeText: ch.outcomeText ?? null,
      condition: encodeJson(ch.condition),
      deferredDelay: ch.deferredDelay ?? null,
    };
    const { error: e2 } = await sb.from("choices").upsert(row);
    if (e2) throw e2;
    for (const [j, e] of (ch.effects ?? []).entries()) {
      const erow = {
        id: e.id,
        parentKind: "choice",
        parentId: ch.id,
        ordinal: j,
        type: e.type,
        paramsJson: encodeJson(e.params ?? {}),
      };
      const { error: e3 } = await sb.from("effects").upsert(erow);
      if (e3) throw e3;
    }
  }
}

async function deleteEncounterRowAndChildren(kind, id) {
  const sb = requireSupabase();
  // Find the choices on this beat → delete their effects → delete choices.
  const { data: choices } = await sb
    .from("choices")
    .select("id")
    .eq("parentKind", KIND_PARENT[kind])
    .eq("parentId", id);
  for (const c of choices ?? []) {
    await sb.from("effects").delete().eq("parentKind", "choice").eq("parentId", c.id);
  }
  await sb
    .from("choices")
    .delete()
    .eq("parentKind", KIND_PARENT[kind])
    .eq("parentId", id);
  await sb.from(KIND_TABLE[kind]).delete().eq("id", id);
}

// ----- Deleting an entire story -----

export async function deleteStory(kind, headId) {
  const sb = requireSupabase();
  // Find all sub-beats by id prefix.
  const { data: subBeats } = await sb
    .from(KIND_TABLE[kind])
    .select("id")
    .like("id", `${headId}__b%`);
  for (const r of subBeats ?? []) {
    await deleteEncounterRowAndChildren(kind, r.id);
  }
  await deleteEncounterRowAndChildren(kind, headId);
}
