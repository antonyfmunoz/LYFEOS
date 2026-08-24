ALTER TABLE "nutrition_foods" ADD COLUMN IF NOT EXISTS "catalog_provider_id" text;
ALTER TABLE "nutrition_foods" ADD COLUMN IF NOT EXISTS "catalog_external_id" text;
ALTER TABLE "nutrition_foods" ADD COLUMN IF NOT EXISTS "catalog_dataset_version" text;
ALTER TABLE "nutrition_foods" ADD COLUMN IF NOT EXISTS "catalog_item_version" text;
ALTER TABLE "nutrition_foods" ADD COLUMN IF NOT EXISTS "catalog_attribution_text" text;
ALTER TABLE "nutrition_foods" ADD COLUMN IF NOT EXISTS "catalog_attribution_url" text;
ALTER TABLE "nutrition_foods" ADD COLUMN IF NOT EXISTS "catalog_territory" text;
ALTER TABLE "nutrition_foods" ADD COLUMN IF NOT EXISTS "catalog_imported_at" timestamp;
ALTER TABLE "nutrition_foods" ADD COLUMN IF NOT EXISTS "catalog_source_modified" boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS "nutrition_foods_user_catalog_item_unique_idx" ON "nutrition_foods" ("user_id", "catalog_provider_id", "catalog_external_id", "catalog_dataset_version", "catalog_item_version");

ALTER TABLE "ingredient_scans" ADD COLUMN IF NOT EXISTS "catalog_provider_id" text;
ALTER TABLE "ingredient_scans" ADD COLUMN IF NOT EXISTS "catalog_external_id" text;
ALTER TABLE "ingredient_scans" ADD COLUMN IF NOT EXISTS "catalog_dataset_version" text;
ALTER TABLE "ingredient_scans" ADD COLUMN IF NOT EXISTS "catalog_item_version" text;
ALTER TABLE "ingredient_scans" ADD COLUMN IF NOT EXISTS "catalog_attribution_text" text;
ALTER TABLE "ingredient_scans" ADD COLUMN IF NOT EXISTS "catalog_attribution_url" text;
ALTER TABLE "ingredient_scans" ADD COLUMN IF NOT EXISTS "catalog_territory" text;
ALTER TABLE "ingredient_scans" ADD COLUMN IF NOT EXISTS "catalog_source_modified" boolean NOT NULL DEFAULT false;
