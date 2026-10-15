ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "adult_eligibility_acknowledged_at" timestamp;
