ALTER TABLE "workspace_databases" ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "workspace_database_rows" ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL DEFAULT 1;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspace_database_revisions" (
  "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "database_id" integer NOT NULL REFERENCES "workspace_databases"("id") ON DELETE cascade,
  "revision_number" integer NOT NULL, "action" text NOT NULL, "source_revision" integer, "snapshot" jsonb NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_database_revisions_revision_positive" CHECK ("revision_number" > 0),
  CONSTRAINT "workspace_database_revisions_action_valid" CHECK ("action" IN ('created','updated','restored')),
  CONSTRAINT "workspace_database_revisions_source_positive" CHECK ("source_revision" IS NULL OR "source_revision" > 0),
  CONSTRAINT "workspace_database_revisions_database_revision_unique_idx" UNIQUE ("database_id", "revision_number")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_database_revisions_user_database_created_idx" ON "workspace_database_revisions" ("user_id", "database_id", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspace_database_row_revisions" (
  "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "database_id" integer NOT NULL REFERENCES "workspace_databases"("id") ON DELETE cascade,
  "row_id" integer NOT NULL REFERENCES "workspace_database_rows"("id") ON DELETE cascade,
  "revision_number" integer NOT NULL, "action" text NOT NULL, "source_revision" integer, "snapshot" jsonb NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_database_row_revisions_revision_positive" CHECK ("revision_number" > 0),
  CONSTRAINT "workspace_database_row_revisions_action_valid" CHECK ("action" IN ('created','updated','restored')),
  CONSTRAINT "workspace_database_row_revisions_source_positive" CHECK ("source_revision" IS NULL OR "source_revision" > 0),
  CONSTRAINT "workspace_database_row_revisions_row_revision_unique_idx" UNIQUE ("row_id", "revision_number")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_database_row_revisions_user_row_created_idx" ON "workspace_database_row_revisions" ("user_id", "row_id", "created_at");
--> statement-breakpoint
INSERT INTO "workspace_database_revisions" ("user_id", "database_id", "revision_number", "action", "snapshot", "created_at")
SELECT "user_id", "id", "revision", 'created', jsonb_build_object('title', "title", 'description', "description", 'category', "category", 'favorite', "favorite", 'definition', "definition"), COALESCE("created_at", now()) FROM "workspace_databases"
ON CONFLICT ("database_id", "revision_number") DO NOTHING;
--> statement-breakpoint
INSERT INTO "workspace_database_row_revisions" ("user_id", "database_id", "row_id", "revision_number", "action", "snapshot", "created_at")
SELECT "user_id", "database_id", "id", "revision", 'created', jsonb_build_object('values', "values"), COALESCE("created_at", now()) FROM "workspace_database_rows"
ON CONFLICT ("row_id", "revision_number") DO NOTHING;
