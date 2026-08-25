ALTER TABLE "kanban_boards" ADD COLUMN IF NOT EXISTS "origin" text NOT NULL DEFAULT 'native';
--> statement-breakpoint
ALTER TABLE "kanban_boards" ADD COLUMN IF NOT EXISTS "legacy_reconciled_at" timestamp;
--> statement-breakpoint
ALTER TABLE "kanban_boards" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;
--> statement-breakpoint
UPDATE "kanban_boards" AS "project"
SET "origin" = 'legacy_kanban'
WHERE NOT EXISTS (
  SELECT 1 FROM "project_events" AS "event"
  WHERE "event"."project_id" = "project"."id" AND "event"."event_type" = 'ProjectCreated.v1'
);
--> statement-breakpoint
INSERT INTO "project_events" ("user_id", "project_id", "event_type", "to_state", "aggregate_revision", "actor_source")
SELECT "project"."user_id", "project"."id", 'ProjectImportedFromLegacyKanban.v1', "project"."state", "project"."revision", 'migration'
FROM "kanban_boards" AS "project"
WHERE "project"."origin" = 'legacy_kanban'
  AND NOT EXISTS (
    SELECT 1 FROM "project_events" AS "event"
    WHERE "event"."project_id" = "project"."id" AND "event"."event_type" = 'ProjectImportedFromLegacyKanban.v1'
  );
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kanban_boards_user_deleted_updated_idx" ON "kanban_boards" ("user_id", "deleted_at", "updated_at");
