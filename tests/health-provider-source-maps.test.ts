import { describe, expect, it } from "vitest";
import { healthProviderCatalog } from "../server/health-connections";
import { canonicalHealthMetricDefinition, normalizeCanonicalHealthMetric } from "../server/health-provider-metrics";
import { healthProviderSourceMap, reviewedHealthProviderSourceMaps, reviewedProviderCanonicalMetrics, validateProviderSourceMetric } from "../server/health-provider-source-maps";

describe("reviewed provider-native health source maps", () => {
  it("maps Apple Health and Health Connect identifiers into governed metrics and units", () => {
    for (const sourceMap of Object.values(reviewedHealthProviderSourceMaps)) {
      expect(sourceMap.entries.length).toBeGreaterThan(0);
      expect(sourceMap.documentationUrls.every((url) => url.startsWith("https://developer."))).toBe(true);
      const nativeIds = sourceMap.entries.map((entry) => entry.sourceMetricId);
      expect(new Set(nativeIds).size).toBe(nativeIds.length);
      for (const entry of sourceMap.entries) {
        expect(canonicalHealthMetricDefinition(entry.canonicalMetricKey)).not.toBeNull();
        expect(() => normalizeCanonicalHealthMetric(entry.canonicalMetricKey, 1, entry.adapterUnit)).not.toThrow();
        expect(validateProviderSourceMetric(sourceMap.provider, entry.sourceMetricId, entry.canonicalMetricKey, entry.adapterUnit).entry).toEqual(entry);
        expect(["instant", "interval"]).toContain(entry.temporalType);
      }
    }
  });

  it("keeps SDNN and RMSSD as distinct factual measurements", () => {
    expect(healthProviderSourceMap("apple_health")?.entries.find((entry) => entry.sourceMetricId.includes("Variability"))?.canonicalMetricKey).toBe("heart_rate_variability_sdnn");
    expect(healthProviderSourceMap("health_connect")?.entries.find((entry) => entry.sourceMetricId.includes("Variability"))?.canonicalMetricKey).toBe("heart_rate_variability_rmssd");
  });

  it("maps reviewed Apple and Android vitals without inventing a composite score", () => {
    const expected = ["respiratory_rate", "oxygen_saturation", "blood_pressure_systolic", "blood_pressure_diastolic", "blood_glucose"];
    for (const provider of ["apple_health", "health_connect"] as const) {
      const keys = healthProviderSourceMap(provider)?.entries.map((entry) => entry.canonicalMetricKey) || [];
      for (const key of expected) expect(keys).toContain(key);
      expect(keys).not.toContain("readiness_score");
    }
  });

  it("keeps each reviewed sleep stage as a separate interval metric", () => {
    const expected = ["sleep_awake_duration", "sleep_light_duration", "sleep_deep_duration", "sleep_rem_duration"];
    for (const provider of ["apple_health", "health_connect"] as const) {
      const stageKeys = healthProviderSourceMap(provider)?.entries.filter((entry) => entry.sourceMetricId.includes("Sleep") && entry.sourceMetricId.includes(".")).map((entry) => entry.canonicalMetricKey) || [];
      for (const key of expected) expect(stageKeys).toContain(key);
    }
  });

  it("exposes only reviewed source coverage and fails closed for direct vendors", () => {
    expect(reviewedProviderCanonicalMetrics("apple_health").length).toBe(19);
    expect(reviewedProviderCanonicalMetrics("health_connect").length).toBe(19);
    for (const provider of healthProviderCatalog.filter((item) => item.availability === "requires_vendor_approval")) {
      expect(healthProviderSourceMap(provider.id)).toBeNull();
      expect(reviewedProviderCanonicalMetrics(provider.id)).toEqual([]);
    }
  });
});
