CREATE TABLE IF NOT EXISTS "health_observation_calculation_preferences" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "observation_id" integer NOT NULL REFERENCES "health_observations"("id") ON DELETE cascade,
  "included" boolean NOT NULL DEFAULT true,
  "reason" text NOT NULL DEFAULT 'overlap_resolution',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "health_observation_calculation_preferences_reason_valid"
    CHECK ("reason" IN ('overlap_resolution'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "health_observation_calculation_preferences_user_observation_unique_idx"
  ON "health_observation_calculation_preferences" ("user_id", "observation_id");
