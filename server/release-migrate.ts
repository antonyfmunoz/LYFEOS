import pg from "pg";

const migrations = [
  {
    id: "0009_postgres_sessions",
    sql: `
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
      );
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
    `,
  },
  {
    id: "0010_transformation_threads",
    sql: `
      CREATE TABLE IF NOT EXISTS "transformation_threads" (
        "id" serial PRIMARY KEY,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "title" text NOT NULL,
        "focus" text NOT NULL,
        "rationale" text NOT NULL,
        "source_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "starter_missions" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "status" text NOT NULL DEFAULT 'draft',
        "activated_at" timestamp,
        "completed_at" timestamp,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );
      ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "transformation_thread_id" integer REFERENCES "transformation_threads"("id") ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS "transformation_threads_user_created_idx" ON "transformation_threads" ("user_id", "created_at" DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS "transformation_threads_one_active_user_idx" ON "transformation_threads" ("user_id") WHERE "status" = 'active';
      CREATE INDEX IF NOT EXISTS "quests_transformation_thread_idx" ON "quests" ("transformation_thread_id");
    `,
  },
  {
    id: "0011_thread_evidence",
    sql: `
      CREATE TABLE IF NOT EXISTS "transformation_thread_evidence" (
        "id" serial PRIMARY KEY,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "transformation_thread_id" integer NOT NULL REFERENCES "transformation_threads"("id") ON DELETE CASCADE,
        "source_type" text NOT NULL,
        "source_id" text NOT NULL,
        "summary" text NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "transformation_thread_evidence_source_idx" ON "transformation_thread_evidence" ("transformation_thread_id", "source_type", "source_id");
      CREATE INDEX IF NOT EXISTS "transformation_thread_evidence_user_created_idx" ON "transformation_thread_evidence" ("user_id", "created_at" DESC);
    `,
  },
  {
    id: "0012_skill_progression",
    sql: `
      CREATE TABLE IF NOT EXISTS "skill_nodes" (
        "id" serial PRIMARY KEY,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "transformation_thread_id" integer NOT NULL REFERENCES "transformation_threads"("id") ON DELETE CASCADE,
        "key" text NOT NULL,
        "name" text NOT NULL,
        "description" text NOT NULL,
        "kind" text NOT NULL DEFAULT 'supporting',
        "experience" integer NOT NULL DEFAULT 0,
        "level" integer NOT NULL DEFAULT 1,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "skill_nodes_thread_key_idx" ON "skill_nodes" ("transformation_thread_id", "key");
      CREATE INDEX IF NOT EXISTS "skill_nodes_user_thread_idx" ON "skill_nodes" ("user_id", "transformation_thread_id");
      CREATE TABLE IF NOT EXISTS "skill_edges" (
        "id" serial PRIMARY KEY,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "source_skill_id" integer NOT NULL REFERENCES "skill_nodes"("id") ON DELETE CASCADE,
        "target_skill_id" integer NOT NULL REFERENCES "skill_nodes"("id") ON DELETE CASCADE,
        "relationship" text NOT NULL DEFAULT 'reinforces',
        "created_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "skill_edges_unique_idx" ON "skill_edges" ("source_skill_id", "target_skill_id", "relationship");
      CREATE INDEX IF NOT EXISTS "skill_edges_user_source_idx" ON "skill_edges" ("user_id", "source_skill_id");
      CREATE TABLE IF NOT EXISTS "quest_skill_contributions" (
        "id" serial PRIMARY KEY,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "quest_id" integer NOT NULL REFERENCES "quests"("id") ON DELETE CASCADE,
        "skill_node_id" integer NOT NULL REFERENCES "skill_nodes"("id") ON DELETE CASCADE,
        "experience_amount" integer NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "quest_skill_contributions_unique_idx" ON "quest_skill_contributions" ("quest_id", "skill_node_id");
      CREATE INDEX IF NOT EXISTS "quest_skill_contributions_user_quest_idx" ON "quest_skill_contributions" ("user_id", "quest_id");
      CREATE TABLE IF NOT EXISTS "skill_progression_events" (
        "id" serial PRIMARY KEY,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "skill_node_id" integer NOT NULL REFERENCES "skill_nodes"("id") ON DELETE CASCADE,
        "quest_id" integer REFERENCES "quests"("id") ON DELETE SET NULL,
        "transformation_thread_id" integer REFERENCES "transformation_threads"("id") ON DELETE SET NULL,
        "source_type" text NOT NULL,
        "experience_delta" integer NOT NULL,
        "evidence_summary" text NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "skill_progression_events_user_skill_created_idx" ON "skill_progression_events" ("user_id", "skill_node_id", "created_at");
      CREATE INDEX IF NOT EXISTS "skill_progression_events_quest_idx" ON "skill_progression_events" ("quest_id");
    `,
  },
  {
    id: "0013_progression_badges",
    sql: `
      CREATE TABLE IF NOT EXISTS "progression_badge_awards" (
        "id" serial PRIMARY KEY,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "badge_key" text NOT NULL,
        "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "awarded_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "progression_badge_awards_user_key_idx" ON "progression_badge_awards" ("user_id", "badge_key");
      CREATE INDEX IF NOT EXISTS "progression_badge_awards_user_awarded_idx" ON "progression_badge_awards" ("user_id", "awarded_at" DESC);
    `,
  },
  {
    id: "0014_cross_product_sharing",
    sql: `
      CREATE TABLE IF NOT EXISTS "cross_product_sharing_preferences" (
        "id" serial PRIMARY KEY,
        "user_id" integer NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
        "ecosystem_sharing_enabled" boolean NOT NULL DEFAULT false,
        "allowed_destinations" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "allowed_purposes" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "consented_at" timestamp,
        "revoked_at" timestamp,
        "updated_at" timestamp NOT NULL DEFAULT now()
      );
    `,
  },
  {
    id: "0015_cross_product_work_links",
    sql: `
      CREATE TABLE IF NOT EXISTS "cross_product_work_links" (
        "id" serial PRIMARY KEY,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "quest_id" integer NOT NULL REFERENCES "quests"("id") ON DELETE CASCADE,
        "work_item_id" uuid NOT NULL,
        "shared_summary" text NOT NULL,
        "destinations" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "cross_product_work_links_quest_work_item_idx" ON "cross_product_work_links" ("quest_id", "work_item_id");
      CREATE INDEX IF NOT EXISTS "cross_product_work_links_user_quest_idx" ON "cross_product_work_links" ("user_id", "quest_id");
    `,
  },
  {
    id: "0016_skill_graph_rules",
    sql: `
      ALTER TABLE "skill_nodes" ADD COLUMN IF NOT EXISTS "unlock_requirements" jsonb NOT NULL DEFAULT '[]'::jsonb;
      ALTER TABLE "skill_nodes" ADD COLUMN IF NOT EXISTS "mastery_requirements" jsonb NOT NULL DEFAULT '{}'::jsonb;
    `,
  },
  {
    id: "0017_mission_contracts",
    sql: `
      CREATE TABLE IF NOT EXISTS "mission_contracts" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "quest_id" integer NOT NULL REFERENCES "quests"("id") ON DELETE cascade,
        "purpose" text NOT NULL,
        "expected_output" text NOT NULL,
        "capability_targets" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "prerequisites" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "required_evidence" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "review_mode" text NOT NULL DEFAULT 'self',
        "risk_level" text NOT NULL DEFAULT 'low',
        "stop_conditions" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "escalation_path" text,
        "state" text NOT NULL DEFAULT 'draft',
        "progression_applied_at" timestamp,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "mission_contracts_quest_unique_idx" UNIQUE("quest_id")
      );
      CREATE INDEX IF NOT EXISTS "mission_contracts_user_state_idx" ON "mission_contracts" ("user_id", "state");
      CREATE TABLE IF NOT EXISTS "mission_evidence" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "mission_contract_id" integer NOT NULL REFERENCES "mission_contracts"("id") ON DELETE cascade,
        "source_type" text NOT NULL,
        "source_reference" text,
        "summary" text NOT NULL,
        "submitted_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "mission_evidence_contract_submitted_idx" ON "mission_evidence" ("mission_contract_id", "submitted_at");
      CREATE TABLE IF NOT EXISTS "mission_reviews" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "mission_contract_id" integer NOT NULL REFERENCES "mission_contracts"("id") ON DELETE cascade,
        "reviewer_type" text NOT NULL DEFAULT 'self',
        "decision" text NOT NULL,
        "rubric" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "summary" text NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "mission_reviews_contract_created_idx" ON "mission_reviews" ("mission_contract_id", "created_at");
    `,
  },
  {
    id: "0018_ai_action_records",
    sql: `
      CREATE TABLE IF NOT EXISTS "ai_action_records" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "tool_name" text NOT NULL,
        "risk" text NOT NULL DEFAULT 'low',
        "state" text NOT NULL DEFAULT 'started',
        "input_summary" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "outcome_summary" text,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "completed_at" timestamp
      );
      CREATE INDEX IF NOT EXISTS "ai_action_records_user_created_idx" ON "ai_action_records" ("user_id", "created_at");
    `,
  },
  {
    id: "0019_personal_capabilities",
    sql: `
      CREATE TABLE IF NOT EXISTS "personal_capabilities" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "key" text NOT NULL,
        "name" text NOT NULL,
        "description" text NOT NULL,
        "experience" integer NOT NULL DEFAULT 0,
        "level" integer NOT NULL DEFAULT 1,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "personal_capabilities_user_key_idx" UNIQUE("user_id", "key")
      );
      CREATE INDEX IF NOT EXISTS "personal_capabilities_user_experience_idx" ON "personal_capabilities" ("user_id", "experience");
      ALTER TABLE "skill_nodes" ADD COLUMN IF NOT EXISTS "capability_id" integer REFERENCES "personal_capabilities"("id") ON DELETE set null;
      CREATE INDEX IF NOT EXISTS "skill_nodes_capability_idx" ON "skill_nodes" ("capability_id");
      WITH distinct_capabilities AS (
        SELECT DISTINCT ON ("user_id", capability_key)
          "user_id", capability_key, "name", "description"
        FROM (
          SELECT
            "user_id",
            regexp_replace(lower(trim("name")), '[^a-z0-9]+', '-', 'g') AS capability_key,
            "name",
            "description",
            "updated_at"
          FROM "skill_nodes"
        ) normalized
        WHERE capability_key <> ''
        ORDER BY "user_id", capability_key, "updated_at" DESC
      )
      INSERT INTO "personal_capabilities" ("user_id", "key", "name", "description", "experience", "level")
      SELECT "user_id", capability_key, "name", "description", 0, 1
      FROM distinct_capabilities
      ON CONFLICT ("user_id", "key") DO NOTHING;
      UPDATE "skill_nodes" node
      SET "capability_id" = capability."id"
      FROM "personal_capabilities" capability
      WHERE capability."user_id" = node."user_id"
        AND capability."key" = regexp_replace(lower(trim(node."name")), '[^a-z0-9]+', '-', 'g')
        AND node."capability_id" IS NULL;
      UPDATE "personal_capabilities" capability
      SET "experience" = totals.experience, "updated_at" = now()
      FROM (
        SELECT "capability_id", sum("experience")::integer AS experience
        FROM "skill_nodes"
        WHERE "capability_id" IS NOT NULL
        GROUP BY "capability_id"
      ) totals
      WHERE capability."id" = totals."capability_id";
      WITH RECURSIVE level_curve AS (
        SELECT "id", "experience", 1 AS level, "experience" AS remaining, 100 AS threshold
        FROM "personal_capabilities"
        UNION ALL
        SELECT "id", "experience", level + 1, remaining - threshold, floor(threshold * 1.35)::integer
        FROM level_curve
        WHERE remaining >= threshold
      ), resolved_levels AS (
        SELECT DISTINCT ON ("id") "id", level
        FROM level_curve
        ORDER BY "id", level DESC
      )
      UPDATE "personal_capabilities" capability
      SET "level" = resolved_levels.level, "updated_at" = now()
      FROM resolved_levels
      WHERE capability."id" = resolved_levels."id";
    `,
  },
  {
    id: "0020_personal_relationship_intelligence",
    sql: `
      CREATE TABLE IF NOT EXISTS "personal_relationships" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "contact_id" integer NOT NULL UNIQUE REFERENCES "contacts"("id") ON DELETE cascade,
        "relationship_kind" text NOT NULL DEFAULT 'personal',
        "state" text NOT NULL DEFAULT 'active',
        "purpose" text,
        "boundaries" text,
        "desired_cadence" text,
        "private_context" text,
        "sharing_enabled" boolean NOT NULL DEFAULT false,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "personal_relationships_user_state_idx" ON "personal_relationships" ("user_id", "state");
      CREATE TABLE IF NOT EXISTS "relationship_interactions" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "relationship_id" integer NOT NULL REFERENCES "personal_relationships"("id") ON DELETE cascade,
        "occurred_at" timestamp NOT NULL DEFAULT now(),
        "kind" text NOT NULL DEFAULT 'check_in',
        "summary" text NOT NULL,
        "source" text NOT NULL DEFAULT 'self_report',
        "created_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "relationship_interactions_relationship_occurred_idx" ON "relationship_interactions" ("relationship_id", "occurred_at" DESC);
      CREATE TABLE IF NOT EXISTS "relationship_commitments" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "relationship_id" integer NOT NULL REFERENCES "personal_relationships"("id") ON DELETE cascade,
        "quest_id" integer REFERENCES "quests"("id") ON DELETE set null,
        "title" text NOT NULL,
        "detail" text,
        "due_date" text,
        "state" text NOT NULL DEFAULT 'open',
        "created_at" timestamp NOT NULL DEFAULT now(),
        "completed_at" timestamp
      );
      CREATE INDEX IF NOT EXISTS "relationship_commitments_relationship_state_idx" ON "relationship_commitments" ("relationship_id", "state");
      CREATE INDEX IF NOT EXISTS "relationship_commitments_quest_idx" ON "relationship_commitments" ("quest_id");
    `,
  },
  {
    id: "0021_evidence_backed_progression",
    sql: `
      ALTER TABLE "mission_contracts" ADD COLUMN IF NOT EXISTS "progression_applied_at" timestamp;
    `,
  },
  {
    id: "0022_backfill_practice_contracts",
    sql: `
      INSERT INTO "mission_contracts" (
        "user_id", "quest_id", "purpose", "expected_output", "capability_targets",
        "prerequisites", "required_evidence", "review_mode", "risk_level", "stop_conditions", "state"
      )
      SELECT DISTINCT
        q."user_id", q."id", 'Practice the skills linked to this mission.',
        'Record what happened while completing ' || q."title" || '.',
        '[]'::jsonb, '[]'::jsonb,
        '["A short observation or artifact showing what happened."]'::jsonb,
        'self', 'low', '[]'::jsonb, 'accepted'
      FROM "quests" q
      INNER JOIN "quest_skill_contributions" c ON c."quest_id" = q."id" AND c."user_id" = q."user_id"
      LEFT JOIN "mission_contracts" contract ON contract."quest_id" = q."id"
      WHERE contract."id" IS NULL;
    `,
  },
  {
    id: "0023_ai_pending_action_approvals",
    sql: `
      CREATE TABLE IF NOT EXISTS "ai_pending_actions" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "action_record_id" integer NOT NULL REFERENCES "ai_action_records"("id") ON DELETE cascade,
        "tool_name" text NOT NULL,
        "payload" jsonb NOT NULL,
        "state" text NOT NULL DEFAULT 'pending',
        "expires_at" timestamp NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "ai_pending_actions_action_record_unique_idx" UNIQUE("action_record_id")
      );
      CREATE INDEX IF NOT EXISTS "ai_pending_actions_user_state_idx" ON "ai_pending_actions" ("user_id", "state", "created_at");
    `,
  },
  {
    id: "0024_skill_edge_weights",
    sql: `
      ALTER TABLE "skill_edges" ADD COLUMN IF NOT EXISTS "influence_weight" integer NOT NULL DEFAULT 1;
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'skill_edges_influence_weight_range'
            AND conrelid = 'skill_edges'::regclass
        ) THEN
          ALTER TABLE "skill_edges" ADD CONSTRAINT "skill_edges_influence_weight_range" CHECK ("influence_weight" BETWEEN 1 AND 3);
        END IF;
      END $$;
    `,
  },
  {
    id: "0025_ai_context_preferences",
    sql: `
      ALTER TABLE "user_profile" ADD COLUMN IF NOT EXISTS "ai_context_preferences" jsonb NOT NULL DEFAULT '{"planning":true,"identity":false,"dailyState":false,"conversationHistory":false}'::jsonb;
    `,
  },
  {
    id: "0026_mission_deferrals",
    sql: `
      CREATE TABLE IF NOT EXISTS "mission_deferrals" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "quest_id" integer NOT NULL REFERENCES "quests"("id") ON DELETE cascade,
        "previous_due_date" text,
        "deferred_to_date" text NOT NULL,
        "reason" text,
        "created_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "mission_deferrals_user_quest_created_idx"
        ON "mission_deferrals" ("user_id", "quest_id", "created_at");
    `,
  },
  {
    id: "0027_mission_dependencies",
    sql: `
      CREATE TABLE IF NOT EXISTS "mission_dependencies" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "dependent_quest_id" integer NOT NULL REFERENCES "quests"("id") ON DELETE cascade,
        "prerequisite_quest_id" integer NOT NULL REFERENCES "quests"("id") ON DELETE cascade,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "mission_dependencies_unique_idx" UNIQUE("dependent_quest_id", "prerequisite_quest_id"),
        CONSTRAINT "mission_dependencies_no_self_reference" CHECK("dependent_quest_id" <> "prerequisite_quest_id")
      );
      CREATE INDEX IF NOT EXISTS "mission_dependencies_user_dependent_idx"
        ON "mission_dependencies" ("user_id", "dependent_quest_id");
    `,
  },
  {
    id: "0028_mission_evidence_confidence",
    sql: `
      ALTER TABLE "mission_evidence"
        ADD COLUMN IF NOT EXISTS "confidence" text NOT NULL DEFAULT 'self_reported';
    `,
  },
  {
    id: "0029_health_fitness_foundation",
    sql: `
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
        "kind" text NOT NULL, "target_value" real NOT NULL, "unit" text NOT NULL,
        "effective_from" date NOT NULL, "effective_to" date, "source" text NOT NULL DEFAULT 'user',
        "calculation_version" text, "note" text,
        "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "health_targets_user_kind_date_idx" ON "health_targets" ("user_id", "kind", "effective_from");
      CREATE TABLE IF NOT EXISTS "body_measurements" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "metric" text NOT NULL, "value" real NOT NULL, "unit" text NOT NULL, "observed_at" date NOT NULL,
        "source" text NOT NULL DEFAULT 'manual', "note" text,
        "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "body_measurements_user_metric_date_idx" ON "body_measurements" ("user_id", "metric", "observed_at");
      CREATE TABLE IF NOT EXISTS "hydration_entries" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "volume_ml" integer NOT NULL CHECK ("volume_ml" > 0), "occurred_at" timestamp NOT NULL DEFAULT now(),
        "source" text NOT NULL DEFAULT 'manual', "note" text, "created_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "hydration_entries_user_occurred_idx" ON "hydration_entries" ("user_id", "occurred_at");
    `,
  },
  {
    id: "0030_nutrition_diary",
    sql: `
      CREATE TABLE IF NOT EXISTS "nutrition_foods" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "name" text NOT NULL, "brand" text, "barcode" text, "source" text NOT NULL DEFAULT 'manual',
        "serving_size_grams" real NOT NULL DEFAULT 100, "note" text,
        "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "nutrition_foods_user_name_idx" ON "nutrition_foods" ("user_id", "name");
      CREATE TABLE IF NOT EXISTS "nutrition_food_nutrients" (
        "id" serial PRIMARY KEY NOT NULL, "food_id" integer NOT NULL REFERENCES "nutrition_foods"("id") ON DELETE cascade,
        "nutrient_key" text NOT NULL, "amount_per_100g" real NOT NULL, "unit" text NOT NULL,
        "source" text NOT NULL DEFAULT 'manual', CONSTRAINT "nutrition_food_nutrients_unique_idx" UNIQUE("food_id", "nutrient_key")
      );
      CREATE TABLE IF NOT EXISTS "nutrition_diary_entries" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "food_id" integer NOT NULL REFERENCES "nutrition_foods"("id") ON DELETE cascade,
        "serving_grams" real NOT NULL CHECK ("serving_grams" > 0), "meal_slot" text NOT NULL DEFAULT 'other',
        "occurred_at" timestamp NOT NULL DEFAULT now(), "note" text, "created_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "nutrition_diary_entries_user_occurred_idx" ON "nutrition_diary_entries" ("user_id", "occurred_at");
    `,
  },
  {
    id: "0031_workout_ledger",
    sql: `
      CREATE TABLE IF NOT EXISTS "workouts" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "activity_type" text NOT NULL, "duration_minutes" integer, "perceived_exertion" integer,
        "occurred_at" timestamp NOT NULL DEFAULT now(), "source" text NOT NULL DEFAULT 'manual', "note" text,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "workouts_duration_positive" CHECK ("duration_minutes" IS NULL OR "duration_minutes" > 0),
        CONSTRAINT "workouts_rpe_range" CHECK ("perceived_exertion" IS NULL OR "perceived_exertion" BETWEEN 1 AND 10)
      );
      CREATE INDEX IF NOT EXISTS "workouts_user_occurred_idx" ON "workouts" ("user_id", "occurred_at");
      CREATE TABLE IF NOT EXISTS "workout_exercises" (
        "id" serial PRIMARY KEY NOT NULL, "workout_id" integer NOT NULL REFERENCES "workouts"("id") ON DELETE cascade,
        "name" text NOT NULL, "sets" integer, "reps" integer, "load_value" real, "load_unit" text,
        "distance_meters" real, "duration_seconds" integer, "sort_order" integer NOT NULL DEFAULT 0, "note" text
      );
    `,
  },
  {
    id: "0032_nutrition_recipes",
    sql: `
      CREATE TABLE IF NOT EXISTS "nutrition_recipes" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "name" text NOT NULL, "servings" real NOT NULL DEFAULT 1 CHECK ("servings" > 0), "note" text,
        "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "nutrition_recipes_user_name_idx" ON "nutrition_recipes" ("user_id", "name");
      CREATE TABLE IF NOT EXISTS "nutrition_recipe_ingredients" (
        "id" serial PRIMARY KEY NOT NULL, "recipe_id" integer NOT NULL REFERENCES "nutrition_recipes"("id") ON DELETE cascade,
        "food_id" integer NOT NULL REFERENCES "nutrition_foods"("id") ON DELETE restrict,
        "grams" real NOT NULL CHECK ("grams" > 0), "sort_order" integer NOT NULL DEFAULT 0,
        CONSTRAINT "nutrition_recipe_ingredients_unique_idx" UNIQUE("recipe_id", "food_id")
      );
    `,
  },
  {
    id: "0033_supplement_entries",
    sql: `
      CREATE TABLE IF NOT EXISTS "supplement_entries" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "name" text NOT NULL, "amount" real, "unit" text, "occurred_at" timestamp NOT NULL DEFAULT now(),
        "source" text NOT NULL DEFAULT 'manual', "note" text, "created_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "supplement_entries_user_occurred_idx" ON "supplement_entries" ("user_id", "occurred_at");
    `,
  },
  {
    id: "0034_fasting_windows",
    sql: `
      CREATE TABLE IF NOT EXISTS "fasting_windows" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "started_at" timestamp NOT NULL, "ended_at" timestamp, "note" text,
        "source" text NOT NULL DEFAULT 'manual', "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "fasting_windows_time_order" CHECK ("ended_at" IS NULL OR "ended_at" >= "started_at")
      );
      CREATE INDEX IF NOT EXISTS "fasting_windows_user_started_idx" ON "fasting_windows" ("user_id", "started_at");
    `,
  },
  {
    id: "0035_body_context_and_recovery",
    sql: `
      ALTER TABLE "health_profiles" ADD COLUMN IF NOT EXISTS "body_type" text;
      ALTER TABLE "health_profiles" ADD COLUMN IF NOT EXISTS "training_experience" text;
      CREATE TABLE IF NOT EXISTS "recovery_activities" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "activity_type" text NOT NULL, "duration_minutes" integer, "perceived_effect" integer,
        "occurred_at" timestamp NOT NULL DEFAULT now(), "source" text NOT NULL DEFAULT 'manual', "note" text, "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "recovery_activities_duration_positive" CHECK ("duration_minutes" IS NULL OR "duration_minutes" > 0),
        CONSTRAINT "recovery_activities_effect_range" CHECK ("perceived_effect" IS NULL OR "perceived_effect" BETWEEN 1 AND 5)
      );
      CREATE INDEX IF NOT EXISTS "recovery_activities_user_occurred_idx" ON "recovery_activities" ("user_id", "occurred_at");
    `,
  },
  {
    id: "0036_health_observations",
    sql: `
      CREATE TABLE IF NOT EXISTS "health_observations" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "category" text NOT NULL, "metric_key" text NOT NULL, "display_name" text NOT NULL, "value" real NOT NULL, "unit" text NOT NULL,
        "method" text, "source" text NOT NULL DEFAULT 'manual', "observed_at" timestamp NOT NULL,
        "lab_name" text, "reference_low" real, "reference_high" real, "reference_unit" text, "note" text, "created_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "health_observations_user_category_metric_date_idx" ON "health_observations" ("user_id", "category", "metric_key", "observed_at");
    `,
  },
  {
    id: "0037_workout_sets",
    sql: `
      CREATE TABLE IF NOT EXISTS "workout_sets" (
        "id" serial PRIMARY KEY NOT NULL, "workout_exercise_id" integer NOT NULL REFERENCES "workout_exercises"("id") ON DELETE cascade,
        "set_order" integer NOT NULL DEFAULT 0, "reps" integer, "load_value" real, "load_unit" text,
        "distance_meters" real, "duration_seconds" integer, "perceived_exertion" integer, "reps_in_reserve" integer,
        "completed" boolean NOT NULL DEFAULT true, "note" text, "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "workout_sets_reps_positive" CHECK ("reps" IS NULL OR "reps" > 0),
        CONSTRAINT "workout_sets_load_positive" CHECK ("load_value" IS NULL OR "load_value" > 0),
        CONSTRAINT "workout_sets_distance_positive" CHECK ("distance_meters" IS NULL OR "distance_meters" > 0),
        CONSTRAINT "workout_sets_duration_positive" CHECK ("duration_seconds" IS NULL OR "duration_seconds" > 0),
        CONSTRAINT "workout_sets_rpe_range" CHECK ("perceived_exertion" IS NULL OR "perceived_exertion" BETWEEN 1 AND 10),
        CONSTRAINT "workout_sets_rir_range" CHECK ("reps_in_reserve" IS NULL OR "reps_in_reserve" BETWEEN 0 AND 20)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "workout_sets_exercise_order_unique_idx" ON "workout_sets" ("workout_exercise_id", "set_order");
    `,
  },
  {
    id: "0038_workout_templates",
    sql: `
      CREATE TABLE IF NOT EXISTS "workout_templates" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "name" text NOT NULL, "activity_type" text NOT NULL, "exercise_blueprint" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "workout_templates_user_name_idx" ON "workout_templates" ("user_id", "name");
    `,
  },
  {
    id: "0039_ingredient_scanner_foundation",
    sql: `
      CREATE TABLE IF NOT EXISTS "ingredient_scans" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "capture_method" text NOT NULL DEFAULT 'manual_label', "barcode" text, "product_name" text,
        "raw_ingredients_text" text NOT NULL, "parse_version" text NOT NULL DEFAULT 'v1', "status" text NOT NULL DEFAULT 'reviewed', "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "ingredient_scans_capture_method_valid" CHECK ("capture_method" IN ('manual_label', 'barcode', 'photo_ocr')),
        CONSTRAINT "ingredient_scans_status_valid" CHECK ("status" IN ('reviewed', 'unresolved'))
      );
      CREATE INDEX IF NOT EXISTS "ingredient_scans_user_created_idx" ON "ingredient_scans" ("user_id", "created_at");
      CREATE TABLE IF NOT EXISTS "ingredient_scan_items" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "scan_id" integer NOT NULL REFERENCES "ingredient_scans"("id") ON DELETE cascade,
        "raw_name" text NOT NULL, "normalized_key" text NOT NULL, "source_order" integer NOT NULL,
        "classification" text NOT NULL DEFAULT 'unknown', "reason" text, "evidence_title" text, "evidence_url" text,
        "evidence_strength" text NOT NULL DEFAULT 'unverified', "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "ingredient_scan_items_classification_valid" CHECK ("classification" IN ('unknown', 'label_fact', 'preference_match', 'regulatory_notice')),
        CONSTRAINT "ingredient_scan_items_evidence_strength_valid" CHECK ("evidence_strength" IN ('unverified', 'source_supplied', 'curated'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "ingredient_scan_items_scan_order_unique_idx" ON "ingredient_scan_items" ("scan_id", "source_order");
      CREATE INDEX IF NOT EXISTS "ingredient_scan_items_user_normalized_idx" ON "ingredient_scan_items" ("user_id", "normalized_key");
    `,
  },
  {
    id: "0040_ingredient_preference_rules",
    sql: `
      CREATE TABLE IF NOT EXISTS "ingredient_preference_rules" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "display_name" text NOT NULL, "normalized_key" text NOT NULL, "preference_type" text NOT NULL,
        "note" text, "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "ingredient_preference_rules_type_valid" CHECK ("preference_type" IN ('avoid', 'limit', 'watch'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "ingredient_preference_rules_user_key_unique_idx" ON "ingredient_preference_rules" ("user_id", "normalized_key");
    `,
  },
  {
    id: "0041_nutrition_input_units",
    sql: `
      ALTER TABLE "nutrition_diary_entries" ADD COLUMN IF NOT EXISTS "input_quantity" real;
      ALTER TABLE "nutrition_diary_entries" ADD COLUMN IF NOT EXISTS "input_unit" text;
    `,
  },
  {
    id: "0042_recovery_activity_details",
    sql: `
      ALTER TABLE "recovery_activities" ADD COLUMN IF NOT EXISTS "custom_label" text;
      ALTER TABLE "recovery_activities" ADD COLUMN IF NOT EXISTS "intensity" integer;
    `,
  },
  {
    id: "0043_nutrition_diary_snapshots",
    sql: `
      ALTER TABLE "nutrition_diary_entries" ADD COLUMN IF NOT EXISTS "nutrient_snapshot" jsonb NOT NULL DEFAULT '[]'::jsonb;
      UPDATE "nutrition_diary_entries" AS entry
      SET "nutrient_snapshot" = COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'nutrientKey', nutrient."nutrient_key", 'amountPer100g', nutrient."amount_per_100g", 'unit', nutrient."unit" -- gitleaks:allow
        ) ORDER BY nutrient."nutrient_key")
        FROM "nutrition_food_nutrients" AS nutrient WHERE nutrient."food_id" = entry."food_id"
      ), '[]'::jsonb)
      WHERE entry."nutrient_snapshot" = '[]'::jsonb;
    `,
  },
  {
    id: "0044_nutrition_food_favorites",
    sql: `ALTER TABLE "nutrition_foods" ADD COLUMN IF NOT EXISTS "favorite" boolean NOT NULL DEFAULT false;`,
  },
  {
    id: "0045_sleep_reflection",
    sql: `
      ALTER TABLE "user_daily_logs" ADD COLUMN IF NOT EXISTS "sleep_quality" integer;
      ALTER TABLE "user_daily_logs" ADD COLUMN IF NOT EXISTS "sleep_note" text;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_daily_logs_sleep_quality_valid') THEN
          ALTER TABLE "user_daily_logs" ADD CONSTRAINT "user_daily_logs_sleep_quality_valid"
            CHECK ("sleep_quality" IS NULL OR "sleep_quality" BETWEEN 1 AND 5);
        END IF;
      END $$;
    `,
  },
  {
    id: "0046_sleep_naps",
    sql: `
      CREATE TABLE IF NOT EXISTS "sleep_naps" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "date" date NOT NULL, "start_time" text NOT NULL, "end_time" text NOT NULL,
        "sleep_quality" integer, "note" text, "source" text NOT NULL DEFAULT 'manual',
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "sleep_naps_quality_valid" CHECK ("sleep_quality" IS NULL OR "sleep_quality" BETWEEN 1 AND 5)
      );
      CREATE INDEX IF NOT EXISTS "sleep_naps_user_date_idx" ON "sleep_naps" ("user_id", "date");
    `,
  },
  {
    id: "0047_recovery_activity_tags",
    sql: `ALTER TABLE "recovery_activities" ADD COLUMN IF NOT EXISTS "tags" jsonb NOT NULL DEFAULT '[]'::jsonb;`,
  },
  {
    id: "0048_exercise_definitions",
    sql: `
      CREATE TABLE IF NOT EXISTS "exercise_definitions" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer REFERENCES "users"("id") ON DELETE cascade,
        "name" text NOT NULL, "category" text, "equipment" text,
        "primary_muscles" jsonb NOT NULL DEFAULT '[]'::jsonb, "secondary_muscles" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "instructions" text, "source" text NOT NULL DEFAULT 'user_custom', "source_version" text,
        "archived_at" timestamp, "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "exercise_definitions_user_name_unique_idx" ON "exercise_definitions" ("user_id", "name") WHERE "user_id" IS NOT NULL;
      CREATE INDEX IF NOT EXISTS "exercise_definitions_name_idx" ON "exercise_definitions" ("name");
    `,
  },
  {
    id: "0049_workout_programs",
    sql: `
      CREATE TABLE IF NOT EXISTS "workout_programs" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "name" text NOT NULL, "note" text, "archived_at" timestamp,
        "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS "workout_program_sessions" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "program_id" integer NOT NULL REFERENCES "workout_programs"("id") ON DELETE cascade,
        "template_id" integer REFERENCES "workout_templates"("id") ON DELETE SET NULL,
        "completed_workout_id" integer REFERENCES "workouts"("id") ON DELETE SET NULL,
        "title" text NOT NULL, "scheduled_date" date NOT NULL, "status" text NOT NULL DEFAULT 'planned', "note" text,
        "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "workout_program_sessions_status_valid" CHECK ("status" IN ('planned', 'skipped', 'completed')),
        CONSTRAINT "workout_program_sessions_completion_valid" CHECK ("status" <> 'completed' OR "completed_workout_id" IS NOT NULL)
      );
      CREATE INDEX IF NOT EXISTS "workout_programs_user_idx" ON "workout_programs" ("user_id", "updated_at");
      CREATE INDEX IF NOT EXISTS "workout_program_sessions_user_date_idx" ON "workout_program_sessions" ("user_id", "scheduled_date");
    `,
  },
  {
    id: "0050_workout_cardio_details",
    sql: `
      ALTER TABLE "workouts" ADD COLUMN IF NOT EXISTS "moving_time_seconds" integer;
      ALTER TABLE "workouts" ADD COLUMN IF NOT EXISTS "elevation_gain_meters" real;
      ALTER TABLE "workouts" ADD COLUMN IF NOT EXISTS "average_heart_rate_bpm" integer;
      ALTER TABLE "workouts" ADD COLUMN IF NOT EXISTS "max_heart_rate_bpm" integer;
      ALTER TABLE "workouts" ADD COLUMN IF NOT EXISTS "heart_rate_source" text;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workouts_cardio_details_valid') THEN
          ALTER TABLE "workouts" ADD CONSTRAINT "workouts_cardio_details_valid" CHECK (
            ("moving_time_seconds" IS NULL OR "moving_time_seconds" > 0) AND
            ("elevation_gain_meters" IS NULL OR "elevation_gain_meters" >= 0) AND
            ("average_heart_rate_bpm" IS NULL OR "average_heart_rate_bpm" BETWEEN 20 AND 260) AND
            ("max_heart_rate_bpm" IS NULL OR "max_heart_rate_bpm" BETWEEN 20 AND 260) AND
            ("average_heart_rate_bpm" IS NULL OR "max_heart_rate_bpm" IS NULL OR "max_heart_rate_bpm" >= "average_heart_rate_bpm") AND
            ("heart_rate_source" IS NULL OR "heart_rate_source" IN ('manual', 'device', 'imported'))
          );
        END IF;
      END $$;
    `,
  },
  {
    id: "0051_supplement_schedules",
    sql: `
      CREATE TABLE IF NOT EXISTS "supplement_schedules" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "name" text NOT NULL, "amount" real, "unit" text, "cadence" text NOT NULL DEFAULT 'daily',
        "weekdays" jsonb NOT NULL DEFAULT '[]'::jsonb, "time_of_day" text, "active" boolean NOT NULL DEFAULT true,
        "note" text, "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "supplement_schedules_cadence_valid" CHECK ("cadence" IN ('daily', 'specific_days', 'as_needed'))
      );
      CREATE TABLE IF NOT EXISTS "supplement_schedule_events" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "schedule_id" integer NOT NULL REFERENCES "supplement_schedules"("id") ON DELETE cascade,
        "date" date NOT NULL, "status" text NOT NULL,
        "supplement_entry_id" integer REFERENCES "supplement_entries"("id") ON DELETE SET NULL,
        "note" text, "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "supplement_schedule_events_status_valid" CHECK ("status" IN ('taken', 'skipped'))
      );
      CREATE INDEX IF NOT EXISTS "supplement_schedules_user_idx" ON "supplement_schedules" ("user_id", "active");
      CREATE UNIQUE INDEX IF NOT EXISTS "supplement_schedule_events_schedule_date_unique_idx" ON "supplement_schedule_events" ("schedule_id", "date");
    `,
  },
  {
    id: "0052_nutrition_meal_plans",
    sql: `
      CREATE TABLE IF NOT EXISTS "nutrition_meal_plans" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "name" text NOT NULL, "start_date" date NOT NULL, "end_date" date NOT NULL, "status" text NOT NULL DEFAULT 'active',
        "note" text, "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "nutrition_meal_plans_dates_valid" CHECK ("end_date" >= "start_date"),
        CONSTRAINT "nutrition_meal_plans_status_valid" CHECK ("status" IN ('active', 'archived'))
      );
      CREATE TABLE IF NOT EXISTS "nutrition_meal_plan_entries" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "plan_id" integer NOT NULL REFERENCES "nutrition_meal_plans"("id") ON DELETE cascade,
        "scheduled_date" date NOT NULL, "meal_slot" text NOT NULL,
        "food_id" integer REFERENCES "nutrition_foods"("id") ON DELETE restrict,
        "recipe_id" integer REFERENCES "nutrition_recipes"("id") ON DELETE restrict,
        "quantity" real NOT NULL, "input_unit" text NOT NULL, "status" text NOT NULL DEFAULT 'planned',
        "logged_diary_entry_ids" jsonb NOT NULL DEFAULT '[]'::jsonb, "note" text,
        "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "nutrition_meal_plan_entries_source_valid" CHECK (("food_id" IS NOT NULL) <> ("recipe_id" IS NOT NULL)),
        CONSTRAINT "nutrition_meal_plan_entries_quantity_valid" CHECK ("quantity" > 0),
        CONSTRAINT "nutrition_meal_plan_entries_unit_valid" CHECK ("input_unit" IN ('g', 'serving', 'recipe_serving')),
        CONSTRAINT "nutrition_meal_plan_entries_status_valid" CHECK ("status" IN ('planned', 'logged', 'skipped'))
      );
      CREATE INDEX IF NOT EXISTS "nutrition_meal_plans_user_date_idx" ON "nutrition_meal_plans" ("user_id", "start_date");
      CREATE INDEX IF NOT EXISTS "nutrition_meal_plan_entries_user_date_idx" ON "nutrition_meal_plan_entries" ("user_id", "scheduled_date");
    `,
  },
  {
    id: "0053_nutrition_portions",
    sql: `
      ALTER TABLE "nutrition_foods" ADD COLUMN IF NOT EXISTS "density_grams_per_ml" real;
      CREATE TABLE IF NOT EXISTS "nutrition_food_portions" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "food_id" integer NOT NULL REFERENCES "nutrition_foods"("id") ON DELETE cascade,
        "label" text NOT NULL, "grams_per_unit" real NOT NULL, "source" text NOT NULL DEFAULT 'manual',
        "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "nutrition_food_portions_grams_valid" CHECK ("grams_per_unit" > 0)
      );
      ALTER TABLE "nutrition_diary_entries" ADD COLUMN IF NOT EXISTS "input_portion_id" integer REFERENCES "nutrition_food_portions"("id") ON DELETE SET NULL;
      ALTER TABLE "nutrition_diary_entries" ADD COLUMN IF NOT EXISTS "input_unit_label" text;
      ALTER TABLE "nutrition_diary_entries" ADD COLUMN IF NOT EXISTS "input_grams_per_unit" real;
      ALTER TABLE "nutrition_meal_plan_entries" ADD COLUMN IF NOT EXISTS "input_portion_id" integer REFERENCES "nutrition_food_portions"("id") ON DELETE SET NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS "nutrition_food_portions_food_label_unique_idx" ON "nutrition_food_portions" ("food_id", "label");
      CREATE INDEX IF NOT EXISTS "nutrition_food_portions_user_idx" ON "nutrition_food_portions" ("user_id", "food_id");
    `,
  },
  {
    id: "0054_health_target_schedules",
    sql: `
      ALTER TABLE "health_targets" ADD COLUMN IF NOT EXISTS "weekdays" jsonb NOT NULL DEFAULT '[]'::jsonb;
      ALTER TABLE "health_targets" ADD COLUMN IF NOT EXISTS "rationale" text;
      ALTER TABLE "health_targets" ADD COLUMN IF NOT EXISTS "method_id" text;
      ALTER TABLE "health_targets" ADD COLUMN IF NOT EXISTS "method_version" text;
    `,
  },
  {
    id: "0055_nutrition_recipe_revisions",
    sql: `
      ALTER TABLE "nutrition_recipes" ADD COLUMN IF NOT EXISTS "folder" text;
      CREATE TABLE IF NOT EXISTS "nutrition_recipe_revisions" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "recipe_id" integer NOT NULL REFERENCES "nutrition_recipes"("id") ON DELETE cascade,
        "revision_number" integer NOT NULL, "name" text NOT NULL, "servings" real NOT NULL, "folder" text, "note" text,
        "ingredients_snapshot" jsonb NOT NULL DEFAULT '[]'::jsonb, "created_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "nutrition_recipe_revisions_number_unique_idx" ON "nutrition_recipe_revisions" ("recipe_id", "revision_number");
      CREATE INDEX IF NOT EXISTS "nutrition_recipe_revisions_user_idx" ON "nutrition_recipe_revisions" ("user_id", "recipe_id");
    `,
  },
  {
    id: "0056_health_mutation_integrity",
    sql: `
      ALTER TABLE "nutrition_diary_entries" ADD COLUMN IF NOT EXISTS "client_mutation_id" text;
      ALTER TABLE "nutrition_diary_entries" ADD COLUMN IF NOT EXISTS "mutation_payload_hash" text;
      ALTER TABLE "workouts" ADD COLUMN IF NOT EXISTS "client_mutation_id" text;
      ALTER TABLE "workouts" ADD COLUMN IF NOT EXISTS "mutation_payload_hash" text;
      CREATE TABLE IF NOT EXISTS "health_deletion_receipts" (
        "id" uuid PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "resource_type" text NOT NULL, "resource_snapshot" jsonb NOT NULL, "expires_at" timestamp NOT NULL,
        "restored_at" timestamp, "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "health_deletion_receipts_type_valid" CHECK ("resource_type" IN ('nutrition_diary_entry', 'workout'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "nutrition_diary_entries_user_mutation_unique_idx" ON "nutrition_diary_entries" ("user_id", "client_mutation_id") WHERE "client_mutation_id" IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS "workouts_user_mutation_unique_idx" ON "workouts" ("user_id", "client_mutation_id") WHERE "client_mutation_id" IS NOT NULL;
      CREATE INDEX IF NOT EXISTS "health_deletion_receipts_user_expiry_idx" ON "health_deletion_receipts" ("user_id", "expires_at");
    `,
  },
  {
    id: "0057_workout_planning_analytics",
    sql: `
      ALTER TABLE "workout_templates" ADD COLUMN IF NOT EXISTS "folder" text;
      ALTER TABLE "workout_templates" ADD COLUMN IF NOT EXISTS "note" text;
      CREATE TABLE IF NOT EXISTS "workout_template_revisions" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "template_id" integer NOT NULL REFERENCES "workout_templates"("id") ON DELETE cascade, "revision_number" integer NOT NULL,
        "name" text NOT NULL, "activity_type" text NOT NULL, "folder" text, "note" text, "exercise_blueprint" jsonb NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(), CONSTRAINT "workout_template_revisions_number_unique_idx" UNIQUE("template_id", "revision_number")
      );
      CREATE INDEX IF NOT EXISTS "workout_template_revisions_user_idx" ON "workout_template_revisions" ("user_id", "template_id");
      INSERT INTO "workout_template_revisions" ("user_id", "template_id", "revision_number", "name", "activity_type", "folder", "note", "exercise_blueprint")
      SELECT template."user_id", template."id", 1, template."name", template."activity_type", template."folder", template."note", template."exercise_blueprint"
      FROM "workout_templates" template
      WHERE NOT EXISTS (SELECT 1 FROM "workout_template_revisions" revision WHERE revision."template_id" = template."id");
      ALTER TABLE "workout_program_sessions" ADD COLUMN IF NOT EXISTS "original_template_id" integer REFERENCES "workout_templates"("id") ON DELETE set null;
      ALTER TABLE "workout_program_sessions" ADD COLUMN IF NOT EXISTS "substitution_reason" text;
      ALTER TABLE "workout_program_sessions" ADD COLUMN IF NOT EXISTS "substituted_at" timestamp;
      ALTER TABLE "workout_program_sessions" ADD COLUMN IF NOT EXISTS "recurrence_group_id" uuid;
      ALTER TABLE "workout_program_sessions" ADD COLUMN IF NOT EXISTS "recurrence_index" integer;
      UPDATE "workout_program_sessions" SET "original_template_id" = "template_id" WHERE "original_template_id" IS NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS "workout_program_sessions_recurrence_unique_idx" ON "workout_program_sessions" ("user_id", "recurrence_group_id", "recurrence_index") WHERE "recurrence_group_id" IS NOT NULL;
      CREATE TABLE IF NOT EXISTS "heart_rate_zone_profiles" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "name" text NOT NULL, "source" text NOT NULL DEFAULT 'user', "method_id" text, "method_version" text, "zones" jsonb NOT NULL,
        "active" boolean NOT NULL DEFAULT true, "note" text, "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "heart_rate_zone_profiles_source_valid" CHECK ("source" IN ('user', 'professional'))
      );
      CREATE INDEX IF NOT EXISTS "heart_rate_zone_profiles_user_idx" ON "heart_rate_zone_profiles" ("user_id", "updated_at");
      CREATE UNIQUE INDEX IF NOT EXISTS "heart_rate_zone_profiles_one_active_idx" ON "heart_rate_zone_profiles" ("user_id") WHERE "active" = true;
    `,
  },
  {
    id: "0058_health_tracking_provenance",
    sql: `
      ALTER TABLE "hydration_entries" ADD COLUMN IF NOT EXISTS "input_quantity" real;
      ALTER TABLE "hydration_entries" ADD COLUMN IF NOT EXISTS "input_unit" text;
      ALTER TABLE "hydration_entries" ADD COLUMN IF NOT EXISTS "input_ml_per_unit" real;
      UPDATE "hydration_entries" SET "input_quantity" = "volume_ml", "input_unit" = 'ml', "input_ml_per_unit" = 1 WHERE "input_quantity" IS NULL;
      CREATE TABLE IF NOT EXISTS "recovery_routines" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "name" text NOT NULL, "activity_type" text NOT NULL, "custom_label" text, "duration_minutes" integer, "intensity" integer,
        "cadence" text NOT NULL DEFAULT 'daily', "weekdays" jsonb NOT NULL DEFAULT '[]'::jsonb, "time_of_day" text,
        "reminder_enabled" boolean NOT NULL DEFAULT false, "tags" jsonb NOT NULL DEFAULT '[]'::jsonb, "note" text,
        "active" boolean NOT NULL DEFAULT true, "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "recovery_routines_cadence_valid" CHECK ("cadence" IN ('daily', 'specific_days', 'as_needed'))
      );
      CREATE INDEX IF NOT EXISTS "recovery_routines_user_active_idx" ON "recovery_routines" ("user_id", "active");
      ALTER TABLE "recovery_activities" ADD COLUMN IF NOT EXISTS "routine_id" integer REFERENCES "recovery_routines"("id") ON DELETE set null;
      CREATE TABLE IF NOT EXISTS "health_metric_definitions" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "metric_key" text NOT NULL, "display_name" text NOT NULL, "category" text NOT NULL, "canonical_unit" text NOT NULL,
        "definition_source" text NOT NULL DEFAULT 'user', "source_url" text, "version" text NOT NULL, "valid_min" real, "valid_max" real,
        "active" boolean NOT NULL DEFAULT true, "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "health_metric_definitions_key_version_unique_idx" UNIQUE("user_id", "metric_key", "version")
      );
      CREATE INDEX IF NOT EXISTS "health_metric_definitions_user_active_idx" ON "health_metric_definitions" ("user_id", "active");
      ALTER TABLE "health_observations" ADD COLUMN IF NOT EXISTS "metric_definition_id" integer REFERENCES "health_metric_definitions"("id") ON DELETE set null;
      ALTER TABLE "health_observations" ADD COLUMN IF NOT EXISTS "definition_version" text;
      ALTER TABLE "health_observations" ADD COLUMN IF NOT EXISTS "method_version" text;
      ALTER TABLE "health_observations" ADD COLUMN IF NOT EXISTS "source_record_id" text;
      ALTER TABLE "health_observations" ADD COLUMN IF NOT EXISTS "device_name" text;
      ALTER TABLE "health_observations" ADD COLUMN IF NOT EXISTS "imported_at" timestamp;
      CREATE UNIQUE INDEX IF NOT EXISTS "health_observations_user_source_record_unique_idx" ON "health_observations" ("user_id", "source", "source_record_id") WHERE "source_record_id" IS NOT NULL;
    `,
  },
  {
    id: "0059_health_data_rights_audit",
    sql: `
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
    `,
  },
  {
    id: "0060_health_progression_ledger",
    sql: `
      CREATE TABLE IF NOT EXISTS "health_progression_events" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "event_key" text NOT NULL, "rule_key" text NOT NULL, "evidence_date" date NOT NULL, "xp_delta" integer NOT NULL,
        "action" text NOT NULL, "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "reversal_of_id" integer REFERENCES "health_progression_events"("id") ON DELETE restrict, "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "health_progression_events_action_valid" CHECK ("action" IN ('earned', 'reversed')),
        CONSTRAINT "health_progression_events_user_key_unique_idx" UNIQUE("user_id", "event_key")
      );
      CREATE INDEX IF NOT EXISTS "health_progression_events_user_created_idx" ON "health_progression_events" ("user_id", "created_at");
      CREATE TABLE IF NOT EXISTS "health_badge_events" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "event_key" text NOT NULL, "badge_key" text NOT NULL, "action" text NOT NULL,
        "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb, "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "health_badge_events_action_valid" CHECK ("action" IN ('awarded', 'reversed')),
        CONSTRAINT "health_badge_events_user_key_unique_idx" UNIQUE("user_id", "event_key")
      );
      CREATE INDEX IF NOT EXISTS "health_badge_events_user_badge_created_idx" ON "health_badge_events" ("user_id", "badge_key", "created_at");
    `,
  },
  {
    id: "0061_health_timezone_provenance",
    sql: `
      ALTER TABLE "health_profiles" ADD COLUMN IF NOT EXISTS "time_zone" text;
      ALTER TABLE "health_profiles" ADD COLUMN IF NOT EXISTS "utc_offset_minutes" integer;
      ALTER TABLE "body_measurements" ADD COLUMN IF NOT EXISTS "recorded_time_zone" text;
      ALTER TABLE "body_measurements" ADD COLUMN IF NOT EXISTS "recorded_utc_offset_minutes" integer;
      ALTER TABLE "hydration_entries" ADD COLUMN IF NOT EXISTS "recorded_time_zone" text;
      ALTER TABLE "hydration_entries" ADD COLUMN IF NOT EXISTS "recorded_utc_offset_minutes" integer;
      ALTER TABLE "supplement_entries" ADD COLUMN IF NOT EXISTS "recorded_time_zone" text;
      ALTER TABLE "supplement_entries" ADD COLUMN IF NOT EXISTS "recorded_utc_offset_minutes" integer;
      ALTER TABLE "fasting_windows" ADD COLUMN IF NOT EXISTS "recorded_time_zone" text;
      ALTER TABLE "fasting_windows" ADD COLUMN IF NOT EXISTS "recorded_utc_offset_minutes" integer;
      ALTER TABLE "recovery_activities" ADD COLUMN IF NOT EXISTS "recorded_time_zone" text;
      ALTER TABLE "recovery_activities" ADD COLUMN IF NOT EXISTS "recorded_utc_offset_minutes" integer;
      ALTER TABLE "health_observations" ADD COLUMN IF NOT EXISTS "recorded_time_zone" text;
      ALTER TABLE "health_observations" ADD COLUMN IF NOT EXISTS "recorded_utc_offset_minutes" integer;
      ALTER TABLE "nutrition_diary_entries" ADD COLUMN IF NOT EXISTS "recorded_time_zone" text;
      ALTER TABLE "nutrition_diary_entries" ADD COLUMN IF NOT EXISTS "recorded_utc_offset_minutes" integer;
      ALTER TABLE "workouts" ADD COLUMN IF NOT EXISTS "recorded_time_zone" text;
      ALTER TABLE "workouts" ADD COLUMN IF NOT EXISTS "recorded_utc_offset_minutes" integer;
    `,
  },
  {
    id: "0062_health_planning_handoff",
    sql: `
      CREATE TABLE IF NOT EXISTS "health_planning_drafts" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "title" text NOT NULL, "category" text NOT NULL, "evidence_start" date NOT NULL, "evidence_end" date NOT NULL,
        "evidence_series" jsonb NOT NULL DEFAULT '[]'::jsonb, "state" text NOT NULL DEFAULT 'pending',
        "quest_id" integer REFERENCES "quests"("id") ON DELETE set null, "created_at" timestamp NOT NULL DEFAULT now(), "decided_at" timestamp,
        CONSTRAINT "health_planning_drafts_state_valid" CHECK ("state" IN ('pending', 'executing', 'succeeded', 'rejected', 'failed')),
        CONSTRAINT "health_planning_drafts_category_valid" CHECK ("category" IN ('health', 'fitness', 'nutrition', 'recovery', 'personal'))
      );
      CREATE INDEX IF NOT EXISTS "health_planning_drafts_user_state_created_idx" ON "health_planning_drafts" ("user_id", "state", "created_at");
    `,
  },
  {
    id: "0063_hydration_reminder_preferences",
    sql: `
      ALTER TABLE "health_profiles" ADD COLUMN IF NOT EXISTS "hydration_reminder_enabled" boolean NOT NULL DEFAULT false;
      ALTER TABLE "health_profiles" ADD COLUMN IF NOT EXISTS "hydration_reminder_interval_minutes" integer NOT NULL DEFAULT 120;
      ALTER TABLE "health_profiles" DROP CONSTRAINT IF EXISTS "health_profiles_hydration_reminder_interval_valid";
      ALTER TABLE "health_profiles" ADD CONSTRAINT "health_profiles_hydration_reminder_interval_valid" CHECK ("hydration_reminder_interval_minutes" BETWEEN 30 AND 480);
    `,
  },
  {
    id: "0064_body_measurement_protocols",
    sql: `
      ALTER TABLE "body_measurements" ADD COLUMN IF NOT EXISTS "measurement_method" text NOT NULL DEFAULT 'unspecified';
      ALTER TABLE "body_measurements" ADD COLUMN IF NOT EXISTS "measurement_protocol" text;
      ALTER TABLE "body_measurements" DROP CONSTRAINT IF EXISTS "body_measurements_method_valid";
      ALTER TABLE "body_measurements" ADD CONSTRAINT "body_measurements_method_valid" CHECK ("measurement_method" IN ('unspecified', 'scale', 'tape', 'bia', 'caliper', 'dexa', 'bod_pod', 'professional', 'other'));
      CREATE INDEX IF NOT EXISTS "body_measurements_user_metric_unit_method_date_idx" ON "body_measurements" ("user_id", "metric", "unit", "measurement_method", "observed_at");
    `,
  },
  {
    id: "0065_workout_revisions",
    sql: `
      CREATE TABLE IF NOT EXISTS "workout_revisions" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "workout_id" integer NOT NULL REFERENCES "workouts"("id") ON DELETE cascade, "revision_number" integer NOT NULL,
        "snapshot" jsonb NOT NULL, "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "workout_revisions_number_unique_idx" UNIQUE("workout_id", "revision_number")
      );
      CREATE INDEX IF NOT EXISTS "workout_revisions_user_idx" ON "workout_revisions" ("user_id", "workout_id");
      INSERT INTO "workout_revisions" ("user_id", "workout_id", "revision_number", "snapshot")
      SELECT workout."user_id", workout."id", 1, jsonb_build_object(
        'workout', to_jsonb(workout),
        'exercises', COALESCE((
          SELECT jsonb_agg(to_jsonb(exercise) || jsonb_build_object(
            'setRecords', COALESCE((SELECT jsonb_agg(to_jsonb(set_record) ORDER BY set_record."set_order") FROM "workout_sets" set_record WHERE set_record."workout_exercise_id" = exercise."id"), '[]'::jsonb)
          ) ORDER BY exercise."sort_order") FROM "workout_exercises" exercise WHERE exercise."workout_id" = workout."id"
        ), '[]'::jsonb)
      )
      FROM "workouts" workout
      WHERE NOT EXISTS (SELECT 1 FROM "workout_revisions" revision WHERE revision."workout_id" = workout."id");
    `,
  },
  {
    id: "0066_health_connection_foundation",
    sql: `
      CREATE TABLE IF NOT EXISTS "health_connections" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "provider" text NOT NULL, "provider_name" text NOT NULL, "status" text NOT NULL DEFAULT 'pending',
        "scopes" jsonb NOT NULL DEFAULT '[]'::jsonb, "consent_version" text NOT NULL, "consented_at" timestamp NOT NULL DEFAULT now(),
        "credential_ref" text, "last_sync_at" timestamp, "last_error_code" text, "revoked_at" timestamp,
        "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "health_connections_status_valid" CHECK ("status" IN ('pending', 'active', 'paused', 'error', 'revoked'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "health_connections_user_provider_unique_idx" ON "health_connections" ("user_id", "provider");
      CREATE INDEX IF NOT EXISTS "health_connections_user_status_idx" ON "health_connections" ("user_id", "status");
      CREATE TABLE IF NOT EXISTS "health_sync_cursors" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "connection_id" integer NOT NULL REFERENCES "health_connections"("id") ON DELETE cascade, "resource_type" text NOT NULL,
        "cursor_value" text, "status" text NOT NULL DEFAULT 'idle', "consecutive_failures" integer NOT NULL DEFAULT 0,
        "last_attempt_at" timestamp, "last_success_at" timestamp, "next_retry_at" timestamp, "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "health_sync_cursors_status_valid" CHECK ("status" IN ('idle', 'syncing', 'retry_wait', 'paused', 'revoked'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "health_sync_cursors_connection_resource_unique_idx" ON "health_sync_cursors" ("connection_id", "resource_type");
      CREATE INDEX IF NOT EXISTS "health_sync_cursors_user_status_idx" ON "health_sync_cursors" ("user_id", "status");
      CREATE TABLE IF NOT EXISTS "health_import_runs" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "connection_id" integer NOT NULL REFERENCES "health_connections"("id") ON DELETE cascade, "provider" text NOT NULL,
        "resource_type" text NOT NULL, "status" text NOT NULL DEFAULT 'running', "fetched_count" integer NOT NULL DEFAULT 0,
        "imported_count" integer NOT NULL DEFAULT 0, "replayed_count" integer NOT NULL DEFAULT 0, "corrected_count" integer NOT NULL DEFAULT 0,
        "suppressed_count" integer NOT NULL DEFAULT 0, "failed_count" integer NOT NULL DEFAULT 0, "error_code" text,
        "started_at" timestamp NOT NULL DEFAULT now(), "finished_at" timestamp,
        CONSTRAINT "health_import_runs_status_valid" CHECK ("status" IN ('running', 'succeeded', 'failed')),
        CONSTRAINT "health_import_runs_counts_nonnegative" CHECK ("fetched_count" >= 0 AND "imported_count" >= 0 AND "replayed_count" >= 0 AND "corrected_count" >= 0 AND "suppressed_count" >= 0 AND "failed_count" >= 0)
      );
      CREATE INDEX IF NOT EXISTS "health_import_runs_user_started_idx" ON "health_import_runs" ("user_id", "started_at");
      CREATE INDEX IF NOT EXISTS "health_import_runs_connection_status_idx" ON "health_import_runs" ("connection_id", "status");
      CREATE TABLE IF NOT EXISTS "health_import_failures" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "connection_id" integer NOT NULL REFERENCES "health_connections"("id") ON DELETE cascade,
        "run_id" integer NOT NULL REFERENCES "health_import_runs"("id") ON DELETE cascade, "provider" text NOT NULL,
        "resource_type" text NOT NULL, "error_code" text NOT NULL, "retryable" boolean NOT NULL DEFAULT true,
        "status" text NOT NULL DEFAULT 'retry_wait', "next_retry_at" timestamp, "created_at" timestamp NOT NULL DEFAULT now(), "resolved_at" timestamp,
        CONSTRAINT "health_import_failures_status_valid" CHECK ("status" IN ('retry_wait', 'resolved', 'abandoned'))
      );
      CREATE INDEX IF NOT EXISTS "health_import_failures_user_status_idx" ON "health_import_failures" ("user_id", "status");
      CREATE INDEX IF NOT EXISTS "health_import_failures_run_idx" ON "health_import_failures" ("run_id");
      CREATE TABLE IF NOT EXISTS "health_source_records" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "connection_id" integer NOT NULL REFERENCES "health_connections"("id") ON DELETE cascade, "provider" text NOT NULL,
        "source_record_id" text NOT NULL, "record_type" text NOT NULL, "observed_at" timestamp NOT NULL,
        "received_at" timestamp NOT NULL DEFAULT now(), "payload_fingerprint" text NOT NULL, "transform_version" text NOT NULL,
        "state" text NOT NULL DEFAULT 'active', "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb, "source_metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        CONSTRAINT "health_source_records_state_valid" CHECK ("state" IN ('active', 'superseded', 'deleted'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "health_source_records_user_provider_record_fingerprint_unique_idx" ON "health_source_records" ("user_id", "provider", "source_record_id", "payload_fingerprint");
      CREATE INDEX IF NOT EXISTS "health_source_records_user_observed_idx" ON "health_source_records" ("user_id", "observed_at");
      CREATE TABLE IF NOT EXISTS "health_source_suppressions" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "connection_id" integer NOT NULL REFERENCES "health_connections"("id") ON DELETE cascade, "provider" text NOT NULL,
        "source_record_key_hash" text NOT NULL, "reason" text NOT NULL DEFAULT 'user_deleted', "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "health_source_suppressions_reason_valid" CHECK ("reason" IN ('user_deleted'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "health_source_suppressions_user_provider_key_unique_idx" ON "health_source_suppressions" ("user_id", "provider", "source_record_key_hash");
      CREATE TABLE IF NOT EXISTS "health_source_preferences" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "metric_key" text NOT NULL, "ordered_sources" jsonb NOT NULL DEFAULT '[]'::jsonb, "updated_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "health_source_preferences_user_metric_unique_idx" ON "health_source_preferences" ("user_id", "metric_key");
      CREATE TABLE IF NOT EXISTS "health_connection_audits" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "connection_id" integer REFERENCES "health_connections"("id") ON DELETE set null, "provider" text NOT NULL,
        "action" text NOT NULL, "details" jsonb NOT NULL DEFAULT '{}'::jsonb, "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "health_connection_audits_action_valid" CHECK ("action" IN ('consent_intent_created', 'paused', 'resumed', 'retry_requested', 'revoked', 'cancelled', 'imports_deleted', 'source_priority_updated'))
      );
      CREATE INDEX IF NOT EXISTS "health_connection_audits_user_created_idx" ON "health_connection_audits" ("user_id", "created_at");
    `,
  },
  {
    id: "0067_health_observation_intervals",
    sql: `
      ALTER TABLE "health_observations" ADD COLUMN IF NOT EXISTS "temporal_type" text NOT NULL DEFAULT 'instant';
      ALTER TABLE "health_observations" ADD COLUMN IF NOT EXISTS "interval_start_at" timestamp;
      ALTER TABLE "health_observations" ADD COLUMN IF NOT EXISTS "interval_end_at" timestamp;
      ALTER TABLE "health_observations" ADD COLUMN IF NOT EXISTS "aggregation_kind" text NOT NULL DEFAULT 'average';
      DO $$ BEGIN
        ALTER TABLE "health_observations" ADD CONSTRAINT "health_observations_temporal_type_valid" CHECK ("temporal_type" IN ('instant', 'interval'));
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE "health_observations" ADD CONSTRAINT "health_observations_aggregation_kind_valid" CHECK ("aggregation_kind" IN ('sum', 'average', 'latest'));
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE "health_observations" ADD CONSTRAINT "health_observations_interval_shape_valid" CHECK (
          ("temporal_type" = 'instant' AND "interval_start_at" IS NULL AND "interval_end_at" IS NULL)
          OR ("temporal_type" = 'interval' AND "interval_start_at" IS NOT NULL AND "interval_end_at" IS NOT NULL AND "interval_start_at" < "interval_end_at" AND "observed_at" = "interval_end_at")
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      CREATE INDEX IF NOT EXISTS "health_observations_user_metric_interval_idx" ON "health_observations" ("user_id", "metric_key", "interval_start_at", "interval_end_at");
    `,
  },
  {
    id: "0068_health_observation_calculation_preferences",
    sql: `
      CREATE TABLE IF NOT EXISTS "health_observation_calculation_preferences" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "observation_id" integer NOT NULL REFERENCES "health_observations"("id") ON DELETE cascade,
        "included" boolean NOT NULL DEFAULT true,
        "reason" text NOT NULL DEFAULT 'overlap_resolution',
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "health_observation_calculation_preferences_reason_valid" CHECK ("reason" IN ('overlap_resolution'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "health_observation_calculation_preferences_user_observation_unique_idx" ON "health_observation_calculation_preferences" ("user_id", "observation_id");
    `,
  },
  {
    id: "0069_health_lab_collection_metadata",
    sql: `
      ALTER TABLE "health_observations" ADD COLUMN IF NOT EXISTS "specimen_type" text;
      ALTER TABLE "health_observations" ADD COLUMN IF NOT EXISTS "collected_at" timestamp;
      DO $$ BEGIN
        ALTER TABLE "health_observations" ADD CONSTRAINT "health_observations_lab_collection_metadata_valid" CHECK (("specimen_type" IS NULL AND "collected_at" IS NULL) OR "category" = 'lab');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      CREATE INDEX IF NOT EXISTS "health_observations_user_collected_at_idx" ON "health_observations" ("user_id", "collected_at");
    `,
  },
  {
    id: "0070_workout_program_completion_evidence",
    sql: `
      ALTER TABLE "workout_program_sessions" ADD COLUMN IF NOT EXISTS "completion_link_lost_at" timestamp;
      ALTER TABLE "workout_program_sessions" DROP CONSTRAINT IF EXISTS "workout_program_sessions_completion_valid";
      ALTER TABLE "workout_program_sessions" ADD CONSTRAINT "workout_program_sessions_completion_valid" CHECK (
        "status" <> 'completed' OR "completed_workout_id" IS NOT NULL OR "completion_link_lost_at" IS NOT NULL
      );
      CREATE OR REPLACE FUNCTION "lyfeos_mark_program_completion_link_lost"() RETURNS trigger AS $$
      BEGIN
        UPDATE "workout_program_sessions" SET "completion_link_lost_at" = now(), "updated_at" = now() WHERE "completed_workout_id" = OLD."id";
        RETURN OLD;
      END;
      $$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS "workouts_mark_program_completion_link_lost" ON "workouts";
      CREATE TRIGGER "workouts_mark_program_completion_link_lost" BEFORE DELETE ON "workouts" FOR EACH ROW EXECUTE FUNCTION "lyfeos_mark_program_completion_link_lost"();
    `,
  },
  {
    id: "0071_workout_program_mission_reference",
    sql: `
      ALTER TABLE "workout_program_sessions" ADD COLUMN IF NOT EXISTS "mission_id" integer REFERENCES "quests"("id") ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS "workout_program_sessions_user_mission_idx" ON "workout_program_sessions" ("user_id", "mission_id");
    `,
  },
  {
    id: "0072_workout_history_exercise_index",
    sql: `
      CREATE INDEX IF NOT EXISTS "workout_exercises_workout_idx" ON "workout_exercises" ("workout_id");
    `,
  },
  {
    id: "0073_health_integrity_monitor_indexes",
    sql: `
      CREATE INDEX IF NOT EXISTS "workout_program_sessions_status_completion_idx" ON "workout_program_sessions" ("status", "completed_workout_id", "completion_link_lost_at");
      CREATE INDEX IF NOT EXISTS "workout_program_sessions_completed_workout_idx" ON "workout_program_sessions" ("completed_workout_id");
      CREATE INDEX IF NOT EXISTS "health_planning_drafts_state_decided_idx" ON "health_planning_drafts" ("state", "decided_at");
      CREATE INDEX IF NOT EXISTS "health_source_records_connection_user_idx" ON "health_source_records" ("connection_id", "user_id");
      CREATE INDEX IF NOT EXISTS "health_import_runs_status_started_idx" ON "health_import_runs" ("status", "started_at");
      CREATE INDEX IF NOT EXISTS "health_import_failures_status_retry_idx" ON "health_import_failures" ("status", "next_retry_at", "resolved_at");
      CREATE INDEX IF NOT EXISTS "health_sync_cursors_status_attempt_idx" ON "health_sync_cursors" ("status", "last_attempt_at", "next_retry_at", "consecutive_failures");
      CREATE INDEX IF NOT EXISTS "health_connections_status_error_idx" ON "health_connections" ("status", "last_error_code");
    `,
  },
  {
    id: "0074_mission_lifecycle_idempotency",
    sql: `
      ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "lifecycle_key" text;
      UPDATE "quests" AS q
      SET "lifecycle_key" = 'health-planning-draft:' || d."id"::text
      FROM "health_planning_drafts" AS d
      WHERE d."quest_id" = q."id"
        AND d."user_id" = q."user_id"
        AND q."lifecycle_key" IS NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS "quests_user_lifecycle_key_unique_idx"
        ON "quests" ("user_id", "lifecycle_key")
        WHERE "lifecycle_key" IS NOT NULL;
    `,
  },
  {
    id: "0075_health_metric_panels",
    sql: `
      CREATE TABLE IF NOT EXISTS "health_metric_panels" (
        "id" serial PRIMARY KEY,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "name" text NOT NULL,
        "left_series_id" text NOT NULL,
        "right_series_id" text NOT NULL,
        "period_days" integer NOT NULL DEFAULT 30,
        "rolling_average" boolean NOT NULL DEFAULT false,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "health_metric_panels_period_valid" CHECK ("period_days" IN (30, 90, 365, 730, 3650)),
        CONSTRAINT "health_metric_panels_series_distinct" CHECK ("left_series_id" <> "right_series_id"),
        CONSTRAINT "health_metric_panels_user_name_unique_idx" UNIQUE ("user_id", "name")
      );
      CREATE INDEX IF NOT EXISTS "health_metric_panels_user_updated_idx" ON "health_metric_panels" ("user_id", "updated_at");
    `,
  },
  {
    id: "0076_sleep_sessions",
    sql: `
      CREATE TABLE IF NOT EXISTS "sleep_sessions" (
        "id" serial PRIMARY KEY,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "started_at" timestamp NOT NULL,
        "ended_at" timestamp NOT NULL,
        "source" text NOT NULL DEFAULT 'manual',
        "device_name" text,
        "method" text,
        "awake_minutes" integer,
        "light_minutes" integer,
        "deep_minutes" integer,
        "rem_minutes" integer,
        "subjective_quality" integer,
        "note" text,
        "recorded_time_zone" text,
        "recorded_utc_offset_minutes" integer,
        "revision" integer NOT NULL DEFAULT 1,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "sleep_sessions_time_valid" CHECK ("ended_at" > "started_at" AND "ended_at" <= "started_at" + interval '36 hours'),
        CONSTRAINT "sleep_sessions_source_valid" CHECK ("source" IN ('manual', 'transcribed_device', 'imported')),
        CONSTRAINT "sleep_sessions_quality_valid" CHECK ("subjective_quality" IS NULL OR "subjective_quality" BETWEEN 1 AND 5),
        CONSTRAINT "sleep_sessions_revision_valid" CHECK ("revision" > 0),
        CONSTRAINT "sleep_sessions_stages_valid" CHECK (
          ("awake_minutes" IS NULL OR "awake_minutes" >= 0) AND
          ("light_minutes" IS NULL OR "light_minutes" >= 0) AND
          ("deep_minutes" IS NULL OR "deep_minutes" >= 0) AND
          ("rem_minutes" IS NULL OR "rem_minutes" >= 0) AND
          COALESCE("awake_minutes", 0) + COALESCE("light_minutes", 0) + COALESCE("deep_minutes", 0) + COALESCE("rem_minutes", 0)
            <= EXTRACT(epoch FROM ("ended_at" - "started_at")) / 60
        )
      );
      CREATE INDEX IF NOT EXISTS "sleep_sessions_user_started_idx" ON "sleep_sessions" ("user_id", "started_at");
    `,
  },
  {
    id: "0077_ingredient_scan_corrections",
    sql: `
      ALTER TABLE "ingredient_scans" ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL DEFAULT 1;
      ALTER TABLE "ingredient_scans" ADD COLUMN IF NOT EXISTS "updated_at" timestamp NOT NULL DEFAULT now();
      CREATE INDEX IF NOT EXISTS "ingredient_scans_user_barcode_idx" ON "ingredient_scans" ("user_id", "barcode");
    `,
  },
  {
    id: "0078_supplement_schedule_history",
    sql: `
      ALTER TABLE "supplement_schedules" ADD COLUMN IF NOT EXISTS "reminder_enabled" boolean NOT NULL DEFAULT false;
      ALTER TABLE "supplement_schedule_events" ADD COLUMN IF NOT EXISTS "name_snapshot" text;
      ALTER TABLE "supplement_schedule_events" ADD COLUMN IF NOT EXISTS "amount_snapshot" real;
      ALTER TABLE "supplement_schedule_events" ADD COLUMN IF NOT EXISTS "unit_snapshot" text;
      ALTER TABLE "supplement_schedule_events" ADD COLUMN IF NOT EXISTS "time_of_day_snapshot" text;
      UPDATE "supplement_schedule_events" AS e
      SET "name_snapshot" = s."name", "amount_snapshot" = s."amount", "unit_snapshot" = s."unit", "time_of_day_snapshot" = s."time_of_day"
      FROM "supplement_schedules" AS s
      WHERE e."schedule_id" = s."id" AND e."name_snapshot" IS NULL;
      ALTER TABLE "supplement_schedule_events" ALTER COLUMN "name_snapshot" SET NOT NULL;
      CREATE INDEX IF NOT EXISTS "supplement_schedule_events_user_date_idx" ON "supplement_schedule_events" ("user_id", "date");
    `,
  },
  {
    id: "0079_health_target_revisions",
    sql: `
      ALTER TABLE "health_targets" ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL DEFAULT 1;
      CREATE TABLE IF NOT EXISTS "health_target_revisions" (
        "id" serial PRIMARY KEY,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "target_id" integer NOT NULL,
        "revision_number" integer NOT NULL,
        "action" text NOT NULL,
        "snapshot" jsonb NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "health_target_revisions_revision_valid" CHECK ("revision_number" > 0),
        CONSTRAINT "health_target_revisions_action_valid" CHECK ("action" IN ('baseline', 'created', 'updated', 'deleted')),
        CONSTRAINT "health_target_revisions_user_target_revision_unique_idx" UNIQUE ("user_id", "target_id", "revision_number")
      );
      INSERT INTO "health_target_revisions" ("user_id", "target_id", "revision_number", "action", "snapshot", "created_at")
      SELECT t."user_id", t."id", t."revision", 'baseline', to_jsonb(t), COALESCE(t."updated_at", t."created_at", now())
      FROM "health_targets" AS t
      ON CONFLICT ("user_id", "target_id", "revision_number") DO NOTHING;
      CREATE INDEX IF NOT EXISTS "health_target_revisions_user_created_idx" ON "health_target_revisions" ("user_id", "created_at");
    `,
  },
  {
    id: "0080_supplement_product_provenance",
    sql: `
      ALTER TABLE "supplement_entries" ADD COLUMN IF NOT EXISTS "brand" text;
      ALTER TABLE "supplement_entries" ADD COLUMN IF NOT EXISTS "manufacturer" text;
      ALTER TABLE "supplement_entries" ADD COLUMN IF NOT EXISTS "form" text;
      ALTER TABLE "supplement_entries" ADD COLUMN IF NOT EXISTS "barcode" text;
      ALTER TABLE "supplement_entries" ADD COLUMN IF NOT EXISTS "lot_number" text;
      ALTER TABLE "supplement_entries" ADD COLUMN IF NOT EXISTS "expires_on" date;
      ALTER TABLE "supplement_schedules" ADD COLUMN IF NOT EXISTS "brand" text;
      ALTER TABLE "supplement_schedules" ADD COLUMN IF NOT EXISTS "manufacturer" text;
      ALTER TABLE "supplement_schedules" ADD COLUMN IF NOT EXISTS "form" text;
      ALTER TABLE "supplement_schedules" ADD COLUMN IF NOT EXISTS "barcode" text;
      ALTER TABLE "supplement_schedules" ADD COLUMN IF NOT EXISTS "lot_number" text;
      ALTER TABLE "supplement_schedules" ADD COLUMN IF NOT EXISTS "expires_on" date;
      ALTER TABLE "supplement_schedule_events" ADD COLUMN IF NOT EXISTS "brand_snapshot" text;
      ALTER TABLE "supplement_schedule_events" ADD COLUMN IF NOT EXISTS "manufacturer_snapshot" text;
      ALTER TABLE "supplement_schedule_events" ADD COLUMN IF NOT EXISTS "form_snapshot" text;
      ALTER TABLE "supplement_schedule_events" ADD COLUMN IF NOT EXISTS "barcode_snapshot" text;
      ALTER TABLE "supplement_schedule_events" ADD COLUMN IF NOT EXISTS "lot_number_snapshot" text;
      ALTER TABLE "supplement_schedule_events" ADD COLUMN IF NOT EXISTS "expires_on_snapshot" date;
      UPDATE "supplement_schedule_events" AS e
      SET "brand_snapshot" = s."brand", "manufacturer_snapshot" = s."manufacturer", "form_snapshot" = s."form",
          "barcode_snapshot" = s."barcode", "lot_number_snapshot" = s."lot_number", "expires_on_snapshot" = s."expires_on"
      FROM "supplement_schedules" AS s WHERE e."schedule_id" = s."id";
      CREATE INDEX IF NOT EXISTS "supplement_entries_user_barcode_idx" ON "supplement_entries" ("user_id", "barcode");
      CREATE INDEX IF NOT EXISTS "supplement_schedules_user_barcode_idx" ON "supplement_schedules" ("user_id", "barcode");
    `,
  },
  {
    id: "0081_health_planning_draft_events",
    sql: `
      CREATE TABLE IF NOT EXISTS "health_planning_draft_events" (
        "id" serial PRIMARY KEY,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "draft_id" integer NOT NULL REFERENCES "health_planning_drafts"("id") ON DELETE cascade,
        "action" text NOT NULL,
        "title_snapshot" text NOT NULL,
        "category_snapshot" text NOT NULL,
        "quest_id_snapshot" integer,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "health_planning_draft_events_action_valid" CHECK ("action" IN ('created', 'confirmed', 'rejected')),
        CONSTRAINT "health_planning_draft_events_draft_action_unique_idx" UNIQUE ("draft_id", "action")
      );
      INSERT INTO "health_planning_draft_events" ("user_id", "draft_id", "action", "title_snapshot", "category_snapshot", "created_at")
      SELECT "user_id", "id", 'created', "title", "category", "created_at" FROM "health_planning_drafts"
      ON CONFLICT ("draft_id", "action") DO NOTHING;
      INSERT INTO "health_planning_draft_events" ("user_id", "draft_id", "action", "title_snapshot", "category_snapshot", "quest_id_snapshot", "created_at")
      SELECT "user_id", "id", 'confirmed', "title", "category", "quest_id", COALESCE("decided_at", "created_at") FROM "health_planning_drafts" WHERE "state" = 'succeeded'
      ON CONFLICT ("draft_id", "action") DO NOTHING;
      INSERT INTO "health_planning_draft_events" ("user_id", "draft_id", "action", "title_snapshot", "category_snapshot", "created_at")
      SELECT "user_id", "id", 'rejected', "title", "category", COALESCE("decided_at", "created_at") FROM "health_planning_drafts" WHERE "state" = 'rejected'
      ON CONFLICT ("draft_id", "action") DO NOTHING;
      CREATE INDEX IF NOT EXISTS "health_planning_draft_events_user_created_idx" ON "health_planning_draft_events" ("user_id", "created_at");
    `,
  },
  {
    id: "0082_health_offline_capture",
    sql: `
      ALTER TABLE "sleep_sessions" ADD COLUMN IF NOT EXISTS "client_mutation_id" text;
      ALTER TABLE "sleep_sessions" ADD COLUMN IF NOT EXISTS "mutation_payload_hash" text;
      ALTER TABLE "recovery_activities" ADD COLUMN IF NOT EXISTS "client_mutation_id" text;
      ALTER TABLE "recovery_activities" ADD COLUMN IF NOT EXISTS "mutation_payload_hash" text;
      CREATE UNIQUE INDEX IF NOT EXISTS "sleep_sessions_user_mutation_unique_idx" ON "sleep_sessions" ("user_id", "client_mutation_id") WHERE "client_mutation_id" IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS "recovery_activities_user_mutation_unique_idx" ON "recovery_activities" ("user_id", "client_mutation_id") WHERE "client_mutation_id" IS NOT NULL;
    `,
  },
  {
    id: "0083_health_daily_offline_capture",
    sql: `
      ALTER TABLE "body_measurements" ADD COLUMN IF NOT EXISTS "client_mutation_id" text;
      ALTER TABLE "body_measurements" ADD COLUMN IF NOT EXISTS "mutation_payload_hash" text;
      ALTER TABLE "hydration_entries" ADD COLUMN IF NOT EXISTS "client_mutation_id" text;
      ALTER TABLE "hydration_entries" ADD COLUMN IF NOT EXISTS "mutation_payload_hash" text;
      ALTER TABLE "supplement_entries" ADD COLUMN IF NOT EXISTS "client_mutation_id" text;
      ALTER TABLE "supplement_entries" ADD COLUMN IF NOT EXISTS "mutation_payload_hash" text;
      ALTER TABLE "health_observations" ADD COLUMN IF NOT EXISTS "client_mutation_id" text;
      ALTER TABLE "health_observations" ADD COLUMN IF NOT EXISTS "mutation_payload_hash" text;
      CREATE UNIQUE INDEX IF NOT EXISTS "body_measurements_user_mutation_unique_idx" ON "body_measurements" ("user_id", "client_mutation_id") WHERE "client_mutation_id" IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS "hydration_entries_user_mutation_unique_idx" ON "hydration_entries" ("user_id", "client_mutation_id") WHERE "client_mutation_id" IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS "supplement_entries_user_mutation_unique_idx" ON "supplement_entries" ("user_id", "client_mutation_id") WHERE "client_mutation_id" IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS "health_observations_user_mutation_unique_idx" ON "health_observations" ("user_id", "client_mutation_id") WHERE "client_mutation_id" IS NOT NULL;
    `,
  },
  {
    id: "0084_health_metric_panel_series",
    sql: `
      ALTER TABLE "health_metric_panels" ADD COLUMN IF NOT EXISTS "series_ids" jsonb NOT NULL DEFAULT '[]'::jsonb;
      UPDATE "health_metric_panels" SET "series_ids" = jsonb_build_array("left_series_id", "right_series_id") WHERE jsonb_array_length("series_ids") = 0;
      ALTER TABLE "health_metric_panels" DROP CONSTRAINT IF EXISTS "health_metric_panels_series_count_valid";
      ALTER TABLE "health_metric_panels" ADD CONSTRAINT "health_metric_panels_series_count_valid" CHECK (jsonb_typeof("series_ids") = 'array' AND jsonb_array_length("series_ids") BETWEEN 2 AND 4);
    `,
  },
  {
    id: "0085_health_practice_reviews",
    sql: `
      CREATE TABLE IF NOT EXISTS "health_practice_reviews" (
        "id" serial PRIMARY KEY,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "review_date" date NOT NULL,
        "domains" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "reflection" text NOT NULL,
        "next_experiment" text,
        "revision" integer NOT NULL DEFAULT 1,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "health_practice_reviews_user_date_unique_idx" UNIQUE ("user_id", "review_date"),
        CONSTRAINT "health_practice_reviews_domains_valid" CHECK (jsonb_typeof("domains") = 'array' AND jsonb_array_length("domains") BETWEEN 1 AND 8),
        CONSTRAINT "health_practice_reviews_reflection_length" CHECK (char_length("reflection") BETWEEN 3 AND 2000),
        CONSTRAINT "health_practice_reviews_revision_positive" CHECK ("revision" > 0)
      );
      CREATE INDEX IF NOT EXISTS "health_practice_reviews_user_date_idx" ON "health_practice_reviews" ("user_id", "review_date" DESC);
    `,
  },
  {
    id: "0086_recovery_tag_policies",
    sql: `
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
    `,
  },
  {
    id: "0087_health_ai_assistance",
    sql: `
      CREATE TABLE IF NOT EXISTS "health_ai_requests" (
        "id" serial PRIMARY KEY,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "series_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "period_days" integer NOT NULL,
        "source_summary" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "provider" text NOT NULL DEFAULT 'none',
        "model" text,
        "state" text NOT NULL DEFAULT 'started',
        "boundary_kind" text,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "completed_at" timestamp,
        CONSTRAINT "health_ai_requests_state_valid" CHECK ("state" IN ('started', 'succeeded', 'blocked', 'failed')),
        CONSTRAINT "health_ai_requests_period_valid" CHECK ("period_days" IN (7, 30, 90))
      );
      CREATE INDEX IF NOT EXISTS "health_ai_requests_user_created_idx" ON "health_ai_requests" ("user_id", "created_at" DESC);
      CREATE TABLE IF NOT EXISTS "health_ai_drafts" (
        "id" serial PRIMARY KEY,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "request_id" integer NOT NULL REFERENCES "health_ai_requests"("id") ON DELETE cascade,
        "title" text NOT NULL,
        "reflection" text NOT NULL,
        "domains" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "next_experiment" text,
        "state" text NOT NULL DEFAULT 'pending',
        "created_at" timestamp NOT NULL DEFAULT now(),
        "decided_at" timestamp,
        CONSTRAINT "health_ai_drafts_request_unique_idx" UNIQUE ("request_id"),
        CONSTRAINT "health_ai_drafts_state_valid" CHECK ("state" IN ('pending', 'saved', 'rejected')),
        CONSTRAINT "health_ai_drafts_domains_valid" CHECK (jsonb_typeof("domains") = 'array' AND jsonb_array_length("domains") BETWEEN 1 AND 8)
      );
      CREATE INDEX IF NOT EXISTS "health_ai_drafts_user_state_created_idx" ON "health_ai_drafts" ("user_id", "state", "created_at" DESC);
    `,
  },
  {
    id: "0088_workout_heart_rate_samples",
    sql: `
      CREATE TABLE IF NOT EXISTS "workout_heart_rate_samples" (
        "id" serial PRIMARY KEY,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "workout_id" integer NOT NULL REFERENCES "workouts"("id") ON DELETE cascade,
        "sampled_at" timestamp NOT NULL,
        "bpm" integer NOT NULL,
        "source" text NOT NULL,
        "device_name" text,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "workout_hr_samples_bpm_valid" CHECK ("bpm" BETWEEN 20 AND 260),
        CONSTRAINT "workout_hr_samples_source_valid" CHECK ("source" IN ('manual', 'transcribed_device', 'imported')),
        CONSTRAINT "workout_hr_samples_workout_time_source_unique_idx" UNIQUE ("workout_id", "sampled_at", "source")
      );
      CREATE INDEX IF NOT EXISTS "workout_hr_samples_user_workout_idx" ON "workout_heart_rate_samples" ("user_id", "workout_id", "sampled_at");
    `,
  },
  {
    id: "0089_health_tracking_preferences",
    sql: `
      ALTER TABLE "health_profiles"
        ADD COLUMN IF NOT EXISTS "tracked_domains" jsonb NOT NULL DEFAULT '["nutrition","training","recovery","sleep","activity","body","metrics","supplements","planning","connections"]'::jsonb;
      ALTER TABLE "health_profiles" DROP CONSTRAINT IF EXISTS "health_profiles_tracked_domains_array";
      ALTER TABLE "health_profiles" ADD CONSTRAINT "health_profiles_tracked_domains_array"
        CHECK (jsonb_typeof("tracked_domains") = 'array' AND jsonb_array_length("tracked_domains") <= 10);
    `,
  },
  {
    id: "0090_clerk_user_identity",
    sql: `
      ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL;
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "clerk_id" text;
      CREATE UNIQUE INDEX IF NOT EXISTS "users_clerk_id_unique" ON "users" ("clerk_id");
    `,
  },
  {
    id: "0091_runtime_schema_reconciliation",
    sql: `
      ALTER TABLE "user_stats" ADD COLUMN IF NOT EXISTS "wealth_tokens_current" integer NOT NULL DEFAULT 100;
      ALTER TABLE "user_stats" ADD COLUMN IF NOT EXISTS "wealth_tokens_max" integer NOT NULL DEFAULT 100;
      ALTER TABLE "user_stats" ALTER COLUMN "primary_color" SET DEFAULT '#ffffff';

      ALTER TABLE "user_profile" ADD COLUMN IF NOT EXISTS "custom_reflection_prompts" jsonb DEFAULT '{"wentWell":"What went well today?","couldBeBetter":"What could have been better?","learned":"What did I learn?"}'::jsonb;
      ALTER TABLE "user_profile" ADD COLUMN IF NOT EXISTS "blue_light_filter" boolean DEFAULT false;
      ALTER TABLE "user_profile" ADD COLUMN IF NOT EXISTS "haptic_feedback" boolean DEFAULT true;
      ALTER TABLE "user_profile" ADD COLUMN IF NOT EXISTS "sound_effects" boolean DEFAULT true;
      ALTER TABLE "user_profile" ADD COLUMN IF NOT EXISTS "completed_tutorials" text[] DEFAULT ARRAY[]::text[];

      ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "end_time" text;
      ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "location" text;
      ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "all_day" boolean DEFAULT false;
      ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "external_id" text;
      ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "external_source" text;

      ALTER TABLE "folders" ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'local';
      ALTER TABLE "folders" ADD COLUMN IF NOT EXISTS "external_id" text;
      ALTER TABLE "folders" ADD COLUMN IF NOT EXISTS "external_url" text;
      ALTER TABLE "folders" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;

      ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'local';
      ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "external_id" text;
      ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "external_url" text;
      ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "last_synced_at" timestamp;
      ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "file_type" text;
      ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "file_data" text;
      ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "file_size" integer;
      ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "mime_type" text;
      ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "thumbnail_data" text;
      ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;

      CREATE TABLE IF NOT EXISTS "ritual_groups" (
        "id" serial PRIMARY KEY,
        "user_id" integer NOT NULL REFERENCES "users"("id"),
        "value" text NOT NULL,
        "label" text NOT NULL,
        "description" text,
        "parent_group_value" text,
        "created_at" timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "mission_views" (
        "id" serial PRIMARY KEY,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "name" text NOT NULL,
        "view_type" text NOT NULL,
        "filters" jsonb DEFAULT '{}'::jsonb,
        "columns" jsonb DEFAULT '[]'::jsonb,
        "sort_by" text,
        "sort_direction" text,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );

      ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "ritual_group" text;
      ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "linked_items" jsonb DEFAULT '[]'::jsonb;
      ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "external_id" text;
      ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "external_source" text;
      ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "location" text;
      ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "all_day" boolean DEFAULT false;
      ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "timezone" text;
      ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "url" text;
      ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "attendees" jsonb DEFAULT '[]'::jsonb;
      ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "mission_status" text DEFAULT 'confirmed';
      ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "view_id" integer;
      ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "view_column" text;

      ALTER TABLE "push_subscriptions" ADD COLUMN IF NOT EXISTS "fcm_token" text;

      CREATE TABLE IF NOT EXISTS "waitlist_emails" (
        "id" serial PRIMARY KEY,
        "email" text NOT NULL UNIQUE,
        "referral_source" text,
        "created_at" timestamp NOT NULL DEFAULT now()
      );
    `,
  },
  {
    id: "0092_health_planning_consent_lifecycle",
    sql: `
      ALTER TABLE "health_planning_drafts" ADD COLUMN IF NOT EXISTS "expires_at" timestamp;
      UPDATE "health_planning_drafts" SET "expires_at" = "created_at" + interval '7 days' WHERE "expires_at" IS NULL;
      ALTER TABLE "health_planning_drafts" ALTER COLUMN "expires_at" SET DEFAULT (now() + interval '7 days');
      ALTER TABLE "health_planning_drafts" ALTER COLUMN "expires_at" SET NOT NULL;
      ALTER TABLE "health_planning_drafts" DROP CONSTRAINT IF EXISTS "health_planning_drafts_state_valid";
      ALTER TABLE "health_planning_drafts" ADD CONSTRAINT "health_planning_drafts_state_valid"
        CHECK ("state" IN ('pending', 'executing', 'succeeded', 'rejected', 'failed', 'expired', 'revoked'));
      CREATE INDEX IF NOT EXISTS "health_planning_drafts_pending_expiry_idx" ON "health_planning_drafts" ("expires_at") WHERE "state" = 'pending';
      ALTER TABLE "health_planning_draft_events" ADD COLUMN IF NOT EXISTS "scope_snapshot" text NOT NULL DEFAULT 'mission_title_only';
      ALTER TABLE "health_planning_draft_events" ADD COLUMN IF NOT EXISTS "expires_at_snapshot" timestamp;
      UPDATE "health_planning_draft_events" e SET "expires_at_snapshot" = d."expires_at"
        FROM "health_planning_drafts" d WHERE e."draft_id" = d."id" AND e."expires_at_snapshot" IS NULL;
      ALTER TABLE "health_planning_draft_events" ALTER COLUMN "expires_at_snapshot" SET NOT NULL;
      ALTER TABLE "health_planning_draft_events" DROP CONSTRAINT IF EXISTS "health_planning_draft_events_action_valid";
      ALTER TABLE "health_planning_draft_events" ADD CONSTRAINT "health_planning_draft_events_action_valid"
        CHECK ("action" IN ('created', 'confirmed', 'rejected', 'expired', 'revoked'));
    `,
  },
  {
    id: "0093_health_report_query_indexes",
    sql: `
      CREATE INDEX IF NOT EXISTS "hydration_entries_user_occurred_idx"
        ON "hydration_entries" ("user_id", "occurred_at");
      CREATE INDEX IF NOT EXISTS "health_observations_user_metric_source_date_idx"
        ON "health_observations" ("user_id", "metric_key", "unit", "source", "observed_at");
    `,
  },
  {
    id: "0094_mission_review_authorization",
    sql: `
      CREATE TABLE IF NOT EXISTS "mission_review_invitations" (
        "id" serial PRIMARY KEY NOT NULL,
        "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "mission_contract_id" integer NOT NULL REFERENCES "mission_contracts"("id") ON DELETE cascade,
        "reviewer_user_id" integer REFERENCES "users"("id") ON DELETE set null,
        "token_hash" text NOT NULL,
        "status" text NOT NULL DEFAULT 'pending',
        "expires_at" timestamp NOT NULL,
        "accepted_at" timestamp,
        "completed_at" timestamp,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "mission_review_invitations_status_valid" CHECK ("status" IN ('pending', 'accepted', 'revoked', 'completed', 'expired'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "mission_review_invitations_token_unique_idx" ON "mission_review_invitations" ("token_hash");
      CREATE INDEX IF NOT EXISTS "mission_review_invitations_owner_contract_idx" ON "mission_review_invitations" ("owner_user_id", "mission_contract_id", "created_at");
      CREATE INDEX IF NOT EXISTS "mission_review_invitations_reviewer_status_idx" ON "mission_review_invitations" ("reviewer_user_id", "status");
      ALTER TABLE "mission_reviews" ADD COLUMN IF NOT EXISTS "reviewer_user_id" integer REFERENCES "users"("id") ON DELETE set null;
      ALTER TABLE "mission_reviews" ADD COLUMN IF NOT EXISTS "review_invitation_id" integer REFERENCES "mission_review_invitations"("id") ON DELETE set null;
      CREATE UNIQUE INDEX IF NOT EXISTS "mission_reviews_invitation_unique_idx" ON "mission_reviews" ("review_invitation_id") WHERE "review_invitation_id" IS NOT NULL;
    `,
  },
  {
    id: "0095_workspace_tables_forms",
    sql: `
      CREATE TABLE IF NOT EXISTS "workspace_databases" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "title" text NOT NULL, "description" text, "category" text NOT NULL DEFAULT 'general', "favorite" boolean NOT NULL DEFAULT false,
        "definition" jsonb NOT NULL, "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "workspace_databases_user_updated_idx" ON "workspace_databases" ("user_id", "updated_at");
      CREATE TABLE IF NOT EXISTS "workspace_database_rows" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "database_id" integer NOT NULL REFERENCES "workspace_databases"("id") ON DELETE cascade, "values" jsonb NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "workspace_database_rows_database_updated_idx" ON "workspace_database_rows" ("database_id", "updated_at");
      CREATE INDEX IF NOT EXISTS "workspace_database_rows_user_idx" ON "workspace_database_rows" ("user_id");
      CREATE TABLE IF NOT EXISTS "workspace_forms" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "database_id" integer NOT NULL REFERENCES "workspace_databases"("id") ON DELETE cascade, "title" text NOT NULL, "description" text,
        "field_ids" jsonb NOT NULL, "confirmation_text" text NOT NULL DEFAULT 'Response saved.', "active" boolean NOT NULL DEFAULT true,
        "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "workspace_forms_user_updated_idx" ON "workspace_forms" ("user_id", "updated_at");
      CREATE INDEX IF NOT EXISTS "workspace_forms_database_idx" ON "workspace_forms" ("database_id");
    `,
  },
  {
    id: "0096_workflow_automations",
    sql: `
      CREATE TABLE IF NOT EXISTS "workflow_automations" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "name" text NOT NULL, "description" text, "definition" jsonb NOT NULL, "enabled" boolean NOT NULL DEFAULT false,
        "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "workflow_automations_user_updated_idx" ON "workflow_automations" ("user_id", "updated_at");
      CREATE INDEX IF NOT EXISTS "workflow_automations_user_enabled_idx" ON "workflow_automations" ("user_id", "enabled");
      CREATE TABLE IF NOT EXISTS "workflow_automation_runs" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "automation_id" integer REFERENCES "workflow_automations"("id") ON DELETE set null, "automation_name" text NOT NULL,
        "trigger_type" text NOT NULL, "trigger_quest_id" integer REFERENCES "quests"("id") ON DELETE set null,
        "idempotency_key" text NOT NULL, "status" text NOT NULL DEFAULT 'running', "action_results" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "error_code" text, "created_at" timestamp NOT NULL DEFAULT now(), "completed_at" timestamp
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "workflow_automation_runs_user_automation_key_unique_idx" ON "workflow_automation_runs" ("user_id", "automation_id", "idempotency_key");
      CREATE INDEX IF NOT EXISTS "workflow_automation_runs_user_created_idx" ON "workflow_automation_runs" ("user_id", "created_at");
      CREATE INDEX IF NOT EXISTS "workflow_automation_runs_automation_created_idx" ON "workflow_automation_runs" ("automation_id", "created_at");
    `,
  },
  {
    id: "0097_projects_convergence",
    sql: `
      ALTER TABLE "kanban_boards" ADD COLUMN IF NOT EXISTS "outcome" text;
      ALTER TABLE "kanban_boards" ADD COLUMN IF NOT EXISTS "state" text NOT NULL DEFAULT 'planned';
      ALTER TABLE "kanban_boards" ADD COLUMN IF NOT EXISTS "start_date" text;
      ALTER TABLE "kanban_boards" ADD COLUMN IF NOT EXISTS "due_date" text;
      ALTER TABLE "kanban_boards" ADD COLUMN IF NOT EXISTS "completed_at" timestamp;
      ALTER TABLE "kanban_boards" ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL DEFAULT 1;
      UPDATE "kanban_boards" SET "outcome" = COALESCE(NULLIF("outcome", ''), NULLIF("description", ''), 'Define the intended project outcome.') WHERE "outcome" IS NULL OR "outcome" = '';
      ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "project_id" integer;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quests_project_id_kanban_boards_id_fk' AND conrelid = 'quests'::regclass) THEN
          ALTER TABLE "quests" ADD CONSTRAINT "quests_project_id_kanban_boards_id_fk" FOREIGN KEY ("project_id") REFERENCES "kanban_boards"("id") ON DELETE SET NULL;
        END IF;
      END $$;
      CREATE INDEX IF NOT EXISTS "quests_user_project_idx" ON "quests" ("user_id", "project_id");
      CREATE TABLE IF NOT EXISTS "project_events" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "project_id" integer NOT NULL REFERENCES "kanban_boards"("id") ON DELETE cascade, "event_type" text NOT NULL,
        "from_state" text, "to_state" text, "aggregate_revision" integer NOT NULL, "actor_source" text NOT NULL DEFAULT 'ui',
        "occurred_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "project_events_project_occurred_idx" ON "project_events" ("project_id", "occurred_at");
      CREATE INDEX IF NOT EXISTS "project_events_user_occurred_idx" ON "project_events" ("user_id", "occurred_at");
    `,
  },
  {
    id: "0098_native_messages",
    sql: `
      CREATE TABLE IF NOT EXISTS "message_conversations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "created_by_user_id" integer REFERENCES "users"("id") ON DELETE set null,
        "title" text NOT NULL, "kind" text NOT NULL DEFAULT 'direct', "status" text NOT NULL DEFAULT 'open', "priority" text NOT NULL DEFAULT 'normal',
        "queue" text NOT NULL DEFAULT 'personal', "ai_mode" text NOT NULL DEFAULT 'observe', "snoozed_until" timestamp, "last_message_at" timestamp,
        "closed_at" timestamp, "version" integer NOT NULL DEFAULT 1, "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "message_conversations_kind_check" CHECK ("kind" IN ('direct','group')),
        CONSTRAINT "message_conversations_status_check" CHECK ("status" IN ('open','pending','snoozed','closed','spam')),
        CONSTRAINT "message_conversations_ai_mode_check" CHECK ("ai_mode" IN ('observe','suggest','approval','delegated'))
      );
      CREATE INDEX IF NOT EXISTS "message_conversations_status_updated_idx" ON "message_conversations" ("status", "updated_at");
      CREATE TABLE IF NOT EXISTS "message_conversation_participants" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "conversation_id" uuid NOT NULL REFERENCES "message_conversations"("id") ON DELETE cascade,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade, "role" text NOT NULL DEFAULT 'member', "status" text NOT NULL DEFAULT 'active',
        "inbox_status" text NOT NULL DEFAULT 'open', "snoozed_until" timestamp, "version" integer NOT NULL DEFAULT 1, "last_read_message_id" uuid,
        "last_read_at" timestamp, "joined_at" timestamp NOT NULL DEFAULT now(), "left_at" timestamp,
        CONSTRAINT "message_conversation_participant_unique" UNIQUE ("conversation_id","user_id"),
        CONSTRAINT "message_conversation_participants_status_check" CHECK ("status" IN ('active','left','blocked')),
        CONSTRAINT "message_conversation_participants_inbox_status_check" CHECK ("inbox_status" IN ('open','pending','snoozed','closed','spam'))
      );
      CREATE INDEX IF NOT EXISTS "message_conversation_participant_user_idx" ON "message_conversation_participants" ("user_id","status","conversation_id");
      CREATE TABLE IF NOT EXISTS "message_channel_bindings" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "conversation_id" uuid NOT NULL REFERENCES "message_conversations"("id") ON DELETE cascade,
        "provider" text NOT NULL DEFAULT 'native', "connection_ref" text, "channel_kind" text NOT NULL DEFAULT 'native', "external_thread_id" text,
        "status" text NOT NULL DEFAULT 'active', "capabilities" jsonb NOT NULL DEFAULT '{"send":true,"receive":true,"receipts":true}'::jsonb,
        "version" integer NOT NULL DEFAULT 1, "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "message_channel_binding_native_unique" UNIQUE ("conversation_id","provider","channel_kind"),
        CONSTRAINT "message_channel_bindings_status_check" CHECK ("status" IN ('pending','active','disabled','revoked','error'))
      );
      CREATE TABLE IF NOT EXISTS "conversation_messages" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "conversation_id" uuid NOT NULL REFERENCES "message_conversations"("id") ON DELETE cascade,
        "sender_user_id" integer REFERENCES "users"("id") ON DELETE set null, "sender_participant_ref" uuid, "direction" text NOT NULL DEFAULT 'outbound',
        "provider" text NOT NULL DEFAULT 'native', "body" text NOT NULL, "body_format" text NOT NULL DEFAULT 'plain', "status" text NOT NULL DEFAULT 'queued',
        "reply_to_message_id" uuid, "provider_message_id" text, "idempotency_key" text NOT NULL, "sent_at" timestamp, "received_at" timestamp,
        "version" integer NOT NULL DEFAULT 1, "extension" jsonb NOT NULL DEFAULT '{}'::jsonb, "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "conversation_messages_sender_idempotency_unique" UNIQUE ("sender_user_id","idempotency_key"),
        CONSTRAINT "conversation_messages_body_format_check" CHECK ("body_format" IN ('plain','markdown','html')),
        CONSTRAINT "conversation_messages_status_check" CHECK ("status" IN ('draft','queued','sent','delivered','read','failed','bounced','rejected','received'))
      );
      CREATE INDEX IF NOT EXISTS "conversation_messages_conversation_created_idx" ON "conversation_messages" ("conversation_id","created_at");
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversation_messages_reply_to_message_id_fk') THEN
          ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_reply_to_message_id_fk" FOREIGN KEY ("reply_to_message_id") REFERENCES "conversation_messages"("id") ON DELETE set null;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'message_conversation_participants_last_read_message_id_fk') THEN
          ALTER TABLE "message_conversation_participants" ADD CONSTRAINT "message_conversation_participants_last_read_message_id_fk" FOREIGN KEY ("last_read_message_id") REFERENCES "conversation_messages"("id") ON DELETE set null;
        END IF;
      END $$;
      CREATE TABLE IF NOT EXISTS "message_attachments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "message_id" uuid NOT NULL REFERENCES "conversation_messages"("id") ON DELETE cascade,
        "document_id" integer REFERENCES "documents"("id") ON DELETE set null, "external_media_id" text, "attachment_kind" text NOT NULL DEFAULT 'file_ref',
        "filename" text, "mime_type" text, "size_bytes" integer, "duration_ms" integer, "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "version" integer NOT NULL DEFAULT 1, "created_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "message_attachments_message_idx" ON "message_attachments" ("message_id");
      CREATE TABLE IF NOT EXISTS "message_delivery_receipts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "message_id" uuid NOT NULL REFERENCES "conversation_messages"("id") ON DELETE cascade,
        "recipient_user_id" integer REFERENCES "users"("id") ON DELETE set null, "provider" text NOT NULL DEFAULT 'native', "state" text NOT NULL,
        "occurred_at" timestamp NOT NULL DEFAULT now(), "provider_receipt_id" text, "failure_code" text, "failure_detail" text,
        "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb, "version" integer NOT NULL DEFAULT 1,
        CONSTRAINT "message_delivery_receipt_state_unique" UNIQUE NULLS NOT DISTINCT ("message_id","recipient_user_id","state"),
        CONSTRAINT "message_delivery_receipts_state_check" CHECK ("state" IN ('queued','accepted','sent','delivered','read','failed','bounced','rejected'))
      );
      CREATE INDEX IF NOT EXISTS "message_delivery_receipts_message_occurred_idx" ON "message_delivery_receipts" ("message_id","occurred_at");
      CREATE TABLE IF NOT EXISTS "message_internal_notes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "conversation_id" uuid NOT NULL REFERENCES "message_conversations"("id") ON DELETE cascade,
        "author_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade, "body" text NOT NULL, "visibility" text NOT NULL DEFAULT 'author_only',
        "version" integer NOT NULL DEFAULT 1, "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "message_internal_notes_visibility_check" CHECK ("visibility" = 'author_only')
      );
      CREATE INDEX IF NOT EXISTS "message_internal_notes_author_conversation_idx" ON "message_internal_notes" ("author_user_id","conversation_id","created_at");
      CREATE TABLE IF NOT EXISTS "message_audit_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "conversation_id" uuid NOT NULL REFERENCES "message_conversations"("id") ON DELETE cascade,
        "message_id" uuid REFERENCES "conversation_messages"("id") ON DELETE set null, "actor_user_id" integer REFERENCES "users"("id") ON DELETE set null,
        "event_type" text NOT NULL, "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb, "aggregate_version" integer NOT NULL, "occurred_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "message_audit_events_conversation_occurred_idx" ON "message_audit_events" ("conversation_id","occurred_at");
    `,
  },
  {
    id: "0099_native_message_interactions",
    sql: `
      ALTER TABLE "conversation_messages" ADD COLUMN IF NOT EXISTS "edited_at" timestamp;
      ALTER TABLE "conversation_messages" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;
      ALTER TABLE "message_attachments" ADD COLUMN IF NOT EXISTS "snapshot_data" text;
      ALTER TABLE "message_attachments" ADD COLUMN IF NOT EXISTS "snapshot_sha256" text;
      ALTER TABLE "message_attachments" ADD COLUMN IF NOT EXISTS "snapshot_at" timestamp;
      CREATE TABLE IF NOT EXISTS "message_reactions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "message_id" uuid NOT NULL REFERENCES "conversation_messages"("id") ON DELETE cascade,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "reaction" text NOT NULL, "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "message_reactions_message_user_unique" UNIQUE ("message_id","user_id"),
        CONSTRAINT "message_reactions_value_check" CHECK ("reaction" IN ('❤️','👍','🎉','💪','🔥'))
      );
      CREATE INDEX IF NOT EXISTS "message_reactions_message_idx" ON "message_reactions" ("message_id");
      CREATE TABLE IF NOT EXISTS "message_edit_history" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "message_id" uuid NOT NULL REFERENCES "conversation_messages"("id") ON DELETE cascade,
        "editor_user_id" integer REFERENCES "users"("id") ON DELETE set null,
        "prior_body" text NOT NULL, "replacement_body" text NOT NULL, "prior_version" integer NOT NULL,
        "edited_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "message_edit_history_message_idx" ON "message_edit_history" ("message_id","edited_at");
    `,
  },
  {
    id: "0100_transformation_intelligence",
    sql: `
      ALTER TABLE "quests"
        ADD COLUMN IF NOT EXISTS "planning_context_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS "difficulty_calibration" jsonb NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS "planning_decision_source" text NOT NULL DEFAULT 'ui';
      ALTER TABLE "mission_contracts"
        ADD COLUMN IF NOT EXISTS "rubric_definition" jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS "rubric_version" integer NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS "acceptance_context_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS "progression_revision" integer NOT NULL DEFAULT 0;
      UPDATE "mission_contracts"
      SET "rubric_definition" = COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', 'criterion-' || criterion.ordinality,
          'requirement', criterion.value,
          'guidance', 'Compare this requirement with the submitted evidence.',
          'weight', 1,
          'required', true
        ) ORDER BY criterion.ordinality)
        FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof("mission_contracts"."required_evidence") = 'array' THEN "mission_contracts"."required_evidence" ELSE '[]'::jsonb END) WITH ORDINALITY AS criterion(value, ordinality)
      ), '[]'::jsonb)
      WHERE "rubric_definition" = '[]'::jsonb;
      ALTER TABLE "mission_reviews" ADD COLUMN IF NOT EXISTS "rubric_version" integer NOT NULL DEFAULT 1;
      ALTER TABLE "skill_progression_events"
        ADD COLUMN IF NOT EXISTS "progression_revision" integer NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS "reversal_of_id" integer REFERENCES "skill_progression_events"("id") ON DELETE restrict;
      ALTER TABLE "ai_action_records" ADD COLUMN IF NOT EXISTS "planning_context_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb;
      CREATE TABLE IF NOT EXISTS "mission_review_appeals" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "mission_contract_id" integer NOT NULL REFERENCES "mission_contracts"("id") ON DELETE cascade,
        "mission_review_id" integer NOT NULL REFERENCES "mission_reviews"("id") ON DELETE cascade,
        "reviewer_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "reason" text NOT NULL,
        "status" text NOT NULL DEFAULT 'open',
        "resolution_summary" text,
        "resolved_at" timestamp,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "mission_review_appeals_status_valid" CHECK ("status" IN ('open','withdrawn','upheld','reconsidered'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "mission_review_appeals_open_review_unique_idx" ON "mission_review_appeals" ("mission_review_id") WHERE "status" = 'open';
      CREATE INDEX IF NOT EXISTS "mission_review_appeals_owner_created_idx" ON "mission_review_appeals" ("user_id","created_at");
      CREATE INDEX IF NOT EXISTS "mission_review_appeals_reviewer_status_idx" ON "mission_review_appeals" ("reviewer_user_id","status","created_at");
    `,
  },
  {
    id: "0101_gamification_contract",
    sql: `
      CREATE TABLE IF NOT EXISTS "activity_progression_events" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "event_key" text NOT NULL UNIQUE,
        "source_type" text NOT NULL,
        "source_id" integer NOT NULL,
        "action" text NOT NULL,
        "experience_delta" integer NOT NULL,
        "reason" text NOT NULL,
        "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "reversal_of_id" integer REFERENCES "activity_progression_events"("id") ON DELETE restrict,
        "source_occurred_at" timestamp NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "activity_progression_events_source_valid" CHECK ("source_type" IN ('mission','vision_goal')),
        CONSTRAINT "activity_progression_events_action_valid" CHECK ("action" IN ('earned','reversed')),
        CONSTRAINT "activity_progression_events_delta_valid" CHECK (("action" = 'earned' AND "experience_delta" > 0) OR ("action" = 'reversed' AND "experience_delta" < 0))
      );
      CREATE INDEX IF NOT EXISTS "activity_progression_events_user_created_idx" ON "activity_progression_events" ("user_id","created_at");
      CREATE INDEX IF NOT EXISTS "activity_progression_events_user_source_idx" ON "activity_progression_events" ("user_id","source_type","source_id");
      CREATE TABLE IF NOT EXISTS "progression_badge_events" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "event_key" text NOT NULL UNIQUE,
        "badge_key" text NOT NULL,
        "action" text NOT NULL,
        "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "reversal_of_id" integer REFERENCES "progression_badge_events"("id") ON DELETE restrict,
        "reason" text,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "progression_badge_events_action_valid" CHECK ("action" IN ('awarded','reversed'))
      );
      CREATE INDEX IF NOT EXISTS "progression_badge_events_user_created_idx" ON "progression_badge_events" ("user_id","created_at");
      CREATE INDEX IF NOT EXISTS "progression_badge_events_user_badge_idx" ON "progression_badge_events" ("user_id","badge_key","created_at");
      INSERT INTO "progression_badge_events" ("user_id","event_key","badge_key","action","evidence","created_at")
      SELECT "user_id", 'legacy-badge-award:' || "id", "badge_key", 'awarded', "evidence", "awarded_at"
      FROM "progression_badge_awards"
      ON CONFLICT ("event_key") DO NOTHING;
    `,
  },
  {
    id: "0102_ai_memory_governance",
    sql: `
      CREATE TABLE IF NOT EXISTS "ai_persona_profiles" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" integer NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE cascade,
        "name" text NOT NULL,
        "interaction_style" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "lyfeos_presentation" jsonb NOT NULL DEFAULT '{"role":"LyfeOS companion"}'::jsonb,
        "ecosystem_sharing_enabled" boolean NOT NULL DEFAULT false,
        "allowed_destinations" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "revision" integer NOT NULL DEFAULT 1,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "ai_persona_profiles_name_valid" CHECK (char_length(btrim("name")) BETWEEN 1 AND 32),
        CONSTRAINT "ai_persona_profiles_revision_valid" CHECK ("revision" > 0)
      );
      INSERT INTO "ai_persona_profiles" ("user_id", "name")
      SELECT "user_id", COALESCE(NULLIF(btrim("ai_assistant_name"), ''), 'NOVA') FROM "user_stats"
      ON CONFLICT ("user_id") DO NOTHING;
      CREATE TABLE IF NOT EXISTS "ai_memory_policies" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE cascade,
        "chat_history_days" integer,
        "context_receipt_days" integer NOT NULL DEFAULT 90,
        "action_receipt_days" integer NOT NULL DEFAULT 365,
        "cross_product_memory_enabled" boolean NOT NULL DEFAULT false,
        "allowed_destinations" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "ai_memory_chat_retention_valid" CHECK ("chat_history_days" IS NULL OR "chat_history_days" IN (30,90,365)),
        CONSTRAINT "ai_memory_context_retention_valid" CHECK ("context_receipt_days" IN (30,90,365)),
        CONSTRAINT "ai_memory_action_retention_valid" CHECK ("action_receipt_days" IN (90,365,1095))
      );
      CREATE TABLE IF NOT EXISTS "ai_context_receipts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "conversation_id" integer REFERENCES "conversations"("id") ON DELETE cascade,
        "assistant_message_id" integer REFERENCES "messages"("id") ON DELETE set null,
        "purpose" text NOT NULL DEFAULT 'assistant_response',
        "sources" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "disclosure" text NOT NULL DEFAULT 'Sources were made available as context; the response remains model-generated.',
        "created_at" timestamp NOT NULL DEFAULT now(),
        "expires_at" timestamp NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "ai_context_receipts_user_created_idx" ON "ai_context_receipts" ("user_id","created_at");
      ALTER TABLE "ai_action_records" ADD COLUMN IF NOT EXISTS "context_receipt_id" uuid REFERENCES "ai_context_receipts"("id") ON DELETE set null;
      ALTER TABLE "ai_action_records" ADD COLUMN IF NOT EXISTS "repair_state" text NOT NULL DEFAULT 'unavailable';
      ALTER TABLE "ai_action_records" ADD COLUMN IF NOT EXISTS "repair_expires_at" timestamp;
      ALTER TABLE "ai_action_records" ADD COLUMN IF NOT EXISTS "repaired_at" timestamp;
      CREATE TABLE IF NOT EXISTS "ai_action_repairs" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "action_record_id" integer NOT NULL UNIQUE REFERENCES "ai_action_records"("id") ON DELETE cascade,
        "strategy" text NOT NULL,
        "payload" jsonb NOT NULL,
        "state" text NOT NULL DEFAULT 'available',
        "expires_at" timestamp NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "ai_action_repair_state_valid" CHECK ("state" IN ('available','executing','repaired','stale','failed','expired'))
      );
      CREATE INDEX IF NOT EXISTS "ai_action_repairs_user_state_idx" ON "ai_action_repairs" ("user_id","state","created_at");
    `,
  },
  {
    id: "0103_relationship_intelligence_governance",
    sql: `
      ALTER TABLE "personal_relationships" ADD COLUMN IF NOT EXISTS "ecosystem_id" uuid DEFAULT gen_random_uuid();
      UPDATE "personal_relationships" SET "ecosystem_id" = gen_random_uuid() WHERE "ecosystem_id" IS NULL;
      ALTER TABLE "personal_relationships" ALTER COLUMN "ecosystem_id" SET NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS "personal_relationships_ecosystem_id_unique" ON "personal_relationships" ("ecosystem_id");
      ALTER TABLE "relationship_interactions" ADD COLUMN IF NOT EXISTS "structured_data" jsonb NOT NULL DEFAULT '{}'::jsonb;
      CREATE TABLE IF NOT EXISTS "relationship_assessments" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "relationship_id" integer NOT NULL REFERENCES "personal_relationships"("id") ON DELETE cascade,
        "assessment_kind" text NOT NULL DEFAULT 'periodic',
        "dimensions" jsonb NOT NULL,
        "reflection" text,
        "occurred_at" timestamp NOT NULL DEFAULT now(),
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "relationship_assessment_kind_valid" CHECK ("assessment_kind" IN ('baseline','periodic','transition'))
      );
      CREATE INDEX IF NOT EXISTS "relationship_assessments_relationship_occurred_idx" ON "relationship_assessments" ("relationship_id","occurred_at");
      CREATE TABLE IF NOT EXISTS "relationship_governance_consents" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "relationship_id" integer NOT NULL REFERENCES "personal_relationships"("id") ON DELETE cascade,
        "purpose" text NOT NULL,
        "allowed_scopes" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "allowed_destinations" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "disclosure_version" text NOT NULL,
        "expires_at" timestamp NOT NULL,
        "revoked_at" timestamp,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "relationship_consent_purpose_valid" CHECK ("purpose" IN ('ai_recommendation','ecosystem_share')),
        CONSTRAINT "relationship_consent_expiry_valid" CHECK ("expires_at" > "created_at")
      );
      CREATE INDEX IF NOT EXISTS "relationship_governance_consents_user_relationship_idx" ON "relationship_governance_consents" ("user_id","relationship_id","purpose");
      CREATE TABLE IF NOT EXISTS "relationship_ai_recommendations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "relationship_id" integer NOT NULL REFERENCES "personal_relationships"("id") ON DELETE cascade,
        "consent_id" uuid NOT NULL REFERENCES "relationship_governance_consents"("id") ON DELETE restrict,
        "model" text NOT NULL,
        "source_manifest" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "recommendations" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "disclosure" text NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "relationship_ai_recommendations_relationship_created_idx" ON "relationship_ai_recommendations" ("relationship_id","created_at");
      CREATE TABLE IF NOT EXISTS "relationship_governance_audit" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "relationship_id" integer NOT NULL REFERENCES "personal_relationships"("id") ON DELETE cascade,
        "consent_id" uuid REFERENCES "relationship_governance_consents"("id") ON DELETE set null,
        "action" text NOT NULL,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "relationship_governance_audit_user_created_idx" ON "relationship_governance_audit" ("user_id","created_at");
    `,
  },
  {
    id: "0104_food_catalog_gateway",
    sql: `
      ALTER TABLE "nutrition_foods" ADD COLUMN IF NOT EXISTS "catalog_provider_id" text;
      ALTER TABLE "nutrition_foods" ADD COLUMN IF NOT EXISTS "catalog_external_id" text;
      ALTER TABLE "nutrition_foods" ADD COLUMN IF NOT EXISTS "catalog_dataset_version" text;
      ALTER TABLE "nutrition_foods" ADD COLUMN IF NOT EXISTS "catalog_item_version" text;
      ALTER TABLE "nutrition_foods" ADD COLUMN IF NOT EXISTS "catalog_attribution_text" text;
      ALTER TABLE "nutrition_foods" ADD COLUMN IF NOT EXISTS "catalog_attribution_url" text;
      ALTER TABLE "nutrition_foods" ADD COLUMN IF NOT EXISTS "catalog_territory" text;
      ALTER TABLE "nutrition_foods" ADD COLUMN IF NOT EXISTS "catalog_imported_at" timestamp;
      ALTER TABLE "nutrition_foods" ADD COLUMN IF NOT EXISTS "catalog_source_modified" boolean NOT NULL DEFAULT false;
      CREATE UNIQUE INDEX IF NOT EXISTS "nutrition_foods_user_catalog_item_unique_idx" ON "nutrition_foods" ("user_id", "catalog_provider_id", "catalog_external_id", "catalog_dataset_version", "catalog_item_version");
      ALTER TABLE "ingredient_scans" ADD COLUMN IF NOT EXISTS "catalog_provider_id" text;
      ALTER TABLE "ingredient_scans" ADD COLUMN IF NOT EXISTS "catalog_external_id" text;
      ALTER TABLE "ingredient_scans" ADD COLUMN IF NOT EXISTS "catalog_dataset_version" text;
      ALTER TABLE "ingredient_scans" ADD COLUMN IF NOT EXISTS "catalog_item_version" text;
      ALTER TABLE "ingredient_scans" ADD COLUMN IF NOT EXISTS "catalog_attribution_text" text;
      ALTER TABLE "ingredient_scans" ADD COLUMN IF NOT EXISTS "catalog_attribution_url" text;
      ALTER TABLE "ingredient_scans" ADD COLUMN IF NOT EXISTS "catalog_territory" text;
      ALTER TABLE "ingredient_scans" ADD COLUMN IF NOT EXISTS "catalog_source_modified" boolean NOT NULL DEFAULT false;
    `,
  },
  {
    id: "0105_food_catalog_portions",
    sql: `
      ALTER TABLE "nutrition_food_portions" ADD COLUMN IF NOT EXISTS "catalog_label" text;
      ALTER TABLE "nutrition_food_portions" ADD COLUMN IF NOT EXISTS "catalog_grams_per_unit" real;
      ALTER TABLE "nutrition_food_portions" ADD COLUMN IF NOT EXISTS "source_modified" boolean NOT NULL DEFAULT false;
    `,
  },
  {
    id: "0106_spreadsheet_revisions",
    sql: `
      ALTER TABLE "spreadsheets" ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL DEFAULT 1;
      ALTER TABLE "spreadsheets" DROP CONSTRAINT IF EXISTS "spreadsheets_revision_positive";
      ALTER TABLE "spreadsheets" ADD CONSTRAINT "spreadsheets_revision_positive" CHECK ("revision" > 0);
      CREATE TABLE IF NOT EXISTS "spreadsheet_revisions" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "spreadsheet_id" integer NOT NULL REFERENCES "spreadsheets"("id") ON DELETE cascade,
        "revision_number" integer NOT NULL,
        "action" text NOT NULL,
        "source_revision" integer,
        "snapshot" jsonb NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "spreadsheet_revisions_revision_positive" CHECK ("revision_number" > 0),
        CONSTRAINT "spreadsheet_revisions_action_valid" CHECK ("action" IN ('created', 'updated', 'restored')),
        CONSTRAINT "spreadsheet_revisions_source_positive" CHECK ("source_revision" IS NULL OR "source_revision" > 0),
        CONSTRAINT "spreadsheet_revisions_spreadsheet_revision_unique_idx" UNIQUE ("spreadsheet_id", "revision_number")
      );
      CREATE INDEX IF NOT EXISTS "spreadsheet_revisions_user_spreadsheet_created_idx" ON "spreadsheet_revisions" ("user_id", "spreadsheet_id", "created_at");
      INSERT INTO "spreadsheet_revisions" ("user_id", "spreadsheet_id", "revision_number", "action", "snapshot", "created_at")
      SELECT "user_id", "id", "revision", 'created', jsonb_build_object('title', "title", 'description', "description", 'category', "category", 'content', "content"), COALESCE("created_at", now())
      FROM "spreadsheets"
      ON CONFLICT ("spreadsheet_id", "revision_number") DO NOTHING;
    `,
  },
  {
    id: "0107_canvas_revisions",
    sql: `
      ALTER TABLE "canvases" ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL DEFAULT 1;
      ALTER TABLE "canvases" DROP CONSTRAINT IF EXISTS "canvases_revision_positive";
      ALTER TABLE "canvases" ADD CONSTRAINT "canvases_revision_positive" CHECK ("revision" > 0);
      CREATE TABLE IF NOT EXISTS "canvas_revisions" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "canvas_id" integer NOT NULL REFERENCES "canvases"("id") ON DELETE cascade,
        "revision_number" integer NOT NULL,
        "action" text NOT NULL,
        "source_revision" integer,
        "snapshot" jsonb NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "canvas_revisions_revision_positive" CHECK ("revision_number" > 0),
        CONSTRAINT "canvas_revisions_action_valid" CHECK ("action" IN ('created', 'updated', 'restored')),
        CONSTRAINT "canvas_revisions_source_positive" CHECK ("source_revision" IS NULL OR "source_revision" > 0),
        CONSTRAINT "canvas_revisions_canvas_revision_unique_idx" UNIQUE ("canvas_id", "revision_number")
      );
      CREATE INDEX IF NOT EXISTS "canvas_revisions_user_canvas_created_idx" ON "canvas_revisions" ("user_id", "canvas_id", "created_at");
      INSERT INTO "canvas_revisions" ("user_id", "canvas_id", "revision_number", "action", "snapshot", "created_at")
      SELECT "user_id", "id", "revision", 'created', jsonb_build_object('title', "title", 'description', "description", 'category', "category", 'content', "content"), COALESCE("created_at", now())
      FROM "canvases"
      ON CONFLICT ("canvas_id", "revision_number") DO NOTHING;
    `,
  },
  {
    id: "0108_workspace_search_indexes",
    sql: `
      CREATE EXTENSION IF NOT EXISTS pg_trgm;
      CREATE INDEX IF NOT EXISTS "quests_workspace_search_fts_idx" ON "quests" USING gin
        (to_tsvector('simple', COALESCE("title", '') || ' ' || COALESCE("description", '')));
      CREATE INDEX IF NOT EXISTS "quests_workspace_search_title_trgm_idx" ON "quests" USING gin ("title" gin_trgm_ops);
      CREATE INDEX IF NOT EXISTS "documents_workspace_search_fts_idx" ON "documents" USING gin
        (to_tsvector('simple', COALESCE("title", '') || ' ' || COALESCE("description", '') || ' ' || COALESCE("content", '')));
      CREATE INDEX IF NOT EXISTS "documents_workspace_search_title_trgm_idx" ON "documents" USING gin ("title" gin_trgm_ops);
      CREATE INDEX IF NOT EXISTS "spreadsheets_workspace_search_fts_idx" ON "spreadsheets" USING gin
        (to_tsvector('simple', COALESCE("title", '') || ' ' || COALESCE("description", '')));
      CREATE INDEX IF NOT EXISTS "spreadsheets_workspace_search_title_trgm_idx" ON "spreadsheets" USING gin ("title" gin_trgm_ops);
      CREATE INDEX IF NOT EXISTS "canvases_workspace_search_fts_idx" ON "canvases" USING gin
        (to_tsvector('simple', COALESCE("title", '') || ' ' || COALESCE("description", '')));
      CREATE INDEX IF NOT EXISTS "canvases_workspace_search_title_trgm_idx" ON "canvases" USING gin ("title" gin_trgm_ops);
      CREATE INDEX IF NOT EXISTS "workspace_databases_workspace_search_fts_idx" ON "workspace_databases" USING gin
        (to_tsvector('simple', COALESCE("title", '') || ' ' || COALESCE("description", '')));
      CREATE INDEX IF NOT EXISTS "workspace_databases_workspace_search_title_trgm_idx" ON "workspace_databases" USING gin ("title" gin_trgm_ops);
      CREATE INDEX IF NOT EXISTS "contacts_workspace_search_fts_idx" ON "contacts" USING gin
        (to_tsvector('simple', COALESCE("name", '') || ' ' || COALESCE("alias", '') || ' ' || COALESCE("company", '') || ' ' || COALESCE("job_title", '')));
      CREATE INDEX IF NOT EXISTS "contacts_workspace_search_name_trgm_idx" ON "contacts" USING gin ("name" gin_trgm_ops);
    `,
  },
  {
    id: "0109_workspace_table_views",
    sql: `
      CREATE TABLE IF NOT EXISTS "workspace_table_views" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "database_id" integer NOT NULL REFERENCES "workspace_databases"("id") ON DELETE cascade,
        "name" text NOT NULL,
        "definition" jsonb NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "workspace_table_views_user_database_idx" ON "workspace_table_views" ("user_id", "database_id");
      CREATE UNIQUE INDEX IF NOT EXISTS "workspace_table_views_database_name_unique_idx" ON "workspace_table_views" ("database_id", lower("name"));
    `,
  },
  {
    id: "0110_workspace_table_revisions",
    sql: `
      ALTER TABLE "workspace_databases" ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL DEFAULT 1;
      ALTER TABLE "workspace_database_rows" ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL DEFAULT 1;
      CREATE TABLE IF NOT EXISTS "workspace_database_revisions" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "database_id" integer NOT NULL REFERENCES "workspace_databases"("id") ON DELETE cascade, "revision_number" integer NOT NULL,
        "action" text NOT NULL, "source_revision" integer, "snapshot" jsonb NOT NULL, "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "workspace_database_revisions_revision_positive" CHECK ("revision_number" > 0),
        CONSTRAINT "workspace_database_revisions_action_valid" CHECK ("action" IN ('created','updated','restored')),
        CONSTRAINT "workspace_database_revisions_source_positive" CHECK ("source_revision" IS NULL OR "source_revision" > 0),
        CONSTRAINT "workspace_database_revisions_database_revision_unique_idx" UNIQUE ("database_id", "revision_number")
      );
      CREATE INDEX IF NOT EXISTS "workspace_database_revisions_user_database_created_idx" ON "workspace_database_revisions" ("user_id", "database_id", "created_at");
      CREATE TABLE IF NOT EXISTS "workspace_database_row_revisions" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "database_id" integer NOT NULL REFERENCES "workspace_databases"("id") ON DELETE cascade, "row_id" integer NOT NULL REFERENCES "workspace_database_rows"("id") ON DELETE cascade,
        "revision_number" integer NOT NULL, "action" text NOT NULL, "source_revision" integer, "snapshot" jsonb NOT NULL, "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "workspace_database_row_revisions_revision_positive" CHECK ("revision_number" > 0),
        CONSTRAINT "workspace_database_row_revisions_action_valid" CHECK ("action" IN ('created','updated','restored')),
        CONSTRAINT "workspace_database_row_revisions_source_positive" CHECK ("source_revision" IS NULL OR "source_revision" > 0),
        CONSTRAINT "workspace_database_row_revisions_row_revision_unique_idx" UNIQUE ("row_id", "revision_number")
      );
      CREATE INDEX IF NOT EXISTS "workspace_database_row_revisions_user_row_created_idx" ON "workspace_database_row_revisions" ("user_id", "row_id", "created_at");
      INSERT INTO "workspace_database_revisions" ("user_id", "database_id", "revision_number", "action", "snapshot", "created_at")
      SELECT "user_id", "id", "revision", 'created', jsonb_build_object('title', "title", 'description', "description", 'category', "category", 'favorite', "favorite", 'definition', "definition"), COALESCE("created_at", now()) FROM "workspace_databases"
      ON CONFLICT ("database_id", "revision_number") DO NOTHING;
      INSERT INTO "workspace_database_row_revisions" ("user_id", "database_id", "row_id", "revision_number", "action", "snapshot", "created_at")
      SELECT "user_id", "database_id", "id", "revision", 'created', jsonb_build_object('values', "values"), COALESCE("created_at", now()) FROM "workspace_database_rows"
      ON CONFLICT ("row_id", "revision_number") DO NOTHING;
    `,
  },
  {
    id: "0111_workspace_form_governance",
    sql: `
      ALTER TABLE "workspace_forms" ADD COLUMN IF NOT EXISTS "definition" jsonb;
      UPDATE "workspace_forms" SET "definition" = jsonb_build_object('version', 1, 'sections', jsonb_build_array(jsonb_build_object('id', 'main', 'title', 'Response details', 'description', NULL, 'fieldIds', "field_ids")), 'conditions', '[]'::jsonb) WHERE "definition" IS NULL;
      ALTER TABLE "workspace_forms" ALTER COLUMN "definition" SET NOT NULL;
      CREATE TABLE IF NOT EXISTS "workspace_form_access_grants" (
        "id" serial PRIMARY KEY NOT NULL, "public_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade, "form_id" integer NOT NULL REFERENCES "workspace_forms"("id") ON DELETE cascade,
        "label" text NOT NULL, "token_hash" text NOT NULL, "active" boolean NOT NULL DEFAULT true, "expires_at" timestamp NOT NULL,
        "max_submissions" integer NOT NULL, "submission_count" integer NOT NULL DEFAULT 0, "last_used_at" timestamp, "revoked_at" timestamp, "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "workspace_form_access_grants_public_unique" UNIQUE ("public_id"), CONSTRAINT "workspace_form_access_grants_token_unique" UNIQUE ("token_hash"),
        CONSTRAINT "workspace_form_access_grants_max_positive" CHECK ("max_submissions" > 0 AND "max_submissions" <= 10000),
        CONSTRAINT "workspace_form_access_grants_count_valid" CHECK ("submission_count" >= 0 AND "submission_count" <= "max_submissions")
      );
      CREATE INDEX IF NOT EXISTS "workspace_form_access_grants_user_form_idx" ON "workspace_form_access_grants" ("user_id", "form_id");
      CREATE INDEX IF NOT EXISTS "workspace_form_access_grants_public_idx" ON "workspace_form_access_grants" ("public_id");
      CREATE TABLE IF NOT EXISTS "workspace_form_submission_receipts" (
        "id" serial PRIMARY KEY NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "form_id" integer NOT NULL REFERENCES "workspace_forms"("id") ON DELETE cascade, "grant_id" integer NOT NULL REFERENCES "workspace_form_access_grants"("id") ON DELETE cascade,
        "row_id" integer NOT NULL REFERENCES "workspace_database_rows"("id") ON DELETE cascade, "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "workspace_form_submission_receipts_grant_row_unique_idx" UNIQUE ("grant_id", "row_id")
      );
      CREATE INDEX IF NOT EXISTS "workspace_form_submission_receipts_user_form_idx" ON "workspace_form_submission_receipts" ("user_id", "form_id");
    `,
  },
  {
    id: "0112_quests_calendar_window",
    sql: `
      CREATE INDEX IF NOT EXISTS "quests_user_calendar_window_idx"
        ON "quests" ("user_id", "start_date", "id")
        WHERE "deleted_at" IS NULL AND "start_date" IS NOT NULL;
    `,
  },
  {
    id: "0113_calendar_offline_concurrency",
    sql: `
      ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL DEFAULT 1;
      ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "lifecycle_payload_hash" text;
      DO $$ BEGIN
        ALTER TABLE "quests" ADD CONSTRAINT "quests_revision_positive" CHECK ("revision" > 0);
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
      CREATE OR REPLACE FUNCTION "lyfeos_bump_quest_revision"() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        NEW."revision" := OLD."revision" + 1;
        NEW."updated_at" := now();
        RETURN NEW;
      END;
      $$;
      DROP TRIGGER IF EXISTS "quests_bump_revision" ON "quests";
      CREATE TRIGGER "quests_bump_revision" BEFORE UPDATE ON "quests" FOR EACH ROW EXECUTE FUNCTION "lyfeos_bump_quest_revision"();
      CREATE TABLE IF NOT EXISTS "mission_mutation_receipts" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "mutation_id" text NOT NULL,
        "payload_hash" text NOT NULL,
        "operation" text NOT NULL,
        "quest_id" integer,
        "resulting_revision" integer,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "mission_mutation_receipts_user_mutation_unique_idx" UNIQUE("user_id", "mutation_id")
      );
      CREATE INDEX IF NOT EXISTS "mission_mutation_receipts_user_created_idx" ON "mission_mutation_receipts" ("user_id", "created_at");
    `,
  },
  {
    id: "0114_workflow_automation_recovery",
    sql: `
      ALTER TABLE "workflow_automations" ADD COLUMN IF NOT EXISTS "consecutive_failures" integer NOT NULL DEFAULT 0;
      ALTER TABLE "workflow_automations" ADD COLUMN IF NOT EXISTS "paused_at" timestamp;
      ALTER TABLE "workflow_automations" ADD COLUMN IF NOT EXISTS "pause_reason" text;
      ALTER TABLE "workflow_automation_runs" ADD COLUMN IF NOT EXISTS "definition_snapshot" jsonb;
      UPDATE "workflow_automation_runs" AS "run" SET "definition_snapshot" = "automation"."definition"
      FROM "workflow_automations" AS "automation"
      WHERE "run"."automation_id" = "automation"."id" AND "run"."definition_snapshot" IS NULL;
      CREATE TABLE IF NOT EXISTS "workflow_automation_action_receipts" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "run_id" integer NOT NULL REFERENCES "workflow_automation_runs"("id") ON DELETE cascade,
        "action_index" integer NOT NULL,
        "action_type" text NOT NULL,
        "status" text NOT NULL DEFAULT 'running',
        "expected_quest_revision" integer,
        "target_quest_id" integer REFERENCES "quests"("id") ON DELETE set null,
        "attempt_count" integer NOT NULL DEFAULT 1,
        "last_error_code" text,
        "claimed_at" timestamp NOT NULL DEFAULT now(),
        "completed_at" timestamp,
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "workflow_automation_action_receipts_index_valid" CHECK ("action_index" >= 0 AND "action_index" < 3),
        CONSTRAINT "workflow_automation_action_receipts_revision_positive" CHECK ("expected_quest_revision" IS NULL OR "expected_quest_revision" > 0),
        CONSTRAINT "workflow_automation_action_receipts_attempt_positive" CHECK ("attempt_count" > 0),
        CONSTRAINT "workflow_automation_action_receipts_status_valid" CHECK ("status" IN ('running','succeeded','failed'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "workflow_automation_action_receipts_run_action_unique_idx" ON "workflow_automation_action_receipts" ("run_id", "action_index");
      CREATE INDEX IF NOT EXISTS "workflow_automation_action_receipts_user_status_idx" ON "workflow_automation_action_receipts" ("user_id", "status", "updated_at");
    `,
  },
  {
    id: "0115_project_lifecycle_recovery",
    sql: `
      ALTER TABLE "kanban_boards" ADD COLUMN IF NOT EXISTS "origin" text NOT NULL DEFAULT 'native';
      ALTER TABLE "kanban_boards" ADD COLUMN IF NOT EXISTS "legacy_reconciled_at" timestamp;
      ALTER TABLE "kanban_boards" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;
      UPDATE "kanban_boards" AS "project" SET "origin" = 'legacy_kanban'
      WHERE NOT EXISTS (
        SELECT 1 FROM "project_events" AS "event"
        WHERE "event"."project_id" = "project"."id" AND "event"."event_type" = 'ProjectCreated.v1'
      );
      INSERT INTO "project_events" ("user_id", "project_id", "event_type", "to_state", "aggregate_revision", "actor_source")
      SELECT "project"."user_id", "project"."id", 'ProjectImportedFromLegacyKanban.v1', "project"."state", "project"."revision", 'migration'
      FROM "kanban_boards" AS "project"
      WHERE "project"."origin" = 'legacy_kanban'
        AND NOT EXISTS (
          SELECT 1 FROM "project_events" AS "event"
          WHERE "event"."project_id" = "project"."id" AND "event"."event_type" = 'ProjectImportedFromLegacyKanban.v1'
        );
      CREATE INDEX IF NOT EXISTS "kanban_boards_user_deleted_updated_idx" ON "kanban_boards" ("user_id", "deleted_at", "updated_at");
    `,
  },
  {
    id: "0116_mission_contract_method_pack",
    sql: `
      ALTER TABLE "mission_contracts" ADD COLUMN IF NOT EXISTS "method_steps" jsonb NOT NULL DEFAULT '[]'::jsonb;
      ALTER TABLE "mission_contracts" ADD COLUMN IF NOT EXISTS "tool_requirements" jsonb NOT NULL DEFAULT '[]'::jsonb;
      DO $$ BEGIN
        ALTER TABLE "mission_contracts" ADD CONSTRAINT "mission_contracts_method_steps_valid"
          CHECK (jsonb_typeof("method_steps") = 'array' AND jsonb_array_length("method_steps") <= 12);
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
      DO $$ BEGIN
        ALTER TABLE "mission_contracts" ADD CONSTRAINT "mission_contracts_tool_requirements_valid"
          CHECK (jsonb_typeof("tool_requirements") = 'array' AND jsonb_array_length("tool_requirements") <= 12);
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `,
  },
  {
    id: "0117_mission_review_native_delivery",
    sql: `
      ALTER TABLE "mission_review_invitations" ADD COLUMN IF NOT EXISTS "delivery_channel" text;
      ALTER TABLE "mission_review_invitations" ADD COLUMN IF NOT EXISTS "delivery_status" text;
      ALTER TABLE "mission_review_invitations" ADD COLUMN IF NOT EXISTS "delivery_message_id" uuid;
      ALTER TABLE "mission_review_invitations" ADD COLUMN IF NOT EXISTS "delivered_at" timestamp;
      DO $$ BEGIN
        ALTER TABLE "mission_review_invitations" ADD CONSTRAINT "mission_review_invitations_delivery_channel_valid"
          CHECK ("delivery_channel" IS NULL OR "delivery_channel" = 'native_inbox');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
      DO $$ BEGIN
        ALTER TABLE "mission_review_invitations" ADD CONSTRAINT "mission_review_invitations_delivery_status_valid"
          CHECK ("delivery_status" IS NULL OR "delivery_status" = 'delivered');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
      DO $$ BEGIN
        ALTER TABLE "mission_review_invitations" ADD CONSTRAINT "mission_review_invitations_delivery_evidence_complete"
          CHECK (
            ("delivery_channel" IS NULL AND "delivery_status" IS NULL AND "delivery_message_id" IS NULL AND "delivered_at" IS NULL)
            OR
            ("delivery_channel" = 'native_inbox' AND "delivery_status" = 'delivered' AND "delivery_message_id" IS NOT NULL AND "delivered_at" IS NOT NULL)
          );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `,
  },
  {
    id: "0118_mission_evidence_provider_provenance",
    sql: `
      CREATE TABLE IF NOT EXISTS "mission_evidence_provider_bindings" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "mission_evidence_id" integer NOT NULL REFERENCES "mission_evidence"("id") ON DELETE cascade,
        "provider_domain" text NOT NULL DEFAULT 'health',
        "provider_source_record_id" integer REFERENCES "health_source_records"("id") ON DELETE set null,
        "provider" text NOT NULL,
        "record_type" text NOT NULL,
        "observed_at" timestamp NOT NULL,
        "received_at" timestamp NOT NULL,
        "payload_fingerprint" text NOT NULL,
        "transform_version" text NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "mission_evidence_provider_bindings_domain_valid" CHECK ("provider_domain" = 'health')
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "mission_evidence_provider_bindings_evidence_unique_idx" ON "mission_evidence_provider_bindings" ("mission_evidence_id");
      CREATE INDEX IF NOT EXISTS "mission_evidence_provider_bindings_user_created_idx" ON "mission_evidence_provider_bindings" ("user_id", "created_at");
      CREATE INDEX IF NOT EXISTS "mission_evidence_provider_bindings_source_idx" ON "mission_evidence_provider_bindings" ("provider_source_record_id");
    `,
  },
  {
    id: "0119_thread_capability_focus",
    sql: `
      ALTER TABLE "transformation_threads" ADD COLUMN IF NOT EXISTS "primary_capability_id" integer;
      UPDATE "transformation_threads" thread
      SET "primary_capability_id" = (
        SELECT node."capability_id" FROM "skill_nodes" node
        WHERE node."transformation_thread_id" = thread."id"
          AND node."user_id" = thread."user_id"
          AND node."kind" = 'primary'
          AND node."capability_id" IS NOT NULL
        ORDER BY node."id" LIMIT 1
      )
      WHERE thread."primary_capability_id" IS NULL;
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'transformation_threads_primary_capability_fk'
            AND conrelid = 'transformation_threads'::regclass
        ) THEN
          ALTER TABLE "transformation_threads"
            ADD CONSTRAINT "transformation_threads_primary_capability_fk"
            FOREIGN KEY ("primary_capability_id") REFERENCES "personal_capabilities"("id") ON DELETE set null;
        END IF;
      END $$;
      CREATE INDEX IF NOT EXISTS "transformation_threads_user_primary_capability_idx"
        ON "transformation_threads" ("user_id", "primary_capability_id", "created_at");
    `,
  },
  {
    id: "0120_mission_consequence_preflight",
    sql: `
      ALTER TABLE "mission_contracts"
        ADD COLUMN IF NOT EXISTS "contract_revision" integer NOT NULL DEFAULT 1;
      CREATE TABLE IF NOT EXISTS "mission_consequence_preflights" (
        "id" serial PRIMARY KEY,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "mission_contract_id" integer NOT NULL REFERENCES "mission_contracts"("id") ON DELETE cascade,
        "contract_revision" integer NOT NULL,
        "assumptions" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "affected_parties" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "scenarios" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "reversibility" text NOT NULL,
        "mitigation_plan" text NOT NULL,
        "uncertainty_note" text NOT NULL,
        "decision" text NOT NULL,
        "decision_rationale" text NOT NULL,
        "status" text NOT NULL,
        "stop_conditions_snapshot" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "acknowledged_no_authority" boolean NOT NULL DEFAULT false,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "mission_consequence_preflights_revision_valid" CHECK ("contract_revision" > 0),
        CONSTRAINT "mission_consequence_preflights_reversibility_valid" CHECK ("reversibility" IN ('reversible', 'partly_reversible', 'irreversible')),
        CONSTRAINT "mission_consequence_preflights_decision_valid" CHECK ("decision" IN ('proceed', 'revise', 'do_not_proceed')),
        CONSTRAINT "mission_consequence_preflights_status_valid" CHECK ("status" IN ('ready', 'revise', 'stopped')),
        CONSTRAINT "mission_consequence_preflights_authority_ack" CHECK ("acknowledged_no_authority" = true)
      );
      CREATE INDEX IF NOT EXISTS "mission_consequence_preflights_contract_revision_idx"
        ON "mission_consequence_preflights" ("mission_contract_id", "contract_revision", "created_at");
      CREATE INDEX IF NOT EXISTS "mission_consequence_preflights_user_created_idx"
        ON "mission_consequence_preflights" ("user_id", "created_at");
    `,
  },
  {
    id: "0121_health_insight_interpretations",
    sql: `
      CREATE TABLE IF NOT EXISTS "health_insight_interpretations" (
        "id" serial PRIMARY KEY,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "insight_kind" text NOT NULL DEFAULT 'association',
        "left_series_id" text NOT NULL,
        "left_series_label" text NOT NULL,
        "right_series_id" text NOT NULL,
        "right_series_label" text NOT NULL,
        "period_days" integer NOT NULL,
        "lag_days" integer NOT NULL DEFAULT 0,
        "evidence_start" date NOT NULL,
        "evidence_end" date NOT NULL,
        "association_snapshot" jsonb NOT NULL,
        "interpretation" text NOT NULL,
        "note" text,
        "acknowledged_exploratory" boolean NOT NULL DEFAULT false,
        "client_mutation_id" text NOT NULL,
        "mutation_payload_hash" text NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "health_insight_interpretations_kind_valid" CHECK ("insight_kind" = 'association'),
        CONSTRAINT "health_insight_interpretations_period_valid" CHECK ("period_days" BETWEEN 7 AND 3650),
        CONSTRAINT "health_insight_interpretations_lag_valid" CHECK ("lag_days" BETWEEN -30 AND 30),
        CONSTRAINT "health_insight_interpretations_window_valid" CHECK ("evidence_end" >= "evidence_start"),
        CONSTRAINT "health_insight_interpretations_choice_valid" CHECK ("interpretation" IN ('worth_revisiting', 'needs_more_context', 'not_meaningful_to_me')),
        CONSTRAINT "health_insight_interpretations_note_valid" CHECK ("note" IS NULL OR char_length("note") <= 2000),
        CONSTRAINT "health_insight_interpretations_ack_valid" CHECK ("acknowledged_exploratory" = true),
        CONSTRAINT "health_insight_interpretations_user_mutation_unique_idx" UNIQUE ("user_id", "client_mutation_id")
      );
      CREATE INDEX IF NOT EXISTS "health_insight_interpretations_user_created_idx"
        ON "health_insight_interpretations" ("user_id", "created_at" DESC);
    `,
  },
  {
    id: "0122_user_identity_reconciliation",
    sql: `
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_url" text;
      CREATE UNIQUE INDEX IF NOT EXISTS "users_display_name_lower_unique"
        ON "users" (lower("display_name"))
        WHERE "display_name" IS NOT NULL;
    `,
  },
];

async function run(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set for release migrations");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`CREATE TABLE IF NOT EXISTS "lyfeos_schema_migrations" ("id" text PRIMARY KEY, "applied_at" timestamp NOT NULL DEFAULT now())`);
    for (const migration of migrations) {
      const applied = await client.query<{ id: string }>(`SELECT "id" FROM "lyfeos_schema_migrations" WHERE "id" = $1`, [migration.id]);
      if (applied.rowCount) continue;
      await client.query(migration.sql);
      await client.query(`INSERT INTO "lyfeos_schema_migrations" ("id") VALUES ($1)`, [migration.id]);
      console.log(`Applied ${migration.id}`);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error("Release migration failed", error);
  process.exitCode = 1;
});
