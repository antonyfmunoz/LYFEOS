-- A visible wake/sleep control default is not evidence of a sleep record.
-- Existing ambiguous pairs remain available to their owner but are not used
-- for sleep analytics or practice progression until explicitly re-recorded.
ALTER TABLE "user_daily_logs"
  ADD COLUMN IF NOT EXISTS "sleep_reported_at" timestamp;
