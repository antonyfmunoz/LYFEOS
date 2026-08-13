CREATE TABLE "progression_badge_awards" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "badge_key" text NOT NULL,
  "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "awarded_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "progression_badge_awards_user_key_idx" ON "progression_badge_awards" ("user_id", "badge_key");
--> statement-breakpoint
CREATE INDEX "progression_badge_awards_user_awarded_idx" ON "progression_badge_awards" ("user_id", "awarded_at" DESC);
