CREATE TABLE IF NOT EXISTS "mission_dependencies" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "dependent_quest_id" integer NOT NULL REFERENCES "quests"("id") ON DELETE cascade,
  "prerequisite_quest_id" integer NOT NULL REFERENCES "quests"("id") ON DELETE cascade,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "mission_dependencies_unique_idx" UNIQUE("dependent_quest_id", "prerequisite_quest_id"),
  CONSTRAINT "mission_dependencies_no_self_reference" CHECK("dependent_quest_id" <> "prerequisite_quest_id")
);
CREATE INDEX IF NOT EXISTS "mission_dependencies_user_dependent_idx"
  ON "mission_dependencies" ("user_id", "dependent_quest_id");
