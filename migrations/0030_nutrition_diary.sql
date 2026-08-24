CREATE TABLE IF NOT EXISTS "nutrition_foods" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "brand" text,
  "barcode" text,
  "source" text NOT NULL DEFAULT 'manual',
  "serving_size_grams" real NOT NULL DEFAULT 100,
  "note" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "nutrition_foods_user_name_idx" ON "nutrition_foods" ("user_id", "name");

CREATE TABLE IF NOT EXISTS "nutrition_food_nutrients" (
  "id" serial PRIMARY KEY NOT NULL,
  "food_id" integer NOT NULL REFERENCES "nutrition_foods"("id") ON DELETE cascade,
  "nutrient_key" text NOT NULL,
  "amount_per_100g" real NOT NULL,
  "unit" text NOT NULL,
  "source" text NOT NULL DEFAULT 'manual',
  CONSTRAINT "nutrition_food_nutrients_unique_idx" UNIQUE("food_id", "nutrient_key")
);

CREATE TABLE IF NOT EXISTS "nutrition_diary_entries" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "food_id" integer NOT NULL REFERENCES "nutrition_foods"("id") ON DELETE cascade,
  "serving_grams" real NOT NULL CHECK ("serving_grams" > 0),
  "meal_slot" text NOT NULL DEFAULT 'other',
  "occurred_at" timestamp NOT NULL DEFAULT now(),
  "note" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "nutrition_diary_entries_user_occurred_idx" ON "nutrition_diary_entries" ("user_id", "occurred_at");
