import { describe, expect, it } from "vitest";
import { canonicalHealthMetricMigrationPolicy, canonicalHealthMetricRegistryVersion, healthMetricRegistryTransition } from "../server/health-provider-metrics";

describe("health metric registry migration governance", () => {
  it("permits only the declared successor for new imports without rewriting history", () => {
    expect(healthMetricRegistryTransition("health-canonical-metrics-v1", canonicalHealthMetricRegistryVersion)).toMatchObject({ allowed: true, action: "new_imports_only" });
    expect(healthMetricRegistryTransition(canonicalHealthMetricRegistryVersion, canonicalHealthMetricRegistryVersion)).toMatchObject({ allowed: true, action: "no_change" });
    expect(healthMetricRegistryTransition("unknown", canonicalHealthMetricRegistryVersion)).toMatchObject({ allowed: false, action: "review_required" });
  });

  it("requires a new release for semantic or conversion changes", () => {
    expect(canonicalHealthMetricMigrationPolicy.immutableHistory).toContain("never rewritten");
    expect(canonicalHealthMetricMigrationPolicy.semanticChange).toContain("requires a new registry release");
    expect(canonicalHealthMetricMigrationPolicy.unsupportedMetric).toContain("fails closed");
  });
});
