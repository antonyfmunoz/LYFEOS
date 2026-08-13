ALTER TABLE "skill_nodes" ADD COLUMN IF NOT EXISTS "unlock_requirements" jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "skill_nodes" ADD COLUMN IF NOT EXISTS "mastery_requirements" jsonb NOT NULL DEFAULT '{}'::jsonb;
