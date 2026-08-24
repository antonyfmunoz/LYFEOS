CREATE TABLE IF NOT EXISTS "sleep_sessions" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "started_at" timestamp NOT NULL,
  "ended_at" timestamp NOT NULL,
  "source" text NOT NULL DEFAULT 'manual',
  "device_name" text,
  "method" text,
  "awake_minutes" integer,
  "light_minutes" integer,
  "deep_minutes" integer,
  "rem_minutes" integer,
  "subjective_quality" integer,
  "note" text,
  "recorded_time_zone" text,
  "recorded_utc_offset_minutes" integer,
  "revision" integer NOT NULL DEFAULT 1,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "sleep_sessions_time_valid" CHECK ("ended_at" > "started_at" AND "ended_at" <= "started_at" + interval '36 hours'),
  CONSTRAINT "sleep_sessions_source_valid" CHECK ("source" IN ('manual', 'transcribed_device', 'imported')),
  CONSTRAINT "sleep_sessions_quality_valid" CHECK ("subjective_quality" IS NULL OR "subjective_quality" BETWEEN 1 AND 5),
  CONSTRAINT "sleep_sessions_revision_valid" CHECK ("revision" > 0),
  CONSTRAINT "sleep_sessions_stages_valid" CHECK (
    ("awake_minutes" IS NULL OR "awake_minutes" >= 0) AND
    ("light_minutes" IS NULL OR "light_minutes" >= 0) AND
    ("deep_minutes" IS NULL OR "deep_minutes" >= 0) AND
    ("rem_minutes" IS NULL OR "rem_minutes" >= 0) AND
    COALESCE("awake_minutes", 0) + COALESCE("light_minutes", 0) + COALESCE("deep_minutes", 0) + COALESCE("rem_minutes", 0)
      <= EXTRACT(epoch FROM ("ended_at" - "started_at")) / 60
  )
);

CREATE INDEX IF NOT EXISTS "sleep_sessions_user_started_idx"
  ON "sleep_sessions" ("user_id", "started_at");
