ALTER TABLE "quests"
  ADD COLUMN IF NOT EXISTS "planning_context_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "difficulty_calibration" jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "planning_decision_source" text NOT NULL DEFAULT 'ui';

ALTER TABLE "mission_contracts"
  ADD COLUMN IF NOT EXISTS "rubric_definition" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "rubric_version" integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "acceptance_context_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "progression_revision" integer NOT NULL DEFAULT 0;

UPDATE "mission_contracts"
SET "rubric_definition" = COALESCE((
  SELECT jsonb_agg(jsonb_build_object(
    'id', 'criterion-' || criterion.ordinality,
    'requirement', criterion.value,
    'guidance', 'Compare this requirement with the submitted evidence.',
    'weight', 1,
    'required', true
  ) ORDER BY criterion.ordinality)
  FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof("mission_contracts"."required_evidence") = 'array' THEN "mission_contracts"."required_evidence" ELSE '[]'::jsonb END) WITH ORDINALITY AS criterion(value, ordinality)
), '[]'::jsonb)
WHERE "rubric_definition" = '[]'::jsonb;

ALTER TABLE "mission_reviews"
  ADD COLUMN IF NOT EXISTS "rubric_version" integer NOT NULL DEFAULT 1;

ALTER TABLE "skill_progression_events"
  ADD COLUMN IF NOT EXISTS "progression_revision" integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "reversal_of_id" integer REFERENCES "skill_progression_events"("id") ON DELETE restrict;

ALTER TABLE "ai_action_records"
  ADD COLUMN IF NOT EXISTS "planning_context_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS "mission_review_appeals" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "mission_contract_id" integer NOT NULL REFERENCES "mission_contracts"("id") ON DELETE cascade,
  "mission_review_id" integer NOT NULL REFERENCES "mission_reviews"("id") ON DELETE cascade,
  "reviewer_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "reason" text NOT NULL,
  "status" text NOT NULL DEFAULT 'open',
  "resolution_summary" text,
  "resolved_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "mission_review_appeals_status_valid" CHECK ("status" IN ('open', 'withdrawn', 'upheld', 'reconsidered'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "mission_review_appeals_open_review_unique_idx"
  ON "mission_review_appeals" ("mission_review_id") WHERE "status" = 'open';
CREATE INDEX IF NOT EXISTS "mission_review_appeals_owner_created_idx"
  ON "mission_review_appeals" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "mission_review_appeals_reviewer_status_idx"
  ON "mission_review_appeals" ("reviewer_user_id", "status", "created_at");
