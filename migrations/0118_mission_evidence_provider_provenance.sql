CREATE TABLE IF NOT EXISTS "mission_evidence_provider_bindings" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "mission_evidence_id" integer NOT NULL REFERENCES "mission_evidence"("id") ON DELETE cascade,
  "provider_domain" text NOT NULL DEFAULT 'health',
  "provider_source_record_id" integer REFERENCES "health_source_records"("id") ON DELETE set null,
  "provider" text NOT NULL,
  "record_type" text NOT NULL,
  "observed_at" timestamp NOT NULL,
  "received_at" timestamp NOT NULL,
  "payload_fingerprint" text NOT NULL,
  "transform_version" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "mission_evidence_provider_bindings_domain_valid" CHECK ("provider_domain" = 'health')
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mission_evidence_provider_bindings_evidence_unique_idx" ON "mission_evidence_provider_bindings" ("mission_evidence_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mission_evidence_provider_bindings_user_created_idx" ON "mission_evidence_provider_bindings" ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mission_evidence_provider_bindings_source_idx" ON "mission_evidence_provider_bindings" ("provider_source_record_id");
