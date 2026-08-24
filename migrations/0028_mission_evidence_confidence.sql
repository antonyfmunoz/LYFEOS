ALTER TABLE "mission_evidence"
  ADD COLUMN IF NOT EXISTS "confidence" text NOT NULL DEFAULT 'self_reported';
