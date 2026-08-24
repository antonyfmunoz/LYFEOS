ALTER TABLE "health_profiles"
  ADD COLUMN IF NOT EXISTS "tracked_domains" jsonb NOT NULL DEFAULT '["nutrition","training","recovery","sleep","activity","body","metrics","supplements","planning","connections"]'::jsonb;

ALTER TABLE "health_profiles" DROP CONSTRAINT IF EXISTS "health_profiles_tracked_domains_array";
ALTER TABLE "health_profiles" ADD CONSTRAINT "health_profiles_tracked_domains_array"
  CHECK (jsonb_typeof("tracked_domains") = 'array' AND jsonb_array_length("tracked_domains") <= 10);
