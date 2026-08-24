ALTER TABLE "sleep_sessions" ADD COLUMN IF NOT EXISTS "client_mutation_id" text;
ALTER TABLE "sleep_sessions" ADD COLUMN IF NOT EXISTS "mutation_payload_hash" text;
ALTER TABLE "recovery_activities" ADD COLUMN IF NOT EXISTS "client_mutation_id" text;
ALTER TABLE "recovery_activities" ADD COLUMN IF NOT EXISTS "mutation_payload_hash" text;

CREATE UNIQUE INDEX IF NOT EXISTS "sleep_sessions_user_mutation_unique_idx"
  ON "sleep_sessions" ("user_id", "client_mutation_id") WHERE "client_mutation_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "recovery_activities_user_mutation_unique_idx"
  ON "recovery_activities" ("user_id", "client_mutation_id") WHERE "client_mutation_id" IS NOT NULL;
