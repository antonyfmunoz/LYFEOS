import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const source = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("health laboratory collection metadata", () => {
  it("adds optional lab-only specimen and collection facts without interpretation", () => {
    const migration = source("migrations/0069_health_lab_collection_metadata.sql");
    const schema = source("shared/schema.ts");
    const release = source("server/release-migrate.ts");
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "specimen_type"');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "collected_at"');
    expect(migration).toContain('OR "category" = \'lab\'');
    expect(migration).toContain("health_observations_user_collected_at_idx");
    expect(schema).toContain('specimenType: text("specimen_type")');
    expect(schema).toContain('collectedAt: timestamp("collected_at")');
    expect(release).toContain('id: "0069_health_lab_collection_metadata"');
  });

  it("validates, displays, and timelines collection facts while keeping the clinical boundary", () => {
    const routes = source("server/routes/health-observations.ts");
    const timeline = source("server/routes/health-fitness.ts");
    const ledger = source("client/src/components/health/HealthMetricsLedger.tsx");
    expect(routes).toContain("Specimen and collection metadata can only be attached to a lab observation");
    expect(routes).toContain("collectedAt: z.string().datetime().nullable().optional()");
    expect(routes).toContain("eq(healthObservations.userId, userId)");
    expect(timeline).toContain("entry.collectedAt?.toISOString() || entry.observedAt.toISOString()");
    expect(ledger).toContain('aria-label="Specimen type"');
    expect(ledger).toContain('aria-label="Specimen collected at"');
    expect(ledger).toContain("Values are never automatically interpreted as clinical advice");
  });
});
