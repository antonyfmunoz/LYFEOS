ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "clerk_id" text;
CREATE UNIQUE INDEX IF NOT EXISTS "users_clerk_id_unique" ON "users" ("clerk_id");
