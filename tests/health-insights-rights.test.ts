import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { aggregateDailyValues, aggregateObservationDailyValues, associationFromDailySeries, comparisonCsv, healthSeriesCoverage, rollingAverage } from "../server/health-insights";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("health trends, associations, and data rights", () => {
  it("aggregates repeated facts without turning missing days into zeros", () => {
    const points = aggregateDailyValues([
      { date: "2026-08-01", value: 200 }, { date: "2026-08-01", value: 300 },
      { date: "2026-08-03", value: 100 }, { date: "invalid", value: 5 },
    ], "sum");
    expect(points).toEqual([
      { date: "2026-08-01", value: 500, records: 2 },
      { date: "2026-08-03", value: 100, records: 1 },
    ]);
    expect(rollingAverage(points, 2)).toEqual([
      { ...points[0], rollingAverage: null },
      { ...points[1], rollingAverage: 300 },
    ]);
  });

  it("reports recorded, missing, and withheld coverage without inventing confidence", () => {
    const coverage = healthSeriesCoverage([
      { date: "2026-08-01", value: 1, records: 1 },
      { date: "2026-08-02", value: 2, records: 1 },
    ], ["2026-08-03"], 10);
    expect(coverage).toEqual({ requestedDays: 10, recordedDays: 2, missingDays: 7, withheldDays: 1, recordedCoverage: 0.2 });
    expect(() => healthSeriesCoverage([], [], 0)).toThrow("requestedDays must be a positive whole number");
  });

  it("honors latest observations and omits ambiguous additive interval totals", () => {
    const instant = (date: string, value: number, hour: number) => ({ date, value, observedAt: new Date(`${date}T${String(hour).padStart(2, "0")}:00:00.000Z`), temporalType: "instant", intervalStartAt: null, intervalEndAt: null, intervalStartDate: null, intervalEndDate: null });
    expect(aggregateObservationDailyValues([instant("2026-08-20", 70, 8), instant("2026-08-20", 71, 9)], "latest").points[0].value).toBe(71);
    const interval = (start: string, end: string, value: number) => ({ date: end.slice(0, 10), value, observedAt: new Date(end), temporalType: "interval", intervalStartAt: new Date(start), intervalEndAt: new Date(end), intervalStartDate: start.slice(0, 10), intervalEndDate: end.slice(0, 10) });
    const disjoint = aggregateObservationDailyValues([
      interval("2026-08-20T08:00:00.000Z", "2026-08-20T09:00:00.000Z", 100),
      interval("2026-08-20T09:00:00.000Z", "2026-08-20T10:00:00.000Z", 200),
    ], "sum");
    expect(disjoint.points[0]).toMatchObject({ value: 300, records: 2 });
    const overlapping = aggregateObservationDailyValues([
      interval("2026-08-20T08:00:00.000Z", "2026-08-20T10:00:00.000Z", 100),
      interval("2026-08-20T09:00:00.000Z", "2026-08-20T11:00:00.000Z", 200),
    ], "sum");
    expect(overlapping.points).toEqual([]);
    expect(overlapping.omittedAmbiguousDates).toEqual(["2026-08-20"]);
    expect(overlapping.disclosure).toContain("without guessing");
  });

  it("withholds an association until sample and selected-period coverage gates pass", () => {
    const sparse = Array.from({ length: 6 }, (_, index) => ({ date: `2026-08-${String(index + 1).padStart(2, "0")}`, value: index, records: 1 }));
    const insufficient = associationFromDailySeries(sparse, sparse, 30);
    expect(insufficient.status).toBe("insufficient");
    expect(insufficient.reasons).toContain("At least 7 aligned days are required.");
    const lowCoverage = associationFromDailySeries([...sparse, { date: "2026-08-07", value: 7, records: 1 }], [...sparse, { date: "2026-08-07", value: 7, records: 1 }], 90);
    expect(lowCoverage.status).toBe("insufficient");
    expect(lowCoverage.reasons?.some((reason) => reason.includes("coverage"))).toBe(true);
  });

  it("reports only a mathematical, non-causal association after sufficient alignment", () => {
    const left = Array.from({ length: 10 }, (_, index) => ({ date: `2026-08-${String(index + 1).padStart(2, "0")}`, value: index + 1, records: 1 }));
    const right = left.map((point) => ({ ...point, value: point.value * 2 }));
    const result = associationFromDailySeries(left, right, 30);
    expect(result.status).toBe("available");
    if (result.status === "available") {
      expect(result.coefficient).toBe(1);
      expect(result.disclosure).toContain("not proof");
      expect(result.pairedSamples).toBe(10);
      expect(result.uncertainty).toMatchObject({ method: "leave_one_day_out_sensitivity", recalculations: 10, unavailableRecalculations: 0 });
      expect(result.uncertainty.lower).toBeLessThanOrEqual(result.coefficient);
      expect(result.uncertainty.upper).toBeGreaterThanOrEqual(result.coefficient);
      expect(result.uncertainty.disclosure).toContain("not a confidence interval or probability statement");
    }
  });

  it("shows when one recorded day materially changes the association", () => {
    const left = Array.from({ length: 8 }, (_, index) => ({ date: `2026-08-${String(index + 1).padStart(2, "0")}`, value: index + 1, records: 1 }));
    const right = left.map((point, index) => ({ ...point, value: index === 7 ? -20 : point.value * 2 }));
    const result = associationFromDailySeries(left, right, 30);
    expect(result.status).toBe("available");
    if (result.status === "available") {
      expect(result.uncertainty.recalculations).toBe(8);
      expect(result.uncertainty.lower).toBeLessThanOrEqual(result.coefficient);
      expect(result.uncertainty.upper).toBeGreaterThanOrEqual(result.coefficient);
      expect(result.uncertainty.upper - result.uncertainty.lower).toBeGreaterThan(0.5);
    }
  });

  it("uses only the explicitly selected lag and reports the paired local dates", () => {
    const left = Array.from({ length: 8 }, (_, index) => ({ date: `2026-08-${String(index + 1).padStart(2, "0")}`, value: index + 1, records: 1 }));
    const right = Array.from({ length: 8 }, (_, index) => ({ date: `2026-08-${String(index + 2).padStart(2, "0")}`, value: (index + 1) * 3, records: 1 }));
    const result = associationFromDailySeries(left, right, 9, 1);
    expect(result.status).toBe("available");
    expect(result.aligned[0]).toMatchObject({ leftDate: "2026-08-01", rightDate: "2026-08-02", left: 1, right: 3 });
    expect(result.coverage).toBe(1);
    expect(result.diagnostics).toMatchObject({ requestedDays: 9, comparableDays: 8, leftRecordedDays: 8, rightRecordedDays: 8, pairedDays: 8, unpairedLeftRecordedDays: 0, unpairedRightRecordedDays: 0, missingValuesImputed: false });
    expect(() => associationFromDailySeries(left, right, 9, 31)).toThrow("lagDays must be a whole number");
  });

  it("reports unmatched recorded days without filling missing values", () => {
    const left = ["01", "02", "03"].map((day, index) => ({ date: `2026-08-${day}`, value: index + 1, records: 1 }));
    const right = ["02", "03", "04"].map((day, index) => ({ date: `2026-08-${day}`, value: index + 4, records: 1 }));
    const result = associationFromDailySeries(left, right, 10);
    expect(result.diagnostics).toMatchObject({ pairedDays: 2, unpairedLeftRecordedDays: 1, unpairedRightRecordedDays: 1, missingValuesImputed: false });
  });

  it("fails closed on duplicate local dates and non-finite values instead of inflating coverage", () => {
    const duplicated = [
      { date: "2026-08-01", value: 1, records: 1 },
      { date: "2026-08-01", value: 2, records: 1 },
    ];
    const duplicateResult = associationFromDailySeries(duplicated, duplicated, 7);
    expect(duplicateResult).toMatchObject({ status: "insufficient", pairedSamples: 0, coverage: 0 });
    expect(duplicateResult.reasons).toContain("Each selected series must contain at most one value for each local-calendar date.");
    const nonFiniteResult = associationFromDailySeries([{ date: "2026-08-01", value: Number.NaN, records: 1 }], [{ date: "2026-08-01", value: 1, records: 1 }], 7);
    expect(nonFiniteResult.reasons).toContain("Every selected daily value must be a finite number.");
  });

  it("keeps extreme finite magnitudes stable and preserves inverse direction", () => {
    const left = Array.from({ length: 8 }, (_, index) => ({ date: `2026-08-${String(index + 1).padStart(2, "0")}`, value: (index + 1) * 1e300, records: 1 }));
    const right = left.map((point, index) => ({ ...point, value: (8 - index) * 1e300 }));
    const result = associationFromDailySeries(left, right, 8);
    expect(result.status).toBe("available");
    if (result.status === "available") expect(result).toMatchObject({ coefficient: -1, direction: "inverse", coverage: 1 });
  });

  it("withholds constant series and rejects invalid requested periods", () => {
    const dates = Array.from({ length: 7 }, (_, index) => ({ date: `2026-08-${String(index + 1).padStart(2, "0")}`, value: 5, records: 1 }));
    const result = associationFromDailySeries(dates, dates.map((point, index) => ({ ...point, value: index })), 7);
    expect(result.status).toBe("insufficient");
    expect(result.reasons).toContain("At least one selected series has no variation in the aligned period.");
    expect(() => associationFromDailySeries([], [], 0)).toThrow("requestedDays must be a positive whole number");
  });

  it("exports explicit gaps and record counts in reconcilable CSV", () => {
    const csv = comparisonCsv({
      dates: ["2026-08-01", "2026-08-02"],
      left: { label: "Hydration", unit: "ml", points: [{ date: "2026-08-01", value: 500, records: 2 }] },
      right: { label: "Training", unit: "minutes", points: [{ date: "2026-08-02", value: 45, records: 1 }] },
    });
    expect(csv).toContain("Hydration (ml),Hydration records,Training (minutes),Training records");
    expect(csv).toContain("2026-08-01,500,2,,");
    expect(csv).toContain("2026-08-02,,,45,1");
  });

  it("offers every governed nutrition snapshot as an honest trend series and excludes future records", () => {
    const routes = source("server/routes/health-insights.ts");
    expect(routes).toContain('encodedNutritionSeries(key)');
    expect(routes).toContain('label: `Nutrition · ${nutrientDefinitions[key].label}`');
    expect(routes).toContain("immutable diary snapshots with the registry unit");
    expect(routes).toContain("Entries without this nutrient stay unknown and are not counted as zero");
    expect(routes).toContain("lt(nutritionDiaryEntries.occurredAt, end)");
    expect(routes).toContain("lte(bodyMeasurements.observedAt, endDate)");
    expect(routes).toContain("lt(healthObservations.observedAt, end)");
  });

  it("requires authentication, explicit analysis confirmation, and exact deletion confirmation", () => {
    const routes = source("server/routes/health-insights.ts");
    const workbench = source("client/src/components/health/HealthTrendWorkbench.tsx");
    const rights = source("client/src/components/health/HealthDataRights.tsx");
    expect(routes).toContain('app.get("/api/health-insights/trends", isAuthenticated');
    expect(routes).toContain('app.post("/api/health-insights/associations", isAuthenticated');
    expect(routes).toContain("confirmed: z.literal(true)");
    expect(routes).toContain("lagDays: z.number().int().min(-30).max(30)");
    expect(routes).toContain('adjustmentMethod: "none"');
    expect(routes).toContain("non-random missing data");
    expect(routes).toContain('confirmation: z.literal("DELETE MY HEALTH DATA")');
    expect(routes).toContain("eq(healthObservations.userId, userId)");
    expect(routes).toContain("Raw health records are not federated");
    expect(workbench).toContain("cannot establish cause");
    expect(workbench).toContain("does not search for a favorable lag");
    expect(workbench).toContain("Review data coverage and unadjusted factors");
    expect(workbench).toContain("Not enough aligned evidence");
    expect(workbench).toContain("View accessible trend data table");
    expect(workbench).toContain('aria-label="Trend evidence coverage"');
    expect(workbench).toContain("could not be combined without guessing");
    expect(routes).toContain("Observation sources stay separate");
    expect(workbench).toContain('caption className="sr-only"');
    expect(workbench).toContain('role="status"');
    expect(rights).toContain("Raw values, notes, biometrics, food, and lab records remain excluded from federation");
    expect(rights).toContain("Current data-retention behavior");
    expect(rights).toContain("not an approved legal retention policy");
    expect(routes).toContain('status: "implementation_behavior_not_approved_policy"');
    expect(routes).toContain("timedPurgeConfigured: false");
  });

  it("keeps rights receipts in migration, release, export, and account deletion paths", () => {
    const migration = source("migrations/0059_health_data_rights_audit.sql");
    const releaseRunner = source("server/release-migrate.ts");
    const profile = source("server/routes/profile.ts");
    const routes = source("server/routes/health-insights.ts");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "health_data_rights_audit"');
    expect(releaseRunner).toContain('id: "0059_health_data_rights_audit"');
    expect(profile).toContain('"health_data_rights_audit"');
    expect(routes).toContain('action: "exported"');
    expect(routes).toContain('action: "preferences_updated"');
    expect(routes).toContain('action: "health_data_deleted"');
    expect(routes).toContain('Content-Disposition');
  });
});
