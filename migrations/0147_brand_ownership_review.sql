ALTER TABLE "brand_ownership_research_reports"
  ADD COLUMN IF NOT EXISTS "reviewer_access_granted" boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "ownership_review_grants" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "revoked_at" timestamp,
  CONSTRAINT "ownership_review_grants_status_check" CHECK ("status" IN ('active', 'revoked'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "ownership_review_grants_user_unique_idx" ON "ownership_review_grants" ("user_id");
CREATE INDEX IF NOT EXISTS "ownership_review_grants_status_idx" ON "ownership_review_grants" ("status");

CREATE TABLE IF NOT EXISTS "brand_ownership_registry_entries" (
  "id" serial PRIMARY KEY NOT NULL,
  "canonical_key" text NOT NULL,
  "profile" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "revision" integer NOT NULL DEFAULT 1,
  "source_report_id" integer REFERENCES "brand_ownership_research_reports"("id") ON DELETE SET NULL,
  "reviewed_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "review_note" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "brand_ownership_registry_entries_status_check" CHECK ("status" IN ('active', 'revoked'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "brand_ownership_registry_entries_key_unique_idx" ON "brand_ownership_registry_entries" ("canonical_key");
CREATE INDEX IF NOT EXISTS "brand_ownership_registry_entries_status_updated_idx" ON "brand_ownership_registry_entries" ("status", "updated_at");

CREATE TABLE IF NOT EXISTS "brand_ownership_registry_lookup_keys" (
  "normalized_key" text PRIMARY KEY NOT NULL,
  "entry_id" integer NOT NULL REFERENCES "brand_ownership_registry_entries"("id") ON DELETE CASCADE,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "brand_ownership_registry_lookup_keys_entry_idx" ON "brand_ownership_registry_lookup_keys" ("entry_id");

CREATE TABLE IF NOT EXISTS "brand_ownership_registry_revisions" (
  "id" serial PRIMARY KEY NOT NULL,
  "entry_id" integer NOT NULL REFERENCES "brand_ownership_registry_entries"("id") ON DELETE CASCADE,
  "revision" integer NOT NULL,
  "profile" jsonb NOT NULL,
  "status" text NOT NULL,
  "source_report_id" integer REFERENCES "brand_ownership_research_reports"("id") ON DELETE SET NULL,
  "reviewed_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "reason" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "brand_ownership_registry_revisions_status_check" CHECK ("status" IN ('active', 'revoked')),
  CONSTRAINT "brand_ownership_registry_revisions_entry_revision_unique" UNIQUE ("entry_id", "revision")
);
