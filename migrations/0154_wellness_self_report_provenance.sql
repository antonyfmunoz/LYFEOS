-- A neutral control default is not an observation. Preserve the historical
-- values but require explicit provenance before analytic surfaces use them.
ALTER TABLE "user_daily_logs"
  ADD COLUMN IF NOT EXISTS "wellness_reported_at" timestamp;
