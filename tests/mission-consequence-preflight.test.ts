import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Mission consequence preflight", () => {
  it("stores append-only same-revision decisions with bounded database states", () => {
    const schema = source("shared/schema.ts");
    const migration = source("migrations/0120_mission_consequence_preflight.sql");
    const release = source("server/release-migrate.ts");
    expect(schema).toContain('export const missionConsequencePreflights = pgTable("mission_consequence_preflights"');
    expect(schema).toContain('contractRevision: integer("contract_revision")');
    expect(migration).toContain("mission_consequence_preflights_authority_ack");
    expect(migration).toContain("'proceed', 'revise', 'do_not_proceed'");
    expect(release).toContain('id: "0120_mission_consequence_preflight"');
  });

  it("fails closed in the shared completion lifecycle and never grants authority", () => {
    const lifecycle = source("server/mission-lifecycle.ts");
    const routes = source("server/routes/mission-contracts.ts");
    expect(lifecycle).toContain("Accept this high-risk Mission's current consequence preflight before completing it.");
    expect(lifecycle).toContain("missionConsequencePreflights.contractRevision");
    expect(lifecycle).toContain("pg_advisory_xact_lock(120010");
    expect(routes).toContain('app.post("/api/quests/:questId/contract/preflights"');
    expect(routes).toContain('app.post("/api/quests/:questId/contract/accept"');
    expect(routes.match(/pg_advisory_xact_lock\(120010/g)).toHaveLength(4);
    expect(routes).toContain("does not predict safety, verify the scenario, grant authority");
  });

  it("keeps the preflight in Mission Detail and includes it in data rights", () => {
    const detail = source("client/src/pages/MissionDetailPage.tsx");
    const profile = source("server/routes/profile.ts");
    expect(detail).toContain("Consequence preflight · contract revision");
    expect(detail).toContain("Record append-only preflight");
    expect(detail).toContain("LyfeOS has not verified these assumptions");
    expect(profile).toContain('"mission_consequence_preflights"');
  });
});
