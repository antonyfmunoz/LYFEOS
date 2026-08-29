CREATE TABLE IF NOT EXISTS "canvas_templates" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "category" text NOT NULL DEFAULT 'general',
  "document" jsonb NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "canvas_templates_name_valid" CHECK (char_length("name") BETWEEN 1 AND 80),
  CONSTRAINT "canvas_templates_description_valid" CHECK ("description" IS NULL OR char_length("description") <= 240),
  CONSTRAINT "canvas_templates_category_valid" CHECK (char_length("category") BETWEEN 1 AND 80 AND "category" ~ '^[A-Za-z0-9 _-]+$')
);

CREATE INDEX IF NOT EXISTS "canvas_templates_user_updated_idx"
  ON "canvas_templates" ("user_id", "updated_at" DESC);
