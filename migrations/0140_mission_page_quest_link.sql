ALTER TABLE "mission_pages"
  ADD COLUMN IF NOT EXISTS "quest_id" integer REFERENCES "quests"("id") ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "mission_pages_quest_unique_idx"
  ON "mission_pages" ("quest_id")
  WHERE "quest_id" IS NOT NULL;
