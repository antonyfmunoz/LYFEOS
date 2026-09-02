CREATE TABLE IF NOT EXISTS "grocery_pantry_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "brand" text,
  "barcode" text,
  "quantity" real NOT NULL DEFAULT 1,
  "unit" text NOT NULL DEFAULT 'item',
  "reorder_at" real,
  "location" text,
  "expires_on" date,
  "purchased_on" date,
  "source" text NOT NULL DEFAULT 'manual',
  "catalog_provider_id" text,
  "catalog_external_id" text,
  "catalog_dataset_version" text,
  "catalog_attribution_text" text,
  "catalog_attribution_url" text,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "grocery_pantry_items_quantity_check" CHECK ("quantity" >= 0),
  CONSTRAINT "grocery_pantry_items_status_check" CHECK ("status" IN ('active', 'archived'))
);
CREATE INDEX IF NOT EXISTS "grocery_pantry_items_user_status_idx" ON "grocery_pantry_items" ("user_id", "status", "updated_at");
CREATE INDEX IF NOT EXISTS "grocery_pantry_items_user_barcode_idx" ON "grocery_pantry_items" ("user_id", "barcode");

CREATE TABLE IF NOT EXISTS "grocery_shopping_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "pantry_item_id" integer REFERENCES "grocery_pantry_items"("id") ON DELETE SET NULL,
  "name" text NOT NULL,
  "brand" text,
  "quantity" real NOT NULL DEFAULT 1,
  "unit" text NOT NULL DEFAULT 'item',
  "note" text,
  "status" text NOT NULL DEFAULT 'pending',
  "generated_by" text NOT NULL DEFAULT 'manual',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "grocery_shopping_items_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "grocery_shopping_items_status_check" CHECK ("status" IN ('pending', 'completed', 'archived'))
);
CREATE INDEX IF NOT EXISTS "grocery_shopping_items_user_status_idx" ON "grocery_shopping_items" ("user_id", "status", "updated_at");
CREATE INDEX IF NOT EXISTS "grocery_shopping_items_user_pantry_idx" ON "grocery_shopping_items" ("user_id", "pantry_item_id");
CREATE UNIQUE INDEX IF NOT EXISTS "grocery_shopping_items_pending_pantry_unique_idx" ON "grocery_shopping_items" ("user_id", "pantry_item_id") WHERE "status" = 'pending' AND "pantry_item_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "grocery_receipt_drafts" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "source_text" text NOT NULL,
  "parsed_items" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" text NOT NULL DEFAULT 'draft',
  "applied_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "grocery_receipt_drafts_status_check" CHECK ("status" IN ('draft', 'applied', 'discarded'))
);
CREATE INDEX IF NOT EXISTS "grocery_receipt_drafts_user_created_idx" ON "grocery_receipt_drafts" ("user_id", "created_at");

CREATE TABLE IF NOT EXISTS "brand_ownership_research_reports" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "brand" text NOT NULL,
  "barcode" text,
  "report_type" text NOT NULL,
  "note" text,
  "evidence_url" text,
  "status" text NOT NULL DEFAULT 'received',
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "brand_ownership_research_reports_type_check" CHECK ("report_type" IN ('missing_brand', 'correction', 'new_source')),
  CONSTRAINT "brand_ownership_research_reports_status_check" CHECK ("status" IN ('received', 'under_review', 'resolved', 'rejected'))
);
CREATE INDEX IF NOT EXISTS "brand_ownership_research_reports_user_created_idx" ON "brand_ownership_research_reports" ("user_id", "created_at");
