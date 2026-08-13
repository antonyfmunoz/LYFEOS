CREATE TABLE IF NOT EXISTS "transformation_threads" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "focus" text NOT NULL,
  "rationale" text NOT NULL,
  "source_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "starter_missions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" text NOT NULL DEFAULT 'draft',
  "activated_at" timestamp,
  "completed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

ALTER TABLE "quests"
  ADD COLUMN IF NOT EXISTS "transformation_thread_id" integer
  REFERENCES "transformation_threads"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "transformation_threads_user_created_idx"
  ON "transformation_threads" ("user_id", "created_at" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS "transformation_threads_one_active_user_idx"
  ON "transformation_threads" ("user_id")
  WHERE "status" = 'active';

CREATE INDEX IF NOT EXISTS "quests_transformation_thread_idx"
  ON "quests" ("transformation_thread_id");
