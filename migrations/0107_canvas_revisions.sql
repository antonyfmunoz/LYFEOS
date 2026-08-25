ALTER TABLE "canvases" ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL DEFAULT 1;
ALTER TABLE "canvases" DROP CONSTRAINT IF EXISTS "canvases_revision_positive";
ALTER TABLE "canvases" ADD CONSTRAINT "canvases_revision_positive" CHECK ("revision" > 0);

CREATE TABLE IF NOT EXISTS "canvas_revisions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "canvas_id" integer NOT NULL REFERENCES "canvases"("id") ON DELETE cascade,
  "revision_number" integer NOT NULL,
  "action" text NOT NULL,
  "source_revision" integer,
  "snapshot" jsonb NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "canvas_revisions_revision_positive" CHECK ("revision_number" > 0),
  CONSTRAINT "canvas_revisions_action_valid" CHECK ("action" IN ('created', 'updated', 'restored')),
  CONSTRAINT "canvas_revisions_source_positive" CHECK ("source_revision" IS NULL OR "source_revision" > 0),
  CONSTRAINT "canvas_revisions_canvas_revision_unique_idx" UNIQUE ("canvas_id", "revision_number")
);

CREATE INDEX IF NOT EXISTS "canvas_revisions_user_canvas_created_idx" ON "canvas_revisions" ("user_id", "canvas_id", "created_at");

INSERT INTO "canvas_revisions" ("user_id", "canvas_id", "revision_number", "action", "snapshot", "created_at")
SELECT "user_id", "id", "revision", 'created', jsonb_build_object(
  'title', "title",
  'description', "description",
  'category', "category",
  'content', "content"
), COALESCE("created_at", now())
FROM "canvases"
ON CONFLICT ("canvas_id", "revision_number") DO NOTHING;
