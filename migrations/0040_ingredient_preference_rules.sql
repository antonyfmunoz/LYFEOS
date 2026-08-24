-- Personal label-review rules are preference records, not allergy, diagnosis,
-- treatment, or universal safety determinations.
CREATE TABLE IF NOT EXISTS "ingredient_preference_rules" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "display_name" text NOT NULL,
  "normalized_key" text NOT NULL,
  "preference_type" text NOT NULL,
  "note" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "ingredient_preference_rules_type_valid" CHECK ("preference_type" IN ('avoid', 'limit', 'watch'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "ingredient_preference_rules_user_key_unique_idx" ON "ingredient_preference_rules" ("user_id", "normalized_key");
