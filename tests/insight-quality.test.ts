import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assessObservedPatternQuality } from "../server/insight-quality";

describe("observed-pattern data quality", () => {
  it("does not expose a pattern from sparse observations", () => {
    expect(assessObservedPatternQuality(4, 30)).toMatchObject({
      level: "insufficient", readyToExplore: false, coveragePercent: 13,
    });
  });

  it("labels partial observations as limited instead of causal", () => {
    expect(assessObservedPatternQuality(6, 30)).toMatchObject({
      level: "limited", readyToExplore: true, coveragePercent: 20,
    });
  });

  it("requires enough observations and coverage for the substantial label", () => {
    expect(assessObservedPatternQuality(21, 30)).toMatchObject({
      level: "substantial", readyToExplore: true, coveragePercent: 70,
    });
  });

  it("does not present in-app planning signals as health, financial, or productivity outcomes", () => {
    const compact = readFileSync(resolve(process.cwd(), "client/src/components/dashboard/CompactStatsWidget.tsx"), "utf8");
    const expanded = readFileSync(resolve(process.cwd(), "client/src/components/dashboard/StatsWidget.tsx"), "utf8");
    const healthDetail = readFileSync(resolve(process.cwd(), "client/src/pages/HealthDetailPage.tsx"), "utf8");
    const wealthDetail = readFileSync(resolve(process.cwd(), "client/src/pages/WealthDetailPage.tsx"), "utf8");
    const statDetail = readFileSync(resolve(process.cwd(), "client/src/pages/StatDetailPage.tsx"), "utf8");
    expect(compact).toContain("not a medical metric, diagnosis, or prediction");
    expect(compact).toContain("not an account balance, financial advice, or a measure of wealth");
    expect(expanded).toContain("not a measure of productivity, wellbeing, or personal worth");
    expect(expanded).not.toContain("prevents illness");
    expect(expanded).not.toContain("typically correlate with improved productivity and wellbeing");
    expect(healthDetail).toContain("not a medical conclusion");
    expect(healthDetail).toContain("Health-point game progress");
    expect(healthDetail).toContain("not a measurement, score, diagnosis, or prediction of your health");
    expect(healthDetail).not.toContain("Current Health Status");
    expect(healthDetail).not.toContain("contributes to health");
    expect(healthDetail).not.toContain("directly impact your health score");
    expect(wealthDetail).toContain("not an account balance, financial advice, or investment result");
    expect(wealthDetail).not.toContain("directly impact your wealth score");
    expect(statDetail).not.toContain("Each task switch costs 2-3 attention tokens");
    expect(statDetail).toContain('percentage > 70 ? "HIGH"');
    expect(healthDetail).not.toContain('label: "OPTIMAL"');
    expect(wealthDetail).not.toContain('label: "OPTIMAL"');
  });

  it("does not let mission-derived health points become AI health advice", () => {
    const routes = readFileSync(resolve(process.cwd(), "server/replit_integrations/chat/routes.ts"), "utf8");
    expect(routes).toContain("These are gameplay values, not health measurements");
    expect(routes).toContain("Do not infer health status or provide medical, nutrition, supplement, sleep, or exercise prescriptions");
    expect(routes).toContain("never a health measurement");
  });
});
