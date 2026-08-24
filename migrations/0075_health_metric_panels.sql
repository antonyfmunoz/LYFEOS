CREATE TABLE IF NOT EXISTS "health_metric_panels" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "left_series_id" text NOT NULL,
  "right_series_id" text NOT NULL,
  "period_days" integer NOT NULL DEFAULT 30,
  "rolling_average" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "health_metric_panels_period_valid" CHECK ("period_days" IN (30, 90, 365, 730, 3650)),
  CONSTRAINT "health_metric_panels_series_distinct" CHECK ("left_series_id" <> "right_series_id"),
  CONSTRAINT "health_metric_panels_user_name_unique_idx" UNIQUE ("user_id", "name")
);

CREATE INDEX IF NOT EXISTS "health_metric_panels_user_updated_idx"
  ON "health_metric_panels" ("user_id", "updated_at");
