CREATE TABLE IF NOT EXISTS "health_data_rights_audit" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "action" text NOT NULL,
  "scope" text NOT NULL,
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "health_data_rights_audit_action_valid" CHECK ("action" IN ('exported', 'preferences_updated', 'health_data_deleted'))
);
CREATE INDEX IF NOT EXISTS "health_data_rights_audit_user_created_idx" ON "health_data_rights_audit" ("user_id", "created_at");
