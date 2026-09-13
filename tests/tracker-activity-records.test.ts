import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Tracker activity records", () => {
  it("supplies the activity charts with explicit planning estimates and honest missing-record coverage", () => {
    const profile = source("server/routes/profile.ts");
    const tracker = source("client/src/pages/AnalyticsPage.tsx");
    expect(profile).toContain("const missionAllocationTrend");
    expect(profile).toContain("const dailyRecordCoverage");
    expect(profile).toContain("planning estimates stored on completed missions");
    expect(profile).toContain("Missing is null, never zero");
    expect(profile).toContain("missionAllocationTrend,");
    expect(profile).toContain("dailyRecordCoverage,");
    expect(tracker).toContain('data-testid="tracker-mission-allocation"');
    expect(tracker).toContain('data-testid="tracker-daily-record-coverage"');
  });
});
