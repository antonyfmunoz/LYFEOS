CREATE TABLE IF NOT EXISTS "activity_progression_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "event_key" text NOT NULL UNIQUE,
  "source_type" text NOT NULL,
  "source_id" integer NOT NULL,
  "action" text NOT NULL,
  "experience_delta" integer NOT NULL,
  "reason" text NOT NULL,
  "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "reversal_of_id" integer REFERENCES "activity_progression_events"("id") ON DELETE restrict,
  "source_occurred_at" timestamp NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "activity_progression_events_source_valid" CHECK ("source_type" IN ('mission', 'vision_goal')),
  CONSTRAINT "activity_progression_events_action_valid" CHECK ("action" IN ('earned', 'reversed')),
  CONSTRAINT "activity_progression_events_delta_valid" CHECK (("action" = 'earned' AND "experience_delta" > 0) OR ("action" = 'reversed' AND "experience_delta" < 0))
);

CREATE INDEX IF NOT EXISTS "activity_progression_events_user_created_idx"
  ON "activity_progression_events" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "activity_progression_events_user_source_idx"
  ON "activity_progression_events" ("user_id", "source_type", "source_id");

CREATE TABLE IF NOT EXISTS "progression_badge_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "event_key" text NOT NULL UNIQUE,
  "badge_key" text NOT NULL,
  "action" text NOT NULL,
  "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "reversal_of_id" integer REFERENCES "progression_badge_events"("id") ON DELETE restrict,
  "reason" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "progression_badge_events_action_valid" CHECK ("action" IN ('awarded', 'reversed'))
);

CREATE INDEX IF NOT EXISTS "progression_badge_events_user_created_idx"
  ON "progression_badge_events" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "progression_badge_events_user_badge_idx"
  ON "progression_badge_events" ("user_id", "badge_key", "created_at");

INSERT INTO "progression_badge_events" ("user_id", "event_key", "badge_key", "action", "evidence", "created_at")
SELECT "user_id", 'legacy-badge-award:' || "id", "badge_key", 'awarded', "evidence", "awarded_at"
FROM "progression_badge_awards"
ON CONFLICT ("event_key") DO NOTHING;
