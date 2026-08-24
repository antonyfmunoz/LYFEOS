import { describe, expect, it } from "vitest";
import { healthProviderCatalog } from "../server/health-connections";
import { canonicalHealthMetricDefinition, canonicalHealthMetricRegistry, canonicalHealthMetricsForScopes, healthProviderScopes } from "../server/health-provider-metrics";

describe("canonical provider health metric registry", () => {
  it("has unique stable keys and exactly one identity conversion for every canonical unit", () => {
    const keys = canonicalHealthMetricRegistry.map((metric) => metric.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const metric of canonicalHealthMetricRegistry) {
      expect(metric.acceptedUnits.filter((unit) => unit.unit === metric.canonicalUnit && unit.multiplier === 1)).toHaveLength(1);
      expect(healthProviderScopes).toContain(metric.scope);
      expect(metric.valueMeaning.length).toBeGreaterThan(10);
      expect(canonicalHealthMetricDefinition(metric.key)).toEqual(metric);
    }
  });

  it("keeps every catalog scope inside the governed consent vocabulary", () => {
    for (const provider of healthProviderCatalog) {
      for (const scope of provider.scopes) expect(healthProviderScopes).toContain(scope);
    }
  });

  it("builds a least-scope human-readable data map", () => {
    const sleepOnly = canonicalHealthMetricsForScopes(["sleep"]);
    expect(sleepOnly.map((metric) => metric.key)).toEqual(["sleep_duration", "sleep_awake_duration", "sleep_light_duration", "sleep_deep_duration", "sleep_rem_duration"]);
    expect(sleepOnly[0]).toMatchObject({ canonicalUnit: "min", scope: "sleep" });
    expect(canonicalHealthMetricsForScopes(["unknown"])).toEqual([]);
  });

  it("does not import vendor readiness or recovery scores as factual health metrics", () => {
    const keys = canonicalHealthMetricRegistry.map((metric) => metric.key);
    expect(keys).not.toContain("readiness_score");
    expect(keys).not.toContain("recovery_score");
    expect(keys).not.toContain("health_score");
  });
});
