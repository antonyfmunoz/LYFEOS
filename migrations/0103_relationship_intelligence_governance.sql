ALTER TABLE "personal_relationships" ADD COLUMN IF NOT EXISTS "ecosystem_id" uuid DEFAULT gen_random_uuid();
UPDATE "personal_relationships" SET "ecosystem_id" = gen_random_uuid() WHERE "ecosystem_id" IS NULL;
ALTER TABLE "personal_relationships" ALTER COLUMN "ecosystem_id" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "personal_relationships_ecosystem_id_unique" ON "personal_relationships" ("ecosystem_id");

ALTER TABLE "relationship_interactions" ADD COLUMN IF NOT EXISTS "structured_data" jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS "relationship_assessments" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "relationship_id" integer NOT NULL REFERENCES "personal_relationships"("id") ON DELETE cascade,
  "assessment_kind" text NOT NULL DEFAULT 'periodic',
  "dimensions" jsonb NOT NULL,
  "reflection" text,
  "occurred_at" timestamp NOT NULL DEFAULT now(),
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "relationship_assessment_kind_valid" CHECK ("assessment_kind" IN ('baseline','periodic','transition'))
);
CREATE INDEX IF NOT EXISTS "relationship_assessments_relationship_occurred_idx" ON "relationship_assessments" ("relationship_id", "occurred_at");

CREATE TABLE IF NOT EXISTS "relationship_governance_consents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "relationship_id" integer NOT NULL REFERENCES "personal_relationships"("id") ON DELETE cascade,
  "purpose" text NOT NULL,
  "allowed_scopes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "allowed_destinations" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "disclosure_version" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "revoked_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "relationship_consent_purpose_valid" CHECK ("purpose" IN ('ai_recommendation','ecosystem_share')),
  CONSTRAINT "relationship_consent_expiry_valid" CHECK ("expires_at" > "created_at")
);
CREATE INDEX IF NOT EXISTS "relationship_governance_consents_user_relationship_idx" ON "relationship_governance_consents" ("user_id", "relationship_id", "purpose");

CREATE TABLE IF NOT EXISTS "relationship_ai_recommendations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "relationship_id" integer NOT NULL REFERENCES "personal_relationships"("id") ON DELETE cascade,
  "consent_id" uuid NOT NULL REFERENCES "relationship_governance_consents"("id") ON DELETE restrict,
  "model" text NOT NULL,
  "source_manifest" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "recommendations" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "disclosure" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "relationship_ai_recommendations_relationship_created_idx" ON "relationship_ai_recommendations" ("relationship_id", "created_at");

CREATE TABLE IF NOT EXISTS "relationship_governance_audit" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "relationship_id" integer NOT NULL REFERENCES "personal_relationships"("id") ON DELETE cascade,
  "consent_id" uuid REFERENCES "relationship_governance_consents"("id") ON DELETE set null,
  "action" text NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "relationship_governance_audit_user_created_idx" ON "relationship_governance_audit" ("user_id", "created_at");
