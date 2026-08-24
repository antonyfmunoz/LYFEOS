CREATE TABLE IF NOT EXISTS "ai_persona_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" integer NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "interaction_style" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "lyfeos_presentation" jsonb NOT NULL DEFAULT '{"role":"LyfeOS companion"}'::jsonb,
  "ecosystem_sharing_enabled" boolean NOT NULL DEFAULT false,
  "allowed_destinations" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "revision" integer NOT NULL DEFAULT 1,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "ai_persona_profiles_name_valid" CHECK (char_length(btrim("name")) BETWEEN 1 AND 32),
  CONSTRAINT "ai_persona_profiles_revision_valid" CHECK ("revision" > 0)
);

INSERT INTO "ai_persona_profiles" ("user_id", "name")
SELECT "user_id", COALESCE(NULLIF(btrim("ai_assistant_name"), ''), 'NOVA')
FROM "user_stats"
ON CONFLICT ("user_id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "ai_memory_policies" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE cascade,
  "chat_history_days" integer,
  "context_receipt_days" integer NOT NULL DEFAULT 90,
  "action_receipt_days" integer NOT NULL DEFAULT 365,
  "cross_product_memory_enabled" boolean NOT NULL DEFAULT false,
  "allowed_destinations" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "ai_memory_chat_retention_valid" CHECK ("chat_history_days" IS NULL OR "chat_history_days" IN (30, 90, 365)),
  CONSTRAINT "ai_memory_context_retention_valid" CHECK ("context_receipt_days" IN (30, 90, 365)),
  CONSTRAINT "ai_memory_action_retention_valid" CHECK ("action_receipt_days" IN (90, 365, 1095))
);

CREATE TABLE IF NOT EXISTS "ai_context_receipts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "conversation_id" integer REFERENCES "conversations"("id") ON DELETE cascade,
  "assistant_message_id" integer REFERENCES "messages"("id") ON DELETE set null,
  "purpose" text NOT NULL DEFAULT 'assistant_response',
  "sources" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "disclosure" text NOT NULL DEFAULT 'Sources were made available as context; the response remains model-generated.',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "expires_at" timestamp NOT NULL
);
CREATE INDEX IF NOT EXISTS "ai_context_receipts_user_created_idx" ON "ai_context_receipts" ("user_id", "created_at");

ALTER TABLE "ai_action_records" ADD COLUMN IF NOT EXISTS "context_receipt_id" uuid REFERENCES "ai_context_receipts"("id") ON DELETE set null;
ALTER TABLE "ai_action_records" ADD COLUMN IF NOT EXISTS "repair_state" text NOT NULL DEFAULT 'unavailable';
ALTER TABLE "ai_action_records" ADD COLUMN IF NOT EXISTS "repair_expires_at" timestamp;
ALTER TABLE "ai_action_records" ADD COLUMN IF NOT EXISTS "repaired_at" timestamp;

CREATE TABLE IF NOT EXISTS "ai_action_repairs" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "action_record_id" integer NOT NULL UNIQUE REFERENCES "ai_action_records"("id") ON DELETE cascade,
  "strategy" text NOT NULL,
  "payload" jsonb NOT NULL,
  "state" text NOT NULL DEFAULT 'available',
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "ai_action_repair_state_valid" CHECK ("state" IN ('available','executing','repaired','stale','failed','expired'))
);
CREATE INDEX IF NOT EXISTS "ai_action_repairs_user_state_idx" ON "ai_action_repairs" ("user_id", "state", "created_at");

