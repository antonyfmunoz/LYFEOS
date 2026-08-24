ALTER TABLE "conversation_messages"
  ADD COLUMN IF NOT EXISTS "edited_at" timestamp,
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;

ALTER TABLE "message_attachments"
  ADD COLUMN IF NOT EXISTS "snapshot_data" text,
  ADD COLUMN IF NOT EXISTS "snapshot_sha256" text,
  ADD COLUMN IF NOT EXISTS "snapshot_at" timestamp;

CREATE TABLE IF NOT EXISTS "message_reactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "message_id" uuid NOT NULL REFERENCES "public"."conversation_messages"("id") ON DELETE cascade,
  "user_id" integer NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
  "reaction" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "message_reactions_message_user_unique" UNIQUE ("message_id", "user_id"),
  CONSTRAINT "message_reactions_value_check" CHECK ("reaction" IN ('❤️', '👍', '🎉', '💪', '🔥'))
);
CREATE INDEX IF NOT EXISTS "message_reactions_message_idx" ON "message_reactions" ("message_id");

CREATE TABLE IF NOT EXISTS "message_edit_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "message_id" uuid NOT NULL REFERENCES "public"."conversation_messages"("id") ON DELETE cascade,
  "editor_user_id" integer REFERENCES "public"."users"("id") ON DELETE set null,
  "prior_body" text NOT NULL,
  "replacement_body" text NOT NULL,
  "prior_version" integer NOT NULL,
  "edited_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "message_edit_history_message_idx" ON "message_edit_history" ("message_id", "edited_at");
