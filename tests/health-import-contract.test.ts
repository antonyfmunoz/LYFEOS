import { describe, expect, it } from "vitest";
import { healthImportRetryDelayMs, healthImportTransformVersion, healthSourceRecordKeyHash, prepareProviderHealthImport, providerImportDirection, selectCanonicalHealthRecord } from "../server/health-import";
import { canonicalHealthMetricRegistryVersion, healthImportFailureCode, healthImportFailureIsRetryable, HealthMetricMappingError, HealthProviderScopeError, normalizeCanonicalHealthMetric } from "../server/health-provider-metrics";

describe("provider health import contract", () => {
  const envelope = {
    sourceRecordId: "source-123", sourceMetricId: "StepsRecord.count", observedAt: "2026-08-22T10:00:00.000Z",
    intervalStartAt: "2026-08-22T09:45:00.000Z", intervalEndAt: "2026-08-22T10:00:00.000Z",
    metricKey: "steps", value: 4200, unit: "count", sourceVersion: "provider-v2",
    method: "device", deviceName: "Example wearable", sourceMetadata: { recordingMethod: "automatic", locale: "en-US" },
  } as const;

  it("creates a deterministic read-only, provenance-preserving import envelope", () => {
    const first = prepareProviderHealthImport("health_connect", envelope, new Date("2026-08-22T11:00:00.000Z"));
    const reordered = prepareProviderHealthImport("health_connect", { ...envelope, sourceMetadata: { locale: "en-US", recordingMethod: "automatic" } }, new Date("2026-08-22T11:00:00.000Z"));
    expect(providerImportDirection).toBe("read_only_import");
    expect(healthImportTransformVersion).toBe("health-import-v3");
    expect(canonicalHealthMetricRegistryVersion).toBe("health-canonical-metrics-v2");
    expect(first.sourceRecord.payloadFingerprint).toBe(reordered.sourceRecord.payloadFingerprint);
    expect(first.sourceRecord.sourcePayload).toMatchObject({ sourceRecordId: "source-123", sourceVersion: "provider-v2" });
    expect(first.sourceRecord.sourceMetadata).toMatchObject({ sourceMetricId: "StepsRecord.count", originalValue: 4200, originalUnit: "count", canonicalMetricRegistryVersion: canonicalHealthMetricRegistryVersion, providerSourceMapVersion: "health-connect-source-map-v2" });
    expect(first.observation).toMatchObject({ source: "health_connect", sourceRecordId: "source-123", category: "cardiovascular", metricKey: "steps", displayName: "Steps", value: 4200, unit: "count", methodVersion: "provider-v2" });
    expect(first.observation).toMatchObject({ temporalType: "interval", intervalStartAt: new Date("2026-08-22T09:45:00.000Z"), intervalEndAt: new Date("2026-08-22T10:00:00.000Z"), aggregationKind: "sum" });
    expect(first.requiredScope).toBe("activity");
  });

  it("normalizes only declared units while retaining a stable failure code", () => {
    expect(normalizeCanonicalHealthMetric("distance", 1.5, "km")).toMatchObject({ value: 1500, unit: "m" });
    expect(normalizeCanonicalHealthMetric("body_weight", 220.46226218, "lb").value).toBeCloseTo(100, 8);
    expect(() => normalizeCanonicalHealthMetric("steps", -1, "count")).toThrow(HealthMetricMappingError);
    try {
      normalizeCanonicalHealthMetric("steps", 1, "km");
    } catch (error) {
      expect(healthImportFailureCode(error)).toBe("IMPORT.UNIT_UNSUPPORTED");
      expect(healthImportFailureIsRetryable(error)).toBe(false);
    }
    expect(healthImportFailureCode(new Error("vendor payload included here"))).toBe("IMPORT.PAGE_FAILED");
    expect(healthImportFailureIsRetryable(new Error("transient provider outage"))).toBe(true);
    expect(healthImportFailureCode(new HealthProviderScopeError())).toBe("IMPORT.SCOPE_NOT_GRANTED");
    expect(healthImportFailureIsRetryable(new HealthProviderScopeError())).toBe(false);
    expect(healthImportFailureCode(new Error("vendor payload included here"), "raw vendor message")).toBe("IMPORT.PAGE_FAILED");
  });

  it("fails closed for an unmapped provider metric instead of guessing", () => {
    expect(() => prepareProviderHealthImport("health_connect", { ...envelope, metricKey: "provider_readiness_score" })).toThrowError(/not mapped/);
    try {
      prepareProviderHealthImport("health_connect", { ...envelope, sourceMetricId: "" });
    } catch (error) {
      expect(healthImportFailureCode(error)).toBe("IMPORT.ENVELOPE_INVALID");
      expect(healthImportFailureIsRetryable(error)).toBe(false);
    }
    expect(() => normalizeCanonicalHealthMetric("body_fat_percentage", 1.1, "fraction")).toThrowError(/mathematical bounds/);
  });

  it("changes the fingerprint when source truth changes", () => {
    const first = prepareProviderHealthImport("health_connect", envelope);
    const changed = prepareProviderHealthImport("health_connect", { ...envelope, value: 4201 });
    expect(first.sourceRecord.payloadFingerprint).not.toBe(changed.sourceRecord.payloadFingerprint);
  });

  it("requires a reviewed native identifier, matching canonical key, and reviewed adapter unit", () => {
    expect(() => prepareProviderHealthImport("health_connect", { ...envelope, sourceMetricId: "UnknownRecord.value" })).toThrowError(/not reviewed/);
    expect(() => prepareProviderHealthImport("health_connect", { ...envelope, sourceMetricId: "DistanceRecord.distance" })).toThrowError(/does not map/);
    expect(() => prepareProviderHealthImport("health_connect", { ...envelope, sourceMetricId: "DistanceRecord.distance", metricKey: "distance", unit: "km" })).toThrowError(/does not match/);
    expect(() => prepareProviderHealthImport("oura", envelope)).toThrowError(/no reviewed native source map/);
  });

  it("requires exact temporal semantics from the reviewed native map", () => {
    const { intervalStartAt: _start, intervalEndAt: _end, ...withoutInterval } = envelope;
    expect(() => prepareProviderHealthImport("health_connect", withoutInterval)).toThrowError(/requires a complete source interval/);
    expect(() => prepareProviderHealthImport("health_connect", { ...envelope, intervalStartAt: envelope.intervalEndAt })).toThrowError(/earlier than its end/);
    expect(() => prepareProviderHealthImport("health_connect", { ...envelope, observedAt: "2026-08-22T10:01:00.000Z" })).toThrowError(/must equal/);
    expect(() => prepareProviderHealthImport("health_connect", {
      ...withoutInterval, sourceMetricId: "RestingHeartRateRecord.beatsPerMinute", metricKey: "resting_heart_rate", value: 60, unit: "bpm",
    })).not.toThrow();
    expect(() => prepareProviderHealthImport("health_connect", {
      ...envelope, sourceMetricId: "RestingHeartRateRecord.beatsPerMinute", metricKey: "resting_heart_rate", value: 60, unit: "bpm",
    })).toThrowError(/cannot include an interval/);
  });

  it("creates a stable suppression key without retaining the provider record identifier", () => {
    const hash = healthSourceRecordKeyHash("oura", "sensitive-provider-record-id");
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain("sensitive-provider-record-id");
    expect(hash).not.toBe(healthSourceRecordKeyHash("whoop", "sensitive-provider-record-id"));
  });

  it("uses bounded exponential retry delays", () => {
    expect(healthImportRetryDelayMs(0)).toBe(0);
    expect(healthImportRetryDelayMs(1)).toBe(60_000);
    expect(healthImportRetryDelayMs(2)).toBe(120_000);
    expect(healthImportRetryDelayMs(20)).toBe(24 * 60 * 60 * 1000);
  });

  it("selects by explicit source priority while retaining conflicts", () => {
    const observedAt = new Date("2026-08-22T10:00:00.000Z");
    const result = selectCanonicalHealthRecord([
      { id: 1, source: "manual", value: 4000, unit: "count", observedAt, receivedAt: new Date("2026-08-22T12:00:00.000Z") },
      { id: 2, source: "health_connect", value: 4200, unit: "count", observedAt, receivedAt: new Date("2026-08-22T11:00:00.000Z") },
    ], ["health_connect", "manual"]);
    expect(result.canonical?.id).toBe(2);
    expect(result.alternatives.map((record) => record.id)).toEqual([1]);
    expect(result.hasConflict).toBe(true);
    expect(result.disclosure).toContain("never summed, averaged, overwritten, or deleted");
  });
});
