CREATE TABLE IF NOT EXISTS "mission_contracts" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "quest_id" integer NOT NULL REFERENCES "quests"("id") ON DELETE cascade,
  "purpose" text NOT NULL,
  "expected_output" text NOT NULL,
  "capability_targets" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "prerequisites" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "required_evidence" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "review_mode" text NOT NULL DEFAULT 'self',
  "risk_level" text NOT NULL DEFAULT 'low',
  "stop_conditions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "escalation_path" text,
  "state" text NOT NULL DEFAULT 'draft',
  "progression_applied_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "mission_contracts_quest_unique_idx" UNIQUE("quest_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mission_contracts_user_state_idx" ON "mission_contracts" ("user_id", "state");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mission_evidence" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "mission_contract_id" integer NOT NULL REFERENCES "mission_contracts"("id") ON DELETE cascade,
  "source_type" text NOT NULL,
  "source_reference" text,
  "summary" text NOT NULL,
  "submitted_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mission_evidence_contract_submitted_idx" ON "mission_evidence" ("mission_contract_id", "submitted_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mission_reviews" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "mission_contract_id" integer NOT NULL REFERENCES "mission_contracts"("id") ON DELETE cascade,
  "reviewer_type" text NOT NULL DEFAULT 'self',
  "decision" text NOT NULL,
  "rubric" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "summary" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mission_reviews_contract_created_idx" ON "mission_reviews" ("mission_contract_id", "created_at");
