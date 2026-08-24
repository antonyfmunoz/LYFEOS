CREATE TABLE IF NOT EXISTS "workouts" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "activity_type" text NOT NULL,
  "duration_minutes" integer,
  "perceived_exertion" integer,
  "occurred_at" timestamp NOT NULL DEFAULT now(),
  "source" text NOT NULL DEFAULT 'manual',
  "note" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "workouts_duration_positive" CHECK ("duration_minutes" IS NULL OR "duration_minutes" > 0),
  CONSTRAINT "workouts_rpe_range" CHECK ("perceived_exertion" IS NULL OR "perceived_exertion" BETWEEN 1 AND 10)
);
CREATE INDEX IF NOT EXISTS "workouts_user_occurred_idx" ON "workouts" ("user_id", "occurred_at");

CREATE TABLE IF NOT EXISTS "workout_exercises" (
  "id" serial PRIMARY KEY NOT NULL,
  "workout_id" integer NOT NULL REFERENCES "workouts"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "sets" integer,
  "reps" integer,
  "load_value" real,
  "load_unit" text,
  "distance_meters" real,
  "duration_seconds" integer,
  "sort_order" integer NOT NULL DEFAULT 0,
  "note" text
);
