import { describe, expect, it } from "vitest";
import { prepareProviderHealthImport } from "../server/health-import";
import { reviewedHealthProviderSourceMaps } from "../server/health-provider-source-maps";
import { extractOuraDailyActivity, extractOuraDailyReadiness, extractOuraDailySpo2, extractOuraHeartRate, extractOuraSleep, extractOuraWorkout, ouraAdapterVersion } from "../server/oura-adapter";

const resolveDay = () => ({ start: "2026-08-20T07:00:00.000Z", end: "2026-08-21T07:00:00.000Z" });

describe("Oura OpenAPI 1.37 adapter", () => {
  it("extracts every reviewed factual field with stable per-metric identities", () => {
    const envelopes = [
      ...extractOuraDailyActivity({ id: "activity-1", day: "2026-08-20", timestamp: "2026-08-21T07:00:00Z", steps: 8500, active_calories: 480, equivalent_walking_distance: 6300, score: 90 }, resolveDay),
      ...extractOuraWorkout({ id: "workout-1", start_datetime: "2026-08-20T16:00:00Z", end_datetime: "2026-08-20T16:45:00Z", calories: 320, distance: 5100, activity: "running", source: "confirmed" }),
      ...extractOuraSleep({ id: "sleep-1", bedtime_start: "2026-08-20T05:00:00Z", bedtime_end: "2026-08-20T13:00:00Z", total_sleep_duration: 25800, awake_time: 900, light_sleep_duration: 13200, deep_sleep_duration: 5400, rem_sleep_duration: 7200, average_heart_rate: 57, average_breath: 14.2, average_hrv: 44 }),
      ...extractOuraHeartRate({ timestamp: "2026-08-20T17:00:00Z", bpm: 72, source: "awake" }),
      ...extractOuraDailySpo2({ id: "spo2-1", day: "2026-08-20", spo2_percentage: { average: 97.4 }, breathing_disturbance_index: 2 }, resolveDay),
      ...extractOuraDailyReadiness({ id: "readiness-1", day: "2026-08-20", timestamp: "2026-08-21T07:00:00Z", temperature_deviation: -0.2, score: 86 }, resolveDay),
    ];
    expect(envelopes.map((item) => item.sourceMetricId)).toEqual(reviewedHealthProviderSourceMaps.oura.entries.map((item) => item.sourceMetricId));
    expect(new Set(envelopes.map((item) => item.sourceRecordId)).size).toBe(envelopes.length);
    const prepared = envelopes.map((item) => prepareProviderHealthImport("oura", item));
    expect(prepared.every((item) => item.direction === "read_only_import")).toBe(true);
    expect(prepared.map((item) => item.requiredScope)).toContain("vitals");
    expect(prepared.find((item) => item.observation.metricKey === "workout_duration")?.observation.value).toBe(45);
    expect(prepared.find((item) => item.sourceRecord.sourceMetadata.sourceMetricId === "PublicDailyActivity.equivalent_walking_distance")?.sourceRecord.sourceMetadata.distanceMeaning).toBe("equivalent_walking_distance_not_route");
    expect(prepared.find((item) => item.sourceRecord.sourceMetadata.sourceMetricId === "PublicWorkout.distance")?.sourceRecord.sourceMetadata.routeRetained).toBe(false);
    expect(JSON.stringify(envelopes)).not.toContain("score");
    expect(JSON.stringify(envelopes)).not.toContain("average_hrv");
    expect(envelopes.every((item) => item.sourceVersion === ouraAdapterVersion)).toBe(true);
  });

  it("omits absent optional facts and rejects invalid source intervals", () => {
    expect(extractOuraDailySpo2({ id: "spo2-empty", day: "2026-08-20", spo2_percentage: null }, resolveDay)).toEqual([]);
    expect(extractOuraDailyReadiness({ id: "ready-empty", day: "2026-08-20", timestamp: "2026-08-21T07:00:00Z", temperature_deviation: null }, resolveDay)).toEqual([]);
    expect(() => extractOuraWorkout({ id: "bad", start_datetime: "2026-08-20T17:00:00Z", end_datetime: "2026-08-20T16:00:00Z" })).toThrow("positive duration");
    expect(() => extractOuraDailyActivity({ id: "bad-day", day: "2026-08-20", timestamp: "2026-08-21T07:00:00Z", steps: 1 }, () => ({ start: "not-a-date", end: "also-bad" }))).toThrow("ordered ISO timestamps");
  });
});
