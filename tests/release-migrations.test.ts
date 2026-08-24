import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("release migration contract", () => {
  it("includes every post-baseline SQL migration in the Fly release runner", () => {
    const migrationIds = readdirSync(resolve(process.cwd(), "migrations"))
      .filter((name) => /^00(?:0[9]|[1-9]\d)_.+\.sql$/.test(name))
      .map((name) => name.replace(/\.sql$/, ""));
    const releaseRunner = readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8");

    expect(migrationIds.length).toBeGreaterThan(0);
    for (const id of migrationIds) {
      expect(releaseRunner).toContain(`id: "${id}"`);
    }
  });

  it("keeps the capacity-deferral audit table in the release migration path", () => {
    const migration = readFileSync(resolve(process.cwd(), "migrations", "0026_mission_deferrals.sql"), "utf8");
    const releaseRunner = readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "mission_deferrals"');
    expect(releaseRunner).toContain('id: "0026_mission_deferrals"');
  });

  it("keeps evidence confidence in the release migration path", () => {
    const migration = readFileSync(resolve(process.cwd(), "migrations", "0028_mission_evidence_confidence.sql"), "utf8");
    const releaseRunner = readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8");
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "confidence"');
    expect(releaseRunner).toContain('id: "0028_mission_evidence_confidence"');
  });

  it("keeps named constraint additions safe when reconciling an already-applied schema", () => {
    const migration = readFileSync(resolve(process.cwd(), "migrations", "0024_skill_edge_weights.sql"), "utf8");
    const releaseRunner = readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8");
    expect(migration).toContain("SELECT 1 FROM pg_constraint");
    expect(migration).toContain("conrelid = 'skill_edges'::regclass");
    expect(releaseRunner).toContain("conname = 'skill_edges_influence_weight_range'");
  });

  it("reconciles the nullable-password Clerk identity column idempotently", () => {
    const migration = readFileSync(resolve(process.cwd(), "migrations", "0090_clerk_user_identity.sql"), "utf8");
    const releaseRunner = readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8");
    expect(migration).toContain('ALTER COLUMN "password" DROP NOT NULL');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "clerk_id" text');
    expect(releaseRunner).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "users_clerk_id_unique"');
  });

  it("captures legacy schema-push drift in a numbered reconciliation migration", () => {
    const migration = readFileSync(resolve(process.cwd(), "migrations", "0091_runtime_schema_reconciliation.sql"), "utf8");
    const releaseRunner = readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8");
    for (const required of ["wealth_tokens_current", "custom_reflection_prompts", "mission_views", "ritual_groups", "waitlist_emails", "fcm_token"]) {
      expect(migration).toContain(required);
      expect(releaseRunner).toContain(required);
    }
  });

  it("includes the Health planning consent lifecycle migration", () => {
    const migration = readFileSync(resolve(process.cwd(), "migrations", "0092_health_planning_consent_lifecycle.sql"), "utf8");
    const releaseRunner = readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8");
    expect(migration).toContain('"expires_at" timestamp');
    expect(migration).toContain('"scope_snapshot"');
    expect(releaseRunner).toContain('id: "0092_health_planning_consent_lifecycle"');
  });

  it("keeps owner-scoped Health report indexes in schema and release migrations", () => {
    const migration = readFileSync(resolve(process.cwd(), "migrations", "0093_health_report_query_indexes.sql"), "utf8");
    const releaseRunner = readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8");
    const schema = readFileSync(resolve(process.cwd(), "shared/schema.ts"), "utf8");
    for (const indexName of ["hydration_entries_user_occurred_idx", "health_observations_user_metric_source_date_idx"]) {
      expect(migration).toContain(indexName);
      expect(releaseRunner).toContain(indexName);
      expect(schema).toContain(indexName);
    }
  });
});
