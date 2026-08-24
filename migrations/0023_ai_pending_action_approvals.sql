CREATE TABLE IF NOT EXISTS "ai_pending_actions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "action_record_id" integer NOT NULL REFERENCES "ai_action_records"("id") ON DELETE cascade,
  "tool_name" text NOT NULL,
  "payload" jsonb NOT NULL,
  "state" text NOT NULL DEFAULT 'pending',
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "ai_pending_actions_action_record_unique_idx" UNIQUE("action_record_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_pending_actions_user_state_idx" ON "ai_pending_actions" ("user_id", "state", "created_at");
