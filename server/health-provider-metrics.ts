import { ZodError } from "zod";

export const canonicalHealthMetricRegistryVersion = "health-canonical-metrics-v2";

export const canonicalHealthMetricRegistryReleases = [
  { version: "health-canonical-metrics-v1", status: "retired", successor: "health-canonical-metrics-v2", note: "Historical source records retain v1 provenance; no stored value is rewritten by retirement." },
  { version: canonicalHealthMetricRegistryVersion, status: "current", successor: null, note: "New normalized imports must use the current reviewed provider map and registry version." },
] as const;

export const canonicalHealthMetricMigrationPolicy = {
  id: "health-metric-registry-migration-v1",
  immutableHistory: "Existing source envelopes, normalized observations, units, values, timestamps, and mapping versions are never rewritten by a registry release.",
  displayOnlyChange: "A label or explanatory copy may change in a new release only when key, canonical unit, aggregation, value meaning, bounds, and accepted conversion math remain identical.",
  semanticChange: "Any change to key, canonical unit, aggregation, value meaning, mathematical bounds, or conversion math requires a new registry release and reviewed adapter map; incompatible facts remain on their original version until an explicit, auditable migration exists.",
  unsupportedMetric: "An unsupported or retired mapping fails closed for new imports and remains available as historical raw/source-attributed data.",
} as const;

export function healthMetricRegistryTransition(fromVersion: string, toVersion: string) {
  const from = canonicalHealthMetricRegistryReleases.find((release) => release.version === fromVersion);
  const to = canonicalHealthMetricRegistryReleases.find((release) => release.version === toVersion);
  if (!from || !to) return { allowed: false, action: "review_required", reason: "Both registry releases must be governed before a transition can be evaluated." } as const;
  if (from.version === to.version) return { allowed: true, action: "no_change", reason: "The source and target registry versions are identical." } as const;
  if (from.successor !== to.version) return { allowed: false, action: "review_required", reason: "Only an explicitly declared successor can receive new mapped imports; historical rows remain unchanged." } as const;
  return { allowed: true, action: "new_imports_only", reason: "Adapters may emit the successor version after review. Historical rows retain their original values and version." } as const;
}

export const healthProviderScopes = ["activity", "workouts", "sleep", "heart_rate", "body_measurements", "vitals"] as const;
export type HealthProviderScope = typeof healthProviderScopes[number];

type HealthMetricCategory = "strength" | "endurance" | "cardiovascular" | "flexibility" | "mobility" | "recovery" | "body_composition" | "lab" | "other";
type HealthRecordType = "activity" | "workout" | "sleep" | "heart_rate" | "body_measurement" | "metric";

type UnitConversion = Readonly<{
  unit: string;
  multiplier: number;
  offset?: number;
}>;

export type CanonicalHealthMetricDefinition = Readonly<{
  key: string;
  displayName: string;
  category: HealthMetricCategory;
  recordType: HealthRecordType;
  scope: HealthProviderScope;
  canonicalUnit: string;
  aggregation: "sum" | "average" | "latest";
  valueMeaning: string;
  nonNegative: boolean;
  maximum?: number;
  acceptedUnits: readonly UnitConversion[];
}>;

const identity = (unit: string): UnitConversion => ({ unit, multiplier: 1 });

/**
 * Product-owned canonical metric vocabulary. Provider adapters map their native
 * identifiers to one of these keys, but cannot invent categories, labels, units,
 * aggregation behavior, or consent scopes at ingestion time.
 */
export const canonicalHealthMetricRegistry = [
  {
    key: "steps", displayName: "Steps", category: "cardiovascular", recordType: "activity", scope: "activity",
    canonicalUnit: "count", aggregation: "sum", valueMeaning: "Recorded step count for the source interval", nonNegative: true,
    acceptedUnits: [identity("count")],
  },
  {
    key: "active_energy", displayName: "Active energy", category: "cardiovascular", recordType: "activity", scope: "activity",
    canonicalUnit: "kcal", aggregation: "sum", valueMeaning: "Recorded active energy for the source interval", nonNegative: true,
    acceptedUnits: [identity("kcal"), { unit: "kJ", multiplier: 1 / 4.184 }],
  },
  {
    key: "distance", displayName: "Distance", category: "endurance", recordType: "activity", scope: "activity",
    canonicalUnit: "m", aggregation: "sum", valueMeaning: "Recorded distance for the source interval", nonNegative: true,
    acceptedUnits: [identity("m"), { unit: "km", multiplier: 1_000 }, { unit: "mi", multiplier: 1_609.344 }],
  },
  {
    key: "workout_duration", displayName: "Workout duration", category: "endurance", recordType: "workout", scope: "workouts",
    canonicalUnit: "min", aggregation: "sum", valueMeaning: "Recorded elapsed workout duration", nonNegative: true,
    acceptedUnits: [identity("min"), { unit: "s", multiplier: 1 / 60 }, { unit: "h", multiplier: 60 }],
  },
  {
    key: "sleep_duration", displayName: "Sleep duration", category: "recovery", recordType: "sleep", scope: "sleep",
    canonicalUnit: "min", aggregation: "sum", valueMeaning: "Recorded sleep duration for the source interval", nonNegative: true,
    acceptedUnits: [identity("min"), { unit: "s", multiplier: 1 / 60 }, { unit: "h", multiplier: 60 }],
  },
  {
    key: "sleep_awake_duration", displayName: "Sleep session awake duration", category: "recovery", recordType: "sleep", scope: "sleep",
    canonicalUnit: "min", aggregation: "sum", valueMeaning: "Recorded awake-stage duration within a named sleep source interval", nonNegative: true,
    acceptedUnits: [identity("min"), { unit: "s", multiplier: 1 / 60 }],
  },
  {
    key: "sleep_light_duration", displayName: "Light sleep duration", category: "recovery", recordType: "sleep", scope: "sleep",
    canonicalUnit: "min", aggregation: "sum", valueMeaning: "Recorded light-or-core sleep-stage duration from the named source", nonNegative: true,
    acceptedUnits: [identity("min"), { unit: "s", multiplier: 1 / 60 }],
  },
  {
    key: "sleep_deep_duration", displayName: "Deep sleep duration", category: "recovery", recordType: "sleep", scope: "sleep",
    canonicalUnit: "min", aggregation: "sum", valueMeaning: "Recorded deep sleep-stage duration from the named source", nonNegative: true,
    acceptedUnits: [identity("min"), { unit: "s", multiplier: 1 / 60 }],
  },
  {
    key: "sleep_rem_duration", displayName: "REM sleep duration", category: "recovery", recordType: "sleep", scope: "sleep",
    canonicalUnit: "min", aggregation: "sum", valueMeaning: "Recorded REM sleep-stage duration from the named source", nonNegative: true,
    acceptedUnits: [identity("min"), { unit: "s", multiplier: 1 / 60 }],
  },
  {
    key: "heart_rate", displayName: "Heart rate", category: "cardiovascular", recordType: "heart_rate", scope: "heart_rate",
    canonicalUnit: "bpm", aggregation: "average", valueMeaning: "Recorded heart-rate sample or source aggregate", nonNegative: true,
    acceptedUnits: [identity("bpm")],
  },
  {
    key: "resting_heart_rate", displayName: "Resting heart rate", category: "cardiovascular", recordType: "heart_rate", scope: "heart_rate",
    canonicalUnit: "bpm", aggregation: "latest", valueMeaning: "Source-designated resting heart-rate observation", nonNegative: true,
    acceptedUnits: [identity("bpm")],
  },
  {
    key: "heart_rate_variability_sdnn", displayName: "Heart-rate variability (SDNN)", category: "recovery", recordType: "heart_rate", scope: "heart_rate",
    canonicalUnit: "ms", aggregation: "latest", valueMeaning: "Recorded SDNN heart-rate variability without readiness interpretation", nonNegative: true,
    acceptedUnits: [identity("ms"), { unit: "s", multiplier: 1_000 }],
  },
  {
    key: "heart_rate_variability_rmssd", displayName: "Heart-rate variability (RMSSD)", category: "recovery", recordType: "heart_rate", scope: "heart_rate",
    canonicalUnit: "ms", aggregation: "latest", valueMeaning: "Recorded RMSSD heart-rate variability without readiness interpretation", nonNegative: true,
    acceptedUnits: [identity("ms"), { unit: "s", multiplier: 1_000 }],
  },
  {
    key: "body_weight", displayName: "Body weight", category: "body_composition", recordType: "body_measurement", scope: "body_measurements",
    canonicalUnit: "kg", aggregation: "latest", valueMeaning: "Recorded body-weight observation", nonNegative: true,
    acceptedUnits: [identity("kg"), { unit: "lb", multiplier: 0.45359237 }],
  },
  {
    key: "body_fat_percentage", displayName: "Body fat percentage", category: "body_composition", recordType: "body_measurement", scope: "body_measurements",
    canonicalUnit: "%", aggregation: "latest", valueMeaning: "Recorded body-fat percentage from the named source and method", nonNegative: true,
    maximum: 100,
    acceptedUnits: [identity("%"), { unit: "fraction", multiplier: 100 }],
  },
  {
    key: "respiratory_rate", displayName: "Respiratory rate", category: "cardiovascular", recordType: "metric", scope: "vitals",
    canonicalUnit: "breaths/min", aggregation: "average", valueMeaning: "Recorded respiratory-rate sample or source aggregate", nonNegative: true, maximum: 200,
    acceptedUnits: [identity("breaths/min")],
  },
  {
    key: "oxygen_saturation", displayName: "Oxygen saturation", category: "cardiovascular", recordType: "metric", scope: "vitals",
    canonicalUnit: "%", aggregation: "latest", valueMeaning: "Recorded peripheral oxygen-saturation value from the named source", nonNegative: true, maximum: 100,
    acceptedUnits: [identity("%"), { unit: "fraction", multiplier: 100 }],
  },
  {
    key: "temperature_deviation", displayName: "Temperature deviation", category: "recovery", recordType: "metric", scope: "vitals",
    canonicalUnit: "degC", aggregation: "latest", valueMeaning: "Recorded temperature difference from the source-defined baseline without interpretation", nonNegative: false,
    acceptedUnits: [identity("degC"), { unit: "degF_delta", multiplier: 5 / 9 }],
  },
  {
    key: "blood_pressure_systolic", displayName: "Blood pressure, systolic", category: "cardiovascular", recordType: "metric", scope: "vitals",
    canonicalUnit: "mmHg", aggregation: "latest", valueMeaning: "Recorded systolic blood-pressure value from the named source and method", nonNegative: true, maximum: 400,
    acceptedUnits: [identity("mmHg")],
  },
  {
    key: "blood_pressure_diastolic", displayName: "Blood pressure, diastolic", category: "cardiovascular", recordType: "metric", scope: "vitals",
    canonicalUnit: "mmHg", aggregation: "latest", valueMeaning: "Recorded diastolic blood-pressure value from the named source and method", nonNegative: true, maximum: 300,
    acceptedUnits: [identity("mmHg")],
  },
  {
    key: "blood_glucose", displayName: "Blood glucose", category: "lab", recordType: "metric", scope: "vitals",
    canonicalUnit: "mmol/L", aggregation: "latest", valueMeaning: "Recorded blood-glucose value from the named source, specimen, and method", nonNegative: true,
    acceptedUnits: [identity("mmol/L"), { unit: "mg/dL", multiplier: 1 / 18.0182 }],
  },
] as const satisfies readonly CanonicalHealthMetricDefinition[];

export type CanonicalHealthMetricKey = typeof canonicalHealthMetricRegistry[number]["key"];

const registryByKey = new Map<string, CanonicalHealthMetricDefinition>(canonicalHealthMetricRegistry.map((definition) => [definition.key, definition]));

export class HealthMetricMappingError extends Error {
  constructor(public readonly code: "IMPORT.METRIC_UNMAPPED" | "IMPORT.UNIT_UNSUPPORTED" | "IMPORT.VALUE_OUT_OF_RANGE" | "IMPORT.SOURCE_MAP_UNAVAILABLE" | "IMPORT.SOURCE_METRIC_UNMAPPED" | "IMPORT.SOURCE_METRIC_MISMATCH" | "IMPORT.SOURCE_UNIT_MISMATCH" | "IMPORT.INTERVAL_REQUIRED" | "IMPORT.INTERVAL_UNEXPECTED" | "IMPORT.INTERVAL_INVALID" | "IMPORT.OBSERVED_TIME_MISMATCH", message: string) {
    super(message);
    this.name = "HealthMetricMappingError";
  }
}

export function canonicalHealthMetricDefinition(metricKey: string): CanonicalHealthMetricDefinition | null {
  return registryByKey.get(metricKey) || null;
}

export function canonicalHealthMetricsForScopes(scopes: readonly string[]) {
  const allowed = new Set(scopes);
  return canonicalHealthMetricRegistry.filter((metric) => allowed.has(metric.scope)).map((metric) => ({
    key: metric.key,
    displayName: metric.displayName,
    scope: metric.scope,
    canonicalUnit: metric.canonicalUnit,
    valueMeaning: metric.valueMeaning,
  }));
}

export function normalizeCanonicalHealthMetric(metricKey: string, value: number, unit: string) {
  const definition = canonicalHealthMetricDefinition(metricKey);
  if (!definition) throw new HealthMetricMappingError("IMPORT.METRIC_UNMAPPED", "The provider metric is not mapped to the canonical registry.");
  const conversion = definition.acceptedUnits.find((candidate) => candidate.unit === unit);
  if (!conversion) throw new HealthMetricMappingError("IMPORT.UNIT_UNSUPPORTED", "The provider unit is not accepted for this canonical metric.");
  const normalizedValue = value * conversion.multiplier + (conversion.offset || 0);
  if (!Number.isFinite(normalizedValue) || (definition.nonNegative && normalizedValue < 0) || (definition.maximum !== undefined && normalizedValue > definition.maximum)) {
    throw new HealthMetricMappingError("IMPORT.VALUE_OUT_OF_RANGE", "The provider value is outside the mathematical bounds for this metric.");
  }
  return { definition, value: normalizedValue, unit: definition.canonicalUnit };
}

export function healthImportFailureCode(error: unknown, fallback?: string): string {
  if (error instanceof HealthMetricMappingError) return error.code;
  if (error instanceof HealthProviderScopeError) return error.code;
  if (error instanceof ZodError) return "IMPORT.ENVELOPE_INVALID";
  return fallback && /^[A-Z0-9_.:-]{1,120}$/.test(fallback) ? fallback : "IMPORT.PAGE_FAILED";
}

export function healthImportFailureIsRetryable(error: unknown): boolean {
  return !(error instanceof HealthMetricMappingError || error instanceof HealthProviderScopeError || error instanceof ZodError);
}

export class HealthProviderScopeError extends Error {
  readonly code = "IMPORT.SCOPE_NOT_GRANTED" as const;

  constructor() {
    super("The provider connection does not include the scope required by this canonical metric.");
    this.name = "HealthProviderScopeError";
  }
}
