CREATE TABLE IF NOT EXISTS "integration_action_receipts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "integration_id" integer REFERENCES "integrations"("id") ON DELETE SET NULL,
  "service" text NOT NULL,
  "action_key" text NOT NULL,
  "capability" text NOT NULL,
  "risk" text NOT NULL,
  "request_fingerprint" varchar(64) NOT NULL,
  "title" text NOT NULL,
  "summary" text NOT NULL,
  "state" text DEFAULT 'pending' NOT NULL,
  "approval_policy" text NOT NULL,
  "decision" text,
  "expires_at" timestamp,
  "decided_at" timestamp,
  "consumed_at" timestamp,
  "completed_at" timestamp,
  "http_status" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "integration_action_receipts_state_check" CHECK ("state" IN ('pending','approved','denied','executing','succeeded','failed','expired')),
  CONSTRAINT "integration_action_receipts_decision_check" CHECK ("decision" IS NULL OR "decision" IN ('allow_once','always_allow','deny','not_required')),
  CONSTRAINT "integration_action_receipts_risk_check" CHECK ("risk" IN ('low','medium','important','high'))
);

CREATE INDEX IF NOT EXISTS "integration_action_receipts_user_created_idx"
  ON "integration_action_receipts" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "integration_action_receipts_pending_idx"
  ON "integration_action_receipts" ("user_id", "state", "expires_at");
