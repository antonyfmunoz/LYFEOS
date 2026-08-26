CREATE TABLE IF NOT EXISTS "ai_voice_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "conversation_id" integer REFERENCES "conversations"("id") ON DELETE SET NULL,
  "title" varchar(160) NOT NULL,
  "purpose" text NOT NULL DEFAULT 'command',
  "status" text NOT NULL DEFAULT 'active',
  "summary_method" text,
  "summary" text,
  "key_points" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "action_items" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "transcript_started_at" timestamp NOT NULL DEFAULT now(),
  "ended_at" timestamp,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "ai_voice_sessions_purpose_valid" CHECK ("purpose" IN ('command','planning','reflection','problem_solving','meeting')),
  CONSTRAINT "ai_voice_sessions_status_valid" CHECK ("status" IN ('active','completed','cancelled')),
  CONSTRAINT "ai_voice_sessions_summary_method_valid" CHECK ("summary_method" IS NULL OR "summary_method" IN ('extractive_v1','provider_v1','user')),
  CONSTRAINT "ai_voice_sessions_version_valid" CHECK ("version" > 0)
);
CREATE INDEX IF NOT EXISTS "ai_voice_sessions_user_created_idx" ON "ai_voice_sessions" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "ai_voice_sessions_user_status_idx" ON "ai_voice_sessions" ("user_id", "status");

CREATE TABLE IF NOT EXISTS "ai_voice_session_segments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL REFERENCES "ai_voice_sessions"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "speaker" text NOT NULL,
  "transcript" text NOT NULL,
  "source" text NOT NULL,
  "idempotency_key" uuid NOT NULL,
  "occurred_at" timestamp NOT NULL DEFAULT now(),
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "ai_voice_segments_speaker_valid" CHECK ("speaker" IN ('user','assistant')),
  CONSTRAINT "ai_voice_segments_source_valid" CHECK ("source" IN ('browser_speech','typed','assistant')),
  CONSTRAINT "ai_voice_segments_transcript_valid" CHECK (char_length("transcript") BETWEEN 1 AND 12000),
  CONSTRAINT "ai_voice_segments_session_idempotency_unique" UNIQUE ("session_id", "idempotency_key")
);
CREATE INDEX IF NOT EXISTS "ai_voice_segments_session_occurred_idx" ON "ai_voice_session_segments" ("session_id", "occurred_at", "id");
CREATE INDEX IF NOT EXISTS "ai_voice_segments_user_created_idx" ON "ai_voice_session_segments" ("user_id", "created_at");
