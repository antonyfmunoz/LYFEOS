CREATE TABLE IF NOT EXISTS "health_planning_drafts" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "title" text NOT NULL,
  "category" text NOT NULL,
  "evidence_start" date NOT NULL,
  "evidence_end" date NOT NULL,
  "evidence_series" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "state" text NOT NULL DEFAULT 'pending',
  "quest_id" integer REFERENCES "quests"("id") ON DELETE set null,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "decided_at" timestamp,
  CONSTRAINT "health_planning_drafts_state_valid" CHECK ("state" IN ('pending', 'executing', 'succeeded', 'rejected', 'failed')),
  CONSTRAINT "health_planning_drafts_category_valid" CHECK ("category" IN ('health', 'fitness', 'nutrition', 'recovery', 'personal'))
);

CREATE INDEX IF NOT EXISTS "health_planning_drafts_user_state_created_idx"
  ON "health_planning_drafts" ("user_id", "state", "created_at");
