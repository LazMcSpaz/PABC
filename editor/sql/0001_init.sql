-- Content tables for the Quest & Encounter editor.
-- Mirrors docs/content-schema-v0.1.md §1. Run once in Supabase
-- (SQL Editor → New query → paste → Run).
--
-- Column names are camelCase (quoted) to match the API layer and the
-- schema doc. JSON-shaped columns (DSL, HexFilter) are stored as TEXT
-- containing JSON; the editor encodes / decodes them client-side.

-- =========================================================
-- 1. Tables
-- =========================================================

CREATE TABLE IF NOT EXISTS world_encounters (
  id                  TEXT PRIMARY KEY,
  mode                TEXT NOT NULL CHECK (mode IN ('private', 'public', 'placement')),
  recipient           TEXT,
  "expiresIn"         INTEGER,
  "publicGroupChoice" INTEGER DEFAULT 0,
  art                 TEXT,
  text                TEXT NOT NULL,
  "triggerCondition"  TEXT NOT NULL,
  "triggerStrength"   TEXT NOT NULL,
  "triggerCooldown"   INTEGER NOT NULL DEFAULT 0,
  "placementFilter"   TEXT
);

CREATE TABLE IF NOT EXISTS field_encounters (
  id      TEXT PRIMARY KEY,
  copies  INTEGER NOT NULL DEFAULT 1,
  art     TEXT,
  text    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quests (
  id     TEXT PRIMARY KEY,
  mode   TEXT NOT NULL CHECK (mode IN ('single-player', 'global')),
  title  TEXT
);

CREATE TABLE IF NOT EXISTS quest_beats (
  id                 TEXT PRIMARY KEY,
  "questId"          TEXT NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
  ordinal            INTEGER NOT NULL DEFAULT 0,
  deliver            TEXT NOT NULL CHECK (deliver IN ('auto', 'discovered', 'conditional')),
  "deliverCondition" TEXT,
  "placementFilter"  TEXT,
  mode               TEXT CHECK (mode IN ('private', 'public')),
  recipient          TEXT,
  art                TEXT,
  text               TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS quest_beats_quest_idx ON quest_beats ("questId");

CREATE TABLE IF NOT EXISTS quest_beat_prereqs (
  "beatId"        TEXT NOT NULL REFERENCES quest_beats(id) ON DELETE CASCADE,
  "prereqBeatId"  TEXT NOT NULL REFERENCES quest_beats(id) ON DELETE CASCADE,
  PRIMARY KEY ("beatId", "prereqBeatId")
);

-- Polymorphic. parentKind ∈ {'world_encounter','field_encounter','quest_beat'};
-- parentId references the id within that table. No DB-level FK because
-- the parent can live in any of three tables — the editor enforces
-- integrity and cleans up on delete.
CREATE TABLE IF NOT EXISTS choices (
  id              TEXT PRIMARY KEY,
  "parentKind"    TEXT NOT NULL CHECK ("parentKind" IN ('world_encounter', 'field_encounter', 'quest_beat')),
  "parentId"      TEXT NOT NULL,
  ordinal         INTEGER NOT NULL DEFAULT 0,
  label           TEXT NOT NULL,
  condition       TEXT,
  "deferredDelay" INTEGER
);

CREATE INDEX IF NOT EXISTS choices_parent_idx ON choices ("parentKind", "parentId");

-- Polymorphic. parentKind ∈ {'choice','quest_claim_reward','quest_shared_reward'};
-- parentId references the choice id or the quest id.
CREATE TABLE IF NOT EXISTS effects (
  id            TEXT PRIMARY KEY,
  "parentKind"  TEXT NOT NULL CHECK ("parentKind" IN ('choice', 'quest_claim_reward', 'quest_shared_reward')),
  "parentId"    TEXT NOT NULL,
  ordinal       INTEGER NOT NULL DEFAULT 0,
  type          TEXT NOT NULL,
  "paramsJson"  TEXT
);

CREATE INDEX IF NOT EXISTS effects_parent_idx ON effects ("parentKind", "parentId");

-- =========================================================
-- 2. Row-Level Security
-- =========================================================
-- Single-trusted-user editor: the front-end uses the anon key behind a
-- PIN gate. RLS is enabled (Supabase best practice) with a permissive
-- policy granting the anon role full CRUD. The PIN gate in the editor
-- is the real access control; anyone with the anon key + URL can read
-- and write content rows.
--
-- If you ever expose the anon key to untrusted contexts (e.g. the
-- game client itself talking to this DB), tighten these policies
-- before that point.

ALTER TABLE world_encounters    ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_encounters    ENABLE ROW LEVEL SECURITY;
ALTER TABLE quests              ENABLE ROW LEVEL SECURITY;
ALTER TABLE quest_beats         ENABLE ROW LEVEL SECURITY;
ALTER TABLE quest_beat_prereqs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE choices             ENABLE ROW LEVEL SECURITY;
ALTER TABLE effects             ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'world_encounters',
    'field_encounters',
    'quests',
    'quest_beats',
    'quest_beat_prereqs',
    'choices',
    'effects'
  ])
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS "editor anon full access" ON %I',
      t
    );
    EXECUTE format(
      'CREATE POLICY "editor anon full access" ON %I FOR ALL TO anon USING (true) WITH CHECK (true)',
      t
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS "editor authenticated full access" ON %I',
      t
    );
    EXECUTE format(
      'CREATE POLICY "editor authenticated full access" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END $$;

-- =========================================================
-- 3. Schema cache reload
-- =========================================================
-- Tell PostgREST to pick up the new tables right away instead of
-- waiting for its next reload tick.
NOTIFY pgrst, 'reload schema';
