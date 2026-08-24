import { describe, expect, it } from "vitest";
import { buildHealthSourceComparisons } from "../server/health-source-comparison";
import fs from "node:fs";
import path from "node:path";

const at = new Date("2026-08-22T10:00:00.000Z");
const record = (id: number, source: string, value: number, observedAt = at) => ({
  id, metricKey: "steps", displayName: "Steps", source, value, unit: "count", observedAt,
  temporalType: "instant", intervalStartAt: null, intervalEndAt: null,
  receivedAt: new Date(`2026-08-22T1${id}:00:00.000Z`), method: "device", methodVersion: "v1", deviceName: source,
});

describe("health source comparison", () => {
  it("compares only exact metric, unit, and timestamp overlaps", () => {
    const comparisons = buildHealthSourceComparisons([
      record(1, "manual", 4000), record(2, "health_connect", 4200),
      record(3, "oura", 4100, new Date("2026-08-22T10:01:00.000Z")),
    ], { steps: ["health_connect", "manual"] });
    expect(comparisons).toHaveLength(1);
    expect(comparisons[0].displayRecord.id).toBe(2);
    expect(comparisons[0].alternatives.map((item) => item.id)).toEqual([1]);
    expect(comparisons[0].hasConflict).toBe(true);
    expect(comparisons[0].disclosure).toContain("not averaged, merged, overwritten, or deleted");
  });

  it("does not label same-source duplicates as a source comparison", () => {
    expect(buildHealthSourceComparisons([record(1, "manual", 4000), record(2, "manual", 4200)], {})).toEqual([]);
  });

  it("does not compare interval records unless both boundaries match", () => {
    const left = { ...record(1, "manual", 100), temporalType: "interval", intervalStartAt: new Date("2026-08-22T09:00:00.000Z"), intervalEndAt: at };
    const differentStart = { ...record(2, "health_connect", 100), temporalType: "interval", intervalStartAt: new Date("2026-08-22T09:30:00.000Z"), intervalEndAt: at };
    expect(buildHealthSourceComparisons([left, differentStart], {})).toEqual([]);
    const [comparison] = buildHealthSourceComparisons([left, { ...differentStart, intervalStartAt: left.intervalStartAt }], {});
    expect(comparison.disclosure).toContain("exact same metric key, unit, temporal type, interval");
  });

  it("reports agreement without claiming equivalence", () => {
    const [comparison] = buildHealthSourceComparisons([record(1, "manual", 4200), record(2, "health_connect", 4200)], {});
    expect(comparison.hasConflict).toBe(false);
    expect(comparison.alternatives).toHaveLength(1);
  });

  it("renders comparisons without allowing provider facts to be edited as manual data", () => {
    const client = fs.readFileSync(path.resolve(import.meta.dirname, "../client/src/components/health/HealthMetricsLedger.tsx"), "utf8");
    expect(client).toContain("Compare overlapping sources");
    expect(client).toContain("Records from different times remain separate");
    expect(client).toContain("{!providerState ? <Button");
    expect(client).toContain("prevent re-import");
  });
});
