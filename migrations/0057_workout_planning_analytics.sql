ALTER TABLE "workout_templates" ADD COLUMN IF NOT EXISTS "folder" text;
ALTER TABLE "workout_templates" ADD COLUMN IF NOT EXISTS "note" text;

CREATE TABLE IF NOT EXISTS "workout_template_revisions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "template_id" integer NOT NULL REFERENCES "workout_templates"("id") ON DELETE cascade,
  "revision_number" integer NOT NULL,
  "name" text NOT NULL,
  "activity_type" text NOT NULL,
  "folder" text,
  "note" text,
  "exercise_blueprint" jsonb NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "workout_template_revisions_number_unique_idx" UNIQUE("template_id", "revision_number")
);
CREATE INDEX IF NOT EXISTS "workout_template_revisions_user_idx" ON "workout_template_revisions" ("user_id", "template_id");
INSERT INTO "workout_template_revisions" ("user_id", "template_id", "revision_number", "name", "activity_type", "folder", "note", "exercise_blueprint")
SELECT template."user_id", template."id", 1, template."name", template."activity_type", template."folder", template."note", template."exercise_blueprint"
FROM "workout_templates" template
WHERE NOT EXISTS (SELECT 1 FROM "workout_template_revisions" revision WHERE revision."template_id" = template."id");

ALTER TABLE "workout_program_sessions" ADD COLUMN IF NOT EXISTS "original_template_id" integer REFERENCES "workout_templates"("id") ON DELETE set null;
ALTER TABLE "workout_program_sessions" ADD COLUMN IF NOT EXISTS "substitution_reason" text;
ALTER TABLE "workout_program_sessions" ADD COLUMN IF NOT EXISTS "substituted_at" timestamp;
ALTER TABLE "workout_program_sessions" ADD COLUMN IF NOT EXISTS "recurrence_group_id" uuid;
ALTER TABLE "workout_program_sessions" ADD COLUMN IF NOT EXISTS "recurrence_index" integer;
UPDATE "workout_program_sessions" SET "original_template_id" = "template_id" WHERE "original_template_id" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "workout_program_sessions_recurrence_unique_idx" ON "workout_program_sessions" ("user_id", "recurrence_group_id", "recurrence_index") WHERE "recurrence_group_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "heart_rate_zone_profiles" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "source" text NOT NULL DEFAULT 'user',
  "method_id" text,
  "method_version" text,
  "zones" jsonb NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "note" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "heart_rate_zone_profiles_source_valid" CHECK ("source" IN ('user', 'professional'))
);
CREATE INDEX IF NOT EXISTS "heart_rate_zone_profiles_user_idx" ON "heart_rate_zone_profiles" ("user_id", "updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "heart_rate_zone_profiles_one_active_idx" ON "heart_rate_zone_profiles" ("user_id") WHERE "active" = true;
