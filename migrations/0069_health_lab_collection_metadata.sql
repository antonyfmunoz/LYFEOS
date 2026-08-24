ALTER TABLE "health_observations" ADD COLUMN IF NOT EXISTS "specimen_type" text;
ALTER TABLE "health_observations" ADD COLUMN IF NOT EXISTS "collected_at" timestamp;

DO $$ BEGIN
  ALTER TABLE "health_observations" ADD CONSTRAINT "health_observations_lab_collection_metadata_valid"
    CHECK (("specimen_type" IS NULL AND "collected_at" IS NULL) OR "category" = 'lab');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "health_observations_user_collected_at_idx"
  ON "health_observations" ("user_id", "collected_at");
