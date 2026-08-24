CREATE TABLE IF NOT EXISTS "workspace_databases" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "title" text NOT NULL,
  "description" text,
  "category" text NOT NULL DEFAULT 'general',
  "favorite" boolean NOT NULL DEFAULT false,
  "definition" jsonb NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_databases_user_updated_idx" ON "workspace_databases" ("user_id", "updated_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspace_database_rows" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "database_id" integer NOT NULL REFERENCES "workspace_databases"("id") ON DELETE cascade,
  "values" jsonb NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_database_rows_database_updated_idx" ON "workspace_database_rows" ("database_id", "updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_database_rows_user_idx" ON "workspace_database_rows" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspace_forms" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "database_id" integer NOT NULL REFERENCES "workspace_databases"("id") ON DELETE cascade,
  "title" text NOT NULL,
  "description" text,
  "field_ids" jsonb NOT NULL,
  "confirmation_text" text NOT NULL DEFAULT 'Response saved.',
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_forms_user_updated_idx" ON "workspace_forms" ("user_id", "updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_forms_database_idx" ON "workspace_forms" ("database_id");
