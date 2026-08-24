CREATE TABLE IF NOT EXISTS "health_progression_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "event_key" text NOT NULL,
  "rule_key" text NOT NULL,
  "evidence_date" date NOT NULL,
  "xp_delta" integer NOT NULL,
  "action" text NOT NULL,
  "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "reversal_of_id" integer REFERENCES "health_progression_events"("id") ON DELETE restrict,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "health_progression_events_action_valid" CHECK ("action" IN ('earned', 'reversed')),
  CONSTRAINT "health_progression_events_user_key_unique_idx" UNIQUE("user_id", "event_key")
);
CREATE INDEX IF NOT EXISTS "health_progression_events_user_created_idx" ON "health_progression_events" ("user_id", "created_at");

CREATE TABLE IF NOT EXISTS "health_badge_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "event_key" text NOT NULL,
  "badge_key" text NOT NULL,
  "action" text NOT NULL,
  "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "health_badge_events_action_valid" CHECK ("action" IN ('awarded', 'reversed')),
  CONSTRAINT "health_badge_events_user_key_unique_idx" UNIQUE("user_id", "event_key")
);
CREATE INDEX IF NOT EXISTS "health_badge_events_user_badge_created_idx" ON "health_badge_events" ("user_id", "badge_key", "created_at");
