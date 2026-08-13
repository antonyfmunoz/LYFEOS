import pg from "pg";

const migrations = [
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
