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
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "personal_capabilities_user_experience_idx" ON "personal_capabilities" ("user_id", "experience");
--> statement-breakpoint
ALTER TABLE "skill_nodes" ADD COLUMN IF NOT EXISTS "capability_id" integer REFERENCES "personal_capabilities"("id") ON DELETE set null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skill_nodes_capability_idx" ON "skill_nodes" ("capability_id");
--> statement-breakpoint
WITH distinct_capabilities AS (
  SELECT DISTINCT ON ("user_id", capability_key)
    "user_id",
    capability_key,
    "name",
    "description"
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
SELECT
  distinct_capabilities."user_id",
  distinct_capabilities.capability_key,
  distinct_capabilities."name",
  distinct_capabilities."description",
  0,
  1
FROM distinct_capabilities
ON CONFLICT ("user_id", "key") DO NOTHING;
--> statement-breakpoint
UPDATE "skill_nodes" node
SET "capability_id" = capability."id"
FROM "personal_capabilities" capability
WHERE capability."user_id" = node."user_id"
  AND capability."key" = regexp_replace(lower(trim(node."name")), '[^a-z0-9]+', '-', 'g')
  AND node."capability_id" IS NULL;
--> statement-breakpoint
UPDATE "personal_capabilities" capability
SET "experience" = totals.experience, "updated_at" = now()
FROM (
  SELECT "capability_id", sum("experience")::integer AS experience
  FROM "skill_nodes"
  WHERE "capability_id" IS NOT NULL
  GROUP BY "capability_id"
) totals
WHERE capability."id" = totals."capability_id";
--> statement-breakpoint
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
