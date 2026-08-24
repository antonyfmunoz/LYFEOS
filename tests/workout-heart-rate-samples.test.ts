import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { heartRateTimeInZones } from "../server/workout-analysis";

describe("workout heart-rate samples", () => {
  const zones = [{ name: "Easy", lowerBpm: 100, upperBpm: 129 }, { name: "Steady", lowerBpm: 130, upperBpm: 159 }];
  it("classifies only short observed gaps and leaves long gaps unknown", () => {
    const result = heartRateTimeInZones([
      { sampledAt: new Date("2026-08-23T10:00:00Z"), bpm: 120 },
      { sampledAt: new Date("2026-08-23T10:01:00Z"), bpm: 124 },
      { sampledAt: new Date("2026-08-23T10:02:00Z"), bpm: 150 },
      { sampledAt: new Date("2026-08-23T10:10:00Z"), bpm: 150 },
    ], zones);
    expect(result).toMatchObject({ secondsByZone: { Easy: 60, Steady: 60 }, classifiedSeconds: 120, longGapSeconds: 480, sampleCount: 4 });
  });

  it("does not double count unordered or duplicate timestamps", () => {
    const result = heartRateTimeInZones([
      { sampledAt: new Date("2026-08-23T10:01:00Z"), bpm: 120 },
      { sampledAt: new Date("2026-08-23T10:00:00Z"), bpm: 120 },
      { sampledAt: new Date("2026-08-23T10:01:00Z"), bpm: 130 },
    ], zones);
    expect(result.classifiedSeconds).toBe(60);
  });

  it("keeps owner scope, source constraints, release migration, and rights coverage", () => {
    const routes = readFileSync(resolve(process.cwd(), "server/routes/workouts.ts"), "utf8");
    expect(routes).toContain('app.post("/api/workouts/:id/heart-rate-samples", isAuthenticated');
    expect(routes).toContain("Every heart-rate sample must fall within the recorded workout interval");
    expect(routes).toContain("eq(workoutHeartRateSamples.userId, userId)");
    expect(readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8")).toContain('id: "0088_workout_heart_rate_samples"');
    expect(readFileSync(resolve(process.cwd(), "server/routes/health-insights.ts"), "utf8")).toContain('"workout_heart_rate_samples"');
  });
});
