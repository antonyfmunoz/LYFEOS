CREATE TABLE IF NOT EXISTS "health_provider_credentials" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "connection_id" integer NOT NULL REFERENCES "health_connections"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "ciphertext" text NOT NULL,
  "iv" varchar(24) NOT NULL,
  "auth_tag" varchar(32) NOT NULL,
  "key_version" varchar(40) NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "health_provider_credentials_connection_unique" UNIQUE ("connection_id")
);
CREATE INDEX IF NOT EXISTS "health_provider_credentials_user_provider_idx" ON "health_provider_credentials" ("user_id", "provider");

ALTER TABLE "health_connection_audits" DROP CONSTRAINT IF EXISTS "health_connection_audits_action_valid";
ALTER TABLE "health_connection_audits" ADD CONSTRAINT "health_connection_audits_action_valid" CHECK ("action" IN ('consent_intent_created', 'authorized', 'credential_rotated', 'provider_revoke_attempted', 'paused', 'resumed', 'retry_requested', 'revoked', 'cancelled', 'imports_deleted', 'source_priority_updated'));
