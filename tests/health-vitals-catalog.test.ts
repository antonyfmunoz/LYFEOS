import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalHealthMetricDefinition, normalizeCanonicalHealthMetric } from "../server/health-provider-metrics";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("governed vitals catalog", () => {
  it("keeps common biometric facts separate with compatible conversions", () => {
    for (const key of ["respiratory_rate", "oxygen_saturation", "temperature_deviation", "blood_pressure_systolic", "blood_pressure_diastolic", "blood_glucose"]) {
      expect(canonicalHealthMetricDefinition(key)?.scope).toBe("vitals");
    }
    expect(normalizeCanonicalHealthMetric("oxygen_saturation", 0.97, "fraction").value).toBe(97);
    expect(normalizeCanonicalHealthMetric("temperature_deviation", 1.8, "degF_delta").value).toBeCloseTo(1, 8);
    expect(normalizeCanonicalHealthMetric("blood_glucose", 90.091, "mg/dL").value).toBeCloseTo(5, 3);
    expect(() => normalizeCanonicalHealthMetric("oxygen_saturation", 1.1, "fraction")).toThrow(/mathematical bounds/);
  });

  it("exposes definitions without reference ranges or connection claims", () => {
    const routes = source("server/routes/health-observations.ts");
    const client = source("client/src/components/health/HealthMetricsLedger.tsx");
    expect(routes).toContain('app.get("/api/health-metric-catalog"');
    expect(routes).toContain("does not provide reference ranges, diagnosis, treatment, or a provider connection");
    expect(client).toContain("Start from a governed metric definition");
    expect(client).toContain("applyCatalogMetric");
  });
});
