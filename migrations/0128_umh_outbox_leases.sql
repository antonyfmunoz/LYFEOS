-- The UMH baseline originally existed only in the raw Drizzle history. Older
-- production databases can therefore have a converged release ledger without
-- these tables. Recreate the complete local federation boundary before adding
-- the leased outbox state machine so this migration repairs that drift safely.
CREATE TABLE IF NOT EXISTS "umh_federation_installations" (
  "id" serial PRIMARY KEY NOT NULL,
  "installation_id" text NOT NULL,
  "tenant_id" text NOT NULL,
  "key_id" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "umh_federation_installations_installation_id_unique" UNIQUE("installation_id")
);

CREATE TABLE IF NOT EXISTS "umh_inbound_commands" (
  "id" serial PRIMARY KEY NOT NULL,
  "command_id" text NOT NULL,
  "nonce" text NOT NULL,
  "installation_id" text NOT NULL,
  "tenant_id" text NOT NULL,
  "local_user_id" integer NOT NULL,
  "capability" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "payload_hash" text NOT NULL,
  "status" text DEFAULT 'received' NOT NULL,
  "outcome" jsonb,
  "received_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp,
  CONSTRAINT "umh_inbound_commands_command_id_unique" UNIQUE("command_id"),
  CONSTRAINT "umh_inbound_commands_nonce_unique" UNIQUE("nonce"),
  CONSTRAINT "umh_inbound_commands_local_user_id_users_id_fk"
    FOREIGN KEY ("local_user_id") REFERENCES "public"."users"("id")
);

CREATE TABLE IF NOT EXISTS "umh_approval_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "command_id" text NOT NULL,
  "risk" text NOT NULL,
  "state" text DEFAULT 'not_required' NOT NULL,
  "rationale" text,
  "requested_at" timestamp DEFAULT now() NOT NULL,
  "resolved_at" timestamp,
  CONSTRAINT "umh_approval_requests_command_id_umh_inbound_commands_command_id_fk"
    FOREIGN KEY ("command_id") REFERENCES "public"."umh_inbound_commands"("command_id")
);

CREATE TABLE IF NOT EXISTS "umh_audit_records" (
  "id" serial PRIMARY KEY NOT NULL,
  "command_id" text,
  "action" text NOT NULL,
  "actor_type" text NOT NULL,
  "actor_id" text NOT NULL,
  "local_user_id" integer,
  "correlation_id" text,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "occurred_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "umh_audit_records_command_id_umh_inbound_commands_command_id_fk"
    FOREIGN KEY ("command_id") REFERENCES "public"."umh_inbound_commands"("command_id"),
  CONSTRAINT "umh_audit_records_local_user_id_users_id_fk"
    FOREIGN KEY ("local_user_id") REFERENCES "public"."users"("id")
);

CREATE TABLE IF NOT EXISTS "umh_outbox_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "event_id" text NOT NULL,
  "event_type" text NOT NULL,
  "aggregate_type" text NOT NULL,
  "aggregate_id" text NOT NULL,
  "payload" jsonb NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamptz DEFAULT now() NOT NULL,
  "lease_token" text,
  "leased_until" timestamptz,
  "delivered_at" timestamptz,
  "last_error" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "umh_outbox_events_event_id_unique" UNIQUE("event_id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "umh_command_idempotency_idx"
  ON "umh_inbound_commands" ("installation_id", "local_user_id", "capability", "idempotency_key");

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
