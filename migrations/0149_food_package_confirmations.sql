-- A user confirmation is evidence of what they visually reviewed on one
-- current package. It is never a certification issued by LyfeOS, and image/OCR
-- material is deliberately not retained.
CREATE TABLE IF NOT EXISTS "food_package_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "product_key" text NOT NULL,
  "barcode" text NOT NULL,
  "product_name" text NOT NULL,
  "brand" text,
  "catalog_provider_id" text NOT NULL,
  "catalog_external_id" text NOT NULL,
  "catalog_dataset_version" text NOT NULL,
  "catalog_item_version" text NOT NULL,
  "catalog_territory" text NOT NULL,
  "kind" text NOT NULL,
  "mark_key" text NOT NULL,
  "mark_label" text NOT NULL,
  "confirmation_method" text NOT NULL,
  "confirmed_at" timestamp NOT NULL DEFAULT now(),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "food_package_confirmations_user_product_mark_unique" UNIQUE ("user_id", "product_key", "kind", "mark_key")
);
CREATE INDEX IF NOT EXISTS "food_package_confirmations_user_barcode_confirmed_idx" ON "food_package_confirmations" ("user_id", "barcode", "confirmed_at");
