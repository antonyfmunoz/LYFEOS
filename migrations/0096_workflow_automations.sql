CREATE TABLE IF NOT EXISTS "workflow_automations" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "description" text,
  "definition" jsonb NOT NULL,
  "enabled" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_automations_user_updated_idx" ON "workflow_automations" ("user_id", "updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_automations_user_enabled_idx" ON "workflow_automations" ("user_id", "enabled");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_automation_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "automation_id" integer REFERENCES "workflow_automations"("id") ON DELETE set null,
  "automation_name" text NOT NULL,
  "trigger_type" text NOT NULL,
  "trigger_quest_id" integer REFERENCES "quests"("id") ON DELETE set null,
  "idempotency_key" text NOT NULL,
  "status" text NOT NULL DEFAULT 'running',
  "action_results" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "error_code" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "completed_at" timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_automation_runs_user_automation_key_unique_idx" ON "workflow_automation_runs" ("user_id", "automation_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_automation_runs_user_created_idx" ON "workflow_automation_runs" ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_automation_runs_automation_created_idx" ON "workflow_automation_runs" ("automation_id", "created_at");
