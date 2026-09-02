-- Preserve the food-source context used for a diary entry. New entries retain
-- it at record time; existing entries remain explicitly legacy/unknown.
ALTER TABLE "nutrition_diary_entries"
  ADD COLUMN IF NOT EXISTS "food_evidence_snapshot" jsonb;
