ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "registration_disclosure_version" text,
  ADD COLUMN IF NOT EXISTS "registration_disclosure_acknowledged_at" timestamp;

DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_registration_disclosure_version_valid"
    CHECK ("registration_disclosure_version" IS NULL OR "registration_disclosure_version" IN ('lyfeos.beta-access-and-privacy.v1', 'legacy_terms_boolean'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_registration_disclosure_pair_valid"
    CHECK (("registration_disclosure_version" IS NULL) = ("registration_disclosure_acknowledged_at" IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
