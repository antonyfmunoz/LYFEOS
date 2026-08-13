CREATE TABLE "cross_product_work_links" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "quest_id" integer NOT NULL REFERENCES "quests"("id") ON DELETE CASCADE,
  "work_item_id" uuid NOT NULL,
  "shared_summary" text NOT NULL,
  "destinations" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "cross_product_work_links_quest_work_item_idx" ON "cross_product_work_links" ("quest_id", "work_item_id");
--> statement-breakpoint
CREATE INDEX "cross_product_work_links_user_quest_idx" ON "cross_product_work_links" ("user_id", "quest_id");
