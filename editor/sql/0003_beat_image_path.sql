-- Quest beats may carry an authored image. The actual file lives in the
-- content branch under src/game/content/images/beats/<id>.jpg; this
-- column stores the path so the engine can resolve it. Nullable —
-- beats without an image render with text only.

ALTER TABLE quest_beats ADD COLUMN IF NOT EXISTS "imagePath" TEXT;

NOTIFY pgrst, 'reload schema';
