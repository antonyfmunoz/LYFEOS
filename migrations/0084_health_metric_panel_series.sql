ALTER TABLE "health_metric_panels" ADD COLUMN IF NOT EXISTS "series_ids" jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE "health_metric_panels"
SET "series_ids" = jsonb_build_array("left_series_id", "right_series_id")
WHERE jsonb_array_length("series_ids") = 0;

ALTER TABLE "health_metric_panels" DROP CONSTRAINT IF EXISTS "health_metric_panels_series_count_valid";
ALTER TABLE "health_metric_panels" ADD CONSTRAINT "health_metric_panels_series_count_valid"
  CHECK (jsonb_typeof("series_ids") = 'array' AND jsonb_array_length("series_ids") BETWEEN 2 AND 4);
