CREATE TABLE IF NOT EXISTS "ai_execution_preferences" (
  "user_id" integer PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "execution_mode" text NOT NULL DEFAULT 'cloud',
  "preferred_provider" text NOT NULL DEFAULT 'anthropic',
  "cloud_fallback_enabled" boolean NOT NULL DEFAULT false,
  "revision" integer NOT NULL DEFAULT 1,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "ai_execution_preferences_mode_valid" CHECK ("execution_mode" IN ('local','hybrid','cloud')),
  CONSTRAINT "ai_execution_preferences_provider_valid" CHECK ("preferred_provider" IN ('self_hosted','anthropic')),
  CONSTRAINT "ai_execution_preferences_revision_valid" CHECK ("revision" > 0),
  CONSTRAINT "ai_execution_preferences_fallback_valid" CHECK ("execution_mode" = 'hybrid' OR "cloud_fallback_enabled" = false)
);

ALTER TABLE "ai_orchestration_runs" ADD COLUMN IF NOT EXISTS "execution_mode" text NOT NULL DEFAULT 'cloud';
ALTER TABLE "ai_orchestration_runs" ADD COLUMN IF NOT EXISTS "provider_preference" text NOT NULL DEFAULT 'anthropic';
ALTER TABLE "ai_orchestration_runs" ADD COLUMN IF NOT EXISTS "cloud_fallback_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "ai_orchestration_runs" ADD COLUMN IF NOT EXISTS "provider_resolution" jsonb NOT NULL DEFAULT '{}'::jsonb;
DO $$ BEGIN ALTER TABLE "ai_orchestration_runs" ADD CONSTRAINT "ai_orchestration_runs_execution_mode_valid" CHECK ("execution_mode" IN ('local','hybrid','cloud')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ai_orchestration_runs" ADD CONSTRAINT "ai_orchestration_runs_provider_preference_valid" CHECK ("provider_preference" IN ('self_hosted','anthropic')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ai_orchestration_runs" ADD CONSTRAINT "ai_orchestration_runs_fallback_valid" CHECK ("execution_mode" = 'hybrid' OR "cloud_fallback_enabled" = false); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "extension_publishers" (
  "key_id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "public_key_pem" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "revoked_at" timestamp,
  CONSTRAINT "extension_publishers_key_id_valid" CHECK ("key_id" ~ '^[a-z0-9][a-z0-9._-]{2,79}$'),
  CONSTRAINT "extension_publishers_name_valid" CHECK (char_length("name") BETWEEN 2 AND 100),
  CONSTRAINT "extension_publishers_status_valid" CHECK ("status" IN ('active','revoked'))
);

CREATE TABLE IF NOT EXISTS "extension_packages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL,
  "version" text NOT NULL,
  "display_name" text NOT NULL,
  "description" text NOT NULL,
  "manifest" jsonb NOT NULL,
  "manifest_digest" text NOT NULL,
  "publisher_key_id" text NOT NULL REFERENCES "extension_publishers"("key_id") ON DELETE RESTRICT,
  "signature" text NOT NULL,
  "status" text NOT NULL DEFAULT 'published',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "revoked_at" timestamp,
  CONSTRAINT "extension_packages_slug_version_unique" UNIQUE ("slug", "version"),
  CONSTRAINT "extension_packages_slug_valid" CHECK ("slug" ~ '^[a-z0-9][a-z0-9-]{2,63}$'),
  CONSTRAINT "extension_packages_version_valid" CHECK ("version" ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  CONSTRAINT "extension_packages_display_name_valid" CHECK (char_length("display_name") BETWEEN 2 AND 100),
  CONSTRAINT "extension_packages_description_valid" CHECK (char_length("description") BETWEEN 3 AND 500),
  CONSTRAINT "extension_packages_digest_valid" CHECK ("manifest_digest" ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT "extension_packages_status_valid" CHECK ("status" IN ('published','revoked'))
);
CREATE INDEX IF NOT EXISTS "extension_packages_status_slug_idx" ON "extension_packages" ("status", "slug", "created_at");

CREATE TABLE IF NOT EXISTS "extension_installations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "package_id" uuid NOT NULL REFERENCES "extension_packages"("id") ON DELETE RESTRICT,
  "extension_slug" text NOT NULL,
  "granted_permissions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" text NOT NULL DEFAULT 'enabled',
  "revision" integer NOT NULL DEFAULT 1,
  "installed_at" timestamp NOT NULL DEFAULT now(),
  "revoked_at" timestamp,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "extension_installations_user_package_unique" UNIQUE ("user_id", "package_id"),
  CONSTRAINT "extension_installations_status_valid" CHECK ("status" IN ('enabled','revoked')),
  CONSTRAINT "extension_installations_revision_valid" CHECK ("revision" > 0)
);
CREATE INDEX IF NOT EXISTS "extension_installations_user_status_idx" ON "extension_installations" ("user_id", "status", "updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "extension_installations_user_active_slug_unique_idx" ON "extension_installations" ("user_id", "extension_slug") WHERE "status" = 'enabled';

CREATE TABLE IF NOT EXISTS "extension_audit_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer REFERENCES "users"("id") ON DELETE CASCADE,
  "package_id" uuid REFERENCES "extension_packages"("id") ON DELETE SET NULL,
  "action" text NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "extension_audit_events_user_created_idx" ON "extension_audit_events" ("user_id", "created_at");
