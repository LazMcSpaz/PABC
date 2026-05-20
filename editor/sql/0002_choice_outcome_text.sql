-- Choice outcome text — narrative shown after a choice is taken.
-- Additive: nullable column, default null. Re-runs are safe.

ALTER TABLE choices ADD COLUMN IF NOT EXISTS "outcomeText" TEXT;

NOTIFY pgrst, 'reload schema';
