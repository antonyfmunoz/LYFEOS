ALTER TABLE "workout_program_sessions" ADD COLUMN IF NOT EXISTS "completion_link_lost_at" timestamp;

ALTER TABLE "workout_program_sessions" DROP CONSTRAINT IF EXISTS "workout_program_sessions_completion_valid";
ALTER TABLE "workout_program_sessions" ADD CONSTRAINT "workout_program_sessions_completion_valid" CHECK (
  "status" <> 'completed' OR "completed_workout_id" IS NOT NULL OR "completion_link_lost_at" IS NOT NULL
);

CREATE OR REPLACE FUNCTION "lyfeos_mark_program_completion_link_lost"() RETURNS trigger AS $$
BEGIN
  UPDATE "workout_program_sessions"
  SET "completion_link_lost_at" = now(), "updated_at" = now()
  WHERE "completed_workout_id" = OLD."id";
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "workouts_mark_program_completion_link_lost" ON "workouts";
CREATE TRIGGER "workouts_mark_program_completion_link_lost"
BEFORE DELETE ON "workouts"
FOR EACH ROW EXECUTE FUNCTION "lyfeos_mark_program_completion_link_lost"();
