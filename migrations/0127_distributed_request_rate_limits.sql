CREATE TABLE IF NOT EXISTS "request_rate_limits" (
  "bucket_hash" text PRIMARY KEY,
  "window_start" timestamptz NOT NULL,
  "request_count" integer NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "request_rate_limits_count_valid" CHECK ("request_count" > 0),
  CONSTRAINT "request_rate_limits_window_valid" CHECK ("expires_at" > "window_start")
);

CREATE INDEX IF NOT EXISTS "request_rate_limits_expires_idx"
  ON "request_rate_limits" ("expires_at");
