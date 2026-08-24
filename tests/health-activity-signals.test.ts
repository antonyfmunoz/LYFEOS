import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildActivitySignalSeries } from "../server/health-activity";

const row = (id: number, source: string, value: number, includedInCalculations = true) => ({
  id, metricKey: "steps", displayName: "Steps", unit: "count", source, value,
  observedAt: new Date(`2026-08-2${id}T12:00:00.000Z`), date: `2026-08-2${id}`,
  temporalType: "interval", intervalStartAt: new Date(`2026-08-2${id}T10:00:00.000Z`),
  intervalEndAt: new Date(`2026-08-2${id}T12:00:00.000Z`), intervalStartDate: `2026-08-2${id}`,
  intervalEndDate: `2026-08-2${id}`, includedInCalculations,
});

describe("activity signal presentation", () => {
  it("keeps providers separate, honors calculation exclusion, and orders the preferred source first", () => {
    const series = buildActivitySignalSeries([row(1, "manual", 1000), row(2, "manual", 1200, false), row(1, "health_connect", 1100)], { steps: ["health_connect", "manual"] });
    expect(series.map((item) => item.source)).toEqual(["health_connect", "manual"]);
    expect(series[0].preferred).toBe(true);
    expect(series[1]).toMatchObject({ recordedRecords: 2, includedRecords: 1, excludedRecords: 1 });
    expect(series[0].points[0].value).toBe(1100);
    expect(series[1].points[0].value).toBe(1000);
  });

  it("fails closed on unsupported metrics and units", () => {
    expect(buildActivitySignalSeries([{ ...row(1, "manual", 1), metricKey: "mystery" }], {})).toEqual([]);
    expect(buildActivitySignalSeries([{ ...row(1, "manual", 1), unit: "km" }], {})).toEqual([]);
  });

  it("wires the private owner-scoped API and explicit no-merge disclosure", () => {
    const routes = readFileSync(resolve(process.cwd(), "server/routes/health-fitness.ts"), "utf8");
    const client = readFileSync(resolve(process.cwd(), "client/src/components/health/ActivitySignals.tsx"), "utf8");
    expect(routes).toContain('app.get("/api/health-fitness/activity-signals", isAuthenticated');
    expect(routes).toContain("eq(healthObservations.userId, userId)");
    expect(routes).toContain("does not add different providers together");
    expect(client).toContain("kept separate by source");
    expect(client).toContain("device imports require an authorized native connector");
  });
});
