ALTER TABLE "umh_outbox_events"
  ADD COLUMN IF NOT EXISTS "lease_token" text,
  ADD COLUMN IF NOT EXISTS "leased_until" timestamptz;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'umh_outbox_events'
      AND column_name = 'next_attempt_at'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE "umh_outbox_events"
      ALTER COLUMN "next_attempt_at" TYPE timestamptz USING "next_attempt_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "delivered_at" TYPE timestamptz USING "delivered_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC';
  END IF;
END $$;

UPDATE "umh_outbox_events"
SET "status" = 'retry', "lease_token" = NULL, "leased_until" = NULL
WHERE "status" = 'processing';

ALTER TABLE "umh_outbox_events"
  DROP CONSTRAINT IF EXISTS "umh_outbox_events_status_valid";

ALTER TABLE "umh_outbox_events"
  ADD CONSTRAINT "umh_outbox_events_status_valid"
  CHECK ("status" IN ('pending', 'processing', 'retry', 'delivered', 'failed'));

ALTER TABLE "umh_outbox_events"
  DROP CONSTRAINT IF EXISTS "umh_outbox_events_lease_valid";

ALTER TABLE "umh_outbox_events"
  ADD CONSTRAINT "umh_outbox_events_lease_valid"
  CHECK (
    ("status" = 'processing' AND "lease_token" IS NOT NULL AND "leased_until" IS NOT NULL)
    OR
    ("status" <> 'processing' AND "lease_token" IS NULL AND "leased_until" IS NULL)
  );

CREATE INDEX IF NOT EXISTS "umh_outbox_events_delivery_due_idx"
  ON "umh_outbox_events" ("next_attempt_at", "id")
  WHERE "status" IN ('pending', 'retry', 'processing');
