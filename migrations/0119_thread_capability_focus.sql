ALTER TABLE "transformation_threads"
  ADD COLUMN IF NOT EXISTS "primary_capability_id" integer;

UPDATE "transformation_threads" thread
SET "primary_capability_id" = (
  SELECT node."capability_id"
  FROM "skill_nodes" node
  WHERE node."transformation_thread_id" = thread."id"
    AND node."user_id" = thread."user_id"
    AND node."kind" = 'primary'
    AND node."capability_id" IS NOT NULL
  ORDER BY node."id"
  LIMIT 1
)
WHERE thread."primary_capability_id" IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'transformation_threads_primary_capability_fk'
      AND conrelid = 'transformation_threads'::regclass
  ) THEN
    ALTER TABLE "transformation_threads"
      ADD CONSTRAINT "transformation_threads_primary_capability_fk"
      FOREIGN KEY ("primary_capability_id") REFERENCES "personal_capabilities"("id") ON DELETE set null;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "transformation_threads_user_primary_capability_idx"
  ON "transformation_threads" ("user_id", "primary_capability_id", "created_at");
