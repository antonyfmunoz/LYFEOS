ALTER TABLE "body_measurements" ADD COLUMN IF NOT EXISTS "measurement_method" text NOT NULL DEFAULT 'unspecified';
ALTER TABLE "body_measurements" ADD COLUMN IF NOT EXISTS "measurement_protocol" text;

ALTER TABLE "body_measurements" DROP CONSTRAINT IF EXISTS "body_measurements_method_valid";
ALTER TABLE "body_measurements" ADD CONSTRAINT "body_measurements_method_valid" CHECK (
  "measurement_method" IN ('unspecified', 'scale', 'tape', 'bia', 'caliper', 'dexa', 'bod_pod', 'professional', 'other')
);

CREATE INDEX IF NOT EXISTS "body_measurements_user_metric_unit_method_date_idx"
  ON "body_measurements" ("user_id", "metric", "unit", "measurement_method", "observed_at");
