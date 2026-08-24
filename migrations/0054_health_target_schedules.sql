ALTER TABLE "health_targets" ADD COLUMN IF NOT EXISTS "weekdays" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "health_targets" ADD COLUMN IF NOT EXISTS "rationale" text;
ALTER TABLE "health_targets" ADD COLUMN IF NOT EXISTS "method_id" text;
ALTER TABLE "health_targets" ADD COLUMN IF NOT EXISTS "method_version" text;
