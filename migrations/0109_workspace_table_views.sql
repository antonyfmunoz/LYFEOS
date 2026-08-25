CREATE TABLE IF NOT EXISTS "workspace_table_views" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "database_id" integer NOT NULL REFERENCES "workspace_databases"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "definition" jsonb NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_table_views_user_database_idx" ON "workspace_table_views" ("user_id", "database_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_table_views_database_name_unique_idx" ON "workspace_table_views" ("database_id", lower("name"));
