import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Health insight interpretations", () => {
  it("stores private user-authored snapshots without raw daily values", () => {
    const schema = source("shared/schema.ts");
    const migration = source("migrations/0121_health_insight_interpretations.sql");
    const routes = source("server/routes/health-insights.ts");
    expect(schema).toContain('export const healthInsightInterpretations = pgTable("health_insight_interpretations"');
    expect(migration).toContain("health_insight_interpretations_ack_valid");
    expect(migration).toContain("'worth_revisiting', 'needs_more_context', 'not_meaningful_to_me'");
    expect(routes).toContain('app.post("/api/health-insights/interpretations"');
    expect(routes).toContain("rawDailyValuesStored: false");
    expect(routes).toContain("aligned: _privateAlignedValues");
  });

  it("keeps uncertainty and interpretation limits visible in the existing Health UI", () => {
    const workbench = source("client/src/components/health/HealthTrendWorkbench.tsx");
    const health = source("client/src/pages/HealthDetailPage.tsx");
    expect(workbench).toContain("Approximate 95% sampling interval");
    expect(workbench).toContain("not a verified health fact, cause, prediction, diagnosis, or instruction");
    expect(workbench).toContain("Raw daily values are not copied into the interpretation");
    expect(health).toContain("sleepWellnessDataQuality.readyToExplore");
  });

  it("includes interpretations in both portable export and Health-domain erasure", () => {
    const profile = source("server/routes/profile.ts");
    const routes = source("server/routes/health-insights.ts");
    expect(profile).toContain('"health_insight_interpretations"');
    expect(routes.match(/"health_insight_interpretations"/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
