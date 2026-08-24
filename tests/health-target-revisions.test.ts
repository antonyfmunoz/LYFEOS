import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("health target revision integrity", () => {
  it("migrates and releases an append-only target history", () => {
    const migration = source("migrations/0079_health_target_revisions.sql");
    const release = source("server/release-migrate.ts");
    expect(migration).toContain('ALTER TABLE "health_targets" ADD COLUMN IF NOT EXISTS "revision"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "health_target_revisions"');
    expect(migration).toContain("ON CONFLICT");
    expect(release).toContain('id: "0079_health_target_revisions"');
  });

  it("serializes overlapping writes and rejects stale edits or deletes", () => {
    const routes = source("server/routes/health-fitness.ts");
    const ui = source("client/src/components/health/NutritionDiary.tsx");
    expect(routes).toContain("pg_advisory_xact_lock(hashtext('lyfeos-health-target')");
    expect(routes.match(/SELECT id FROM health_targets[^`]+FOR UPDATE/g)?.length).toBe(2);
    expect(routes.match(/current\.revision !== expectedRevision\.revision/g)?.length).toBe(2);
    expect(routes).toContain('action: "updated"');
    expect(routes).toContain('action: "deleted"');
    expect(ui).toContain('"x-lyfeos-expected-revision": String(editingTarget.revision)');
    expect(ui).toContain("Target change history");
  });

  it("keeps target history in both health and account data-rights paths", () => {
    expect(source("server/routes/health-insights.ts")).toContain('"health_target_revisions"');
    expect(source("server/routes/profile.ts")).toContain('"health_target_revisions"');
  });
});
