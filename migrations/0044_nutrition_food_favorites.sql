-- Favorites are user-owned capture shortcuts only; they do not alter nutrient
-- facts or historical diary snapshots.
ALTER TABLE "nutrition_foods" ADD COLUMN IF NOT EXISTS "favorite" boolean NOT NULL DEFAULT false;
