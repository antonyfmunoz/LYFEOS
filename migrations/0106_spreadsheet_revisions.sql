ALTER TABLE "spreadsheets" ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL DEFAULT 1;
ALTER TABLE "spreadsheets" DROP CONSTRAINT IF EXISTS "spreadsheets_revision_positive";
ALTER TABLE "spreadsheets" ADD CONSTRAINT "spreadsheets_revision_positive" CHECK ("revision" > 0);

CREATE TABLE IF NOT EXISTS "spreadsheet_revisions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "spreadsheet_id" integer NOT NULL REFERENCES "spreadsheets"("id") ON DELETE cascade,
  "revision_number" integer NOT NULL,
  "action" text NOT NULL,
  "source_revision" integer,
  "snapshot" jsonb NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "spreadsheet_revisions_revision_positive" CHECK ("revision_number" > 0),
  CONSTRAINT "spreadsheet_revisions_action_valid" CHECK ("action" IN ('created', 'updated', 'restored')),
  CONSTRAINT "spreadsheet_revisions_source_positive" CHECK ("source_revision" IS NULL OR "source_revision" > 0),
  CONSTRAINT "spreadsheet_revisions_spreadsheet_revision_unique_idx" UNIQUE ("spreadsheet_id", "revision_number")
);

CREATE INDEX IF NOT EXISTS "spreadsheet_revisions_user_spreadsheet_created_idx" ON "spreadsheet_revisions" ("user_id", "spreadsheet_id", "created_at");

INSERT INTO "spreadsheet_revisions" ("user_id", "spreadsheet_id", "revision_number", "action", "snapshot", "created_at")
SELECT "user_id", "id", "revision", 'created', jsonb_build_object(
  'title', "title",
  'description', "description",
  'category', "category",
  'content', "content"
), COALESCE("created_at", now())
FROM "spreadsheets"
ON CONFLICT ("spreadsheet_id", "revision_number") DO NOTHING;
