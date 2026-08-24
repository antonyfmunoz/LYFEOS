-- Ingredient review retains exactly what the person supplied and deliberately
-- separates it from any future evidence registry or product-catalog claim.
CREATE TABLE IF NOT EXISTS "ingredient_scans" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "capture_method" text NOT NULL DEFAULT 'manual_label',
  "barcode" text,
  "product_name" text,
  "raw_ingredients_text" text NOT NULL,
  "parse_version" text NOT NULL DEFAULT 'v1',
  "status" text NOT NULL DEFAULT 'reviewed',
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "ingredient_scans_capture_method_valid" CHECK ("capture_method" IN ('manual_label', 'barcode', 'photo_ocr')),
  CONSTRAINT "ingredient_scans_status_valid" CHECK ("status" IN ('reviewed', 'unresolved'))
);
CREATE INDEX IF NOT EXISTS "ingredient_scans_user_created_idx" ON "ingredient_scans" ("user_id", "created_at");

CREATE TABLE IF NOT EXISTS "ingredient_scan_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "scan_id" integer NOT NULL REFERENCES "ingredient_scans"("id") ON DELETE cascade,
  "raw_name" text NOT NULL,
  "normalized_key" text NOT NULL,
  "source_order" integer NOT NULL,
  "classification" text NOT NULL DEFAULT 'unknown',
  "reason" text,
  "evidence_title" text,
  "evidence_url" text,
  "evidence_strength" text NOT NULL DEFAULT 'unverified',
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "ingredient_scan_items_classification_valid" CHECK ("classification" IN ('unknown', 'label_fact', 'preference_match', 'regulatory_notice')),
  CONSTRAINT "ingredient_scan_items_evidence_strength_valid" CHECK ("evidence_strength" IN ('unverified', 'source_supplied', 'curated'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "ingredient_scan_items_scan_order_unique_idx" ON "ingredient_scan_items" ("scan_id", "source_order");
CREATE INDEX IF NOT EXISTS "ingredient_scan_items_user_normalized_idx" ON "ingredient_scan_items" ("user_id", "normalized_key");
