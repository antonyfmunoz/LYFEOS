-- Preserve workout structure at the same level as the atomic attempt. These
-- fields are descriptive user observations; they do not infer competence.
ALTER TABLE "workout_exercises"
  ADD COLUMN IF NOT EXISTS "superset_group" text;

ALTER TABLE "workout_sets"
  ADD COLUMN IF NOT EXISTS "set_kind" text NOT NULL DEFAULT 'working',
  ADD COLUMN IF NOT EXISTS "reached_failure" boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workout_sets_set_kind_check'
  ) THEN
    ALTER TABLE "workout_sets"
      ADD CONSTRAINT "workout_sets_set_kind_check"
      CHECK ("set_kind" IN ('warmup', 'working', 'drop'));
  END IF;
END $$;
