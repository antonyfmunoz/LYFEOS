CREATE TABLE IF NOT EXISTS "slides" (
  "id" serial PRIMARY KEY, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" text NOT NULL, "description" text, "document" jsonb NOT NULL,
  "favorite" boolean NOT NULL DEFAULT false, "deleted_at" timestamp,
  "revision" integer NOT NULL DEFAULT 1, "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "slides_user_updated_idx" ON "slides" ("user_id", "updated_at");
CREATE INDEX IF NOT EXISTS "slides_user_deleted_idx" ON "slides" ("user_id", "deleted_at");
CREATE TABLE IF NOT EXISTS "slide_revisions" (
  "id" serial PRIMARY KEY, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "slide_id" integer NOT NULL REFERENCES "slides"("id") ON DELETE CASCADE,
  "revision_number" integer NOT NULL, "action" text NOT NULL, "snapshot" jsonb NOT NULL, "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "slide_revisions_slide_revision_idx" UNIQUE ("slide_id", "revision_number")
);
CREATE INDEX IF NOT EXISTS "slide_revisions_user_slide_created_idx" ON "slide_revisions" ("user_id", "slide_id", "created_at");
CREATE TABLE IF NOT EXISTS "vault_forms" (
  "id" serial PRIMARY KEY, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" text NOT NULL, "description" text, "definition" jsonb NOT NULL, "confirmation_text" text NOT NULL DEFAULT 'Response saved.',
  "backing_database_id" integer REFERENCES "workspace_databases"("id") ON DELETE SET NULL,
  "favorite" boolean NOT NULL DEFAULT false, "active" boolean NOT NULL DEFAULT true, "deleted_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "vault_forms_user_updated_idx" ON "vault_forms" ("user_id", "updated_at");
CREATE INDEX IF NOT EXISTS "vault_forms_user_deleted_idx" ON "vault_forms" ("user_id", "deleted_at");
CREATE TABLE IF NOT EXISTS "vault_form_responses" (
  "id" serial PRIMARY KEY, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "form_id" integer NOT NULL REFERENCES "vault_forms"("id") ON DELETE CASCADE, "values" jsonb NOT NULL, "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "vault_form_responses_user_form_created_idx" ON "vault_form_responses" ("user_id", "form_id", "created_at");
CREATE TABLE IF NOT EXISTS "vault_item_states" (
  "id" serial PRIMARY KEY, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "item_type" text NOT NULL, "item_id" integer NOT NULL, "favorite" boolean NOT NULL DEFAULT false,
  "trashed_at" timestamp, "last_opened_at" timestamp, "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "vault_item_states_user_type_item_idx" UNIQUE ("user_id", "item_type", "item_id")
);
CREATE INDEX IF NOT EXISTS "vault_item_states_user_trash_recent_idx" ON "vault_item_states" ("user_id", "trashed_at", "last_opened_at");
