import type { HealthProviderId } from "./health-connections";
import { canonicalHealthMetricDefinition, HealthMetricMappingError, type CanonicalHealthMetricKey } from "./health-provider-metrics";

export const healthProviderSourceMapReviewDate = "2026-08-23";

export type HealthProviderSourceMapEntry = Readonly<{
  sourceMetricId: string;
  canonicalMetricKey: CanonicalHealthMetricKey;
  adapterUnit: string;
  temporalType: "instant" | "interval";
  extraction: string;
}>;

type HealthProviderSourceMap = Readonly<{
  provider: HealthProviderId;
  version: string;
  reviewedAt: string;
  documentationUrls: readonly string[];
  entries: readonly HealthProviderSourceMapEntry[];
}>;

/**
 * Reviewed native-source maps. These describe the adapter output contract, not
 * a claim that authorization or a native bridge exists in this repository.
 */
export const reviewedHealthProviderSourceMaps = {
  apple_health: {
    provider: "apple_health",
    version: "apple-health-source-map-v2",
    reviewedAt: healthProviderSourceMapReviewDate,
    documentationUrls: [
      "https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier",
      "https://developer.apple.com/documentation/healthkit/hkcategorytypeidentifier/sleepanalysis",
      "https://developer.apple.com/documentation/healthkit/hkworkout/duration",
    ],
    entries: [
      { sourceMetricId: "HKQuantityTypeIdentifierStepCount", canonicalMetricKey: "steps", adapterUnit: "count", temporalType: "interval", extraction: "cumulative quantity sample value" },
      { sourceMetricId: "HKQuantityTypeIdentifierActiveEnergyBurned", canonicalMetricKey: "active_energy", adapterUnit: "kcal", temporalType: "interval", extraction: "cumulative quantity sample converted to kilocalories" },
      { sourceMetricId: "HKQuantityTypeIdentifierDistanceWalkingRunning", canonicalMetricKey: "distance", adapterUnit: "m", temporalType: "interval", extraction: "cumulative quantity sample converted to meters" },
      { sourceMetricId: "HKWorkout.duration", canonicalMetricKey: "workout_duration", adapterUnit: "s", temporalType: "interval", extraction: "workout duration in seconds" },
      { sourceMetricId: "HKCategoryTypeIdentifierSleepAnalysis", canonicalMetricKey: "sleep_duration", adapterUnit: "s", temporalType: "interval", extraction: "deduplicated non-overlapping asleep intervals only" },
      { sourceMetricId: "HKCategoryTypeIdentifierSleepAnalysis.awake", canonicalMetricKey: "sleep_awake_duration", adapterUnit: "s", temporalType: "interval", extraction: "awake category interval duration" },
      { sourceMetricId: "HKCategoryTypeIdentifierSleepAnalysis.asleepCore", canonicalMetricKey: "sleep_light_duration", adapterUnit: "s", temporalType: "interval", extraction: "asleep-core category interval duration" },
      { sourceMetricId: "HKCategoryTypeIdentifierSleepAnalysis.asleepDeep", canonicalMetricKey: "sleep_deep_duration", adapterUnit: "s", temporalType: "interval", extraction: "asleep-deep category interval duration" },
      { sourceMetricId: "HKCategoryTypeIdentifierSleepAnalysis.asleepREM", canonicalMetricKey: "sleep_rem_duration", adapterUnit: "s", temporalType: "interval", extraction: "asleep-REM category interval duration" },
      { sourceMetricId: "HKQuantityTypeIdentifierHeartRate", canonicalMetricKey: "heart_rate", adapterUnit: "bpm", temporalType: "instant", extraction: "discrete quantity sample converted to count per minute" },
      { sourceMetricId: "HKQuantityTypeIdentifierRestingHeartRate", canonicalMetricKey: "resting_heart_rate", adapterUnit: "bpm", temporalType: "instant", extraction: "source-designated discrete resting-heart-rate sample" },
      { sourceMetricId: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN", canonicalMetricKey: "heart_rate_variability_sdnn", adapterUnit: "ms", temporalType: "instant", extraction: "discrete SDNN quantity sample converted to milliseconds" },
      { sourceMetricId: "HKQuantityTypeIdentifierBodyMass", canonicalMetricKey: "body_weight", adapterUnit: "kg", temporalType: "instant", extraction: "discrete quantity sample converted to kilograms" },
      { sourceMetricId: "HKQuantityTypeIdentifierBodyFatPercentage", canonicalMetricKey: "body_fat_percentage", adapterUnit: "%", temporalType: "instant", extraction: "discrete quantity sample converted to percent" },
      { sourceMetricId: "HKQuantityTypeIdentifierRespiratoryRate", canonicalMetricKey: "respiratory_rate", adapterUnit: "breaths/min", temporalType: "instant", extraction: "discrete quantity sample converted to breaths per minute" },
      { sourceMetricId: "HKQuantityTypeIdentifierOxygenSaturation", canonicalMetricKey: "oxygen_saturation", adapterUnit: "fraction", temporalType: "instant", extraction: "discrete quantity sample retained as a zero-to-one fraction" },
      { sourceMetricId: "HKQuantityTypeIdentifierBloodPressureSystolic", canonicalMetricKey: "blood_pressure_systolic", adapterUnit: "mmHg", temporalType: "instant", extraction: "systolic component of a blood-pressure correlation converted to millimeters of mercury" },
      { sourceMetricId: "HKQuantityTypeIdentifierBloodPressureDiastolic", canonicalMetricKey: "blood_pressure_diastolic", adapterUnit: "mmHg", temporalType: "instant", extraction: "diastolic component of a blood-pressure correlation converted to millimeters of mercury" },
      { sourceMetricId: "HKQuantityTypeIdentifierBloodGlucose", canonicalMetricKey: "blood_glucose", adapterUnit: "mmol/L", temporalType: "instant", extraction: "discrete quantity sample converted to millimoles per liter" },
    ],
  },
  health_connect: {
    provider: "health_connect",
    version: "health-connect-source-map-v2",
    reviewedAt: healthProviderSourceMapReviewDate,
    documentationUrls: [
      "https://developer.android.com/health-and-fitness/health-connect/data-types",
      "https://developer.android.com/reference/androidx/health/connect/client/records/Record",
      "https://developer.android.com/reference/kotlin/androidx/health/connect/client/records/ExerciseSessionRecord",
    ],
    entries: [
      { sourceMetricId: "StepsRecord.count", canonicalMetricKey: "steps", adapterUnit: "count", temporalType: "interval", extraction: "interval record count" },
      { sourceMetricId: "ActiveCaloriesBurnedRecord.energy", canonicalMetricKey: "active_energy", adapterUnit: "kcal", temporalType: "interval", extraction: "interval energy converted to kilocalories" },
      { sourceMetricId: "DistanceRecord.distance", canonicalMetricKey: "distance", adapterUnit: "m", temporalType: "interval", extraction: "interval distance converted to meters" },
      { sourceMetricId: "ExerciseSessionRecord.interval", canonicalMetricKey: "workout_duration", adapterUnit: "s", temporalType: "interval", extraction: "end time minus start time in seconds" },
      { sourceMetricId: "SleepSessionRecord.interval", canonicalMetricKey: "sleep_duration", adapterUnit: "s", temporalType: "interval", extraction: "deduplicated sleep-session interval in seconds" },
      { sourceMetricId: "SleepSessionRecord.Stage.AWAKE", canonicalMetricKey: "sleep_awake_duration", adapterUnit: "s", temporalType: "interval", extraction: "awake stage interval duration" },
      { sourceMetricId: "SleepSessionRecord.Stage.LIGHT", canonicalMetricKey: "sleep_light_duration", adapterUnit: "s", temporalType: "interval", extraction: "light stage interval duration" },
      { sourceMetricId: "SleepSessionRecord.Stage.DEEP", canonicalMetricKey: "sleep_deep_duration", adapterUnit: "s", temporalType: "interval", extraction: "deep stage interval duration" },
      { sourceMetricId: "SleepSessionRecord.Stage.REM", canonicalMetricKey: "sleep_rem_duration", adapterUnit: "s", temporalType: "interval", extraction: "REM stage interval duration" },
      { sourceMetricId: "HeartRateRecord.samples.beatsPerMinute", canonicalMetricKey: "heart_rate", adapterUnit: "bpm", temporalType: "instant", extraction: "one factual envelope per timestamped sample" },
      { sourceMetricId: "RestingHeartRateRecord.beatsPerMinute", canonicalMetricKey: "resting_heart_rate", adapterUnit: "bpm", temporalType: "instant", extraction: "instantaneous beats-per-minute value" },
      { sourceMetricId: "HeartRateVariabilityRmssdRecord.heartRateVariabilityMillis", canonicalMetricKey: "heart_rate_variability_rmssd", adapterUnit: "ms", temporalType: "instant", extraction: "instantaneous RMSSD value in milliseconds" },
      { sourceMetricId: "WeightRecord.weight", canonicalMetricKey: "body_weight", adapterUnit: "kg", temporalType: "instant", extraction: "mass converted to kilograms" },
      { sourceMetricId: "BodyFatRecord.percentage", canonicalMetricKey: "body_fat_percentage", adapterUnit: "%", temporalType: "instant", extraction: "instantaneous percentage value" },
      { sourceMetricId: "RespiratoryRateRecord.rate", canonicalMetricKey: "respiratory_rate", adapterUnit: "breaths/min", temporalType: "instant", extraction: "instantaneous breaths-per-minute value" },
      { sourceMetricId: "OxygenSaturationRecord.percentage", canonicalMetricKey: "oxygen_saturation", adapterUnit: "%", temporalType: "instant", extraction: "instantaneous percentage value" },
      { sourceMetricId: "BloodPressureRecord.systolic", canonicalMetricKey: "blood_pressure_systolic", adapterUnit: "mmHg", temporalType: "instant", extraction: "instantaneous systolic pressure converted to millimeters of mercury" },
      { sourceMetricId: "BloodPressureRecord.diastolic", canonicalMetricKey: "blood_pressure_diastolic", adapterUnit: "mmHg", temporalType: "instant", extraction: "instantaneous diastolic pressure converted to millimeters of mercury" },
      { sourceMetricId: "BloodGlucoseRecord.level", canonicalMetricKey: "blood_glucose", adapterUnit: "mmol/L", temporalType: "instant", extraction: "instantaneous blood-glucose level converted to millimoles per liter" },
    ],
  },
} as const satisfies Partial<Record<HealthProviderId, HealthProviderSourceMap>>;

export function healthProviderSourceMap(provider: HealthProviderId): HealthProviderSourceMap | null {
  return reviewedHealthProviderSourceMaps[provider as keyof typeof reviewedHealthProviderSourceMaps] || null;
}

export function reviewedProviderCanonicalMetrics(provider: HealthProviderId) {
  const sourceMap = healthProviderSourceMap(provider);
  if (!sourceMap) return [];
  const seen = new Set<string>();
  return sourceMap.entries.flatMap((entry) => {
    if (seen.has(entry.canonicalMetricKey)) return [];
    seen.add(entry.canonicalMetricKey);
    const definition = canonicalHealthMetricDefinition(entry.canonicalMetricKey);
    return definition ? [{
      key: definition.key,
      displayName: definition.displayName,
      scope: definition.scope,
      canonicalUnit: definition.canonicalUnit,
      valueMeaning: definition.valueMeaning,
    }] : [];
  });
}

export function validateProviderSourceMetric(provider: HealthProviderId, sourceMetricId: string, canonicalMetricKey: string, adapterUnit: string) {
  const sourceMap = healthProviderSourceMap(provider);
  if (!sourceMap) throw new HealthMetricMappingError("IMPORT.SOURCE_MAP_UNAVAILABLE", "This provider has no reviewed native source map.");
  const entry = sourceMap.entries.find((candidate) => candidate.sourceMetricId === sourceMetricId);
  if (!entry) throw new HealthMetricMappingError("IMPORT.SOURCE_METRIC_UNMAPPED", "The provider-native metric identifier is not reviewed for import.");
  if (entry.canonicalMetricKey !== canonicalMetricKey) throw new HealthMetricMappingError("IMPORT.SOURCE_METRIC_MISMATCH", "The provider-native metric identifier does not map to the requested canonical metric.");
  if (entry.adapterUnit !== adapterUnit) throw new HealthMetricMappingError("IMPORT.SOURCE_UNIT_MISMATCH", "The provider adapter unit does not match its reviewed source map.");
  return { sourceMap, entry };
}

export function validateProviderTemporalSemantics(entry: HealthProviderSourceMapEntry, observedAt: Date, intervalStartAt?: Date, intervalEndAt?: Date) {
  if (entry.temporalType === "instant") {
    if (intervalStartAt || intervalEndAt) throw new HealthMetricMappingError("IMPORT.INTERVAL_UNEXPECTED", "An instantaneous provider metric cannot include an interval.");
    return { temporalType: "instant" as const, observedAt, intervalStartAt: null, intervalEndAt: null };
  }
  if (!intervalStartAt || !intervalEndAt) throw new HealthMetricMappingError("IMPORT.INTERVAL_REQUIRED", "This provider metric requires a complete source interval.");
  if (intervalStartAt >= intervalEndAt) throw new HealthMetricMappingError("IMPORT.INTERVAL_INVALID", "The provider interval start must be earlier than its end.");
  if (observedAt.getTime() !== intervalEndAt.getTime()) throw new HealthMetricMappingError("IMPORT.OBSERVED_TIME_MISMATCH", "An interval observation time must equal the source interval end.");
  return { temporalType: "interval" as const, observedAt: intervalEndAt, intervalStartAt, intervalEndAt };
}
