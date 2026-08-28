ALTER TABLE "ai_memory_policies"
  ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL DEFAULT 1;

ALTER TABLE "ai_memory_policies" DROP CONSTRAINT IF EXISTS "ai_memory_policies_revision_valid";
ALTER TABLE "ai_memory_policies"
  ADD CONSTRAINT "ai_memory_policies_revision_valid" CHECK ("revision" > 0);
