ALTER TABLE "user_daily_logs" ADD COLUMN IF NOT EXISTS "sleep_quality" integer;
ALTER TABLE "user_daily_logs" ADD COLUMN IF NOT EXISTS "sleep_note" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_daily_logs_sleep_quality_valid'
  ) THEN
    ALTER TABLE "user_daily_logs"
      ADD CONSTRAINT "user_daily_logs_sleep_quality_valid"
      CHECK ("sleep_quality" IS NULL OR "sleep_quality" BETWEEN 1 AND 5);
  END IF;
END $$;
