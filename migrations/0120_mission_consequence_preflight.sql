ALTER TABLE "mission_contracts"
  ADD COLUMN IF NOT EXISTS "contract_revision" integer NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS "mission_consequence_preflights" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "mission_contract_id" integer NOT NULL REFERENCES "mission_contracts"("id") ON DELETE cascade,
  "contract_revision" integer NOT NULL,
  "assumptions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "affected_parties" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "scenarios" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "reversibility" text NOT NULL,
  "mitigation_plan" text NOT NULL,
  "uncertainty_note" text NOT NULL,
  "decision" text NOT NULL,
  "decision_rationale" text NOT NULL,
  "status" text NOT NULL,
  "stop_conditions_snapshot" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "acknowledged_no_authority" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "mission_consequence_preflights_revision_valid" CHECK ("contract_revision" > 0),
  CONSTRAINT "mission_consequence_preflights_reversibility_valid" CHECK ("reversibility" IN ('reversible', 'partly_reversible', 'irreversible')),
  CONSTRAINT "mission_consequence_preflights_decision_valid" CHECK ("decision" IN ('proceed', 'revise', 'do_not_proceed')),
  CONSTRAINT "mission_consequence_preflights_status_valid" CHECK ("status" IN ('ready', 'revise', 'stopped')),
  CONSTRAINT "mission_consequence_preflights_authority_ack" CHECK ("acknowledged_no_authority" = true)
);

CREATE INDEX IF NOT EXISTS "mission_consequence_preflights_contract_revision_idx"
  ON "mission_consequence_preflights" ("mission_contract_id", "contract_revision", "created_at");
CREATE INDEX IF NOT EXISTS "mission_consequence_preflights_user_created_idx"
  ON "mission_consequence_preflights" ("user_id", "created_at");
