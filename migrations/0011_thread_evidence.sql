CREATE TABLE IF NOT EXISTS "transformation_thread_evidence" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "transformation_thread_id" integer NOT NULL REFERENCES "transformation_threads"("id") ON DELETE CASCADE,
  "source_type" text NOT NULL,
  "source_id" text NOT NULL,
  "summary" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "transformation_thread_evidence_source_idx"
  ON "transformation_thread_evidence" ("transformation_thread_id", "source_type", "source_id");

CREATE INDEX IF NOT EXISTS "transformation_thread_evidence_user_created_idx"
  ON "transformation_thread_evidence" ("user_id", "created_at" DESC);
