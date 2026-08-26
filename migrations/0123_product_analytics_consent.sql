CREATE TABLE IF NOT EXISTS "product_analytics_consents" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "subject_id" uuid NOT NULL,
  "state" text NOT NULL,
  "policy_version" text NOT NULL,
  "source" text NOT NULL DEFAULT 'profile_settings',
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "product_analytics_consents_state_valid" CHECK ("state" IN ('enabled', 'revoked')),
  CONSTRAINT "product_analytics_consents_source_valid" CHECK ("source" IN ('profile_settings', 'account_deletion'))
);

CREATE INDEX IF NOT EXISTS "product_analytics_consents_user_created_idx"
  ON "product_analytics_consents" ("user_id", "id" DESC);

CREATE TABLE IF NOT EXISTS "product_analytics_deletion_queue" (
  "id" serial PRIMARY KEY,
  "subject_id" uuid NOT NULL UNIQUE,
  "requested_at" timestamp NOT NULL DEFAULT now(),
  "attempts" integer NOT NULL DEFAULT 0,
  "last_attempt_at" timestamp,
  "last_error" text,
  "completed_at" timestamp,
  CONSTRAINT "product_analytics_deletion_queue_attempts_valid" CHECK ("attempts" >= 0)
);

CREATE INDEX IF NOT EXISTS "product_analytics_deletion_queue_pending_idx"
  ON "product_analytics_deletion_queue" ("requested_at", "id")
  WHERE "completed_at" IS NULL;
