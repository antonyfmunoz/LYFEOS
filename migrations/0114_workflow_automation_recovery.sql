ALTER TABLE "workflow_automations" ADD COLUMN IF NOT EXISTS "consecutive_failures" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "workflow_automations" ADD COLUMN IF NOT EXISTS "paused_at" timestamp;
--> statement-breakpoint
ALTER TABLE "workflow_automations" ADD COLUMN IF NOT EXISTS "pause_reason" text;
--> statement-breakpoint
ALTER TABLE "workflow_automation_runs" ADD COLUMN IF NOT EXISTS "definition_snapshot" jsonb;
--> statement-breakpoint
UPDATE "workflow_automation_runs" AS "run"
SET "definition_snapshot" = "automation"."definition"
FROM "workflow_automations" AS "automation"
WHERE "run"."automation_id" = "automation"."id" AND "run"."definition_snapshot" IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_automation_action_receipts" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "run_id" integer NOT NULL REFERENCES "workflow_automation_runs"("id") ON DELETE cascade,
  "action_index" integer NOT NULL,
  "action_type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'running',
  "expected_quest_revision" integer,
  "target_quest_id" integer REFERENCES "quests"("id") ON DELETE set null,
  "attempt_count" integer NOT NULL DEFAULT 1,
  "last_error_code" text,
  "claimed_at" timestamp NOT NULL DEFAULT now(),
  "completed_at" timestamp,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "workflow_automation_action_receipts_index_valid" CHECK ("action_index" >= 0 AND "action_index" < 3),
  CONSTRAINT "workflow_automation_action_receipts_revision_positive" CHECK ("expected_quest_revision" IS NULL OR "expected_quest_revision" > 0),
  CONSTRAINT "workflow_automation_action_receipts_attempt_positive" CHECK ("attempt_count" > 0),
  CONSTRAINT "workflow_automation_action_receipts_status_valid" CHECK ("status" IN ('running','succeeded','failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_automation_action_receipts_run_action_unique_idx" ON "workflow_automation_action_receipts" ("run_id", "action_index");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_automation_action_receipts_user_status_idx" ON "workflow_automation_action_receipts" ("user_id", "status", "updated_at");
