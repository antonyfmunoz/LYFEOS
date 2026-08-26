ALTER TABLE "push_subscriptions"
  ADD COLUMN IF NOT EXISTS "endpoint" text,
  ADD COLUMN IF NOT EXISTS "p256dh" text,
  ADD COLUMN IF NOT EXISTS "auth" text,
  ADD COLUMN IF NOT EXISTS "expiration_time" timestamp,
  ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "user_agent" varchar(300),
  ADD COLUMN IF NOT EXISTS "last_success_at" timestamp,
  ADD COLUMN IF NOT EXISTS "last_failure_at" timestamp,
  ADD COLUMN IF NOT EXISTS "failure_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp NOT NULL DEFAULT now();
ALTER TABLE "push_subscriptions" DROP CONSTRAINT IF EXISTS "push_subscriptions_status_valid";
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_status_valid" CHECK ("status" IN ('active','expired','revoked','failed'));
ALTER TABLE "push_subscriptions" DROP CONSTRAINT IF EXISTS "push_subscriptions_web_shape_valid";
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_web_shape_valid" CHECK (
  ("endpoint" IS NULL AND "p256dh" IS NULL AND "auth" IS NULL)
  OR
  ("endpoint" IS NOT NULL AND "endpoint" ~ '^https://' AND char_length("endpoint") <= 2048 AND "p256dh" IS NOT NULL AND char_length("p256dh") BETWEEN 20 AND 300 AND "auth" IS NOT NULL AND char_length("auth") BETWEEN 8 AND 200)
);
ALTER TABLE "push_subscriptions" DROP CONSTRAINT IF EXISTS "push_subscriptions_failure_count_valid";
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_failure_count_valid" CHECK ("failure_count" >= 0);
UPDATE "push_subscriptions" SET "status" = 'revoked', "updated_at" = now() WHERE "endpoint" IS NULL;
ALTER TABLE "push_subscriptions" DROP CONSTRAINT IF EXISTS "push_subscriptions_user_id_users_id_fk";
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_endpoint_unique_idx" ON "push_subscriptions" ("endpoint") WHERE "endpoint" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "push_subscriptions_user_status_idx" ON "push_subscriptions" ("user_id", "status");
