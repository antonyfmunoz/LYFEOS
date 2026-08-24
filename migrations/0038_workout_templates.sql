-- Templates are private reusable plans. They are intentionally separate from
-- factual workouts so loading a plan never records training as completed.
CREATE TABLE IF NOT EXISTS "workout_templates" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "activity_type" text NOT NULL,
  "exercise_blueprint" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "workout_templates_user_name_idx" ON "workout_templates" ("user_id", "name");
