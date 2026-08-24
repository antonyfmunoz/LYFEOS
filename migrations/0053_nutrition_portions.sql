ALTER TABLE "nutrition_foods" ADD COLUMN IF NOT EXISTS "density_grams_per_ml" real;

CREATE TABLE IF NOT EXISTS "nutrition_food_portions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "food_id" integer NOT NULL REFERENCES "nutrition_foods"("id") ON DELETE cascade,
  "label" text NOT NULL,
  "grams_per_unit" real NOT NULL,
  "source" text NOT NULL DEFAULT 'manual',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "nutrition_food_portions_grams_valid" CHECK ("grams_per_unit" > 0)
);

ALTER TABLE "nutrition_diary_entries" ADD COLUMN IF NOT EXISTS "input_portion_id" integer REFERENCES "nutrition_food_portions"("id") ON DELETE SET NULL;
ALTER TABLE "nutrition_diary_entries" ADD COLUMN IF NOT EXISTS "input_unit_label" text;
ALTER TABLE "nutrition_diary_entries" ADD COLUMN IF NOT EXISTS "input_grams_per_unit" real;
ALTER TABLE "nutrition_meal_plan_entries" ADD COLUMN IF NOT EXISTS "input_portion_id" integer REFERENCES "nutrition_food_portions"("id") ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "nutrition_food_portions_food_label_unique_idx" ON "nutrition_food_portions" ("food_id", "label");
CREATE INDEX IF NOT EXISTS "nutrition_food_portions_user_idx" ON "nutrition_food_portions" ("user_id", "food_id");
