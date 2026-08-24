ALTER TABLE "nutrition_food_portions" ADD COLUMN IF NOT EXISTS "catalog_label" text;
ALTER TABLE "nutrition_food_portions" ADD COLUMN IF NOT EXISTS "catalog_grams_per_unit" real;
ALTER TABLE "nutrition_food_portions" ADD COLUMN IF NOT EXISTS "source_modified" boolean NOT NULL DEFAULT false;
