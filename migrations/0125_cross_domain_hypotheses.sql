CREATE TABLE IF NOT EXISTS "hypothesis_domain_consents" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "domain" text NOT NULL,
  "state" text NOT NULL,
  "policy_version" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "hypothesis_domain_consents_domain_valid" CHECK ("domain" IN ('missions', 'daily_state', 'health')),
  CONSTRAINT "hypothesis_domain_consents_state_valid" CHECK ("state" IN ('enabled', 'revoked'))
);
CREATE INDEX IF NOT EXISTS "hypothesis_domain_consents_user_domain_created_idx"
  ON "hypothesis_domain_consents" ("user_id", "domain", "id" DESC);

CREATE TABLE IF NOT EXISTS "cross_domain_hypotheses" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "title" text NOT NULL,
  "left_signal_id" text NOT NULL,
  "right_signal_id" text NOT NULL,
  "period_days" integer NOT NULL,
  "lag_days" integer NOT NULL DEFAULT 0,
  "time_zone" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "revision" integer NOT NULL DEFAULT 1,
  "calculation_state" text NOT NULL DEFAULT 'idle',
  "last_error_code" text,
  "next_calculation_at" timestamp NOT NULL DEFAULT now(),
  "last_calculated_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "cross_domain_hypotheses_title_valid" CHECK (char_length("title") BETWEEN 3 AND 120),
  CONSTRAINT "cross_domain_hypotheses_signals_different" CHECK ("left_signal_id" <> "right_signal_id"),
  CONSTRAINT "cross_domain_hypotheses_period_valid" CHECK ("period_days" IN (14, 30, 60, 90, 180, 365)),
  CONSTRAINT "cross_domain_hypotheses_lag_valid" CHECK ("lag_days" BETWEEN -14 AND 14),
  CONSTRAINT "cross_domain_hypotheses_status_valid" CHECK ("status" IN ('active', 'paused')),
  CONSTRAINT "cross_domain_hypotheses_calculation_state_valid" CHECK ("calculation_state" IN ('idle', 'running', 'failed')),
  CONSTRAINT "cross_domain_hypotheses_revision_valid" CHECK ("revision" > 0)
);
CREATE INDEX IF NOT EXISTS "cross_domain_hypotheses_user_updated_idx"
  ON "cross_domain_hypotheses" ("user_id", "updated_at" DESC);
CREATE INDEX IF NOT EXISTS "cross_domain_hypotheses_due_idx"
  ON "cross_domain_hypotheses" ("next_calculation_at", "id") WHERE "status" = 'active';

CREATE TABLE IF NOT EXISTS "cross_domain_hypothesis_snapshots" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "hypothesis_id" integer NOT NULL REFERENCES "cross_domain_hypotheses"("id") ON DELETE cascade,
  "definition_revision" integer NOT NULL,
  "calculation_version" text NOT NULL,
  "evidence_start" date NOT NULL,
  "evidence_end" date NOT NULL,
  "result" jsonb NOT NULL,
  "left_quality" jsonb NOT NULL,
  "right_quality" jsonb NOT NULL,
  "data_fingerprint" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "cross_domain_hypothesis_snapshots_revision_valid" CHECK ("definition_revision" > 0),
  CONSTRAINT "cross_domain_hypothesis_snapshots_window_valid" CHECK ("evidence_end" >= "evidence_start"),
  CONSTRAINT "cross_domain_hypothesis_snapshots_fingerprint_unique" UNIQUE ("hypothesis_id", "definition_revision", "evidence_end", "data_fingerprint")
);
CREATE INDEX IF NOT EXISTS "cross_domain_hypothesis_snapshots_user_hypothesis_created_idx"
  ON "cross_domain_hypothesis_snapshots" ("user_id", "hypothesis_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "cross_domain_hypothesis_interpretations" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "hypothesis_id" integer NOT NULL REFERENCES "cross_domain_hypotheses"("id") ON DELETE cascade,
  "snapshot_id" integer NOT NULL REFERENCES "cross_domain_hypothesis_snapshots"("id") ON DELETE cascade,
  "interpretation" text NOT NULL,
  "note" text,
  "acknowledged_exploratory" boolean NOT NULL DEFAULT false,
  "client_mutation_id" text NOT NULL,
  "mutation_payload_hash" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "cross_domain_hypothesis_interpretations_choice_valid" CHECK ("interpretation" IN ('worth_revisiting', 'needs_more_context', 'not_meaningful_to_me')),
  CONSTRAINT "cross_domain_hypothesis_interpretations_note_valid" CHECK ("note" IS NULL OR char_length("note") <= 2000),
  CONSTRAINT "cross_domain_hypothesis_interpretations_ack_valid" CHECK ("acknowledged_exploratory" = true),
  CONSTRAINT "cross_domain_hypothesis_interpretations_user_mutation_unique" UNIQUE ("user_id", "client_mutation_id")
);
CREATE INDEX IF NOT EXISTS "cross_domain_hypothesis_interpretations_user_hypothesis_created_idx"
  ON "cross_domain_hypothesis_interpretations" ("user_id", "hypothesis_id", "created_at" DESC);
