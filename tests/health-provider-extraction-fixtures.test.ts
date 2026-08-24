import { describe, expect, it } from "vitest";
import { prepareProviderHealthImport } from "../server/health-import";
import { reviewedHealthProviderSourceMaps } from "../server/health-provider-source-maps";

type Provider = "apple_health" | "health_connect";
type Fixture = readonly [sourceMetricId: string, metricKey: string, value: number, unit: string, temporalType: "instant" | "interval", expectedValue: number];

const appleFixtures: readonly Fixture[] = [
  ["HKQuantityTypeIdentifierStepCount", "steps", 1200, "count", "interval", 1200],
  ["HKQuantityTypeIdentifierActiveEnergyBurned", "active_energy", 250, "kcal", "interval", 250],
  ["HKQuantityTypeIdentifierDistanceWalkingRunning", "distance", 3200, "m", "interval", 3200],
  ["HKWorkout.duration", "workout_duration", 3600, "s", "interval", 60],
  ["HKCategoryTypeIdentifierSleepAnalysis", "sleep_duration", 25200, "s", "interval", 420],
  ["HKCategoryTypeIdentifierSleepAnalysis.awake", "sleep_awake_duration", 900, "s", "interval", 15],
  ["HKCategoryTypeIdentifierSleepAnalysis.asleepCore", "sleep_light_duration", 12600, "s", "interval", 210],
  ["HKCategoryTypeIdentifierSleepAnalysis.asleepDeep", "sleep_deep_duration", 4500, "s", "interval", 75],
  ["HKCategoryTypeIdentifierSleepAnalysis.asleepREM", "sleep_rem_duration", 5400, "s", "interval", 90],
  ["HKQuantityTypeIdentifierHeartRate", "heart_rate", 72, "bpm", "instant", 72],
  ["HKQuantityTypeIdentifierRestingHeartRate", "resting_heart_rate", 58, "bpm", "instant", 58],
  ["HKQuantityTypeIdentifierHeartRateVariabilitySDNN", "heart_rate_variability_sdnn", 42, "ms", "instant", 42],
  ["HKQuantityTypeIdentifierBodyMass", "body_weight", 82.5, "kg", "instant", 82.5],
  ["HKQuantityTypeIdentifierBodyFatPercentage", "body_fat_percentage", 18.2, "%", "instant", 18.2],
  ["HKQuantityTypeIdentifierRespiratoryRate", "respiratory_rate", 14, "breaths/min", "instant", 14],
  ["HKQuantityTypeIdentifierOxygenSaturation", "oxygen_saturation", 0.98, "fraction", "instant", 98],
  ["HKQuantityTypeIdentifierBloodPressureSystolic", "blood_pressure_systolic", 118, "mmHg", "instant", 118],
  ["HKQuantityTypeIdentifierBloodPressureDiastolic", "blood_pressure_diastolic", 76, "mmHg", "instant", 76],
  ["HKQuantityTypeIdentifierBloodGlucose", "blood_glucose", 5.4, "mmol/L", "instant", 5.4],
] as const;

const healthConnectFixtures: readonly Fixture[] = [
  ["StepsRecord.count", "steps", 1350, "count", "interval", 1350],
  ["ActiveCaloriesBurnedRecord.energy", "active_energy", 275, "kcal", "interval", 275],
  ["DistanceRecord.distance", "distance", 4100, "m", "interval", 4100],
  ["ExerciseSessionRecord.interval", "workout_duration", 2700, "s", "interval", 45],
  ["SleepSessionRecord.interval", "sleep_duration", 27000, "s", "interval", 450],
  ["SleepSessionRecord.Stage.AWAKE", "sleep_awake_duration", 1200, "s", "interval", 20],
  ["SleepSessionRecord.Stage.LIGHT", "sleep_light_duration", 13800, "s", "interval", 230],
  ["SleepSessionRecord.Stage.DEEP", "sleep_deep_duration", 4800, "s", "interval", 80],
  ["SleepSessionRecord.Stage.REM", "sleep_rem_duration", 6000, "s", "interval", 100],
  ["HeartRateRecord.samples.beatsPerMinute", "heart_rate", 74, "bpm", "instant", 74],
  ["RestingHeartRateRecord.beatsPerMinute", "resting_heart_rate", 60, "bpm", "instant", 60],
  ["HeartRateVariabilityRmssdRecord.heartRateVariabilityMillis", "heart_rate_variability_rmssd", 38, "ms", "instant", 38],
  ["WeightRecord.weight", "body_weight", 81.8, "kg", "instant", 81.8],
  ["BodyFatRecord.percentage", "body_fat_percentage", 17.9, "%", "instant", 17.9],
  ["RespiratoryRateRecord.rate", "respiratory_rate", 15, "breaths/min", "instant", 15],
  ["OxygenSaturationRecord.percentage", "oxygen_saturation", 97, "%", "instant", 97],
  ["BloodPressureRecord.systolic", "blood_pressure_systolic", 121, "mmHg", "instant", 121],
  ["BloodPressureRecord.diastolic", "blood_pressure_diastolic", 79, "mmHg", "instant", 79],
  ["BloodGlucoseRecord.level", "blood_glucose", 5.7, "mmol/L", "instant", 5.7],
] as const;

function envelope(provider: Provider, fixture: Fixture, index: number) {
  const [sourceMetricId, metricKey, value, unit, temporalType] = fixture;
  const intervalStartAt = "2026-08-22T08:00:00.000Z";
  const intervalEndAt = "2026-08-22T09:00:00.000Z";
  return {
    sourceRecordId: `${provider}-fixture-${index}`,
    sourceMetricId, metricKey, value, unit,
    observedAt: temporalType === "interval" ? intervalEndAt : "2026-08-22T09:30:00.000Z",
    ...(temporalType === "interval" ? { intervalStartAt, intervalEndAt } : {}),
    method: "fixture extraction", deviceName: "Fixture device", sourceVersion: "native-fixture-v1",
    sourceMetadata: { fixture: true },
  };
}

describe("reviewed native provider extraction fixtures", () => {
  for (const [provider, fixtures] of [["apple_health", appleFixtures], ["health_connect", healthConnectFixtures]] as const) {
    it(`covers and normalizes every ${provider} source-map field`, () => {
      expect(fixtures.map(([id]) => id)).toEqual(reviewedHealthProviderSourceMaps[provider].entries.map((entry) => entry.sourceMetricId));
      fixtures.forEach((fixture, index) => {
        const prepared = prepareProviderHealthImport(provider, envelope(provider, fixture, index), new Date("2026-08-22T10:00:00.000Z"));
        expect(prepared.observation).toMatchObject({ metricKey: fixture[1], value: fixture[5], temporalType: fixture[4], source: provider });
        expect(prepared.sourceRecord.sourceMetadata).toMatchObject({ sourceMetricId: fixture[0], originalValue: fixture[2], originalUnit: fixture[3], providerSourceMapVersion: reviewedHealthProviderSourceMaps[provider].version });
        expect(prepared.direction).toBe("read_only_import");
        if (fixture[4] === "interval") expect(prepared.observation.observedAt.toISOString()).toBe("2026-08-22T09:00:00.000Z");
      });
    });
  }

  it("fails closed when an extraction changes a reviewed unit or interval contract", () => {
    const valid = envelope("apple_health", appleFixtures[0], 0);
    expect(() => prepareProviderHealthImport("apple_health", { ...valid, unit: "steps" })).toThrow("not accepted for this canonical metric");
    expect(() => prepareProviderHealthImport("apple_health", { ...valid, intervalEndAt: undefined })).toThrow("complete source interval");
  });
});
