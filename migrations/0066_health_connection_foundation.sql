CREATE TABLE IF NOT EXISTS "health_connections" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "provider" text NOT NULL,
  "provider_name" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "scopes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "consent_version" text NOT NULL,
  "consented_at" timestamp NOT NULL DEFAULT now(),
  "credential_ref" text,
  "last_sync_at" timestamp,
  "last_error_code" text,
  "revoked_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "health_connections_status_valid" CHECK ("status" IN ('pending', 'active', 'paused', 'error', 'revoked'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "health_connections_user_provider_unique_idx" ON "health_connections" ("user_id", "provider");
CREATE INDEX IF NOT EXISTS "health_connections_user_status_idx" ON "health_connections" ("user_id", "status");

CREATE TABLE IF NOT EXISTS "health_sync_cursors" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "connection_id" integer NOT NULL REFERENCES "health_connections"("id") ON DELETE cascade,
  "resource_type" text NOT NULL,
  "cursor_value" text,
  "status" text NOT NULL DEFAULT 'idle',
  "consecutive_failures" integer NOT NULL DEFAULT 0,
  "last_attempt_at" timestamp,
  "last_success_at" timestamp,
  "next_retry_at" timestamp,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "health_sync_cursors_status_valid" CHECK ("status" IN ('idle', 'syncing', 'retry_wait', 'paused', 'revoked'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "health_sync_cursors_connection_resource_unique_idx" ON "health_sync_cursors" ("connection_id", "resource_type");
CREATE INDEX IF NOT EXISTS "health_sync_cursors_user_status_idx" ON "health_sync_cursors" ("user_id", "status");

CREATE TABLE IF NOT EXISTS "health_import_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "connection_id" integer NOT NULL REFERENCES "health_connections"("id") ON DELETE cascade,
  "provider" text NOT NULL,
  "resource_type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'running',
  "fetched_count" integer NOT NULL DEFAULT 0,
  "imported_count" integer NOT NULL DEFAULT 0,
  "replayed_count" integer NOT NULL DEFAULT 0,
  "corrected_count" integer NOT NULL DEFAULT 0,
  "suppressed_count" integer NOT NULL DEFAULT 0,
  "failed_count" integer NOT NULL DEFAULT 0,
  "error_code" text,
  "started_at" timestamp NOT NULL DEFAULT now(),
  "finished_at" timestamp,
  CONSTRAINT "health_import_runs_status_valid" CHECK ("status" IN ('running', 'succeeded', 'failed')),
  CONSTRAINT "health_import_runs_counts_nonnegative" CHECK ("fetched_count" >= 0 AND "imported_count" >= 0 AND "replayed_count" >= 0 AND "corrected_count" >= 0 AND "suppressed_count" >= 0 AND "failed_count" >= 0)
);
CREATE INDEX IF NOT EXISTS "health_import_runs_user_started_idx" ON "health_import_runs" ("user_id", "started_at");
CREATE INDEX IF NOT EXISTS "health_import_runs_connection_status_idx" ON "health_import_runs" ("connection_id", "status");

CREATE TABLE IF NOT EXISTS "health_import_failures" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "connection_id" integer NOT NULL REFERENCES "health_connections"("id") ON DELETE cascade,
  "run_id" integer NOT NULL REFERENCES "health_import_runs"("id") ON DELETE cascade,
  "provider" text NOT NULL,
  "resource_type" text NOT NULL,
  "error_code" text NOT NULL,
  "retryable" boolean NOT NULL DEFAULT true,
  "status" text NOT NULL DEFAULT 'retry_wait',
  "next_retry_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "resolved_at" timestamp,
  CONSTRAINT "health_import_failures_status_valid" CHECK ("status" IN ('retry_wait', 'resolved', 'abandoned'))
);
CREATE INDEX IF NOT EXISTS "health_import_failures_user_status_idx" ON "health_import_failures" ("user_id", "status");
CREATE INDEX IF NOT EXISTS "health_import_failures_run_idx" ON "health_import_failures" ("run_id");

CREATE TABLE IF NOT EXISTS "health_source_records" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "connection_id" integer NOT NULL REFERENCES "health_connections"("id") ON DELETE cascade,
  "provider" text NOT NULL,
  "source_record_id" text NOT NULL,
  "record_type" text NOT NULL,
  "observed_at" timestamp NOT NULL,
  "received_at" timestamp NOT NULL DEFAULT now(),
  "payload_fingerprint" text NOT NULL,
  "transform_version" text NOT NULL,
  "state" text NOT NULL DEFAULT 'active',
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "source_metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "health_source_records_state_valid" CHECK ("state" IN ('active', 'superseded', 'deleted'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "health_source_records_user_provider_record_fingerprint_unique_idx" ON "health_source_records" ("user_id", "provider", "source_record_id", "payload_fingerprint");
CREATE INDEX IF NOT EXISTS "health_source_records_user_observed_idx" ON "health_source_records" ("user_id", "observed_at");

CREATE TABLE IF NOT EXISTS "health_source_suppressions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "connection_id" integer NOT NULL REFERENCES "health_connections"("id") ON DELETE cascade,
  "provider" text NOT NULL,
  "source_record_key_hash" text NOT NULL,
  "reason" text NOT NULL DEFAULT 'user_deleted',
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "health_source_suppressions_reason_valid" CHECK ("reason" IN ('user_deleted'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "health_source_suppressions_user_provider_key_unique_idx" ON "health_source_suppressions" ("user_id", "provider", "source_record_key_hash");

CREATE TABLE IF NOT EXISTS "health_source_preferences" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "metric_key" text NOT NULL,
  "ordered_sources" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "health_source_preferences_user_metric_unique_idx" ON "health_source_preferences" ("user_id", "metric_key");

CREATE TABLE IF NOT EXISTS "health_connection_audits" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "connection_id" integer REFERENCES "health_connections"("id") ON DELETE set null,
  "provider" text NOT NULL,
  "action" text NOT NULL,
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "health_connection_audits_action_valid" CHECK ("action" IN ('consent_intent_created', 'paused', 'resumed', 'retry_requested', 'revoked', 'cancelled', 'imports_deleted', 'source_priority_updated'))
);
CREATE INDEX IF NOT EXISTS "health_connection_audits_user_created_idx" ON "health_connection_audits" ("user_id", "created_at");
