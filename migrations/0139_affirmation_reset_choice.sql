ALTER TABLE "user_profile"
  ADD COLUMN IF NOT EXISTS "affirmation_auto_generation_enabled" boolean NOT NULL DEFAULT true;
