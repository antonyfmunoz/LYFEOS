ALTER TABLE "mission_contracts" ADD COLUMN IF NOT EXISTS "method_steps" jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "mission_contracts" ADD COLUMN IF NOT EXISTS "tool_requirements" jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "mission_contracts" ADD CONSTRAINT "mission_contracts_method_steps_valid"
    CHECK (jsonb_typeof("method_steps") = 'array' AND jsonb_array_length("method_steps") <= 12);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "mission_contracts" ADD CONSTRAINT "mission_contracts_tool_requirements_valid"
    CHECK (jsonb_typeof("tool_requirements") = 'array' AND jsonb_array_length("tool_requirements") <= 12);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
