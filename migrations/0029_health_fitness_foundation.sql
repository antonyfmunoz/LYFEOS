CREATE TABLE IF NOT EXISTS "health_profiles" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "weight_unit" text NOT NULL DEFAULT 'kg',
  "height_unit" text NOT NULL DEFAULT 'cm',
  "energy_unit" text NOT NULL DEFAULT 'kcal',
  "volume_unit" text NOT NULL DEFAULT 'ml',
  "height_value" real,
  "planning_context_enabled" boolean NOT NULL DEFAULT false,
  "ai_context_enabled" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "health_profiles_user_unique" UNIQUE("user_id")
);

CREATE TABLE IF NOT EXISTS "health_targets" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "kind" text NOT NULL,
  "target_value" real NOT NULL,
  "unit" text NOT NULL,
  "effective_from" date NOT NULL,
  "effective_to" date,
  "source" text NOT NULL DEFAULT 'user',
  "calculation_version" text,
  "note" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "health_targets_user_kind_date_idx" ON "health_targets" ("user_id", "kind", "effective_from");

CREATE TABLE IF NOT EXISTS "body_measurements" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "metric" text NOT NULL,
  "value" real NOT NULL,
  "unit" text NOT NULL,
  "observed_at" date NOT NULL,
  "source" text NOT NULL DEFAULT 'manual',
  "note" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "body_measurements_user_metric_date_idx" ON "body_measurements" ("user_id", "metric", "observed_at");

CREATE TABLE IF NOT EXISTS "hydration_entries" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "volume_ml" integer NOT NULL CHECK ("volume_ml" > 0),
  "occurred_at" timestamp NOT NULL DEFAULT now(),
  "source" text NOT NULL DEFAULT 'manual',
  "note" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "hydration_entries_user_occurred_idx" ON "hydration_entries" ("user_id", "occurred_at");
