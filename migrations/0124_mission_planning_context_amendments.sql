CREATE TABLE IF NOT EXISTS "mission_planning_context_amendments" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "quest_id" integer NOT NULL REFERENCES "quests"("id") ON DELETE cascade,
  "revision" integer NOT NULL,
  "previous_snapshot" jsonb NOT NULL,
  "snapshot" jsonb NOT NULL,
  "reason" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "mission_planning_context_amendments_revision_valid" CHECK ("revision" > 0),
  CONSTRAINT "mission_planning_context_amendments_reason_valid" CHECK (char_length("reason") BETWEEN 3 AND 500),
  CONSTRAINT "mission_planning_context_amendments_quest_revision_unique" UNIQUE ("quest_id", "revision")
);

CREATE INDEX IF NOT EXISTS "mission_planning_context_amendments_user_quest_revision_idx"
  ON "mission_planning_context_amendments" ("user_id", "quest_id", "revision" DESC);
