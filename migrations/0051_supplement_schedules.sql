CREATE TABLE IF NOT EXISTS "supplement_schedules" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "amount" real,
  "unit" text,
  "cadence" text NOT NULL DEFAULT 'daily',
  "weekdays" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "time_of_day" text,
  "active" boolean NOT NULL DEFAULT true,
  "note" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "supplement_schedules_cadence_valid" CHECK ("cadence" IN ('daily', 'specific_days', 'as_needed'))
);

CREATE TABLE IF NOT EXISTS "supplement_schedule_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "schedule_id" integer NOT NULL REFERENCES "supplement_schedules"("id") ON DELETE cascade,
  "date" date NOT NULL,
  "status" text NOT NULL,
  "supplement_entry_id" integer REFERENCES "supplement_entries"("id") ON DELETE SET NULL,
  "note" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "supplement_schedule_events_status_valid" CHECK ("status" IN ('taken', 'skipped'))
);

CREATE INDEX IF NOT EXISTS "supplement_schedules_user_idx" ON "supplement_schedules" ("user_id", "active");
CREATE UNIQUE INDEX IF NOT EXISTS "supplement_schedule_events_schedule_date_unique_idx" ON "supplement_schedule_events" ("schedule_id", "date");
