import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildHealthIntervalConflictGroups, type HealthIntervalConflictRecord } from "../server/health-interval-conflicts";

const root = path.resolve(import.meta.dirname, "..");
const record = (id: number, start: string, end: string, overrides: Partial<HealthIntervalConflictRecord> = {}): HealthIntervalConflictRecord => ({
  id, metricKey: "steps", displayName: "Steps", unit: "count", source: "health_connect", value: 100,
  temporalType: "interval", aggregationKind: "sum", intervalStartAt: start, intervalEndAt: end,
  method: null, methodVersion: "health-import-v3", deviceName: null, includedInCalculations: true, ...overrides,
});

describe("health observation calculation preferences", () => {
  it("groups connected additive overlaps without treating adjacent intervals or other sources as conflicts", () => {
    const groups = buildHealthIntervalConflictGroups([
      record(1, "2026-08-22T08:00:00.000Z", "2026-08-22T10:00:00.000Z"),
      record(2, "2026-08-22T09:00:00.000Z", "2026-08-22T11:00:00.000Z"),
      record(3, "2026-08-22T10:30:00.000Z", "2026-08-22T12:00:00.000Z"),
      record(4, "2026-08-22T12:00:00.000Z", "2026-08-22T13:00:00.000Z"),
      record(5, "2026-08-22T09:00:00.000Z", "2026-08-22T11:00:00.000Z", { source: "apple_health" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].records.map((item) => item.id)).toEqual([1, 2, 3]);
    expect(groups[0]).toMatchObject({ source: "health_connect", resolved: false });
  });

  it("marks an overlap resolved only when the included records no longer overlap", () => {
    const groups = buildHealthIntervalConflictGroups([
      record(1, "2026-08-22T08:00:00.000Z", "2026-08-22T10:00:00.000Z"),
      record(2, "2026-08-22T09:00:00.000Z", "2026-08-22T11:00:00.000Z", { includedInCalculations: false }),
    ]);
    expect(groups[0].resolved).toBe(true);
    expect(groups[0].records[1].includedInCalculations).toBe(false);
  });

  it("persists reversible owner preferences through migration, release, calculation, rights, and UI paths", () => {
    const migration = fs.readFileSync(path.join(root, "migrations/0068_health_observation_calculation_preferences.sql"), "utf8");
    const release = fs.readFileSync(path.join(root, "server/release-migrate.ts"), "utf8");
    const routes = fs.readFileSync(path.join(root, "server/routes/health-observations.ts"), "utf8");
    const insights = fs.readFileSync(path.join(root, "server/routes/health-insights.ts"), "utf8");
    const profile = fs.readFileSync(path.join(root, "server/routes/profile.ts"), "utf8");
    const ledger = fs.readFileSync(path.join(root, "client/src/components/health/HealthMetricsLedger.tsx"), "utf8");
    expect(migration).toContain('REFERENCES "health_observations"("id") ON DELETE cascade');
    expect(migration).toContain("health_observation_calculation_preferences_user_observation_unique_idx");
    expect(release).toContain('id: "0068_health_observation_calculation_preferences"');
    expect(routes).toContain('app.put("/api/health-observations/:id/calculation-inclusion", isAuthenticated');
    expect(routes).toContain("eq(healthObservations.userId, userId)");
    expect(routes).toContain("confirmed: z.literal(true)");
    expect(insights).toContain("row.includedInCalculations !== false");
    expect(insights).toContain('"health_observation_calculation_preferences"');
    expect(profile).toContain('"health_observation_calculation_preferences"');
    expect(ledger).toContain("The source fact will remain stored and visible");
  });
});
