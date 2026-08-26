CREATE TABLE IF NOT EXISTS "lyfeos_installations" (
  "id" text PRIMARY KEY NOT NULL,
  "product_key" text NOT NULL DEFAULT 'lyfeos',
  "product_owner" text NOT NULL DEFAULT 'OST',
  "status" text NOT NULL DEFAULT 'active',
  "current_brand_revision" integer NOT NULL DEFAULT 1,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "lyfeos_installations_identity_valid" CHECK ("product_key" = 'lyfeos' AND "product_owner" = 'OST'),
  CONSTRAINT "lyfeos_installations_status_valid" CHECK ("status" IN ('active','suspended','terminated')),
  CONSTRAINT "lyfeos_installations_revision_positive" CHECK ("current_brand_revision" > 0)
);
CREATE TABLE IF NOT EXISTS "installation_brand_revisions" (
  "id" serial PRIMARY KEY NOT NULL,
  "installation_id" text NOT NULL REFERENCES "lyfeos_installations"("id") ON DELETE CASCADE,
  "revision" integer NOT NULL,
  "brand" jsonb NOT NULL,
  "actor_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "reason" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "installation_brand_revisions_installation_revision_unique" UNIQUE ("installation_id", "revision"),
  CONSTRAINT "installation_brand_revisions_revision_positive" CHECK ("revision" > 0)
);
CREATE TABLE IF NOT EXISTS "installation_domain_bindings" (
  "id" serial PRIMARY KEY NOT NULL,
  "installation_id" text NOT NULL REFERENCES "lyfeos_installations"("id") ON DELETE CASCADE,
  "hostname" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "verification_token_hash" text,
  "verified_at" timestamp,
  "revoked_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "installation_domain_bindings_status_valid" CHECK ("status" IN ('pending','verified','revoked')),
  CONSTRAINT "installation_domain_bindings_hostname_valid" CHECK ("hostname" = lower("hostname") AND char_length("hostname") BETWEEN 4 AND 253)
);
CREATE UNIQUE INDEX IF NOT EXISTS "installation_domain_bindings_hostname_unique_idx" ON "installation_domain_bindings" (lower("hostname"));
CREATE INDEX IF NOT EXISTS "installation_domain_bindings_installation_status_idx" ON "installation_domain_bindings" ("installation_id", "status");
CREATE TABLE IF NOT EXISTS "installation_admin_grants" (
  "id" serial PRIMARY KEY NOT NULL,
  "installation_id" text NOT NULL REFERENCES "lyfeos_installations"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" text NOT NULL DEFAULT 'brand_admin',
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "revoked_at" timestamp,
  CONSTRAINT "installation_admin_grants_installation_user_unique" UNIQUE ("installation_id", "user_id"),
  CONSTRAINT "installation_admin_grants_role_valid" CHECK ("role" IN ('brand_admin','installation_owner')),
  CONSTRAINT "installation_admin_grants_status_valid" CHECK ("status" IN ('active','revoked'))
);
CREATE TABLE IF NOT EXISTS "installation_audit_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "installation_id" text NOT NULL REFERENCES "lyfeos_installations"("id") ON DELETE CASCADE,
  "actor_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "action" text NOT NULL,
  "subject_type" text NOT NULL,
  "subject_id" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "installation_audit_events_installation_created_idx" ON "installation_audit_events" ("installation_id", "created_at");

INSERT INTO "lyfeos_installations" ("id") VALUES ('default') ON CONFLICT ("id") DO NOTHING;
INSERT INTO "installation_brand_revisions" ("installation_id", "revision", "brand", "reason")
VALUES ('default', 1, '{"productName":"LyfeOS","shortName":"LyfeOS","accentColor":"#00e0ff","supportUrl":"https://lyfeos.net"}'::jsonb, 'OST default installation')
ON CONFLICT ("installation_id", "revision") DO NOTHING;
INSERT INTO "installation_domain_bindings" ("installation_id", "hostname", "status", "verified_at") VALUES
  ('default', 'lyfeos.net', 'verified', now()),
  ('default', 'www.lyfeos.net', 'verified', now()),
  ('default', 'lyfeos-app.fly.dev', 'verified', now())
ON CONFLICT (lower("hostname")) DO NOTHING;
