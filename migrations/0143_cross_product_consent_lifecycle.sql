ALTER TABLE "cross_product_sharing_preferences"
  ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL DEFAULT 1;

ALTER TABLE "cross_product_sharing_preferences"
  ADD COLUMN IF NOT EXISTS "federation_subject_id" uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE "cross_product_sharing_preferences"
  DROP CONSTRAINT IF EXISTS "cross_product_sharing_preferences_federation_subject_id_unique";

ALTER TABLE "cross_product_sharing_preferences"
  ADD CONSTRAINT "cross_product_sharing_preferences_federation_subject_id_unique"
  UNIQUE ("federation_subject_id");

ALTER TABLE "cross_product_sharing_preferences"
  DROP CONSTRAINT IF EXISTS "cross_product_sharing_preferences_revision_valid";

ALTER TABLE "cross_product_sharing_preferences"
  ADD CONSTRAINT "cross_product_sharing_preferences_revision_valid"
  CHECK ("revision" > 0);

CREATE TABLE IF NOT EXISTS "cross_product_sharing_revisions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "revision" integer NOT NULL,
  "state" text NOT NULL,
  "allowed_destinations" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "allowed_purposes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "affected_destinations" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "affected_purposes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "policy_version" text NOT NULL,
  "event_id" text,
  "delivery_state" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "cross_product_sharing_revisions_user_revision_unique" UNIQUE ("user_id", "revision"),
  CONSTRAINT "cross_product_sharing_revisions_revision_valid" CHECK ("revision" > 0),
  CONSTRAINT "cross_product_sharing_revisions_state_valid" CHECK ("state" IN ('enabled', 'disabled')),
  CONSTRAINT "cross_product_sharing_revisions_delivery_valid" CHECK ("delivery_state" IN ('queued', 'not_configured')),
  CONSTRAINT "cross_product_sharing_revisions_policy_valid" CHECK ("policy_version" = 'lyfeos.cross-product-sharing.v1')
);

CREATE INDEX IF NOT EXISTS "cross_product_sharing_revisions_user_created_idx"
  ON "cross_product_sharing_revisions" ("user_id", "created_at" DESC, "id" DESC);

INSERT INTO "cross_product_sharing_revisions" (
  "user_id", "revision", "state", "allowed_destinations", "allowed_purposes",
  "affected_destinations", "affected_purposes", "policy_version", "delivery_state", "created_at"
)
SELECT
  "user_id", "revision",
  CASE WHEN "ecosystem_sharing_enabled" THEN 'enabled' ELSE 'disabled' END,
  CASE WHEN "ecosystem_sharing_enabled" THEN "allowed_destinations" ELSE '[]'::jsonb END,
  CASE WHEN "ecosystem_sharing_enabled" THEN "allowed_purposes" ELSE '[]'::jsonb END,
  "allowed_destinations", "allowed_purposes",
  'lyfeos.cross-product-sharing.v1', 'not_configured', "updated_at"
FROM "cross_product_sharing_preferences"
ON CONFLICT ("user_id", "revision") DO NOTHING;
