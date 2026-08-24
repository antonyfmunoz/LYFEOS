CREATE TABLE IF NOT EXISTS "message_conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_by_user_id" integer,
  "title" text NOT NULL,
  "kind" text DEFAULT 'direct' NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "priority" text DEFAULT 'normal' NOT NULL,
  "queue" text DEFAULT 'personal' NOT NULL,
  "ai_mode" text DEFAULT 'observe' NOT NULL,
  "snoozed_until" timestamp,
  "last_message_at" timestamp,
  "closed_at" timestamp,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "message_conversations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null,
  CONSTRAINT "message_conversations_kind_check" CHECK ("kind" IN ('direct', 'group')),
  CONSTRAINT "message_conversations_status_check" CHECK ("status" IN ('open', 'pending', 'snoozed', 'closed', 'spam')),
  CONSTRAINT "message_conversations_ai_mode_check" CHECK ("ai_mode" IN ('observe', 'suggest', 'approval', 'delegated')),
  CONSTRAINT "message_conversations_version_check" CHECK ("version" > 0)
);
CREATE INDEX IF NOT EXISTS "message_conversations_status_updated_idx" ON "message_conversations" ("status", "updated_at");

CREATE TABLE IF NOT EXISTS "message_conversation_participants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "role" text DEFAULT 'member' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "inbox_status" text DEFAULT 'open' NOT NULL,
  "snoozed_until" timestamp,
  "version" integer DEFAULT 1 NOT NULL,
  "last_read_message_id" uuid,
  "last_read_at" timestamp,
  "joined_at" timestamp DEFAULT now() NOT NULL,
  "left_at" timestamp,
  CONSTRAINT "message_conversation_participants_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."message_conversations"("id") ON DELETE cascade,
  CONSTRAINT "message_conversation_participants_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade,
  CONSTRAINT "message_conversation_participants_status_check" CHECK ("status" IN ('active', 'left', 'blocked')),
  CONSTRAINT "message_conversation_participants_inbox_status_check" CHECK ("inbox_status" IN ('open', 'pending', 'snoozed', 'closed', 'spam')),
  CONSTRAINT "message_conversation_participant_unique" UNIQUE ("conversation_id", "user_id")
);
CREATE INDEX IF NOT EXISTS "message_conversation_participant_user_idx" ON "message_conversation_participants" ("user_id", "status", "conversation_id");

CREATE TABLE IF NOT EXISTS "message_channel_bindings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "provider" text DEFAULT 'native' NOT NULL,
  "connection_ref" text,
  "channel_kind" text DEFAULT 'native' NOT NULL,
  "external_thread_id" text,
  "status" text DEFAULT 'active' NOT NULL,
  "capabilities" jsonb DEFAULT '{"send":true,"receive":true,"receipts":true}'::jsonb NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "message_channel_bindings_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."message_conversations"("id") ON DELETE cascade,
  CONSTRAINT "message_channel_bindings_status_check" CHECK ("status" IN ('pending', 'active', 'disabled', 'revoked', 'error')),
  CONSTRAINT "message_channel_binding_native_unique" UNIQUE ("conversation_id", "provider", "channel_kind")
);

CREATE TABLE IF NOT EXISTS "conversation_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "sender_user_id" integer,
  "sender_participant_ref" uuid,
  "direction" text DEFAULT 'outbound' NOT NULL,
  "provider" text DEFAULT 'native' NOT NULL,
  "body" text NOT NULL,
  "body_format" text DEFAULT 'plain' NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "reply_to_message_id" uuid,
  "provider_message_id" text,
  "idempotency_key" text NOT NULL,
  "sent_at" timestamp,
  "received_at" timestamp,
  "version" integer DEFAULT 1 NOT NULL,
  "extension" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "conversation_messages_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."message_conversations"("id") ON DELETE cascade,
  CONSTRAINT "conversation_messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE set null,
  CONSTRAINT "conversation_messages_reply_to_message_id_fk" FOREIGN KEY ("reply_to_message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE set null,
  CONSTRAINT "conversation_messages_body_format_check" CHECK ("body_format" IN ('plain', 'markdown', 'html')),
  CONSTRAINT "conversation_messages_status_check" CHECK ("status" IN ('draft', 'queued', 'sent', 'delivered', 'read', 'failed', 'bounced', 'rejected', 'received')),
  CONSTRAINT "conversation_messages_sender_idempotency_unique" UNIQUE ("sender_user_id", "idempotency_key")
);
CREATE INDEX IF NOT EXISTS "conversation_messages_conversation_created_idx" ON "conversation_messages" ("conversation_id", "created_at");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'message_conversation_participants_last_read_message_id_fk') THEN
    ALTER TABLE "message_conversation_participants"
      ADD CONSTRAINT "message_conversation_participants_last_read_message_id_fk"
      FOREIGN KEY ("last_read_message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE set null;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "message_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "message_id" uuid NOT NULL,
  "document_id" integer,
  "external_media_id" text,
  "attachment_kind" text DEFAULT 'file_ref' NOT NULL,
  "filename" text,
  "mime_type" text,
  "size_bytes" integer,
  "duration_ms" integer,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "message_attachments_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE cascade,
  CONSTRAINT "message_attachments_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null
);
CREATE INDEX IF NOT EXISTS "message_attachments_message_idx" ON "message_attachments" ("message_id");

CREATE TABLE IF NOT EXISTS "message_delivery_receipts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "message_id" uuid NOT NULL,
  "recipient_user_id" integer,
  "provider" text DEFAULT 'native' NOT NULL,
  "state" text NOT NULL,
  "occurred_at" timestamp DEFAULT now() NOT NULL,
  "provider_receipt_id" text,
  "failure_code" text,
  "failure_detail" text,
  "evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  CONSTRAINT "message_delivery_receipts_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE cascade,
  CONSTRAINT "message_delivery_receipts_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE set null,
  CONSTRAINT "message_delivery_receipts_state_check" CHECK ("state" IN ('queued', 'accepted', 'sent', 'delivered', 'read', 'failed', 'bounced', 'rejected')),
  CONSTRAINT "message_delivery_receipt_state_unique" UNIQUE NULLS NOT DISTINCT ("message_id", "recipient_user_id", "state")
);
CREATE INDEX IF NOT EXISTS "message_delivery_receipts_message_occurred_idx" ON "message_delivery_receipts" ("message_id", "occurred_at");

CREATE TABLE IF NOT EXISTS "message_internal_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "author_user_id" integer NOT NULL,
  "body" text NOT NULL,
  "visibility" text DEFAULT 'author_only' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "message_internal_notes_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."message_conversations"("id") ON DELETE cascade,
  CONSTRAINT "message_internal_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade,
  CONSTRAINT "message_internal_notes_visibility_check" CHECK ("visibility" = 'author_only')
);
CREATE INDEX IF NOT EXISTS "message_internal_notes_author_conversation_idx" ON "message_internal_notes" ("author_user_id", "conversation_id", "created_at");

CREATE TABLE IF NOT EXISTS "message_audit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "message_id" uuid,
  "actor_user_id" integer,
  "event_type" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "aggregate_version" integer NOT NULL,
  "occurred_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "message_audit_events_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."message_conversations"("id") ON DELETE cascade,
  CONSTRAINT "message_audit_events_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE set null,
  CONSTRAINT "message_audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null
);
CREATE INDEX IF NOT EXISTS "message_audit_events_conversation_occurred_idx" ON "message_audit_events" ("conversation_id", "occurred_at");
