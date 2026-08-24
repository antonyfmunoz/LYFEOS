CREATE TABLE IF NOT EXISTS "health_practice_reviews" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "review_date" date NOT NULL,
  "domains" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "reflection" text NOT NULL,
  "next_experiment" text,
  "revision" integer NOT NULL DEFAULT 1,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "health_practice_reviews_user_date_unique_idx" UNIQUE ("user_id", "review_date"),
  CONSTRAINT "health_practice_reviews_domains_valid" CHECK (jsonb_typeof("domains") = 'array' AND jsonb_array_length("domains") BETWEEN 1 AND 8),
  CONSTRAINT "health_practice_reviews_reflection_length" CHECK (char_length("reflection") BETWEEN 3 AND 2000),
  CONSTRAINT "health_practice_reviews_revision_positive" CHECK ("revision" > 0)
);
CREATE INDEX IF NOT EXISTS "health_practice_reviews_user_date_idx" ON "health_practice_reviews" ("user_id", "review_date" DESC);
