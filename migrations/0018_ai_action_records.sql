CREATE TABLE IF NOT EXISTS "ai_action_records" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "tool_name" text NOT NULL,
  "risk" text NOT NULL DEFAULT 'low',
  "state" text NOT NULL DEFAULT 'started',
  "input_summary" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "outcome_summary" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "completed_at" timestamp
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_action_records_user_created_idx" ON "ai_action_records" ("user_id", "created_at");
