-- Preserve the evidence snapshot returned with a signed catalog receipt so a
-- user can distinguish source provenance from later private edits.
ALTER TABLE "nutrition_foods"
  ADD COLUMN IF NOT EXISTS "catalog_evidence" jsonb;
