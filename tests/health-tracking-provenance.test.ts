import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { hydrationToMl, recoveryRoutineDueOnDate } from "../server/health-fitness";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("health tracking provenance", () => {
  it("converts explicit hydration units and preserves the captured conversion", () => {
    expect(hydrationToMl(500, "ml")).toEqual({ volumeMl: 500, inputQuantity: 500, inputUnit: "ml", inputMlPerUnit: 1 });
    expect(hydrationToMl(1.5, "l")).toEqual({ volumeMl: 1500, inputQuantity: 1.5, inputUnit: "l", inputMlPerUnit: 1000 });
    expect(hydrationToMl(8, "fl_oz")).toEqual({ volumeMl: 237, inputQuantity: 8, inputUnit: "fl_oz", inputMlPerUnit: 29.5735 });
    expect(hydrationToMl(2, "cup")).toEqual({ volumeMl: 473, inputQuantity: 2, inputUnit: "cup", inputMlPerUnit: 236.588 });
    expect(() => hydrationToMl(0, "ml")).toThrow("positive");
  });

  it("marks only scheduled routines as due and leaves as-needed routines optional", () => {
    expect(recoveryRoutineDueOnDate("daily", [], "2026-08-22")).toBe(true);
    expect(recoveryRoutineDueOnDate("specific_days", [1, 3, 6], "2026-08-22")).toBe(true);
    expect(recoveryRoutineDueOnDate("specific_days", [1, 3], "2026-08-22")).toBe(false);
    expect(recoveryRoutineDueOnDate("as_needed", [], "2026-08-22")).toBe(false);
    expect(recoveryRoutineDueOnDate("daily", [], "not-a-date")).toBe(false);
  });

  it("keeps recovery routines confirm-only, owner scoped, filterable, and separate from performed facts", () => {
    const routes = read("server/routes/recovery.ts");
    const client = read("client/src/components/health/RecoveryRoutines.tsx");
    expect(routes).toContain('app.get("/api/recovery-routines", isAuthenticated');
    expect(routes).toContain('app.post("/api/recovery-routines/:id/log", isAuthenticated');
    expect(routes).toContain("eq(recoveryRoutines.userId, req.session.userId!)");
    expect(routes).toContain("This routine is already logged for that date");
    expect(routes).toContain('source: "routine_confirmation"');
    expect(routes).toContain("no completion was inferred");
    expect(routes).toContain("activity.tags.includes(tag)");
    expect(client).toContain("nothing is recorded until you choose Log");
    expect(client).toContain('aria-label="Recovery routine weekdays"');
  });

  it("versions metric definitions and snapshots source provenance without interpreting values", () => {
    const migration = read("migrations/0058_health_tracking_provenance.sql");
    const releaseRunner = read("server/release-migrate.ts");
    const routes = read("server/routes/health-observations.ts");
    const client = read("client/src/components/health/HealthMetricsLedger.tsx");
    const profile = read("server/routes/profile.ts");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "health_metric_definitions"');
    expect(migration).toContain('"definition_version" text');
    expect(migration).toContain('"source_record_id" text');
    expect(migration).toContain("health_observations_user_source_record_unique_idx");
    expect(releaseRunner).toContain('id: "0058_health_tracking_provenance"');
    expect(routes).toContain('app.post("/api/health-metric-definitions", isAuthenticated');
    expect(routes).toContain("observationAggregationKind(values.metricKey, values.unit)");
    expect(routes).toContain("eq(healthMetricDefinitions.userId, req.session.userId!)");
    expect(routes).toContain("definitionVersion: definition?.version || null");
    expect(routes).toContain("That source record has already been imported");
    expect(routes).toContain("not a clinical interpretation");
    expect(client).toContain('aria-label="Measurement method version"');
    expect(client).toContain('aria-label="Source record identifier"');
    expect(profile).toContain('"health_metric_definitions"');
    expect(profile).toContain('"recovery_routines"');
  });

  it("preserves local calendar provenance when a plan becomes factual diary evidence", () => {
    const mealPlans = read("server/routes/meal-plans.ts");
    expect(mealPlans).toContain("zonedDateTime(entry.scheduledDate, baseTimeContext.timeZone, 12)");
    expect(mealPlans).toContain("recordedTimeZone: recordTimeContext.timeZone");
    expect(mealPlans).toContain("recordedUtcOffsetMinutes: recordTimeContext.utcOffsetMinutes");
    expect(mealPlans).toContain("Only an explicit Log meal action creates factual diary entries");
  });
});
