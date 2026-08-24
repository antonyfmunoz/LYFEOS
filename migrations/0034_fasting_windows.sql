CREATE TABLE IF NOT EXISTS "fasting_windows" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "started_at" timestamp NOT NULL,
  "ended_at" timestamp,
  "note" text,
  "source" text NOT NULL DEFAULT 'manual',
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "fasting_windows_time_order" CHECK ("ended_at" IS NULL OR "ended_at" >= "started_at")
);
CREATE INDEX IF NOT EXISTS "fasting_windows_user_started_idx" ON "fasting_windows" ("user_id", "started_at");
