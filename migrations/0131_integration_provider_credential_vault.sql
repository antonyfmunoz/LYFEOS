ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "credential_ref" text;

CREATE TABLE IF NOT EXISTS "integration_provider_credentials" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "integration_id" integer NOT NULL REFERENCES "integrations"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "ciphertext" text NOT NULL,
  "iv" varchar(24) NOT NULL,
  "auth_tag" varchar(32) NOT NULL,
  "key_version" varchar(40) NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "integration_provider_credentials_integration_unique" UNIQUE ("integration_id")
);
CREATE INDEX IF NOT EXISTS "integration_provider_credentials_user_provider_idx" ON "integration_provider_credentials" ("user_id", "provider");

ALTER TABLE "health_connection_audits" DROP CONSTRAINT IF EXISTS "health_connection_audits_action_valid";
ALTER TABLE "health_connection_audits" ADD CONSTRAINT "health_connection_audits_action_valid" CHECK ("action" IN ('consent_intent_created', 'authorized', 'credential_rotated', 'provider_revoke_attempted', 'paused', 'resumed', 'retry_requested', 'revoked', 'cancelled', 'imports_deleted', 'source_priority_updated'));
