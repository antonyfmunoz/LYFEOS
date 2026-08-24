ALTER TABLE "body_measurements" ADD COLUMN IF NOT EXISTS "client_mutation_id" text;
ALTER TABLE "body_measurements" ADD COLUMN IF NOT EXISTS "mutation_payload_hash" text;
ALTER TABLE "hydration_entries" ADD COLUMN IF NOT EXISTS "client_mutation_id" text;
ALTER TABLE "hydration_entries" ADD COLUMN IF NOT EXISTS "mutation_payload_hash" text;
ALTER TABLE "supplement_entries" ADD COLUMN IF NOT EXISTS "client_mutation_id" text;
ALTER TABLE "supplement_entries" ADD COLUMN IF NOT EXISTS "mutation_payload_hash" text;
ALTER TABLE "health_observations" ADD COLUMN IF NOT EXISTS "client_mutation_id" text;
ALTER TABLE "health_observations" ADD COLUMN IF NOT EXISTS "mutation_payload_hash" text;

CREATE UNIQUE INDEX IF NOT EXISTS "body_measurements_user_mutation_unique_idx" ON "body_measurements" ("user_id", "client_mutation_id") WHERE "client_mutation_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "hydration_entries_user_mutation_unique_idx" ON "hydration_entries" ("user_id", "client_mutation_id") WHERE "client_mutation_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "supplement_entries_user_mutation_unique_idx" ON "supplement_entries" ("user_id", "client_mutation_id") WHERE "client_mutation_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "health_observations_user_mutation_unique_idx" ON "health_observations" ("user_id", "client_mutation_id") WHERE "client_mutation_id" IS NOT NULL;
