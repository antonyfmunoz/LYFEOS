CREATE TABLE IF NOT EXISTS "recovery_tag_policies" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "normalized_tag" text NOT NULL,
  "display_tag" text NOT NULL,
  "classification" text NOT NULL DEFAULT 'private_sensitive',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "recovery_tag_policies_classification_valid" CHECK ("classification" IN ('private_sensitive', 'private_standard')),
  CONSTRAINT "recovery_tag_policies_user_tag_unique_idx" UNIQUE ("user_id", "normalized_tag")
);
