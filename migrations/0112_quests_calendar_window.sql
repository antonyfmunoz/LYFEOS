CREATE INDEX IF NOT EXISTS "quests_user_calendar_window_idx"
  ON "quests" ("user_id", "start_date", "id")
  WHERE "deleted_at" IS NULL AND "start_date" IS NOT NULL;
