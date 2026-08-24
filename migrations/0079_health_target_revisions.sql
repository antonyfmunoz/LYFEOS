ALTER TABLE "health_targets" ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS "health_target_revisions" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "target_id" integer NOT NULL,
  "revision_number" integer NOT NULL,
  "action" text NOT NULL,
  "snapshot" jsonb NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "health_target_revisions_revision_valid" CHECK ("revision_number" > 0),
  CONSTRAINT "health_target_revisions_action_valid" CHECK ("action" IN ('baseline', 'created', 'updated', 'deleted')),
  CONSTRAINT "health_target_revisions_user_target_revision_unique_idx" UNIQUE ("user_id", "target_id", "revision_number")
);

INSERT INTO "health_target_revisions" ("user_id", "target_id", "revision_number", "action", "snapshot", "created_at")
SELECT t."user_id", t."id", t."revision", 'baseline', to_jsonb(t), COALESCE(t."updated_at", t."created_at", now())
FROM "health_targets" AS t
ON CONFLICT ("user_id", "target_id", "revision_number") DO NOTHING;

CREATE INDEX IF NOT EXISTS "health_target_revisions_user_created_idx" ON "health_target_revisions" ("user_id", "created_at");
