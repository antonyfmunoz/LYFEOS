ALTER TABLE "hydration_entries" ADD COLUMN IF NOT EXISTS "input_quantity" real;
ALTER TABLE "hydration_entries" ADD COLUMN IF NOT EXISTS "input_unit" text;
ALTER TABLE "hydration_entries" ADD COLUMN IF NOT EXISTS "input_ml_per_unit" real;
UPDATE "hydration_entries" SET "input_quantity" = "volume_ml", "input_unit" = 'ml', "input_ml_per_unit" = 1 WHERE "input_quantity" IS NULL;

CREATE TABLE IF NOT EXISTS "recovery_routines" (
  "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "name" text NOT NULL, "activity_type" text NOT NULL, "custom_label" text, "duration_minutes" integer, "intensity" integer,
  "cadence" text NOT NULL DEFAULT 'daily', "weekdays" jsonb NOT NULL DEFAULT '[]'::jsonb, "time_of_day" text,
  "reminder_enabled" boolean NOT NULL DEFAULT false, "tags" jsonb NOT NULL DEFAULT '[]'::jsonb, "note" text,
  "active" boolean NOT NULL DEFAULT true, "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "recovery_routines_cadence_valid" CHECK ("cadence" IN ('daily', 'specific_days', 'as_needed'))
);
CREATE INDEX IF NOT EXISTS "recovery_routines_user_active_idx" ON "recovery_routines" ("user_id", "active");
ALTER TABLE "recovery_activities" ADD COLUMN IF NOT EXISTS "routine_id" integer REFERENCES "recovery_routines"("id") ON DELETE set null;

CREATE TABLE IF NOT EXISTS "health_metric_definitions" (
  "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "metric_key" text NOT NULL, "display_name" text NOT NULL, "category" text NOT NULL, "canonical_unit" text NOT NULL,
  "definition_source" text NOT NULL DEFAULT 'user', "source_url" text, "version" text NOT NULL, "valid_min" real, "valid_max" real,
  "active" boolean NOT NULL DEFAULT true, "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "health_metric_definitions_key_version_unique_idx" UNIQUE("user_id", "metric_key", "version")
);
CREATE INDEX IF NOT EXISTS "health_metric_definitions_user_active_idx" ON "health_metric_definitions" ("user_id", "active");
ALTER TABLE "health_observations" ADD COLUMN IF NOT EXISTS "metric_definition_id" integer REFERENCES "health_metric_definitions"("id") ON DELETE set null;
ALTER TABLE "health_observations" ADD COLUMN IF NOT EXISTS "definition_version" text;
ALTER TABLE "health_observations" ADD COLUMN IF NOT EXISTS "method_version" text;
ALTER TABLE "health_observations" ADD COLUMN IF NOT EXISTS "source_record_id" text;
ALTER TABLE "health_observations" ADD COLUMN IF NOT EXISTS "device_name" text;
ALTER TABLE "health_observations" ADD COLUMN IF NOT EXISTS "imported_at" timestamp;
CREATE UNIQUE INDEX IF NOT EXISTS "health_observations_user_source_record_unique_idx" ON "health_observations" ("user_id", "source", "source_record_id") WHERE "source_record_id" IS NOT NULL;
