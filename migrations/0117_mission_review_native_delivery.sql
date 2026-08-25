ALTER TABLE "mission_review_invitations" ADD COLUMN IF NOT EXISTS "delivery_channel" text;
--> statement-breakpoint
ALTER TABLE "mission_review_invitations" ADD COLUMN IF NOT EXISTS "delivery_status" text;
--> statement-breakpoint
ALTER TABLE "mission_review_invitations" ADD COLUMN IF NOT EXISTS "delivery_message_id" uuid;
--> statement-breakpoint
ALTER TABLE "mission_review_invitations" ADD COLUMN IF NOT EXISTS "delivered_at" timestamp;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "mission_review_invitations" ADD CONSTRAINT "mission_review_invitations_delivery_channel_valid"
    CHECK ("delivery_channel" IS NULL OR "delivery_channel" = 'native_inbox');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "mission_review_invitations" ADD CONSTRAINT "mission_review_invitations_delivery_status_valid"
    CHECK ("delivery_status" IS NULL OR "delivery_status" = 'delivered');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "mission_review_invitations" ADD CONSTRAINT "mission_review_invitations_delivery_evidence_complete"
    CHECK (
      ("delivery_channel" IS NULL AND "delivery_status" IS NULL AND "delivery_message_id" IS NULL AND "delivered_at" IS NULL)
      OR
      ("delivery_channel" = 'native_inbox' AND "delivery_status" = 'delivered' AND "delivery_message_id" IS NOT NULL AND "delivered_at" IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
