import { z } from "zod";
import type { providerHealthEnvelopeSchema } from "./health-import";

export const ouraAdapterVersion = "oura-openapi-1.37-adapter-v1" as const;

type Envelope = z.input<typeof providerHealthEnvelopeSchema>;
type DayInterval = { start: string; end: string };
type DayIntervalResolver = (day: string) => DayInterval;

const iso = z.string().datetime({ offset: true });
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const finite = z.number().finite();
const nonNegative = finite.nonnegative();

const activitySchema = z.object({
  id: z.string().min(1), day, timestamp: iso,
  steps: nonNegative.optional(), active_calories: nonNegative.optional(), equivalent_walking_distance: nonNegative.optional(),
}).passthrough();
const workoutSchema = z.object({
  id: z.string().min(1), start_datetime: iso, end_datetime: iso,
  calories: nonNegative.nullish(), distance: nonNegative.nullish(), activity: z.string().nullish(), source: z.string().nullish(),
}).passthrough();
const sleepSchema = z.object({
  id: z.string().min(1), bedtime_start: iso, bedtime_end: iso,
  total_sleep_duration: nonNegative.nullish(), awake_time: nonNegative.nullish(), light_sleep_duration: nonNegative.nullish(),
  deep_sleep_duration: nonNegative.nullish(), rem_sleep_duration: nonNegative.nullish(), average_heart_rate: nonNegative.nullish(), average_breath: nonNegative.nullish(),
}).passthrough();
const heartRateSchema = z.object({ timestamp: iso, bpm: nonNegative, source: z.string().nullish() }).passthrough();
const spo2Schema = z.object({ id: z.string().min(1), day, spo2_percentage: z.object({ average: nonNegative }).nullish() }).passthrough();
const readinessSchema = z.object({ id: z.string().min(1), day, timestamp: iso, temperature_deviation: finite.nullish() }).passthrough();

function interval(value: DayInterval): DayInterval {
  const start = new Date(value.start); const end = new Date(value.end);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) throw new Error("Oura day interval must contain ordered ISO timestamps.");
  return { start: start.toISOString(), end: end.toISOString() };
}

function seconds(start: string, end: string): number {
  const duration = (new Date(end).getTime() - new Date(start).getTime()) / 1000;
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Oura source interval must have positive duration.");
  return duration;
}

function envelope(input: {
  documentId: string; sourceMetricId: string; metricKey: string; value: number; unit: string;
  observedAt: string; intervalStartAt?: string; intervalEndAt?: string; method: string; metadata?: Record<string, string | number | boolean | null>;
}): Envelope {
  return {
    sourceRecordId: `${input.documentId}:${input.sourceMetricId}`,
    sourceMetricId: input.sourceMetricId,
    metricKey: input.metricKey,
    value: input.value,
    unit: input.unit,
    observedAt: new Date(input.observedAt).toISOString(),
    ...(input.intervalStartAt && input.intervalEndAt ? { intervalStartAt: new Date(input.intervalStartAt).toISOString(), intervalEndAt: new Date(input.intervalEndAt).toISOString() } : {}),
    method: input.method,
    deviceName: "Oura",
    sourceVersion: ouraAdapterVersion,
    sourceMetadata: { providerDocumentId: input.documentId, ...input.metadata },
  };
}

function addOptional(target: Envelope[], value: number | null | undefined, build: (value: number) => Envelope): void {
  if (value !== null && value !== undefined) target.push(build(value));
}

export function extractOuraDailyActivity(raw: unknown, resolveDay: DayIntervalResolver): Envelope[] {
  const row = activitySchema.parse(raw); const window = interval(resolveDay(row.day)); const result: Envelope[] = [];
  addOptional(result, row.steps, (value) => envelope({ documentId: row.id, sourceMetricId: "PublicDailyActivity.steps", metricKey: "steps", value, unit: "count", observedAt: window.end, intervalStartAt: window.start, intervalEndAt: window.end, method: "Oura daily activity" }));
  addOptional(result, row.active_calories, (value) => envelope({ documentId: row.id, sourceMetricId: "PublicDailyActivity.active_calories", metricKey: "active_energy", value, unit: "kcal", observedAt: window.end, intervalStartAt: window.start, intervalEndAt: window.end, method: "Oura daily activity" }));
  addOptional(result, row.equivalent_walking_distance, (value) => envelope({ documentId: row.id, sourceMetricId: "PublicDailyActivity.equivalent_walking_distance", metricKey: "distance", value, unit: "m", observedAt: window.end, intervalStartAt: window.start, intervalEndAt: window.end, method: "Oura equivalent walking distance", metadata: { distanceMeaning: "equivalent_walking_distance_not_route" } }));
  return result;
}

export function extractOuraWorkout(raw: unknown): Envelope[] {
  const row = workoutSchema.parse(raw); const duration = seconds(row.start_datetime, row.end_datetime); const result: Envelope[] = [
    envelope({ documentId: row.id, sourceMetricId: "PublicWorkout.start_datetime+end_datetime", metricKey: "workout_duration", value: duration, unit: "s", observedAt: row.end_datetime, intervalStartAt: row.start_datetime, intervalEndAt: row.end_datetime, method: "Oura workout", metadata: { activity: row.activity || null, providerSource: row.source || null } }),
  ];
  addOptional(result, row.calories, (value) => envelope({ documentId: row.id, sourceMetricId: "PublicWorkout.calories", metricKey: "active_energy", value, unit: "kcal", observedAt: row.end_datetime, intervalStartAt: row.start_datetime, intervalEndAt: row.end_datetime, method: "Oura workout", metadata: { activity: row.activity || null } }));
  addOptional(result, row.distance, (value) => envelope({ documentId: row.id, sourceMetricId: "PublicWorkout.distance", metricKey: "distance", value, unit: "m", observedAt: row.end_datetime, intervalStartAt: row.start_datetime, intervalEndAt: row.end_datetime, method: "Oura workout distance", metadata: { activity: row.activity || null, routeRetained: false } }));
  return result;
}

export function extractOuraSleep(raw: unknown): Envelope[] {
  const row = sleepSchema.parse(raw); seconds(row.bedtime_start, row.bedtime_end); const result: Envelope[] = [];
  const durationFields = [
    ["total_sleep_duration", "PublicModifiedSleepModel.total_sleep_duration", "sleep_duration"],
    ["awake_time", "PublicModifiedSleepModel.awake_time", "sleep_awake_duration"],
    ["light_sleep_duration", "PublicModifiedSleepModel.light_sleep_duration", "sleep_light_duration"],
    ["deep_sleep_duration", "PublicModifiedSleepModel.deep_sleep_duration", "sleep_deep_duration"],
    ["rem_sleep_duration", "PublicModifiedSleepModel.rem_sleep_duration", "sleep_rem_duration"],
  ] as const;
  for (const [field, sourceMetricId, metricKey] of durationFields) addOptional(result, row[field], (value) => envelope({ documentId: row.id, sourceMetricId, metricKey, value, unit: "s", observedAt: row.bedtime_end, intervalStartAt: row.bedtime_start, intervalEndAt: row.bedtime_end, method: "Oura sleep aggregate" }));
  addOptional(result, row.average_heart_rate, (value) => envelope({ documentId: row.id, sourceMetricId: "PublicModifiedSleepModel.average_heart_rate", metricKey: "heart_rate", value, unit: "bpm", observedAt: row.bedtime_end, intervalStartAt: row.bedtime_start, intervalEndAt: row.bedtime_end, method: "Oura sleep average" }));
  addOptional(result, row.average_breath, (value) => envelope({ documentId: row.id, sourceMetricId: "PublicModifiedSleepModel.average_breath", metricKey: "respiratory_rate", value, unit: "breaths/min", observedAt: row.bedtime_end, intervalStartAt: row.bedtime_start, intervalEndAt: row.bedtime_end, method: "Oura sleep average" }));
  return result;
}

export function extractOuraHeartRate(raw: unknown): Envelope[] {
  const row = heartRateSchema.parse(raw); const timestamp = new Date(row.timestamp).toISOString();
  return [envelope({ documentId: timestamp, sourceMetricId: "PublicHeartRateRow.bpm", metricKey: "heart_rate", value: row.bpm, unit: "bpm", observedAt: timestamp, method: "Oura discrete heart-rate sample", metadata: { providerSource: row.source || null } })];
}

export function extractOuraDailySpo2(raw: unknown, resolveDay: DayIntervalResolver): Envelope[] {
  const row = spo2Schema.parse(raw); if (!row.spo2_percentage) return []; const window = interval(resolveDay(row.day));
  return [envelope({ documentId: row.id, sourceMetricId: "PublicDailySpO2.spo2_percentage.average", metricKey: "oxygen_saturation", value: row.spo2_percentage.average, unit: "%", observedAt: window.end, intervalStartAt: window.start, intervalEndAt: window.end, method: "Oura daily SpO2 aggregate" })];
}

export function extractOuraDailyReadiness(raw: unknown, resolveDay: DayIntervalResolver): Envelope[] {
  const row = readinessSchema.parse(raw); if (row.temperature_deviation === null || row.temperature_deviation === undefined) return []; const window = interval(resolveDay(row.day));
  return [envelope({ documentId: row.id, sourceMetricId: "PublicDailyReadiness.temperature_deviation", metricKey: "temperature_deviation", value: row.temperature_deviation, unit: "degC", observedAt: window.end, intervalStartAt: window.start, intervalEndAt: window.end, method: "Oura baseline temperature deviation", metadata: { readinessScoreImported: false } })];
}
