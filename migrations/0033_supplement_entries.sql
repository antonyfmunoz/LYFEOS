CREATE TABLE IF NOT EXISTS "supplement_entries" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "amount" real,
  "unit" text,
  "occurred_at" timestamp NOT NULL DEFAULT now(),
  "source" text NOT NULL DEFAULT 'manual',
  "note" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "supplement_entries_user_occurred_idx" ON "supplement_entries" ("user_id", "occurred_at");
