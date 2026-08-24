CREATE TABLE IF NOT EXISTS "exercise_definitions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer REFERENCES "users"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "category" text,
  "equipment" text,
  "primary_muscles" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "secondary_muscles" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "instructions" text,
  "source" text NOT NULL DEFAULT 'user_custom',
  "source_version" text,
  "archived_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "exercise_definitions_user_name_unique_idx"
  ON "exercise_definitions" ("user_id", "name") WHERE "user_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "exercise_definitions_name_idx" ON "exercise_definitions" ("name");
