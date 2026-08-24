import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");

describe("health observation interval persistence", () => {
  it("adds constrained temporal and aggregation semantics to observations", () => {
    const migration = fs.readFileSync(path.join(root, "migrations/0067_health_observation_intervals.sql"), "utf8");
    const release = fs.readFileSync(path.join(root, "server/release-migrate.ts"), "utf8");
    const schema = fs.readFileSync(path.join(root, "shared/schema.ts"), "utf8");
    expect(release).toContain('id: "0067_health_observation_intervals"');
    for (const column of ["temporal_type", "interval_start_at", "interval_end_at", "aggregation_kind"]) {
      expect(migration).toContain(`"${column}"`);
    }
    expect(migration).toContain("health_observations_interval_shape_valid");
    expect(migration).toContain('"observed_at" = "interval_end_at"');
    expect(schema).toContain('temporalType: text("temporal_type")');
    expect(schema).toContain("health_observations_user_metric_interval_idx");
  });

  it("persists imported temporal semantics instead of leaving them only in the source payload", () => {
    const service = fs.readFileSync(path.join(root, "server/health-import-service.ts"), "utf8");
    expect(service).toContain("temporalType: prepared.observation.temporalType");
    expect(service).toContain("intervalStartAt: prepared.observation.intervalStartAt");
    expect(service).toContain("aggregationKind: prepared.observation.aggregationKind");
  });
});
