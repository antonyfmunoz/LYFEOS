ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL DEFAULT 1;
ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "lifecycle_payload_hash" text;

DO $$ BEGIN
  ALTER TABLE "quests" ADD CONSTRAINT "quests_revision_positive" CHECK ("revision" > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION "lyfeos_bump_quest_revision"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."revision" := OLD."revision" + 1;
  NEW."updated_at" := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "quests_bump_revision" ON "quests";
CREATE TRIGGER "quests_bump_revision"
BEFORE UPDATE ON "quests"
FOR EACH ROW
EXECUTE FUNCTION "lyfeos_bump_quest_revision"();

CREATE TABLE IF NOT EXISTS "mission_mutation_receipts" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "mutation_id" text NOT NULL,
  "payload_hash" text NOT NULL,
  "operation" text NOT NULL,
  "quest_id" integer,
  "resulting_revision" integer,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "mission_mutation_receipts_user_mutation_unique_idx" UNIQUE("user_id", "mutation_id")
);

CREATE INDEX IF NOT EXISTS "mission_mutation_receipts_user_created_idx"
  ON "mission_mutation_receipts" ("user_id", "created_at");
