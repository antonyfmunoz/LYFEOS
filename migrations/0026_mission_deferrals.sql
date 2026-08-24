CREATE TABLE IF NOT EXISTS "mission_deferrals" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "quest_id" integer NOT NULL REFERENCES "quests"("id") ON DELETE cascade,
  "previous_due_date" text,
  "deferred_to_date" text NOT NULL,
  "reason" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "mission_deferrals_user_quest_created_idx"
  ON "mission_deferrals" ("user_id", "quest_id", "created_at");
