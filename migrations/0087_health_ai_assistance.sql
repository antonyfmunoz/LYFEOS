CREATE TABLE IF NOT EXISTS "health_ai_requests" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "series_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "period_days" integer NOT NULL,
  "source_summary" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "provider" text NOT NULL DEFAULT 'none',
  "model" text,
  "state" text NOT NULL DEFAULT 'started',
  "boundary_kind" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "completed_at" timestamp,
  CONSTRAINT "health_ai_requests_state_valid" CHECK ("state" IN ('started', 'succeeded', 'blocked', 'failed')),
  CONSTRAINT "health_ai_requests_period_valid" CHECK ("period_days" IN (7, 30, 90))
);
CREATE INDEX IF NOT EXISTS "health_ai_requests_user_created_idx" ON "health_ai_requests" ("user_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "health_ai_drafts" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "request_id" integer NOT NULL REFERENCES "health_ai_requests"("id") ON DELETE cascade,
  "title" text NOT NULL,
  "reflection" text NOT NULL,
  "domains" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "next_experiment" text,
  "state" text NOT NULL DEFAULT 'pending',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "decided_at" timestamp,
  CONSTRAINT "health_ai_drafts_request_unique_idx" UNIQUE ("request_id"),
  CONSTRAINT "health_ai_drafts_state_valid" CHECK ("state" IN ('pending', 'saved', 'rejected')),
  CONSTRAINT "health_ai_drafts_domains_valid" CHECK (jsonb_typeof("domains") = 'array' AND jsonb_array_length("domains") BETWEEN 1 AND 8)
);
CREATE INDEX IF NOT EXISTS "health_ai_drafts_user_state_created_idx" ON "health_ai_drafts" ("user_id", "state", "created_at" DESC);
