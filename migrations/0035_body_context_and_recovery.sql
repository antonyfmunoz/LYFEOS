ALTER TABLE "health_profiles" ADD COLUMN IF NOT EXISTS "body_type" text;
ALTER TABLE "health_profiles" ADD COLUMN IF NOT EXISTS "training_experience" text;

CREATE TABLE IF NOT EXISTS "recovery_activities" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "activity_type" text NOT NULL,
  "duration_minutes" integer,
  "perceived_effect" integer,
  "occurred_at" timestamp NOT NULL DEFAULT now(),
  "source" text NOT NULL DEFAULT 'manual',
  "note" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "recovery_activities_duration_positive" CHECK ("duration_minutes" IS NULL OR "duration_minutes" > 0),
  CONSTRAINT "recovery_activities_effect_range" CHECK ("perceived_effect" IS NULL OR "perceived_effect" BETWEEN 1 AND 5)
);
CREATE INDEX IF NOT EXISTS "recovery_activities_user_occurred_idx" ON "recovery_activities" ("user_id", "occurred_at");
