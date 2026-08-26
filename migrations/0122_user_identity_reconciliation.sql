ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_url" text;

CREATE UNIQUE INDEX IF NOT EXISTS "users_display_name_lower_unique"
  ON "users" (lower("display_name"))
  WHERE "display_name" IS NOT NULL;
