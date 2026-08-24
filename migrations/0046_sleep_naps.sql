CREATE TABLE IF NOT EXISTS "sleep_naps" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "date" date NOT NULL,
  "start_time" text NOT NULL,
  "end_time" text NOT NULL,
  "sleep_quality" integer,
  "note" text,
  "source" text NOT NULL DEFAULT 'manual',
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "sleep_naps_quality_valid" CHECK ("sleep_quality" IS NULL OR "sleep_quality" BETWEEN 1 AND 5)
);

CREATE INDEX IF NOT EXISTS "sleep_naps_user_date_idx" ON "sleep_naps" ("user_id", "date");
