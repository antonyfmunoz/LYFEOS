ALTER TABLE "workouts" ADD COLUMN IF NOT EXISTS "moving_time_seconds" integer;
ALTER TABLE "workouts" ADD COLUMN IF NOT EXISTS "elevation_gain_meters" real;
ALTER TABLE "workouts" ADD COLUMN IF NOT EXISTS "average_heart_rate_bpm" integer;
ALTER TABLE "workouts" ADD COLUMN IF NOT EXISTS "max_heart_rate_bpm" integer;
ALTER TABLE "workouts" ADD COLUMN IF NOT EXISTS "heart_rate_source" text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workouts_cardio_details_valid') THEN
    ALTER TABLE "workouts" ADD CONSTRAINT "workouts_cardio_details_valid" CHECK (
      ("moving_time_seconds" IS NULL OR "moving_time_seconds" > 0) AND
      ("elevation_gain_meters" IS NULL OR "elevation_gain_meters" >= 0) AND
      ("average_heart_rate_bpm" IS NULL OR "average_heart_rate_bpm" BETWEEN 20 AND 260) AND
      ("max_heart_rate_bpm" IS NULL OR "max_heart_rate_bpm" BETWEEN 20 AND 260) AND
      ("average_heart_rate_bpm" IS NULL OR "max_heart_rate_bpm" IS NULL OR "max_heart_rate_bpm" >= "average_heart_rate_bpm") AND
      ("heart_rate_source" IS NULL OR "heart_rate_source" IN ('manual', 'device', 'imported'))
    );
  END IF;
END $$;
