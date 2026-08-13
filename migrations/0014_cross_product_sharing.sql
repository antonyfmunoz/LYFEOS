CREATE TABLE "cross_product_sharing_preferences" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "ecosystem_sharing_enabled" boolean NOT NULL DEFAULT false,
  "allowed_destinations" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "allowed_purposes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "consented_at" timestamp,
  "revoked_at" timestamp,
  "updated_at" timestamp NOT NULL DEFAULT now()
);
