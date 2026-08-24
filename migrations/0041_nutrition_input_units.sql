-- New diary records retain the unit a person entered. Historical entries are
-- left untouched because their original input unit cannot be reconstructed.
ALTER TABLE "nutrition_diary_entries" ADD COLUMN IF NOT EXISTS "input_quantity" real;
ALTER TABLE "nutrition_diary_entries" ADD COLUMN IF NOT EXISTS "input_unit" text;
