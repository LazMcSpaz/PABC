-- In-game wiki / glossary entries.
--
-- Each row defines one term the player can click on in any encounter text.
-- The body itself may contain `[[other-term]]` markers for cross-links;
-- the renderer resolves them recursively, so wiki entries form a
-- navigable graph.
--
-- `aliases` stores a JSON array of alt spellings the [[markup]] resolver
-- accepts as the same entry (e.g. ["ZoC", "zone of control"] → zoc-entry).
--
-- `category` is a free-text bucket used by the wiki UI for grouping
-- (Mechanics / Geography & Story / Factions are the starter set, but
-- authors can introduce more without a schema change).

CREATE TABLE IF NOT EXISTS wiki_entries (
  id         TEXT PRIMARY KEY,
  term       TEXT NOT NULL,
  aliases    TEXT,                       -- JSON array of strings
  category   TEXT,
  body       TEXT NOT NULL,
  "imagePath" TEXT
);

CREATE INDEX IF NOT EXISTS wiki_entries_category_idx ON wiki_entries (category);

ALTER TABLE wiki_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "editor anon full access" ON wiki_entries;
CREATE POLICY "editor anon full access"
  ON wiki_entries FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "editor authenticated full access" ON wiki_entries;
CREATE POLICY "editor authenticated full access"
  ON wiki_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
