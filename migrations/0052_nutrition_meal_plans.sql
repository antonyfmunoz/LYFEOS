CREATE TABLE IF NOT EXISTS "nutrition_meal_plans" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "note" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "nutrition_meal_plans_dates_valid" CHECK ("end_date" >= "start_date"),
  CONSTRAINT "nutrition_meal_plans_status_valid" CHECK ("status" IN ('active', 'archived'))
);

CREATE TABLE IF NOT EXISTS "nutrition_meal_plan_entries" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "plan_id" integer NOT NULL REFERENCES "nutrition_meal_plans"("id") ON DELETE cascade,
  "scheduled_date" date NOT NULL,
  "meal_slot" text NOT NULL,
  "food_id" integer REFERENCES "nutrition_foods"("id") ON DELETE restrict,
  "recipe_id" integer REFERENCES "nutrition_recipes"("id") ON DELETE restrict,
  "quantity" real NOT NULL,
  "input_unit" text NOT NULL,
  "status" text NOT NULL DEFAULT 'planned',
  "logged_diary_entry_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "note" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "nutrition_meal_plan_entries_source_valid" CHECK (("food_id" IS NOT NULL) <> ("recipe_id" IS NOT NULL)),
  CONSTRAINT "nutrition_meal_plan_entries_quantity_valid" CHECK ("quantity" > 0),
  CONSTRAINT "nutrition_meal_plan_entries_unit_valid" CHECK ("input_unit" IN ('g', 'serving', 'recipe_serving')),
  CONSTRAINT "nutrition_meal_plan_entries_status_valid" CHECK ("status" IN ('planned', 'logged', 'skipped'))
);

CREATE INDEX IF NOT EXISTS "nutrition_meal_plans_user_date_idx" ON "nutrition_meal_plans" ("user_id", "start_date");
CREATE INDEX IF NOT EXISTS "nutrition_meal_plan_entries_user_date_idx" ON "nutrition_meal_plan_entries" ("user_id", "scheduled_date");
