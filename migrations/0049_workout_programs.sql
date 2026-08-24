CREATE TABLE IF NOT EXISTS "workout_programs" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "note" text,
  "archived_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "workout_program_sessions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "program_id" integer NOT NULL REFERENCES "workout_programs"("id") ON DELETE cascade,
  "template_id" integer REFERENCES "workout_templates"("id") ON DELETE SET NULL,
  "completed_workout_id" integer REFERENCES "workouts"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "scheduled_date" date NOT NULL,
  "status" text NOT NULL DEFAULT 'planned',
  "note" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "workout_program_sessions_status_valid" CHECK ("status" IN ('planned', 'skipped', 'completed')),
  CONSTRAINT "workout_program_sessions_completion_valid" CHECK ("status" <> 'completed' OR "completed_workout_id" IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS "workout_programs_user_idx" ON "workout_programs" ("user_id", "updated_at");
CREATE INDEX IF NOT EXISTS "workout_program_sessions_user_date_idx" ON "workout_program_sessions" ("user_id", "scheduled_date");
