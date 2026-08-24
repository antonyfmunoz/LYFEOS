ALTER TABLE "nutrition_diary_entries" ADD COLUMN IF NOT EXISTS "client_mutation_id" text;
ALTER TABLE "nutrition_diary_entries" ADD COLUMN IF NOT EXISTS "mutation_payload_hash" text;
ALTER TABLE "workouts" ADD COLUMN IF NOT EXISTS "client_mutation_id" text;
ALTER TABLE "workouts" ADD COLUMN IF NOT EXISTS "mutation_payload_hash" text;

CREATE TABLE IF NOT EXISTS "health_deletion_receipts" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "resource_type" text NOT NULL,
  "resource_snapshot" jsonb NOT NULL,
  "expires_at" timestamp NOT NULL,
  "restored_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "health_deletion_receipts_type_valid" CHECK ("resource_type" IN ('nutrition_diary_entry', 'workout'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "nutrition_diary_entries_user_mutation_unique_idx" ON "nutrition_diary_entries" ("user_id", "client_mutation_id") WHERE "client_mutation_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "workouts_user_mutation_unique_idx" ON "workouts" ("user_id", "client_mutation_id") WHERE "client_mutation_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "health_deletion_receipts_user_expiry_idx" ON "health_deletion_receipts" ("user_id", "expires_at");
