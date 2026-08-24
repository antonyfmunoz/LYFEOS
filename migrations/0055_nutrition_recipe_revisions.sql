ALTER TABLE "nutrition_recipes" ADD COLUMN IF NOT EXISTS "folder" text;

CREATE TABLE IF NOT EXISTS "nutrition_recipe_revisions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "recipe_id" integer NOT NULL REFERENCES "nutrition_recipes"("id") ON DELETE cascade,
  "revision_number" integer NOT NULL,
  "name" text NOT NULL,
  "servings" real NOT NULL,
  "folder" text,
  "note" text,
  "ingredients_snapshot" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "nutrition_recipe_revisions_number_unique_idx" ON "nutrition_recipe_revisions" ("recipe_id", "revision_number");
CREATE INDEX IF NOT EXISTS "nutrition_recipe_revisions_user_idx" ON "nutrition_recipe_revisions" ("user_id", "recipe_id");
