import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Mission provider evidence boundary", () => {
  it("persists a minimal server-owned provenance receipt without copying the Health payload", () => {
    const schema = source("shared/schema.ts");
    const migration = source("migrations/0118_mission_evidence_provider_provenance.sql");
    const routes = source("server/routes/mission-contracts.ts");
    expect(schema).toContain('pgTable("mission_evidence_provider_bindings"');
    expect(migration).toContain('ON DELETE set null');
    expect(routes).toContain('providerSourceRecordId: z.number().int().positive()');
    expect(routes).toContain('eq(healthSourceRecords.userId, req.session.userId!)');
    expect(routes).toContain('eq(healthSourceRecords.state, "active")');
    expect(routes).not.toContain("sourcePayload: sourceRecord.sourcePayload");
  });

  it("keeps provider claims distinct from completion review and surfaces lifecycle state", () => {
    const provenance = source("server/mission-evidence-provenance.ts");
    const missionPage = source("client/src/pages/MissionDetailPage.tsx");
    const reviewPage = source("client/src/pages/MissionReviewPage.tsx");
    expect(provenance).toContain('"source_deleted"');
    expect(provenance).toContain('"superseded"');
    expect(provenance).toContain("supports provenance, not mission completion by itself");
    expect(missionPage).toContain('aria-label="Imported provider record"');
    expect(missionPage).toContain("No imported records are available");
    expect(reviewPage).toContain("item.provenance.disclosure");
  });

  it("includes the owner receipt in export and deletes it before private Health source data", () => {
    const profileRoutes = source("server/routes/profile.ts");
    expect(profileRoutes).toContain('"mission_evidence_provider_bindings"');
    expect(profileRoutes.indexOf('DELETE FROM "mission_evidence_provider_bindings"')).toBeLessThan(
      profileRoutes.indexOf('for (const table of ["health_source_records"'),
    );
  });
});
