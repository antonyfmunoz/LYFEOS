-- Provider-free Yuka/IVY parity: a private saved-label favorite never changes
-- the original label, evidence, or any health conclusion.
ALTER TABLE "ingredient_scans" ADD COLUMN IF NOT EXISTS "favorite" boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "ingredient_scans_user_favorite_created_idx" ON "ingredient_scans" ("user_id", "favorite", "created_at");

ALTER TABLE "ingredient_scan_items" DROP CONSTRAINT IF EXISTS "ingredient_scan_items_classification_valid";
ALTER TABLE "ingredient_scan_items" ADD CONSTRAINT "ingredient_scan_items_classification_valid"
  CHECK ("classification" IN ('unknown', 'label_fact', 'preference_match', 'regulatory_notice', 'declared_major_allergen_label_term', 'declared_color_additive', 'declared_sulfiting_agent', 'declared_non_nutritive_sweetener', 'declared_caffeine_source', 'declared_partially_hydrogenated_oil', 'declared_seed_oil'));
