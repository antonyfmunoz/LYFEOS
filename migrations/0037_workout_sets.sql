-- Preserve the original aggregate exercise fields for backwards compatibility,
-- while recording newly logged work at the individual-set level. A set is a
-- factual attempt, not a prescribed target or a claim about capability.
CREATE TABLE IF NOT EXISTS "workout_sets" (
  "id" serial PRIMARY KEY NOT NULL,
  "workout_exercise_id" integer NOT NULL REFERENCES "workout_exercises"("id") ON DELETE cascade,
  "set_order" integer NOT NULL DEFAULT 0,
  "reps" integer,
  "load_value" real,
  "load_unit" text,
  "distance_meters" real,
  "duration_seconds" integer,
  "perceived_exertion" integer,
  "reps_in_reserve" integer,
  "completed" boolean NOT NULL DEFAULT true,
  "note" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "workout_sets_reps_positive" CHECK ("reps" IS NULL OR "reps" > 0),
  CONSTRAINT "workout_sets_load_positive" CHECK ("load_value" IS NULL OR "load_value" > 0),
  CONSTRAINT "workout_sets_distance_positive" CHECK ("distance_meters" IS NULL OR "distance_meters" > 0),
  CONSTRAINT "workout_sets_duration_positive" CHECK ("duration_seconds" IS NULL OR "duration_seconds" > 0),
  CONSTRAINT "workout_sets_rpe_range" CHECK ("perceived_exertion" IS NULL OR "perceived_exertion" BETWEEN 1 AND 10),
  CONSTRAINT "workout_sets_rir_range" CHECK ("reps_in_reserve" IS NULL OR "reps_in_reserve" BETWEEN 0 AND 20)
);
CREATE UNIQUE INDEX IF NOT EXISTS "workout_sets_exercise_order_unique_idx" ON "workout_sets" ("workout_exercise_id", "set_order");
