ALTER TABLE "skill_edges" ADD COLUMN IF NOT EXISTS "influence_weight" integer NOT NULL DEFAULT 1;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'skill_edges_influence_weight_range'
      AND conrelid = 'skill_edges'::regclass
  ) THEN
    ALTER TABLE "skill_edges" ADD CONSTRAINT "skill_edges_influence_weight_range" CHECK ("influence_weight" BETWEEN 1 AND 3);
  END IF;
END $$;
