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

  it("archives isolated rendered evidence for the exact-revision safety journey", () => {
    const acceptance = source("scripts/mission-safety-browser-acceptance.ts");
    const workflow = source(".github/workflows/verify.yml");
    const packageJson = source("package.json");
    const detail = source("client/src/pages/MissionDetailPage.tsx");
    expect(acceptance).toContain('ISOLATED ? "lyfeos.isolated-mission-safety-browser.v1"');
    expect(acceptance).toContain('process.env.GITHUB_SHA');
    expect(acceptance).toContain('recordPreflight(page, missionId, "revise", 1');
    expect(acceptance).toContain('recordPreflight(page, missionId, "proceed", 2');
    expect(acceptance).toContain('materialRevisionInvalidatedDecision');
    expect(acceptance).toContain('prerequisiteBlockedCompletion');
    expect(acceptance).toContain('DELETE", "/api/account"');
    expect(acceptance).toContain('desktop-1440x900');
    expect(acceptance).toContain('mobile-390x844');
    expect(detail).toContain('data-testid="mission-preflight-acknowledgement"');
    expect(detail).toContain('data-testid="mission-preflight-record"');
    expect(detail).toContain('data-testid="mission-preflight-accept"');
    expect(packageJson).toContain('"acceptance:mission-safety": "tsx scripts/mission-safety-browser-acceptance.ts"');
    expect(workflow).toContain('npm run acceptance:mission-safety');
    expect(workflow).toContain('name: lyfeos-isolated-mission-safety-${{ github.sha }}');
    expect(workflow).toContain('path: ${{ runner.temp }}/lyfeos-mission-safety-browser');
  });

  it("repeats the exact-revision safety journey with a source-pinned disposable production account", () => {
    const acceptance = source("scripts/mission-safety-browser-acceptance.ts");
    const workflow = source(".github/workflows/production-browser-acceptance.yml");
    expect(acceptance).toContain('MODE === "production"');
    expect(acceptance).toContain('BASE_URL.origin === "https://lyfeos.net"');
    expect(acceptance).toContain('release.body?.sourceRevision === SOURCE');
    expect(acceptance).toContain('"lyfeos.production-mission-safety-browser.v1"');
    expect(acceptance).toContain('sessionInvalidated');
    expect(acceptance).toContain('emailReleased');
    expect(acceptance).toContain('displayNameReleased');
    expect(workflow).toContain('name: Run disposable production Mission safety acceptance');
    expect(workflow).toContain('LYFEOS_MISSION_SAFETY_MODE: production');
    expect(workflow).toContain('LYFEOS_TEST_API_URL: https://lyfeos.net');
  });
});
