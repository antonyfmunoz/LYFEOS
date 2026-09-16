CREATE TABLE IF NOT EXISTS "spirit_entries" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "entry_date" date NOT NULL,
  "kind" text NOT NULL,
  "title" varchar(180) NOT NULL,
  "scripture" varchar(300),
  "content" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "spirit_entries_kind_valid" CHECK ("kind" IN ('bible_study', 'prayer', 'reflection', 'sermon', 'other'))
);

CREATE INDEX IF NOT EXISTS "spirit_entries_user_date_idx" ON "spirit_entries" ("user_id", "entry_date");
CREATE INDEX IF NOT EXISTS "spirit_entries_user_kind_date_idx" ON "spirit_entries" ("user_id", "kind", "entry_date");
