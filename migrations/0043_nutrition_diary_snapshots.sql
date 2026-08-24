-- Preserve the nutrient facts that were present when food was logged so later
-- food-record corrections do not silently rewrite historical diary totals.
ALTER TABLE "nutrition_diary_entries"
  ADD COLUMN IF NOT EXISTS "nutrient_snapshot" jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE "nutrition_diary_entries" AS entry
SET "nutrient_snapshot" = COALESCE((
  SELECT jsonb_agg(jsonb_build_object(
    'nutrientKey', nutrient."nutrient_key",
    'amountPer100g', nutrient."amount_per_100g",
    'unit', nutrient."unit"
  ) ORDER BY nutrient."nutrient_key")
  FROM "nutrition_food_nutrients" AS nutrient
  WHERE nutrient."food_id" = entry."food_id"
), '[]'::jsonb)
WHERE entry."nutrient_snapshot" = '[]'::jsonb;
