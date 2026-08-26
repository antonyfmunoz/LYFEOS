ALTER TABLE "workflow_automations" ADD COLUMN IF NOT EXISTS "schedule_next_run_at" timestamptz;
ALTER TABLE "workflow_automations" ADD COLUMN IF NOT EXISTS "schedule_last_scheduled_for" timestamptz;
ALTER TABLE "workflow_automations" ADD COLUMN IF NOT EXISTS "schedule_occurrences_run" integer NOT NULL DEFAULT 0;
ALTER TABLE "workflow_automations" ADD COLUMN IF NOT EXISTS "schedule_claimed_at" timestamptz;
ALTER TABLE "workflow_automation_runs" ADD COLUMN IF NOT EXISTS "trigger_context" jsonb;

ALTER TABLE "workflow_automations" DROP CONSTRAINT IF EXISTS "workflow_automations_schedule_occurrences_valid";
ALTER TABLE "workflow_automations" ADD CONSTRAINT "workflow_automations_schedule_occurrences_valid" CHECK ("schedule_occurrences_run" >= 0 AND "schedule_occurrences_run" <= 365);

CREATE INDEX IF NOT EXISTS "workflow_automations_schedule_due_idx"
  ON "workflow_automations" ("schedule_next_run_at", "id")
  WHERE "enabled" = true AND "schedule_next_run_at" IS NOT NULL;
