ALTER TABLE "health_planning_drafts" ADD COLUMN IF NOT EXISTS "expires_at" timestamp;
UPDATE "health_planning_drafts" SET "expires_at" = "created_at" + interval '7 days' WHERE "expires_at" IS NULL;
ALTER TABLE "health_planning_drafts" ALTER COLUMN "expires_at" SET DEFAULT (now() + interval '7 days');
ALTER TABLE "health_planning_drafts" ALTER COLUMN "expires_at" SET NOT NULL;
ALTER TABLE "health_planning_drafts" DROP CONSTRAINT IF EXISTS "health_planning_drafts_state_valid";
ALTER TABLE "health_planning_drafts" ADD CONSTRAINT "health_planning_drafts_state_valid"
  CHECK ("state" IN ('pending', 'executing', 'succeeded', 'rejected', 'failed', 'expired', 'revoked'));
CREATE INDEX IF NOT EXISTS "health_planning_drafts_pending_expiry_idx" ON "health_planning_drafts" ("expires_at") WHERE "state" = 'pending';

ALTER TABLE "health_planning_draft_events" ADD COLUMN IF NOT EXISTS "scope_snapshot" text NOT NULL DEFAULT 'mission_title_only';
ALTER TABLE "health_planning_draft_events" ADD COLUMN IF NOT EXISTS "expires_at_snapshot" timestamp;
UPDATE "health_planning_draft_events" e SET "expires_at_snapshot" = d."expires_at"
FROM "health_planning_drafts" d WHERE e."draft_id" = d."id" AND e."expires_at_snapshot" IS NULL;
ALTER TABLE "health_planning_draft_events" ALTER COLUMN "expires_at_snapshot" SET NOT NULL;
ALTER TABLE "health_planning_draft_events" DROP CONSTRAINT IF EXISTS "health_planning_draft_events_action_valid";
ALTER TABLE "health_planning_draft_events" ADD CONSTRAINT "health_planning_draft_events_action_valid"
  CHECK ("action" IN ('created', 'confirmed', 'rejected', 'expired', 'revoked'));
