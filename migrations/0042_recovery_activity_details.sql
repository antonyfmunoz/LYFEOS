-- Custom labels and intensity preserve the user's own description of a
-- recovery practice without assigning treatment or efficacy meaning.
ALTER TABLE "recovery_activities" ADD COLUMN IF NOT EXISTS "custom_label" text;
ALTER TABLE "recovery_activities" ADD COLUMN IF NOT EXISTS "intensity" integer;
