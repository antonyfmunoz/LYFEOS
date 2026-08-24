ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "lifecycle_key" text;

UPDATE "quests" AS q
SET "lifecycle_key" = 'health-planning-draft:' || d."id"::text
FROM "health_planning_drafts" AS d
WHERE d."quest_id" = q."id"
  AND d."user_id" = q."user_id"
  AND q."lifecycle_key" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "quests_user_lifecycle_key_unique_idx"
  ON "quests" ("user_id", "lifecycle_key")
  WHERE "lifecycle_key" IS NOT NULL;
