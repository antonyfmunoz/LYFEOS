CREATE TABLE "skill_nodes" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "transformation_thread_id" integer NOT NULL REFERENCES "transformation_threads"("id") ON DELETE CASCADE,
  "key" text NOT NULL,
  "name" text NOT NULL,
  "description" text NOT NULL,
  "kind" text NOT NULL DEFAULT 'supporting',
  "experience" integer NOT NULL DEFAULT 0,
  "level" integer NOT NULL DEFAULT 1,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "skill_nodes_thread_key_idx" ON "skill_nodes" ("transformation_thread_id", "key");
--> statement-breakpoint
CREATE INDEX "skill_nodes_user_thread_idx" ON "skill_nodes" ("user_id", "transformation_thread_id");
--> statement-breakpoint
CREATE TABLE "skill_edges" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "source_skill_id" integer NOT NULL REFERENCES "skill_nodes"("id") ON DELETE CASCADE,
  "target_skill_id" integer NOT NULL REFERENCES "skill_nodes"("id") ON DELETE CASCADE,
  "relationship" text NOT NULL DEFAULT 'reinforces',
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "skill_edges_unique_idx" ON "skill_edges" ("source_skill_id", "target_skill_id", "relationship");
--> statement-breakpoint
CREATE INDEX "skill_edges_user_source_idx" ON "skill_edges" ("user_id", "source_skill_id");
--> statement-breakpoint
CREATE TABLE "quest_skill_contributions" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "quest_id" integer NOT NULL REFERENCES "quests"("id") ON DELETE CASCADE,
  "skill_node_id" integer NOT NULL REFERENCES "skill_nodes"("id") ON DELETE CASCADE,
  "experience_amount" integer NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "quest_skill_contributions_unique_idx" ON "quest_skill_contributions" ("quest_id", "skill_node_id");
--> statement-breakpoint
CREATE INDEX "quest_skill_contributions_user_quest_idx" ON "quest_skill_contributions" ("user_id", "quest_id");
--> statement-breakpoint
CREATE TABLE "skill_progression_events" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "skill_node_id" integer NOT NULL REFERENCES "skill_nodes"("id") ON DELETE CASCADE,
  "quest_id" integer REFERENCES "quests"("id") ON DELETE SET NULL,
  "transformation_thread_id" integer REFERENCES "transformation_threads"("id") ON DELETE SET NULL,
  "source_type" text NOT NULL,
  "experience_delta" integer NOT NULL,
  "evidence_summary" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "skill_progression_events_user_skill_created_idx" ON "skill_progression_events" ("user_id", "skill_node_id", "created_at");
--> statement-breakpoint
CREATE INDEX "skill_progression_events_quest_idx" ON "skill_progression_events" ("quest_id");
