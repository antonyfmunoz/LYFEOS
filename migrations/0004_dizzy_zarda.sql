ALTER TABLE "vision_goals" ADD COLUMN "reward_text" text;--> statement-breakpoint
ALTER TABLE "vision_goals" ADD COLUMN "bonus_xp" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "vision_goals" ADD COLUMN "completed_at" timestamp;