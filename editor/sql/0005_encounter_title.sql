-- Story title for encounters. Quests already have `title`; this brings
-- world and field encounters in line. Stored on the head row only;
-- sub-beats inherit the head's title at export time. Nullable — a blank
-- title falls back to a prettified id in the generated content.

ALTER TABLE world_encounters ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE field_encounters ADD COLUMN IF NOT EXISTS "title" TEXT;

NOTIFY pgrst, 'reload schema';
