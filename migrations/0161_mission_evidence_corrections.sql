ALTER TABLE "mission_evidence" ADD COLUMN IF NOT EXISTS "supersedes_evidence_id" integer REFERENCES "mission_evidence"("id") ON DELETE SET NULL;
ALTER TABLE "mission_evidence" ADD COLUMN IF NOT EXISTS "correction_reason" text;
CREATE INDEX IF NOT EXISTS "mission_evidence_supersedes_idx" ON "mission_evidence" ("supersedes_evidence_id");
