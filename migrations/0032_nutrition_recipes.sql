CREATE TABLE IF NOT EXISTS "nutrition_recipes" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "servings" real NOT NULL DEFAULT 1 CHECK ("servings" > 0),
  "note" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "nutrition_recipes_user_name_idx" ON "nutrition_recipes" ("user_id", "name");
CREATE TABLE IF NOT EXISTS "nutrition_recipe_ingredients" (
  "id" serial PRIMARY KEY NOT NULL,
  "recipe_id" integer NOT NULL REFERENCES "nutrition_recipes"("id") ON DELETE cascade,
  "food_id" integer NOT NULL REFERENCES "nutrition_foods"("id") ON DELETE restrict,
  "grams" real NOT NULL CHECK ("grams" > 0),
  "sort_order" integer NOT NULL DEFAULT 0,
  CONSTRAINT "nutrition_recipe_ingredients_unique_idx" UNIQUE("recipe_id", "food_id")
);
