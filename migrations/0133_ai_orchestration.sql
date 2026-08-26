CREATE TABLE IF NOT EXISTS "ai_orchestration_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "objective" text NOT NULL,
  "context_text" text,
  "status" text NOT NULL DEFAULT 'draft',
  "requested_agents" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "allowed_domains" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "capability_snapshot" jsonb NOT NULL DEFAULT '{"externalAccess":false,"mutations":false,"externalSend":false}'::jsonb,
  "source_manifest" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "provider" text,
  "model" text,
  "failure_code" text,
  "version" integer NOT NULL DEFAULT 1,
  "approved_at" timestamp,
  "started_at" timestamp,
  "completed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "ai_orchestration_runs_status_valid" CHECK ("status" IN ('draft','approved','running','completed','cancelled','failed')),
  CONSTRAINT "ai_orchestration_runs_objective_valid" CHECK (char_length("objective") BETWEEN 3 AND 4000),
  CONSTRAINT "ai_orchestration_runs_context_valid" CHECK ("context_text" IS NULL OR char_length("context_text") <= 12000),
  CONSTRAINT "ai_orchestration_runs_version_valid" CHECK ("version" > 0)
);
CREATE INDEX IF NOT EXISTS "ai_orchestration_runs_user_created_idx" ON "ai_orchestration_runs" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "ai_orchestration_runs_user_status_idx" ON "ai_orchestration_runs" ("user_id", "status");

CREATE TABLE IF NOT EXISTS "ai_orchestration_steps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL REFERENCES "ai_orchestration_runs"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "step_order" integer NOT NULL,
  "agent_kind" text NOT NULL,
  "instruction" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "output" text,
  "provider" text,
  "model" text,
  "started_at" timestamp,
  "completed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "ai_orchestration_steps_agent_valid" CHECK ("agent_kind" IN ('research','scheduling','content','analysis','integration')),
  CONSTRAINT "ai_orchestration_steps_status_valid" CHECK ("status" IN ('pending','running','completed','failed','cancelled')),
  CONSTRAINT "ai_orchestration_steps_order_valid" CHECK ("step_order" BETWEEN 1 AND 5),
  CONSTRAINT "ai_orchestration_steps_instruction_valid" CHECK (char_length("instruction") BETWEEN 3 AND 2000),
  CONSTRAINT "ai_orchestration_steps_run_order_unique" UNIQUE ("run_id", "step_order")
);
CREATE INDEX IF NOT EXISTS "ai_orchestration_steps_user_created_idx" ON "ai_orchestration_steps" ("user_id", "created_at");
