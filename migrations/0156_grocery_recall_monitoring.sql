-- Opt-in pantry recall monitoring. A possible FDA text match is retained as
-- a review alert, never as a finding that a user's package is included.
ALTER TABLE "grocery_pantry_items"
  ADD COLUMN IF NOT EXISTS "last_recall_checked_at" timestamp;

CREATE INDEX IF NOT EXISTS "grocery_pantry_items_recall_monitor_idx"
  ON "grocery_pantry_items" ("status", "last_recall_checked_at");

CREATE TABLE IF NOT EXISTS "grocery_recall_monitoring_preferences" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "enabled" boolean NOT NULL DEFAULT false,
  "last_checked_at" timestamp,
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "grocery_recall_monitoring_preferences_user_unique_idx"
  ON "grocery_recall_monitoring_preferences" ("user_id");
CREATE INDEX IF NOT EXISTS "grocery_recall_monitoring_preferences_enabled_checked_idx"
  ON "grocery_recall_monitoring_preferences" ("enabled", "last_checked_at");

CREATE TABLE IF NOT EXISTS "grocery_recall_alerts" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "pantry_item_id" integer NOT NULL REFERENCES "grocery_pantry_items"("id") ON DELETE CASCADE,
  "recall_number" text NOT NULL,
  "product_description" text NOT NULL,
  "classification" text,
  "reason_for_recall" text,
  "code_info" text,
  "source_url" text NOT NULL,
  "status" text NOT NULL DEFAULT 'open',
  "detected_at" timestamp NOT NULL DEFAULT now(),
  "last_seen_at" timestamp NOT NULL DEFAULT now(),
  "dismissed_at" timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS "grocery_recall_alerts_pantry_recall_unique_idx"
  ON "grocery_recall_alerts" ("pantry_item_id", "recall_number");
CREATE INDEX IF NOT EXISTS "grocery_recall_alerts_user_status_idx"
  ON "grocery_recall_alerts" ("user_id", "status", "last_seen_at");
