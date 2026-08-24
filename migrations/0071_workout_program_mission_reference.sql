ALTER TABLE "workout_program_sessions"
  ADD COLUMN IF NOT EXISTS "mission_id" integer REFERENCES "quests"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "workout_program_sessions_user_mission_idx"
  ON "workout_program_sessions" ("user_id", "mission_id");
