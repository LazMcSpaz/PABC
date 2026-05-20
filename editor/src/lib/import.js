// Import pipeline for table-grouped JSON content (authoring agent output).
//
// Accepts a JSON document whose top-level keys are the seven table names
// from docs/content-schema-v0.1.md §1:
//   world_encounters, field_encounters, quests, quest_beats,
//   quest_beat_prereqs, choices, effects
// Each value is an array of full row objects whose keys are the DB
// column names (camelCase, exactly as in the schema doc).
//
// Strategy: bypass the editor's in-memory format. Upsert rows
// directly into Supabase in dependency order. JSON-shaped columns
// (triggerCondition, placementFilter, paramsJson, etc.) pass through
// as strings; if the importer sees an object value it stringifies
// before write.

import { requireSupabase } from "./supabase.js";
import { EFFECT_TYPES } from "./schema.js";

// Tables that may appear at the top level, in import order. quests
// before quest_beats so the FK is satisfied; prereqs after beats for
// the same reason. choices and effects have no DB-level FKs but stay
// in logical order.
export const IMPORT_TABLES = [
  "quests",
  "world_encounters",
  "field_encounters",
  "quest_beats",
  "choices",
  "quest_beat_prereqs",
  "effects",
];

// Columns that hold stringified JSON in the DB (TEXT). If the importer
// encounters an object value for one of these, it stringifies before
// upsert.
const JSON_TEXT_COLUMNS = {
  world_encounters: ["triggerCondition", "triggerStrength", "placementFilter"],
  quest_beats: ["deliverCondition", "placementFilter"],
  choices: ["condition"],
  effects: ["paramsJson"],
};

// Boolean columns stored as INT 0/1.
const BOOL_INT_COLUMNS = {
  world_encounters: ["publicGroupChoice"],
};

// Columns we expect on each table. Unknown columns are rejected to
// catch authoring-agent typos early.
const ALLOWED_COLUMNS = {
  world_encounters: new Set([
    "id",
    "mode",
    "recipient",
    "expiresIn",
    "publicGroupChoice",
    "art",
    "text",
    "triggerCondition",
    "triggerStrength",
    "triggerCooldown",
    "placementFilter",
  ]),
  field_encounters: new Set(["id", "copies", "art", "text"]),
  quests: new Set(["id", "mode", "title"]),
  quest_beats: new Set([
    "id",
    "questId",
    "ordinal",
    "deliver",
    "deliverCondition",
    "placementFilter",
    "mode",
    "recipient",
    "art",
    "text",
  ]),
  quest_beat_prereqs: new Set(["beatId", "prereqBeatId"]),
  choices: new Set([
    "id",
    "parentKind",
    "parentId",
    "ordinal",
    "label",
    "condition",
    "deferredDelay",
  ]),
  effects: new Set([
    "id",
    "parentKind",
    "parentId",
    "ordinal",
    "type",
    "paramsJson",
  ]),
};

const REQUIRED_COLUMNS = {
  world_encounters: ["id", "mode", "text", "triggerCondition", "triggerStrength"],
  field_encounters: ["id", "text"],
  quests: ["id", "mode"],
  quest_beats: ["id", "questId", "deliver", "text"],
  quest_beat_prereqs: ["beatId", "prereqBeatId"],
  choices: ["id", "parentKind", "parentId", "label"],
  effects: ["id", "parentKind", "parentId", "type"],
};

// ----- Parsing -----

export function parseImport(text) {
  if (!text || !text.trim()) {
    return { ok: false, error: "empty input" };
  }
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `JSON parse failed: ${e.message}` };
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return { ok: false, error: "top-level must be an object" };
  }

  const unknown = Object.keys(doc).filter((k) => !IMPORT_TABLES.includes(k));
  if (unknown.length) {
    return {
      ok: false,
      error: `unknown top-level keys: ${unknown.join(", ")}`,
    };
  }

  const groups = {};
  for (const table of IMPORT_TABLES) {
    if (!(table in doc)) continue;
    if (!Array.isArray(doc[table])) {
      return { ok: false, error: `${table}: must be an array` };
    }
    groups[table] = doc[table];
  }
  return { ok: true, groups };
}

// ----- Validation + row prep -----

export function prepareRows(groups) {
  const rows = {};
  const errors = [];

  for (const table of IMPORT_TABLES) {
    const input = groups[table];
    if (!input || input.length === 0) continue;
    const allowed = ALLOWED_COLUMNS[table];
    const required = REQUIRED_COLUMNS[table];
    const jsonCols = JSON_TEXT_COLUMNS[table] ?? [];
    const boolCols = BOOL_INT_COLUMNS[table] ?? [];

    rows[table] = [];

    input.forEach((raw, i) => {
      const where = `${table}[${i}]`;
      if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
        errors.push(`${where}: must be an object`);
        return;
      }

      const out = {};
      for (const key of Object.keys(raw)) {
        if (!allowed.has(key)) {
          errors.push(`${where}: unknown column '${key}'`);
          continue;
        }
        let val = raw[key];

        if (jsonCols.includes(key) && val != null && typeof val !== "string") {
          try {
            val = JSON.stringify(val);
          } catch (e) {
            errors.push(`${where}.${key}: not JSON-serialisable (${e.message})`);
            continue;
          }
        }

        if (boolCols.includes(key)) {
          if (val === true || val === 1 || val === "1") val = 1;
          else if (val === false || val === 0 || val === "0" || val == null) val = 0;
          else {
            errors.push(`${where}.${key}: must be boolean / 0 / 1`);
            continue;
          }
        }

        out[key] = val;
      }

      // Required columns
      for (const req of required) {
        if (out[req] == null || out[req] === "") {
          errors.push(`${where}: missing required '${req}'`);
        }
      }

      // Effect type must be in the locked 22 list.
      if (table === "effects" && out.type && !EFFECT_TYPES.includes(out.type)) {
        errors.push(`${where}.type: '${out.type}' is not in the locked list of 22`);
      }

      rows[table].push(out);
    });
  }

  return { rows, errors };
}

// ----- Conflict detection -----

export async function detectConflicts(rows) {
  const sb = requireSupabase();
  const conflicts = {};

  const idColumns = {
    world_encounters: "id",
    field_encounters: "id",
    quests: "id",
    quest_beats: "id",
    choices: "id",
    effects: "id",
    // quest_beat_prereqs PK is composite — handled separately below
  };

  for (const table of IMPORT_TABLES) {
    if (!rows[table] || rows[table].length === 0) continue;
    if (table === "quest_beat_prereqs") {
      const checks = await Promise.all(
        rows[table].map(async (r) => {
          const { data, error } = await sb
            .from("quest_beat_prereqs")
            .select("beatId")
            .eq("beatId", r.beatId)
            .eq("prereqBeatId", r.prereqBeatId)
            .limit(1);
          if (error) throw error;
          return (data ?? []).length > 0;
        }),
      );
      conflicts[table] = checks.filter(Boolean).length;
      continue;
    }
    const col = idColumns[table];
    const ids = rows[table].map((r) => r[col]).filter(Boolean);
    if (!ids.length) {
      conflicts[table] = 0;
      continue;
    }
    const { data, error } = await sb.from(table).select(col).in(col, ids);
    if (error) throw error;
    conflicts[table] = (data ?? []).length;
  }

  return conflicts;
}

// ----- Apply -----

export async function applyImport(rows) {
  const sb = requireSupabase();
  const summary = {};

  for (const table of IMPORT_TABLES) {
    if (!rows[table] || rows[table].length === 0) continue;
    const onConflict =
      table === "quest_beat_prereqs" ? "beatId,prereqBeatId" : "id";
    const { error } = await sb
      .from(table)
      .upsert(rows[table], { onConflict });
    if (error) {
      throw new Error(`${table}: ${error.message}`);
    }
    summary[table] = rows[table].length;
  }

  return summary;
}
