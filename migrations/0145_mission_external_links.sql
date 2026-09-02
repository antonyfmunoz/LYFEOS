CREATE TABLE IF NOT EXISTS "mission_external_links" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "quest_id" integer NOT NULL REFERENCES "quests"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "external_id" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "mission_external_links_quest_provider_unique" UNIQUE ("quest_id", "provider"),
  CONSTRAINT "mission_external_links_user_provider_external_unique" UNIQUE ("user_id", "provider", "external_id")
);

CREATE INDEX IF NOT EXISTS "mission_external_links_user_quest_idx"
  ON "mission_external_links" ("user_id", "quest_id");

INSERT INTO "mission_external_links" ("user_id", "quest_id", "provider", "external_id")
SELECT "user_id", "id", "external_source", "external_id"
FROM "quests"
WHERE "external_source" IS NOT NULL AND "external_id" IS NOT NULL
ON CONFLICT DO NOTHING;
