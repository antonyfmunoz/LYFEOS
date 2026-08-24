CREATE TABLE IF NOT EXISTS "health_planning_draft_events" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "draft_id" integer NOT NULL REFERENCES "health_planning_drafts"("id") ON DELETE cascade,
  "action" text NOT NULL,
  "title_snapshot" text NOT NULL,
  "category_snapshot" text NOT NULL,
  "quest_id_snapshot" integer,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "health_planning_draft_events_action_valid" CHECK ("action" IN ('created', 'confirmed', 'rejected')),
  CONSTRAINT "health_planning_draft_events_draft_action_unique_idx" UNIQUE ("draft_id", "action")
);

INSERT INTO "health_planning_draft_events" ("user_id", "draft_id", "action", "title_snapshot", "category_snapshot", "created_at")
SELECT "user_id", "id", 'created', "title", "category", "created_at" FROM "health_planning_drafts"
ON CONFLICT ("draft_id", "action") DO NOTHING;

INSERT INTO "health_planning_draft_events" ("user_id", "draft_id", "action", "title_snapshot", "category_snapshot", "quest_id_snapshot", "created_at")
SELECT "user_id", "id", 'confirmed', "title", "category", "quest_id", COALESCE("decided_at", "created_at")
FROM "health_planning_drafts" WHERE "state" = 'succeeded'
ON CONFLICT ("draft_id", "action") DO NOTHING;

INSERT INTO "health_planning_draft_events" ("user_id", "draft_id", "action", "title_snapshot", "category_snapshot", "created_at")
SELECT "user_id", "id", 'rejected', "title", "category", COALESCE("decided_at", "created_at")
FROM "health_planning_drafts" WHERE "state" = 'rejected'
ON CONFLICT ("draft_id", "action") DO NOTHING;

CREATE INDEX IF NOT EXISTS "health_planning_draft_events_user_created_idx" ON "health_planning_draft_events" ("user_id", "created_at");
