CREATE TABLE IF NOT EXISTS "personal_relationships" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "contact_id" integer NOT NULL UNIQUE REFERENCES "contacts"("id") ON DELETE cascade,
  "relationship_kind" text NOT NULL DEFAULT 'personal',
  "state" text NOT NULL DEFAULT 'active',
  "purpose" text,
  "boundaries" text,
  "desired_cadence" text,
  "private_context" text,
  "sharing_enabled" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "personal_relationships_user_state_idx" ON "personal_relationships" ("user_id", "state");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "relationship_interactions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "relationship_id" integer NOT NULL REFERENCES "personal_relationships"("id") ON DELETE cascade,
  "occurred_at" timestamp NOT NULL DEFAULT now(),
  "kind" text NOT NULL DEFAULT 'check_in',
  "summary" text NOT NULL,
  "source" text NOT NULL DEFAULT 'self_report',
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "relationship_interactions_relationship_occurred_idx" ON "relationship_interactions" ("relationship_id", "occurred_at" DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "relationship_commitments" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "relationship_id" integer NOT NULL REFERENCES "personal_relationships"("id") ON DELETE cascade,
  "quest_id" integer REFERENCES "quests"("id") ON DELETE set null,
  "title" text NOT NULL,
  "detail" text,
  "due_date" text,
  "state" text NOT NULL DEFAULT 'open',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "completed_at" timestamp
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "relationship_commitments_relationship_state_idx" ON "relationship_commitments" ("relationship_id", "state");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "relationship_commitments_quest_idx" ON "relationship_commitments" ("quest_id");
