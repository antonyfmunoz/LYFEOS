CREATE TABLE IF NOT EXISTS "workout_revisions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "workout_id" integer NOT NULL REFERENCES "workouts"("id") ON DELETE cascade,
  "revision_number" integer NOT NULL,
  "snapshot" jsonb NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "workout_revisions_number_unique_idx" UNIQUE("workout_id", "revision_number")
);
CREATE INDEX IF NOT EXISTS "workout_revisions_user_idx" ON "workout_revisions" ("user_id", "workout_id");
INSERT INTO "workout_revisions" ("user_id", "workout_id", "revision_number", "snapshot")
SELECT workout."user_id", workout."id", 1, jsonb_build_object(
  'workout', to_jsonb(workout),
  'exercises', COALESCE((
    SELECT jsonb_agg(to_jsonb(exercise) || jsonb_build_object(
      'setRecords', COALESCE((SELECT jsonb_agg(to_jsonb(set_record) ORDER BY set_record."set_order") FROM "workout_sets" set_record WHERE set_record."workout_exercise_id" = exercise."id"), '[]'::jsonb)
    ) ORDER BY exercise."sort_order") FROM "workout_exercises" exercise WHERE exercise."workout_id" = workout."id"
  ), '[]'::jsonb)
)
FROM "workouts" workout
WHERE NOT EXISTS (SELECT 1 FROM "workout_revisions" revision WHERE revision."workout_id" = workout."id");
