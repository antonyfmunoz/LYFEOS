CREATE TABLE IF NOT EXISTS "workout_heart_rate_samples" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "workout_id" integer NOT NULL REFERENCES "workouts"("id") ON DELETE cascade,
  "sampled_at" timestamp NOT NULL,
  "bpm" integer NOT NULL,
  "source" text NOT NULL,
  "device_name" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "workout_hr_samples_bpm_valid" CHECK ("bpm" BETWEEN 20 AND 260),
  CONSTRAINT "workout_hr_samples_source_valid" CHECK ("source" IN ('manual', 'transcribed_device', 'imported')),
  CONSTRAINT "workout_hr_samples_workout_time_source_unique_idx" UNIQUE ("workout_id", "sampled_at", "source")
);
CREATE INDEX IF NOT EXISTS "workout_hr_samples_user_workout_idx" ON "workout_heart_rate_samples" ("user_id", "workout_id", "sampled_at");
