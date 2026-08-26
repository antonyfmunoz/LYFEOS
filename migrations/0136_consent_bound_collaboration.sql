CREATE TABLE IF NOT EXISTS "collaboration_workspaces" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "purpose" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "revision" integer NOT NULL DEFAULT 1,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "collaboration_workspaces_name_valid" CHECK (char_length("name") BETWEEN 2 AND 80),
  CONSTRAINT "collaboration_workspaces_purpose_valid" CHECK (char_length("purpose") BETWEEN 3 AND 280),
  CONSTRAINT "collaboration_workspaces_status_valid" CHECK ("status" IN ('active','archived')),
  CONSTRAINT "collaboration_workspaces_revision_valid" CHECK ("revision" > 0)
);
CREATE INDEX IF NOT EXISTS "collaboration_workspaces_owner_updated_idx" ON "collaboration_workspaces" ("owner_user_id", "updated_at");

CREATE TABLE IF NOT EXISTS "collaboration_memberships" (
  "id" serial PRIMARY KEY NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "collaboration_workspaces"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "invited_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "role" text NOT NULL,
  "status" text NOT NULL DEFAULT 'invited',
  "invitation_purpose" text NOT NULL,
  "accepted_at" timestamp,
  "revoked_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "collaboration_memberships_workspace_user_unique" UNIQUE ("workspace_id", "user_id"),
  CONSTRAINT "collaboration_memberships_role_valid" CHECK ("role" IN ('owner','coach','collaborator')),
  CONSTRAINT "collaboration_memberships_status_valid" CHECK ("status" IN ('invited','active','declined','revoked','left')),
  CONSTRAINT "collaboration_memberships_purpose_valid" CHECK (char_length("invitation_purpose") BETWEEN 3 AND 280)
);
CREATE INDEX IF NOT EXISTS "collaboration_memberships_user_status_idx" ON "collaboration_memberships" ("user_id", "status", "updated_at");
CREATE INDEX IF NOT EXISTS "collaboration_memberships_workspace_status_idx" ON "collaboration_memberships" ("workspace_id", "status");

CREATE TABLE IF NOT EXISTS "collaboration_visibility_grants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "collaboration_workspaces"("id") ON DELETE CASCADE,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "grantee_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "subject_type" text NOT NULL,
  "subject_id" integer NOT NULL,
  "scopes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "purpose" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "expires_at" timestamp NOT NULL,
  "revoked_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "collaboration_visibility_grants_subject_valid" CHECK ("subject_type" IN ('mission','thread')),
  CONSTRAINT "collaboration_visibility_grants_status_valid" CHECK ("status" IN ('active','revoked')),
  CONSTRAINT "collaboration_visibility_grants_subject_id_valid" CHECK ("subject_id" > 0),
  CONSTRAINT "collaboration_visibility_grants_purpose_valid" CHECK (char_length("purpose") BETWEEN 3 AND 280),
  CONSTRAINT "collaboration_visibility_grants_not_self" CHECK ("owner_user_id" <> "grantee_user_id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "collaboration_visibility_grants_active_subject_unique_idx" ON "collaboration_visibility_grants" ("workspace_id", "owner_user_id", "grantee_user_id", "subject_type", "subject_id") WHERE "status" = 'active';
CREATE INDEX IF NOT EXISTS "collaboration_visibility_grants_grantee_status_idx" ON "collaboration_visibility_grants" ("grantee_user_id", "status", "expires_at");
CREATE INDEX IF NOT EXISTS "collaboration_visibility_grants_owner_created_idx" ON "collaboration_visibility_grants" ("owner_user_id", "created_at");

CREATE TABLE IF NOT EXISTS "collaboration_audit_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "collaboration_workspaces"("id") ON DELETE CASCADE,
  "actor_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "subject_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "action" text NOT NULL,
  "subject_type" text NOT NULL,
  "subject_id" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "collaboration_audit_events_workspace_created_idx" ON "collaboration_audit_events" ("workspace_id", "created_at");
