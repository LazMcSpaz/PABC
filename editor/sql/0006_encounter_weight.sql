-- Rarity multiplier for world-encounter triggers (spec / content-tool v2).
-- The end-of-round trigger pipeline scores `strength × weight` and fires
-- the top K; missing weight = 1.0 (back-compat). Authors expose this in
-- the editor as a 5-tier dropdown:
--   Common    2.0
--   Normal    1.0  (default)
--   Uncommon  0.6
--   Rare      0.3
--   Mythic    0.1
ALTER TABLE world_encounters
  ADD COLUMN IF NOT EXISTS "triggerWeight" NUMERIC NOT NULL DEFAULT 1.0;

NOTIFY pgrst, 'reload schema';
