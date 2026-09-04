-- Retain a user-supplied or structured-imported recipe source separately from
-- nutrition values. The URL is provenance context, not nutrition evidence.
ALTER TABLE "nutrition_recipes" ADD COLUMN IF NOT EXISTS "source_url" text;
ALTER TABLE "nutrition_recipe_revisions" ADD COLUMN IF NOT EXISTS "source_url" text;
