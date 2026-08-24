CREATE TABLE IF NOT EXISTS "health_observations" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "category" text NOT NULL,
  "metric_key" text NOT NULL,
  "display_name" text NOT NULL,
  "value" real NOT NULL,
  "unit" text NOT NULL,
  "method" text,
  "source" text NOT NULL DEFAULT 'manual',
  "observed_at" timestamp NOT NULL,
  "lab_name" text,
  "reference_low" real,
  "reference_high" real,
  "reference_unit" text,
  "note" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "health_observations_user_category_metric_date_idx" ON "health_observations" ("user_id", "category", "metric_key", "observed_at");
