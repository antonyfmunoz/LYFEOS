ALTER TABLE "health_observations" ADD COLUMN IF NOT EXISTS "temporal_type" text NOT NULL DEFAULT 'instant';
ALTER TABLE "health_observations" ADD COLUMN IF NOT EXISTS "interval_start_at" timestamp;
ALTER TABLE "health_observations" ADD COLUMN IF NOT EXISTS "interval_end_at" timestamp;
ALTER TABLE "health_observations" ADD COLUMN IF NOT EXISTS "aggregation_kind" text NOT NULL DEFAULT 'average';

DO $$ BEGIN
  ALTER TABLE "health_observations" ADD CONSTRAINT "health_observations_temporal_type_valid"
    CHECK ("temporal_type" IN ('instant', 'interval'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "health_observations" ADD CONSTRAINT "health_observations_aggregation_kind_valid"
    CHECK ("aggregation_kind" IN ('sum', 'average', 'latest'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "health_observations" ADD CONSTRAINT "health_observations_interval_shape_valid"
    CHECK (
      ("temporal_type" = 'instant' AND "interval_start_at" IS NULL AND "interval_end_at" IS NULL)
      OR
      ("temporal_type" = 'interval' AND "interval_start_at" IS NOT NULL AND "interval_end_at" IS NOT NULL AND "interval_start_at" < "interval_end_at" AND "observed_at" = "interval_end_at")
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "health_observations_user_metric_interval_idx"
  ON "health_observations" ("user_id", "metric_key", "interval_start_at", "interval_end_at");
