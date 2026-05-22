-- Pool rename: Tech → Research (engine change). Rewrite existing
-- authored content so ADJUST_RESOURCE / CONVERT effects that referenced
-- the old 'Tech' pool now reference 'Research'.
--
-- paramsJson is stored as compact JSON text (the editor emits no spaces),
-- so the substring forms below match what the tool wrote. Nested effects
-- (inside QUEUE_DEFERRED / FORCE_CHOICE params) live in the same JSON
-- string and are rewritten by the same replace. Hand-edited content with
-- different spacing may need a manual pass.

-- ADJUST_RESOURCE: { "resource":"Tech", ... }  (also nested copies)
UPDATE effects
SET "paramsJson" = replace("paramsJson", '"resource":"Tech"', '"resource":"Research"')
WHERE "paramsJson" LIKE '%"resource":"Tech"%';

-- CONVERT pools: { "from":"Tech" } / { "to":"Tech" }
UPDATE effects
SET "paramsJson" = replace("paramsJson", '"from":"Tech"', '"from":"Research"')
WHERE "paramsJson" LIKE '%"from":"Tech"%';

UPDATE effects
SET "paramsJson" = replace("paramsJson", '"to":"Tech"', '"to":"Research"')
WHERE "paramsJson" LIKE '%"to":"Tech"%';

NOTIFY pgrst, 'reload schema';
