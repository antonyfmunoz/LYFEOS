CREATE TABLE IF NOT EXISTS "mission_review_invitations" (
  "id" serial PRIMARY KEY NOT NULL,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "mission_contract_id" integer NOT NULL REFERENCES "mission_contracts"("id") ON DELETE cascade,
  "reviewer_user_id" integer REFERENCES "users"("id") ON DELETE set null,
  "token_hash" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "expires_at" timestamp NOT NULL,
  "accepted_at" timestamp,
  "completed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "mission_review_invitations_status_valid" CHECK ("status" IN ('pending', 'accepted', 'revoked', 'completed', 'expired'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mission_review_invitations_token_unique_idx" ON "mission_review_invitations" ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mission_review_invitations_owner_contract_idx" ON "mission_review_invitations" ("owner_user_id", "mission_contract_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mission_review_invitations_reviewer_status_idx" ON "mission_review_invitations" ("reviewer_user_id", "status");
--> statement-breakpoint
ALTER TABLE "mission_reviews" ADD COLUMN IF NOT EXISTS "reviewer_user_id" integer REFERENCES "users"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "mission_reviews" ADD COLUMN IF NOT EXISTS "review_invitation_id" integer REFERENCES "mission_review_invitations"("id") ON DELETE set null;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mission_reviews_invitation_unique_idx" ON "mission_reviews" ("review_invitation_id") WHERE "review_invitation_id" IS NOT NULL;
