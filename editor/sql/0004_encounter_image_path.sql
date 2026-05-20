-- Unify image support across encounter types: world encounters and
-- field encounters get the same imagePath column quest_beats already
-- has (migration 0003). Nullable — encounters without an image render
-- with text only.

ALTER TABLE world_encounters ADD COLUMN IF NOT EXISTS "imagePath" TEXT;
ALTER TABLE field_encounters ADD COLUMN IF NOT EXISTS "imagePath" TEXT;

NOTIFY pgrst, 'reload schema';
