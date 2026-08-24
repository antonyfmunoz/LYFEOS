ALTER TABLE "ingredient_scans" ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL DEFAULT 1;
ALTER TABLE "ingredient_scans" ADD COLUMN IF NOT EXISTS "updated_at" timestamp NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS "ingredient_scans_user_barcode_idx" ON "ingredient_scans" ("user_id", "barcode");
