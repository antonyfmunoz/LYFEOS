ALTER TABLE "workspace_forms" ADD COLUMN IF NOT EXISTS "definition" jsonb;

UPDATE "workspace_forms"
SET "definition" = jsonb_build_object(
  'version', 1,
  'sections', jsonb_build_array(jsonb_build_object('id', 'main', 'title', 'Response details', 'description', NULL, 'fieldIds', "field_ids")),
  'conditions', '[]'::jsonb
)
WHERE "definition" IS NULL;

ALTER TABLE "workspace_forms" ALTER COLUMN "definition" SET NOT NULL;

CREATE TABLE IF NOT EXISTS "workspace_form_access_grants" (
  "id" serial PRIMARY KEY NOT NULL,
  "public_id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "form_id" integer NOT NULL REFERENCES "workspace_forms"("id") ON DELETE cascade,
  "label" text NOT NULL,
  "token_hash" text NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "expires_at" timestamp NOT NULL,
  "max_submissions" integer NOT NULL,
  "submission_count" integer NOT NULL DEFAULT 0,
  "last_used_at" timestamp,
  "revoked_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_form_access_grants_public_unique" UNIQUE ("public_id"),
  CONSTRAINT "workspace_form_access_grants_token_unique" UNIQUE ("token_hash"),
  CONSTRAINT "workspace_form_access_grants_max_positive" CHECK ("max_submissions" > 0 AND "max_submissions" <= 10000),
  CONSTRAINT "workspace_form_access_grants_count_valid" CHECK ("submission_count" >= 0 AND "submission_count" <= "max_submissions")
);
CREATE INDEX IF NOT EXISTS "workspace_form_access_grants_user_form_idx" ON "workspace_form_access_grants" ("user_id", "form_id");
CREATE INDEX IF NOT EXISTS "workspace_form_access_grants_public_idx" ON "workspace_form_access_grants" ("public_id");

CREATE TABLE IF NOT EXISTS "workspace_form_submission_receipts" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "form_id" integer NOT NULL REFERENCES "workspace_forms"("id") ON DELETE cascade,
  "grant_id" integer NOT NULL REFERENCES "workspace_form_access_grants"("id") ON DELETE cascade,
  "row_id" integer NOT NULL REFERENCES "workspace_database_rows"("id") ON DELETE cascade,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_form_submission_receipts_grant_row_unique_idx" UNIQUE ("grant_id", "row_id")
);
CREATE INDEX IF NOT EXISTS "workspace_form_submission_receipts_user_form_idx" ON "workspace_form_submission_receipts" ("user_id", "form_id");
