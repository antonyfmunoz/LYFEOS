CREATE INDEX IF NOT EXISTS "hydration_entries_user_occurred_idx"
  ON "hydration_entries" ("user_id", "occurred_at");

CREATE INDEX IF NOT EXISTS "health_observations_user_metric_source_date_idx"
  ON "health_observations" ("user_id", "metric_key", "unit", "source", "observed_at");
