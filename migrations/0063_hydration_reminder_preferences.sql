ALTER TABLE "health_profiles" ADD COLUMN IF NOT EXISTS "hydration_reminder_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "health_profiles" ADD COLUMN IF NOT EXISTS "hydration_reminder_interval_minutes" integer NOT NULL DEFAULT 120;

ALTER TABLE "health_profiles" DROP CONSTRAINT IF EXISTS "health_profiles_hydration_reminder_interval_valid";
ALTER TABLE "health_profiles" ADD CONSTRAINT "health_profiles_hydration_reminder_interval_valid"
  CHECK ("hydration_reminder_interval_minutes" BETWEEN 30 AND 480);
