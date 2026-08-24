ALTER TABLE "kanban_boards" ADD COLUMN IF NOT EXISTS "outcome" text;
--> statement-breakpoint
ALTER TABLE "kanban_boards" ADD COLUMN IF NOT EXISTS "state" text NOT NULL DEFAULT 'planned';
--> statement-breakpoint
ALTER TABLE "kanban_boards" ADD COLUMN IF NOT EXISTS "start_date" text;
--> statement-breakpoint
ALTER TABLE "kanban_boards" ADD COLUMN IF NOT EXISTS "due_date" text;
--> statement-breakpoint
ALTER TABLE "kanban_boards" ADD COLUMN IF NOT EXISTS "completed_at" timestamp;
--> statement-breakpoint
ALTER TABLE "kanban_boards" ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL DEFAULT 1;
--> statement-breakpoint
UPDATE "kanban_boards" SET "outcome" = COALESCE(NULLIF("outcome", ''), NULLIF("description", ''), 'Define the intended project outcome.') WHERE "outcome" IS NULL OR "outcome" = '';
--> statement-breakpoint
ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "project_id" integer;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quests_project_id_kanban_boards_id_fk' AND conrelid = 'quests'::regclass) THEN
    ALTER TABLE "quests" ADD CONSTRAINT "quests_project_id_kanban_boards_id_fk" FOREIGN KEY ("project_id") REFERENCES "kanban_boards"("id") ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quests_user_project_idx" ON "quests" ("user_id", "project_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "project_id" integer NOT NULL REFERENCES "kanban_boards"("id") ON DELETE cascade,
  "event_type" text NOT NULL,
  "from_state" text,
  "to_state" text,
  "aggregate_revision" integer NOT NULL,
  "actor_source" text NOT NULL DEFAULT 'ui',
  "occurred_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_events_project_occurred_idx" ON "project_events" ("project_id", "occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_events_user_occurred_idx" ON "project_events" ("user_id", "occurred_at");
