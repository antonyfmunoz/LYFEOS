import type { Express, Request, Response } from "express";
import { and, desc, eq, gte, inArray, isNull, lte, lt, sql, sum } from "drizzle-orm";
import { z } from "zod";
import { bodyMeasurements, fastingWindows, healthObservationCalculationPreferences, healthObservations, healthProfiles, healthSourcePreferences, healthTargetRevisions, healthTargets, hydrationEntries, nutritionDiaryEntries, nutritionFoods, recoveryActivities, sleepNaps, sleepSessions, supplementEntries, userDailyLogs, workoutExercises, workouts, workoutSets } from "@shared/schema";
import { db } from "../db";
import { bodyMeasurementMetrics, dateInTimeZone, dayBounds, fastingTimingSummary, healthDaySummary, healthSources, healthTargetKinds, hydrationToMl, localDate, requestTimeContext, sleepDurationMinutes, validTimeZone, zonedDateTime } from "../health-fitness";
import { isAuthenticated } from "./middleware";
import { assessEvidenceDocumentation, type EvidenceDocumentationRecord } from "../health-evidence";
import { isValidBodyMeasurementUnit } from "@shared/body-measurements";
import { parseExpectedResourceRevision } from "../revision-concurrency";
import { healthMutationId, healthMutationPayloadHash } from "../health-mutation-integrity";
import { activitySignalMetricKeys, buildActivitySignalSeries } from "../health-activity";

const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const healthTrackingDomains = ["nutrition", "training", "recovery", "sleep", "activity", "body", "metrics", "supplements", "planning", "connections"] as const;
const profileSchema = z.object({
  weightUnit: z.enum(["kg", "lb"]).optional(), heightUnit: z.enum(["cm", "in"]).optional(),
  energyUnit: z.enum(["kcal", "kJ"]).optional(), volumeUnit: z.enum(["ml", "fl_oz"]).optional(),
  heightValue: z.number().positive().max(300).nullable().optional(),
  bodyType: z.enum(["slender", "athletic", "broad", "mixed", "other", "prefer_not_to_say"]).nullable().optional(),
  trainingExperience: z.enum(["new", "developing", "experienced", "advanced", "prefer_not_to_say"]).nullable().optional(),
  planningContextEnabled: z.boolean().optional(), aiContextEnabled: z.boolean().optional(),
  timeZone: z.string().trim().max(100).refine(validTimeZone, "Choose a valid IANA time zone.").nullable().optional(),
  utcOffsetMinutes: z.number().int().min(-840).max(840).nullable().optional(),
  hydrationReminderEnabled: z.boolean().optional(), hydrationReminderIntervalMinutes: z.number().int().min(30).max(480).optional(),
  trackedDomains: z.array(z.enum(healthTrackingDomains)).max(healthTrackingDomains.length).refine((domains) => new Set(domains).size === domains.length, "Choose each Health workspace only once.").optional(),
});
const targetInput = z.object({
  kind: z.enum(healthTargetKinds), targetValue: z.number().positive().max(100_000), unit: z.string().trim().min(1).max(24),
  effectiveFrom: daySchema, effectiveTo: daySchema.nullable().optional(), source: z.enum(["user", "professional", "calculated"]).default("user"),
  calculationVersion: z.string().trim().max(64).nullable().optional(), note: z.string().trim().max(500).nullable().optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]), rationale: z.string().trim().max(1000).nullable().optional(),
  methodId: z.string().trim().max(80).nullable().optional(), methodVersion: z.string().trim().max(40).nullable().optional(),
});
const targetSchema = targetInput.superRefine((input, context) => {
  if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) context.addIssue({ code: z.ZodIssueCode.custom, message: "An end date cannot precede the start date." });
  if (new Set(input.weekdays).size !== input.weekdays.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "A weekday can appear only once." });
  if (input.source === "calculated" && (!input.methodId || !input.methodVersion)) context.addIssue({ code: z.ZodIssueCode.custom, message: "Calculated targets require a method identifier and version." });
});

function targetWeekdays(value: unknown): number[] { return Array.isArray(value) ? value.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6) : []; }
function targetSchedulesOverlap(left: { effectiveFrom: string; effectiveTo: string | null; weekdays: unknown }, right: { effectiveFrom: string; effectiveTo?: string | null; weekdays: number[] }) {
  const datesOverlap = left.effectiveFrom <= (right.effectiveTo || "9999-12-31") && right.effectiveFrom <= (left.effectiveTo || "9999-12-31");
  if (!datesOverlap) return false;
  const leftDays = targetWeekdays(left.weekdays);
  return !leftDays.length || !right.weekdays.length || leftDays.some((day) => right.weekdays.includes(day));
}

function overlappingTargetInRows(targets: Array<typeof healthTargets.$inferSelect>, input: z.infer<typeof targetInput>, excludedId?: number) {
  return targets.find((target) => target.id !== excludedId && targetSchedulesOverlap(target, input));
}
const measurementFields = z.object({
  metric: z.enum(bodyMeasurementMetrics), value: z.number().positive().max(100_000), unit: z.string().trim().min(1).max(24),
  observedAt: daySchema, source: z.enum(healthSources).default("manual"), note: z.string().trim().max(500).nullable().optional(),
  measurementMethod: z.enum(["unspecified", "scale", "tape", "bia", "caliper", "dexa", "bod_pod", "professional", "other"]).default("unspecified"),
  measurementProtocol: z.string().trim().max(300).nullable().optional(),
});
const refineMeasurementUnit = (input: { metric: string; unit: string }, context: z.RefinementCtx) => {
  if (!isValidBodyMeasurementUnit(input.metric, input.unit)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["unit"], message: "Choose a supported unit for this measurement type." });
};
const measurementSchema = measurementFields.superRefine(refineMeasurementUnit);
const measurementUpdateSchema = measurementFields.omit({ observedAt: true }).superRefine(refineMeasurementUnit);
const hydrationInput = z.object({
  volumeMl: z.number().int().positive().max(20_000).optional(), quantity: z.number().positive().max(20_000).optional(), inputUnit: z.enum(["ml", "l", "fl_oz", "cup"]).optional(), occurredAt: z.string().datetime().optional(), note: z.string().trim().max(500).nullable().optional(),
});
const hydrationSchema = hydrationInput.refine((value) => value.volumeMl != null || value.quantity != null, { message: "Enter a hydration amount." });
const hydrationUpdateSchema = hydrationInput.omit({ occurredAt: true }).refine((value) => value.volumeMl != null || value.quantity != null, { message: "Enter a hydration amount." });
function hydrationValues(input: z.infer<typeof hydrationSchema>) {
  const inputUnit = input.inputUnit || "ml";
  const inputQuantity = input.quantity ?? input.volumeMl!;
  return hydrationToMl(inputQuantity, inputUnit);
}
const supplementInput = z.object({
  name: z.string().trim().min(1).max(120), amount: z.number().positive().max(100_000).nullable().optional(),
  unit: z.string().trim().min(1).max(24).nullable().optional(), occurredAt: z.string().datetime().optional(), note: z.string().trim().max(500).nullable().optional(),
  brand: z.string().trim().max(120).nullable().optional(), manufacturer: z.string().trim().max(160).nullable().optional(),
  form: z.string().trim().max(80).nullable().optional(), barcode: z.string().trim().max(64).nullable().optional(),
  lotNumber: z.string().trim().max(80).nullable().optional(), expiresOn: daySchema.nullable().optional(),
});
const supplementSchema = supplementInput
  .refine((input) => input.amount === null || input.amount === undefined || !!input.unit, { message: "A unit is required when an amount is logged." })
  .refine((input) => !input.expiresOn || Boolean(localDate(input.expiresOn)), { message: "Enter a valid label expiration date." });
const supplementUpdateSchema = supplementInput.omit({ occurredAt: true })
  .refine((input) => input.amount === null || input.amount === undefined || !!input.unit, { message: "A unit is required when an amount is logged." })
  .refine((input) => !input.expiresOn || Boolean(localDate(input.expiresOn)), { message: "Enter a valid label expiration date." });
const fastingStartSchema = z.object({ startedAt: z.string().datetime().optional(), note: z.string().trim().max(500).nullable().optional() });
const fastingEndSchema = z.object({ endedAt: z.string().datetime().optional() });
const fastingUpdateSchema = z.object({
  startedAt: z.string().datetime(), endedAt: z.string().datetime().nullable(), note: z.string().trim().max(500).nullable().optional(),
}).refine((input) => input.endedAt === null || new Date(input.endedAt) > new Date(input.startedAt), { message: "A fasting window must end after it starts." });
const clockTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).nullable();
const sleepSchema = z.object({
  date: daySchema,
  sleepTime: clockTimeSchema,
  wakeTime: clockTimeSchema,
  sleepQuality: z.number().int().min(1).max(5).nullable(),
  sleepNote: z.string().trim().max(500).nullable(),
});
const napSchema = z.object({
  date: daySchema,
  startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  sleepQuality: z.number().int().min(1).max(5).nullable(),
  note: z.string().trim().max(500).nullable(),
});
const sleepSessionInput = z.object({
  startedAt: z.string().datetime(), endedAt: z.string().datetime(),
  source: z.enum(["manual", "transcribed_device"]),
  deviceName: z.string().trim().max(160).nullable().optional(), method: z.string().trim().max(160).nullable().optional(),
  awakeMinutes: z.number().int().min(0).max(2160).nullable(), lightMinutes: z.number().int().min(0).max(2160).nullable(),
  deepMinutes: z.number().int().min(0).max(2160).nullable(), remMinutes: z.number().int().min(0).max(2160).nullable(),
  subjectiveQuality: z.number().int().min(1).max(5).nullable(), note: z.string().trim().max(1000).nullable().optional(),
}).superRefine((input, context) => {
  const durationMinutes = (new Date(input.endedAt).getTime() - new Date(input.startedAt).getTime()) / 60_000;
  if (!(durationMinutes > 0 && durationMinutes <= 2160)) context.addIssue({ code: z.ZodIssueCode.custom, message: "A sleep session must end after it starts and be no longer than 36 hours." });
  const stageMinutes = [input.awakeMinutes, input.lightMinutes, input.deepMinutes, input.remMinutes].reduce<number>((total, value) => total + (value || 0), 0);
  if (stageMinutes > durationMinutes) context.addIssue({ code: z.ZodIssueCode.custom, message: "Recorded stage minutes cannot exceed elapsed session time." });
  if (input.source === "transcribed_device" && !input.deviceName) context.addIssue({ code: z.ZodIssueCode.custom, message: "Name the device when transcribing device data." });
});

function sleepSessionDurationMinutes(startedAt: Date, endedAt: Date): number { return Math.round((endedAt.getTime() - startedAt.getTime()) / 60_000); }

async function getProfile(userId: number) {
  const [profile] = await db.select().from(healthProfiles).where(eq(healthProfiles.userId, userId)).limit(1);
  return profile || null;
}

export function registerHealthFitnessRoutes(app: Express): void {

  app.get("/api/health-fitness/activity-signals", isAuthenticated, async (req: Request, res: Response) => {
    const requestedDays = Number(req.query.days || 30);
    const days = [7, 30, 90, 365].includes(requestedDays) ? requestedDays : 30;
    const { timeZone } = requestTimeContext(req);
    const endDate = dateInTimeZone(new Date(), timeZone);
    const first = new Date(`${endDate}T00:00:00.000Z`);
    first.setUTCDate(first.getUTCDate() - (days - 1));
    const startDate = first.toISOString().slice(0, 10);
    const { start } = dayBounds(startDate, timeZone);
    const { end } = dayBounds(endDate, timeZone);
    const userId = req.session.userId!;
    const [observations, preferences, workoutRows] = await Promise.all([
      db.select({
        id: healthObservations.id, metricKey: healthObservations.metricKey, displayName: healthObservations.displayName,
        unit: healthObservations.unit, source: healthObservations.source, value: healthObservations.value,
        observedAt: healthObservations.observedAt, temporalType: healthObservations.temporalType,
        intervalStartAt: healthObservations.intervalStartAt, intervalEndAt: healthObservations.intervalEndAt,
        included: healthObservationCalculationPreferences.included,
      }).from(healthObservations).leftJoin(healthObservationCalculationPreferences, and(
        eq(healthObservationCalculationPreferences.userId, userId),
        eq(healthObservationCalculationPreferences.observationId, healthObservations.id),
      )).where(and(
        eq(healthObservations.userId, userId), inArray(healthObservations.metricKey, [...activitySignalMetricKeys]),
        gte(healthObservations.observedAt, start), lt(healthObservations.observedAt, end),
      )),
      db.select().from(healthSourcePreferences).where(and(
        eq(healthSourcePreferences.userId, userId), inArray(healthSourcePreferences.metricKey, [...activitySignalMetricKeys]),
      )),
      db.select({ source: workouts.source, activityType: workouts.activityType, occurredAt: workouts.occurredAt, durationMinutes: workouts.durationMinutes })
        .from(workouts).where(and(eq(workouts.userId, userId), gte(workouts.occurredAt, start), lt(workouts.occurredAt, end))),
    ]);
    const sourcePriorities = Object.fromEntries(preferences.map((preference) => [
      preference.metricKey,
      Array.isArray(preference.orderedSources) ? preference.orderedSources.filter((source): source is string => typeof source === "string") : [],
    ]));
    const series = buildActivitySignalSeries(observations.map((row) => ({
      ...row,
      date: dateInTimeZone(row.observedAt, timeZone),
      intervalStartDate: row.intervalStartAt ? dateInTimeZone(row.intervalStartAt, timeZone) : null,
      intervalEndDate: row.intervalEndAt ? dateInTimeZone(row.intervalEndAt, timeZone) : null,
      includedInCalculations: row.included ?? true,
    })), sourcePriorities);
    const workoutSources = Array.from(workoutRows.reduce((groups, workout) => {
      const current = groups.get(workout.source) || { source: workout.source, workouts: 0, recordedDurationMinutes: 0, activities: new Set<string>() };
      current.workouts += 1;
      current.recordedDurationMinutes += workout.durationMinutes || 0;
      current.activities.add(workout.activityType);
      groups.set(workout.source, current);
      return groups;
    }, new Map<string, { source: string; workouts: number; recordedDurationMinutes: number; activities: Set<string> }>()).values()).map((group) => ({ ...group, activities: Array.from(group.activities).sort() }));
    return res.json({
      days, period: { startDate, endDate, timeZone }, series, workoutSources,
      disclosure: "Activity signals remain separated by metric, unit, and source. LyfeOS does not add different providers together, infer missing days as zero, store routes here, or turn activity records into a health, readiness, or fitness score. Source priority only controls display order.",
    });
  });
  app.get("/api/health-fitness/timeline", isAuthenticated, async (req: Request, res: Response) => {
    const requestedDays = Number(req.query.days || 14);
    const days = Number.isInteger(requestedDays) && requestedDays >= 7 && requestedDays <= 90 ? requestedDays : 14;
    const { timeZone } = requestTimeContext(req);
    const endDate = localDate(req.query.endDate) || dateInTimeZone(new Date(), timeZone);
    const startDay = new Date(`${endDate}T00:00:00.000Z`);
    startDay.setUTCDate(startDay.getUTCDate() - (days - 1));
    const startDate = startDay.toISOString().slice(0, 10);
    const { start } = dayBounds(startDate, timeZone);
    const { end } = dayBounds(endDate, timeZone);
    const userId = req.session.userId!;
    const [hydration, measurements, observations, recovery, training, supplements, fasting, nutrition, dailySleep, naps, sessions] = await Promise.all([
      db.select().from(hydrationEntries).where(and(eq(hydrationEntries.userId, userId), gte(hydrationEntries.occurredAt, start), lt(hydrationEntries.occurredAt, end))),
      db.select().from(bodyMeasurements).where(and(eq(bodyMeasurements.userId, userId), gte(bodyMeasurements.observedAt, startDate), lte(bodyMeasurements.observedAt, endDate))),
      db.select().from(healthObservations).where(and(eq(healthObservations.userId, userId), gte(healthObservations.observedAt, start), lt(healthObservations.observedAt, end))),
      db.select().from(recoveryActivities).where(and(eq(recoveryActivities.userId, userId), gte(recoveryActivities.occurredAt, start), lt(recoveryActivities.occurredAt, end))),
      db.select().from(workouts).where(and(eq(workouts.userId, userId), gte(workouts.occurredAt, start), lt(workouts.occurredAt, end))),
      db.select().from(supplementEntries).where(and(eq(supplementEntries.userId, userId), gte(supplementEntries.occurredAt, start), lt(supplementEntries.occurredAt, end))),
      db.select().from(fastingWindows).where(and(eq(fastingWindows.userId, userId), gte(fastingWindows.startedAt, start), lt(fastingWindows.startedAt, end))),
      db.select({ id: nutritionDiaryEntries.id, occurredAt: nutritionDiaryEntries.occurredAt, servingGrams: nutritionDiaryEntries.servingGrams, mealSlot: nutritionDiaryEntries.mealSlot, note: nutritionDiaryEntries.note, foodName: nutritionFoods.name, source: nutritionFoods.source })
        .from(nutritionDiaryEntries).innerJoin(nutritionFoods, eq(nutritionDiaryEntries.foodId, nutritionFoods.id))
        .where(and(eq(nutritionDiaryEntries.userId, userId), gte(nutritionDiaryEntries.occurredAt, start), lt(nutritionDiaryEntries.occurredAt, end))),
      db.select().from(userDailyLogs).where(and(eq(userDailyLogs.userId, userId), gte(userDailyLogs.date, startDate), lte(userDailyLogs.date, endDate))),
      db.select().from(sleepNaps).where(and(eq(sleepNaps.userId, userId), gte(sleepNaps.date, startDate), lte(sleepNaps.date, endDate))),
      db.select().from(sleepSessions).where(and(eq(sleepSessions.userId, userId), gte(sleepSessions.startedAt, start), lt(sleepSessions.startedAt, end))),
    ]);
    const events = [
      ...hydration.map((entry) => ({ id: `hydration:${entry.id}`, type: "hydration", occurredAt: entry.occurredAt.toISOString(), title: "Hydration", detail: `${entry.volumeMl} ml${entry.note ? ` · ${entry.note}` : ""}`, source: entry.source })),
      ...measurements.map((entry) => ({ id: `measurement:${entry.id}`, type: "measurement", occurredAt: zonedDateTime(entry.observedAt, timeZone, 12).toISOString(), title: entry.metric.replaceAll("_", " "), detail: `${entry.value} ${entry.unit}${entry.note ? ` · ${entry.note}` : ""}`, source: entry.source })),
      ...observations.map((entry) => ({ id: `observation:${entry.id}`, type: "observation", occurredAt: entry.collectedAt?.toISOString() || entry.observedAt.toISOString(), title: entry.displayName, detail: `${entry.value} ${entry.unit}${entry.specimenType ? ` · ${entry.specimenType} specimen` : ""}${entry.collectedAt ? ` · collected ${entry.collectedAt.toISOString()}` : ""}${entry.method ? ` · ${entry.method}` : ""}`, source: entry.source })),
      ...recovery.map((entry) => ({ id: `recovery:${entry.id}`, type: "recovery", occurredAt: entry.occurredAt.toISOString(), title: entry.customLabel || entry.activityType.replaceAll("_", " "), detail: `${entry.durationMinutes ? `${entry.durationMinutes} min` : "duration not recorded"}${entry.tags && Array.isArray(entry.tags) && entry.tags.length ? ` · ${entry.tags.map(String).join(", ")}` : ""}`, source: entry.source })),
      ...training.map((entry) => ({ id: `workout:${entry.id}`, type: "workout", occurredAt: entry.occurredAt.toISOString(), title: entry.activityType, detail: `${entry.durationMinutes ? `${entry.durationMinutes} min` : "duration not recorded"}${entry.perceivedExertion ? ` · RPE ${entry.perceivedExertion}` : ""}`, source: entry.source })),
      ...supplements.map((entry) => ({ id: `supplement:${entry.id}`, type: "supplement", occurredAt: entry.occurredAt.toISOString(), title: entry.name, detail: entry.amount != null ? `${entry.amount}${entry.unit ? ` ${entry.unit}` : ""}` : "amount not recorded", source: entry.source })),
      ...fasting.map((entry) => ({ id: `fasting:${entry.id}`, type: "fasting", occurredAt: entry.startedAt.toISOString(), title: "Fasting window", detail: entry.endedAt ? `Ended ${entry.endedAt.toISOString()}` : "In progress", source: entry.source })),
      ...nutrition.map((entry) => ({ id: `nutrition:${entry.id}`, type: "nutrition", occurredAt: entry.occurredAt.toISOString(), title: entry.foodName, detail: `${entry.servingGrams} g · ${entry.mealSlot}${entry.note ? ` · ${entry.note}` : ""}`, source: entry.source })),
      ...dailySleep.filter((entry) => entry.sleepTime || entry.wakeTime || entry.sleepQuality || entry.sleepNote).map((entry) => ({ id: `sleep:${entry.id}`, type: "sleep", occurredAt: zonedDateTime(entry.date, timeZone, 12).toISOString(), title: "Sleep", detail: `${entry.sleepTime || "?"}–${entry.wakeTime || "?"}${entry.sleepQuality ? ` · subjective ${entry.sleepQuality}/5` : ""}${entry.sleepNote ? ` · ${entry.sleepNote}` : ""}`, source: "manual" })),
      ...naps.map((entry) => { const [hour, minute] = entry.startTime.split(":").map(Number); return { id: `nap:${entry.id}`, type: "sleep", occurredAt: zonedDateTime(entry.date, timeZone, hour, minute).toISOString(), title: "Nap", detail: `${entry.startTime}–${entry.endTime}${entry.sleepQuality ? ` · subjective ${entry.sleepQuality}/5` : ""}${entry.note ? ` · ${entry.note}` : ""}`, source: entry.source }; }),
      ...sessions.map((entry) => ({ id: `sleep-session:${entry.id}`, type: "sleep", occurredAt: entry.startedAt.toISOString(), title: "Sleep session", detail: `${sleepSessionDurationMinutes(entry.startedAt, entry.endedAt)} min · ${entry.source.replaceAll("_", " ")}${entry.deviceName ? ` · ${entry.deviceName}` : ""}`, source: entry.source })),
    ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    const timelineTypes = ["hydration", "measurement", "observation", "recovery", "workout", "supplement", "fasting", "nutrition", "sleep"] as const;
    const coverage = timelineTypes.map((type) => {
      const matching = events.filter((event) => event.type === type);
      return {
        type,
        recordCount: matching.length,
        status: matching.length ? "recorded" as const : "not_recorded_in_period" as const,
        latestAt: matching[0]?.occurredAt || null,
        sources: Array.from(new Set(matching.map((event) => event.source))).sort(),
      };
    });
    return res.json({
      days, startDate, endDate, timeZone, events: events.slice(0, 250), coverage,
      disclosure: "This timeline assembles your private factual and self-reported records. A domain marked not recorded only describes this selected period; it does not mean an activity did not occur. LyfeOS does not infer causes, health status, treatment effects, readiness, or medical conclusions.",
    });
  });

  app.get("/api/health-fitness/profile", isAuthenticated, async (req: Request, res: Response) => {
    return res.json({ profile: await getProfile(req.session.userId!) });
  });

  app.patch("/api/health-fitness/profile", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid health profile.", details: parsed.error.flatten() });
    const userId = req.session.userId!;
    const [profile] = await db.insert(healthProfiles).values({ userId, ...parsed.data, updatedAt: new Date() })
      .onConflictDoUpdate({ target: healthProfiles.userId, set: { ...parsed.data, updatedAt: new Date() } }).returning();
    return res.json({ profile });
  });

  app.get("/api/health-fitness/sleep", isAuthenticated, async (req: Request, res: Response) => {
    const requestedDays = Number(req.query.days || 14);
    const days = Number.isInteger(requestedDays) && requestedDays >= 7 && requestedDays <= 90 ? requestedDays : 14;
    const { timeZone } = requestTimeContext(req);
    const endDate = localDate(req.query.endDate) || dateInTimeZone(new Date(), timeZone);
    const start = new Date(`${endDate}T00:00:00.000Z`);
    start.setUTCDate(start.getUTCDate() - (days - 1));
    const startDate = start.toISOString().slice(0, 10);
    const { start: startedAfter } = dayBounds(startDate, timeZone);
    const { end: startedBefore } = dayBounds(endDate, timeZone);
    const [logs, naps, sessions] = await Promise.all([
      db.select({ date: userDailyLogs.date, sleepTime: userDailyLogs.sleepTime, wakeTime: userDailyLogs.wakeTime, sleepQuality: userDailyLogs.sleepQuality, sleepNote: userDailyLogs.sleepNote })
        .from(userDailyLogs)
        .where(and(eq(userDailyLogs.userId, req.session.userId!), gte(userDailyLogs.date, startDate), lte(userDailyLogs.date, endDate)))
        .orderBy(userDailyLogs.date),
      db.select().from(sleepNaps)
        .where(and(eq(sleepNaps.userId, req.session.userId!), gte(sleepNaps.date, startDate), lte(sleepNaps.date, endDate)))
        .orderBy(sleepNaps.date, sleepNaps.startTime),
      db.select().from(sleepSessions)
        .where(and(eq(sleepSessions.userId, req.session.userId!), gte(sleepSessions.startedAt, startedAfter), lt(sleepSessions.startedAt, startedBefore)))
        .orderBy(desc(sleepSessions.startedAt)),
    ]);
    return res.json({
      days,
      records: logs.map((log) => ({ ...log, durationMinutes: sleepDurationMinutes(log.sleepTime, log.wakeTime), source: "manual" as const })),
      naps: naps.map((nap) => ({ ...nap, durationMinutes: sleepDurationMinutes(nap.startTime, nap.endTime) })),
      sessions: sessions.map((session) => ({ ...session, durationMinutes: sleepSessionDurationMinutes(session.startedAt, session.endedAt) })),
      disclosure: "Daily quality and notes are subjective reflections. Session duration and any transcribed stages are recorded facts from the named source; LyfeOS does not interpret them as sleep quality, diagnosis, readiness, or medical guidance.",
    });
  });

  app.put("/api/health-fitness/sleep", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = sleepSchema.safeParse(req.body);
    if (!parsed.success || !localDate(parsed.data?.date)) return res.status(400).json({ error: "Invalid sleep record.", details: parsed.success ? undefined : parsed.error.flatten() });
    const values = { userId: req.session.userId!, date: parsed.data.date, sleepTime: parsed.data.sleepTime, wakeTime: parsed.data.wakeTime, sleepQuality: parsed.data.sleepQuality, sleepNote: parsed.data.sleepNote };
    const [log] = await db.insert(userDailyLogs).values(values)
      .onConflictDoUpdate({ target: [userDailyLogs.userId, userDailyLogs.date], set: { sleepTime: parsed.data.sleepTime, wakeTime: parsed.data.wakeTime, sleepQuality: parsed.data.sleepQuality, sleepNote: parsed.data.sleepNote } })
      .returning({ date: userDailyLogs.date, sleepTime: userDailyLogs.sleepTime, wakeTime: userDailyLogs.wakeTime, sleepQuality: userDailyLogs.sleepQuality, sleepNote: userDailyLogs.sleepNote });
    return res.json({ record: { ...log, durationMinutes: sleepDurationMinutes(log.sleepTime, log.wakeTime), source: "manual" as const } });
  });

  app.post("/api/health-fitness/sleep/naps", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = napSchema.safeParse(req.body);
    const durationMinutes = parsed.success ? sleepDurationMinutes(parsed.data.startTime, parsed.data.endTime) : null;
    if (!parsed.success || !localDate(parsed.data.date) || durationMinutes === null) return res.status(400).json({ error: "Invalid nap record.", details: parsed.success ? undefined : parsed.error.flatten() });
    const [nap] = await db.insert(sleepNaps).values({ userId: req.session.userId!, ...parsed.data, source: "manual" }).returning();
    return res.status(201).json({ nap: { ...nap, durationMinutes } });
  });

  app.patch("/api/health-fitness/sleep/naps/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const parsed = napSchema.safeParse(req.body);
    const durationMinutes = parsed.success ? sleepDurationMinutes(parsed.data.startTime, parsed.data.endTime) : null;
    if (!Number.isInteger(id) || !parsed.success || !localDate(parsed.data.date) || durationMinutes === null) return res.status(400).json({ error: "Invalid nap record.", details: parsed.success ? undefined : parsed.error.flatten() });
    const [nap] = await db.update(sleepNaps).set(parsed.data).where(and(eq(sleepNaps.id, id), eq(sleepNaps.userId, req.session.userId!))).returning();
    return nap ? res.json({ nap: { ...nap, durationMinutes } }) : res.status(404).json({ error: "Nap record not found." });
  });

  app.delete("/api/health-fitness/sleep/naps/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid nap record." });
    const [nap] = await db.delete(sleepNaps).where(and(eq(sleepNaps.id, id), eq(sleepNaps.userId, req.session.userId!))).returning({ id: sleepNaps.id });
    return nap ? res.status(204).send() : res.status(404).json({ error: "Nap record not found." });
  });

  app.post("/api/health-fitness/sleep/sessions", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = sleepSessionInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid sleep session.", details: parsed.error.flatten() });
    const userId = req.session.userId!;
    const rawMutationId = req.header("x-lyfeos-mutation-id");
    const clientMutationId = healthMutationId(rawMutationId);
    if (rawMutationId && !clientMutationId) return res.status(400).json({ error: "Invalid mutation identity." });
    const mutationPayloadHash = clientMutationId ? healthMutationPayloadHash(parsed.data) : null;
    if (clientMutationId) {
      const [existing] = await db.select().from(sleepSessions).where(and(eq(sleepSessions.userId, userId), eq(sleepSessions.clientMutationId, clientMutationId))).limit(1);
      if (existing) return existing.mutationPayloadHash === mutationPayloadHash
        ? res.json({ session: { ...existing, durationMinutes: sleepSessionDurationMinutes(existing.startedAt, existing.endedAt) }, replayed: true })
        : res.status(409).json({ error: "This mutation identity was already used for a different sleep session." });
    }
    const { timeZone, utcOffsetMinutes } = requestTimeContext(req);
    try {
      const [session] = await db.insert(sleepSessions).values({
        userId, ...parsed.data, startedAt: new Date(parsed.data.startedAt), endedAt: new Date(parsed.data.endedAt),
        recordedTimeZone: timeZone, recordedUtcOffsetMinutes: utcOffsetMinutes, clientMutationId, mutationPayloadHash,
      }).returning();
      return res.status(201).json({ session: { ...session, durationMinutes: sleepSessionDurationMinutes(session.startedAt, session.endedAt) }, replayed: false });
    } catch (error) {
      if (!clientMutationId) throw error;
      const [existing] = await db.select().from(sleepSessions).where(and(eq(sleepSessions.userId, userId), eq(sleepSessions.clientMutationId, clientMutationId))).limit(1);
      if (!existing) throw error;
      return existing.mutationPayloadHash === mutationPayloadHash
        ? res.json({ session: { ...existing, durationMinutes: sleepSessionDurationMinutes(existing.startedAt, existing.endedAt) }, replayed: true })
        : res.status(409).json({ error: "This mutation identity was already used for a different sleep session." });
    }
  });

  app.patch("/api/health-fitness/sleep/sessions/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const revision = parseExpectedResourceRevision(req.header("x-lyfeos-expected-revision"));
    const parsed = sleepSessionInput.safeParse(req.body);
    if (!Number.isInteger(id) || !parsed.success || (!revision.ok && revision.reason === "invalid")) return res.status(400).json({ error: "Invalid sleep session.", details: parsed.success ? undefined : parsed.error.flatten() });
    if (!revision.ok) return res.status(428).json({ error: "Reload this sleep session before saving a correction." });
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM sleep_sessions WHERE id = ${id} AND user_id = ${req.session.userId!} FOR UPDATE`);
      const [current] = await tx.select().from(sleepSessions).where(and(eq(sleepSessions.id, id), eq(sleepSessions.userId, req.session.userId!))).limit(1);
      if (!current) return { status: 404 as const };
      if (current.revision !== revision.revision) return { status: 409 as const, currentRevision: current.revision };
      const [session] = await tx.update(sleepSessions).set({
        ...parsed.data, startedAt: new Date(parsed.data.startedAt), endedAt: new Date(parsed.data.endedAt), revision: current.revision + 1, updatedAt: new Date(),
      }).where(and(eq(sleepSessions.id, id), eq(sleepSessions.userId, req.session.userId!))).returning();
      return { status: 200 as const, session };
    });
    if (result.status === 404) return res.status(404).json({ error: "Sleep session not found." });
    if (result.status === 409) return res.status(409).json({ error: "This sleep session changed after you opened it. Your correction was not applied.", currentRevision: result.currentRevision });
    return res.json({ session: { ...result.session, durationMinutes: sleepSessionDurationMinutes(result.session.startedAt, result.session.endedAt) } });
  });

  app.delete("/api/health-fitness/sleep/sessions/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const revision = parseExpectedResourceRevision(req.header("x-lyfeos-expected-revision"));
    if (!Number.isInteger(id) || (!revision.ok && revision.reason === "invalid")) return res.status(400).json({ error: "Invalid sleep session." });
    if (!revision.ok) return res.status(428).json({ error: "Reload this sleep session before deleting it." });
    const userId = req.session.userId!;
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM sleep_sessions WHERE id = ${id} AND user_id = ${userId} FOR UPDATE`);
      const [current] = await tx.select().from(sleepSessions).where(and(eq(sleepSessions.id, id), eq(sleepSessions.userId, userId))).limit(1);
      if (!current) return { status: 404 as const };
      if (current.revision !== revision.revision) return { status: 409 as const, currentRevision: current.revision };
      await tx.delete(sleepSessions).where(and(eq(sleepSessions.id, id), eq(sleepSessions.userId, userId)));
      return { status: 204 as const };
    });
    if (result.status === 404) return res.status(404).json({ error: "Sleep session not found." });
    if (result.status === 409) return res.status(409).json({ error: "This sleep session changed after you opened it. It was not deleted.", currentRevision: result.currentRevision });
    return res.status(204).send();
  });

  app.get("/api/health-fitness/targets", isAuthenticated, async (req: Request, res: Response) => {
    const targets = await db.select().from(healthTargets).where(eq(healthTargets.userId, req.session.userId!))
      .orderBy(desc(healthTargets.effectiveFrom), desc(healthTargets.createdAt));
    return res.json({ targets });
  });

  app.get("/api/health-fitness/target-revisions", isAuthenticated, async (req: Request, res: Response) => {
    const revisions = await db.select().from(healthTargetRevisions)
      .where(eq(healthTargetRevisions.userId, req.session.userId!))
      .orderBy(desc(healthTargetRevisions.createdAt), desc(healthTargetRevisions.id)).limit(200);
    return res.json({ revisions });
  });

  app.post("/api/health-fitness/targets", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = targetSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid health target.", details: parsed.error.flatten() });
    const userId = req.session.userId!;
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('lyfeos-health-target'), hashtext(${`${userId}:${parsed.data.kind}`}))`);
      const existing = await tx.select().from(healthTargets).where(and(eq(healthTargets.userId, userId), eq(healthTargets.kind, parsed.data.kind)));
      if (overlappingTargetInRows(existing, parsed.data)) return { status: 409 as const };
      const [target] = await tx.insert(healthTargets).values({ userId, ...parsed.data, effectiveTo: parsed.data.effectiveTo || null, calculationVersion: parsed.data.calculationVersion || null, rationale: parsed.data.rationale || null, methodId: parsed.data.methodId || null, methodVersion: parsed.data.methodVersion || null, note: parsed.data.note || null }).returning();
      await tx.insert(healthTargetRevisions).values({ userId, targetId: target.id, revisionNumber: target.revision, action: "created", snapshot: target });
      return { status: 201 as const, target };
    });
    return result.status === 409
      ? res.status(409).json({ error: "This target overlaps another target of the same kind on at least one scheduled day." })
      : res.status(201).json({ target: result.target });
  });

  app.patch("/api/health-fitness/targets/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const expectedRevision = parseExpectedResourceRevision(req.header("x-lyfeos-expected-revision"));
    const parsed = targetSchema.safeParse(req.body);
    if (!Number.isInteger(id) || !parsed.success || (!expectedRevision.ok && expectedRevision.reason === "invalid")) return res.status(400).json({ error: "Invalid health target.", details: parsed.success ? undefined : parsed.error.flatten() });
    if (!expectedRevision.ok) return res.status(428).json({ error: "Reload this target before saving changes." });
    const userId = req.session.userId!;
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM health_targets WHERE id = ${id} AND user_id = ${userId} FOR UPDATE`);
      const [current] = await tx.select().from(healthTargets).where(and(eq(healthTargets.id, id), eq(healthTargets.userId, userId))).limit(1);
      if (!current) return { status: 404 as const };
      if (current.revision !== expectedRevision.revision) return { status: 409 as const, reason: "stale" as const, currentRevision: current.revision };
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('lyfeos-health-target'), hashtext(${`${userId}:${parsed.data.kind}`}))`);
      const existing = await tx.select().from(healthTargets).where(and(eq(healthTargets.userId, userId), eq(healthTargets.kind, parsed.data.kind)));
      if (overlappingTargetInRows(existing, parsed.data, id)) return { status: 409 as const, reason: "overlap" as const };
      const [target] = await tx.update(healthTargets).set({ ...parsed.data, effectiveTo: parsed.data.effectiveTo || null, calculationVersion: parsed.data.calculationVersion || null, rationale: parsed.data.rationale || null, methodId: parsed.data.methodId || null, methodVersion: parsed.data.methodVersion || null, note: parsed.data.note || null, revision: current.revision + 1, updatedAt: new Date() })
        .where(and(eq(healthTargets.id, id), eq(healthTargets.userId, userId))).returning();
      await tx.insert(healthTargetRevisions).values({ userId, targetId: target.id, revisionNumber: target.revision, action: "updated", snapshot: target });
      return { status: 200 as const, target };
    });
    if (result.status === 404) return res.status(404).json({ error: "Health target not found." });
    if (result.status === 409 && result.reason === "stale") return res.status(409).json({ error: "This target changed after you opened it. Your changes were not applied.", currentRevision: result.currentRevision });
    if (result.status === 409) return res.status(409).json({ error: "This target overlaps another target of the same kind on at least one scheduled day." });
    return res.json({ target: result.target });
  });

  app.delete("/api/health-fitness/targets/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const expectedRevision = parseExpectedResourceRevision(req.header("x-lyfeos-expected-revision"));
    if (!Number.isInteger(id) || (!expectedRevision.ok && expectedRevision.reason === "invalid")) return res.status(400).json({ error: "Invalid health target." });
    if (!expectedRevision.ok) return res.status(428).json({ error: "Reload this target before deleting it." });
    const userId = req.session.userId!;
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM health_targets WHERE id = ${id} AND user_id = ${userId} FOR UPDATE`);
      const [current] = await tx.select().from(healthTargets).where(and(eq(healthTargets.id, id), eq(healthTargets.userId, userId))).limit(1);
      if (!current) return { status: 404 as const };
      if (current.revision !== expectedRevision.revision) return { status: 409 as const, currentRevision: current.revision };
      await tx.insert(healthTargetRevisions).values({ userId, targetId: current.id, revisionNumber: current.revision + 1, action: "deleted", snapshot: { ...current, revision: current.revision + 1, deletedAt: new Date().toISOString() } });
      await tx.delete(healthTargets).where(and(eq(healthTargets.id, id), eq(healthTargets.userId, userId)));
      return { status: 204 as const };
    });
    if (result.status === 404) return res.status(404).json({ error: "Health target not found." });
    if (result.status === 409) return res.status(409).json({ error: "This target changed after you opened it. It was not deleted.", currentRevision: result.currentRevision });
    return res.status(204).send();
  });

  app.get("/api/health-fitness/measurements", isAuthenticated, async (req: Request, res: Response) => {
    const measurements = await db.select().from(bodyMeasurements).where(eq(bodyMeasurements.userId, req.session.userId!))
      .orderBy(desc(bodyMeasurements.observedAt), desc(bodyMeasurements.createdAt)).limit(300);
    return res.json({ measurements });
  });

  app.post("/api/health-fitness/measurements", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = measurementSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid body measurement.", details: parsed.error.flatten() });
    const userId = req.session.userId!;
    const rawMutationId = req.header("x-lyfeos-mutation-id");
    const clientMutationId = healthMutationId(rawMutationId);
    if (rawMutationId && !clientMutationId) return res.status(400).json({ error: "Invalid mutation identity." });
    const mutationPayloadHash = clientMutationId ? healthMutationPayloadHash(parsed.data) : null;
    if (clientMutationId) {
      const [existing] = await db.select().from(bodyMeasurements).where(and(eq(bodyMeasurements.userId, userId), eq(bodyMeasurements.clientMutationId, clientMutationId))).limit(1);
      if (existing) return existing.mutationPayloadHash === mutationPayloadHash ? res.json({ measurement: existing, replayed: true }) : res.status(409).json({ error: "This mutation identity was already used for a different body measurement." });
    }
    const selectedZone = requestTimeContext(req).timeZone;
    const timeContext = requestTimeContext(req, zonedDateTime(parsed.data.observedAt, selectedZone, 12));
    try {
      const [measurement] = await db.insert(bodyMeasurements).values({ userId, ...parsed.data, note: parsed.data.note || null, recordedTimeZone: timeContext.timeZone, recordedUtcOffsetMinutes: timeContext.utcOffsetMinutes, clientMutationId, mutationPayloadHash }).returning();
      return res.status(201).json({ measurement, replayed: false });
    } catch (error) {
      if (!clientMutationId) throw error;
      const [existing] = await db.select().from(bodyMeasurements).where(and(eq(bodyMeasurements.userId, userId), eq(bodyMeasurements.clientMutationId, clientMutationId))).limit(1);
      if (!existing) throw error;
      return existing.mutationPayloadHash === mutationPayloadHash ? res.json({ measurement: existing, replayed: true }) : res.status(409).json({ error: "This mutation identity was already used for a different body measurement." });
    }
  });

  app.patch("/api/health-fitness/measurements/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const parsed = measurementUpdateSchema.safeParse(req.body);
    if (!Number.isInteger(id) || !parsed.success) return res.status(400).json({ error: "Invalid measurement.", details: parsed.success ? undefined : parsed.error.flatten() });
    const [measurement] = await db.update(bodyMeasurements).set({ ...parsed.data, note: parsed.data.note || null })
      .where(and(eq(bodyMeasurements.id, id), eq(bodyMeasurements.userId, req.session.userId!))).returning();
    return measurement ? res.json({ measurement }) : res.status(404).json({ error: "Measurement not found." });
  });

  app.delete("/api/health-fitness/measurements/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid measurement." });
    const [measurement] = await db.delete(bodyMeasurements).where(and(eq(bodyMeasurements.id, id), eq(bodyMeasurements.userId, req.session.userId!))).returning({ id: bodyMeasurements.id });
    return measurement ? res.status(204).send() : res.status(404).json({ error: "Measurement not found." });
  });

  app.get("/api/health-fitness/hydration", isAuthenticated, async (req: Request, res: Response) => {
    const { timeZone } = requestTimeContext(req);
    const date = localDate(req.query.date) || dateInTimeZone(new Date(), timeZone);
    const { start, end } = dayBounds(date, timeZone);
    const entries = await db.select().from(hydrationEntries).where(and(eq(hydrationEntries.userId, req.session.userId!), gte(hydrationEntries.occurredAt, start), lt(hydrationEntries.occurredAt, end))).orderBy(desc(hydrationEntries.occurredAt));
    return res.json({ date, entries });
  });

  app.get("/api/health-fitness/hydration/trends", isAuthenticated, async (req: Request, res: Response) => {
    const requestedDays = Number(req.query.days || 30);
    const days = Number.isInteger(requestedDays) && requestedDays >= 7 && requestedDays <= 3650 ? requestedDays : 30;
    const { timeZone } = requestTimeContext(req);
    const endDate = dateInTimeZone(new Date(), timeZone);
    const firstDate = new Date(`${endDate}T00:00:00.000Z`); firstDate.setUTCDate(firstDate.getUTCDate() - (days - 1));
    const startDate = firstDate.toISOString().slice(0, 10);
    const { start } = dayBounds(startDate, timeZone);
    const entries = await db.select().from(hydrationEntries).where(and(eq(hydrationEntries.userId, req.session.userId!), gte(hydrationEntries.occurredAt, start))).orderBy(hydrationEntries.occurredAt);
    const totals = new Map<string, { volumeMl: number; entries: number }>();
    for (const entry of entries) {
      const date = dateInTimeZone(entry.occurredAt, timeZone);
      const current = totals.get(date) || { volumeMl: 0, entries: 0 };
      totals.set(date, { volumeMl: current.volumeMl + entry.volumeMl, entries: current.entries + 1 });
    }
    return res.json({ days, timeZone, trend: Array.from({ length: days }, (_, index) => { const date = new Date(`${startDate}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate() + index); const key = date.toISOString().slice(0, 10); return { date: key, ...(totals.get(key) || { volumeMl: 0, entries: 0 }) }; }), disclosure: "Hydration history sums only recorded entries after converting each captured unit to milliliters. It is not a hydration-status or medical assessment." });
  });

  app.post("/api/health-fitness/hydration", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = hydrationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid hydration entry.", details: parsed.error.flatten() });
    const userId = req.session.userId!;
    const rawMutationId = req.header("x-lyfeos-mutation-id");
    const clientMutationId = healthMutationId(rawMutationId);
    if (rawMutationId && !clientMutationId) return res.status(400).json({ error: "Invalid mutation identity." });
    const mutationPayloadHash = clientMutationId ? healthMutationPayloadHash(parsed.data) : null;
    if (clientMutationId) {
      const [existing] = await db.select().from(hydrationEntries).where(and(eq(hydrationEntries.userId, userId), eq(hydrationEntries.clientMutationId, clientMutationId))).limit(1);
      if (existing) return existing.mutationPayloadHash === mutationPayloadHash ? res.json({ entry: existing, replayed: true }) : res.status(409).json({ error: "This mutation identity was already used for a different hydration entry." });
    }
    const occurredAt = parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) return res.status(400).json({ error: "Invalid hydration time." });
    const values = hydrationValues(parsed.data);
    if (values.volumeMl < 1 || values.volumeMl > 20_000) return res.status(400).json({ error: "Hydration amount must convert to between 1 and 20,000 ml." });
    const timeContext = requestTimeContext(req, occurredAt);
    try {
      const [entry] = await db.insert(hydrationEntries).values({ userId, ...values, occurredAt, note: parsed.data.note || null, recordedTimeZone: timeContext.timeZone, recordedUtcOffsetMinutes: timeContext.utcOffsetMinutes, clientMutationId, mutationPayloadHash }).returning();
      return res.status(201).json({ entry, replayed: false });
    } catch (error) {
      if (!clientMutationId) throw error;
      const [existing] = await db.select().from(hydrationEntries).where(and(eq(hydrationEntries.userId, userId), eq(hydrationEntries.clientMutationId, clientMutationId))).limit(1);
      if (!existing) throw error;
      return existing.mutationPayloadHash === mutationPayloadHash ? res.json({ entry: existing, replayed: true }) : res.status(409).json({ error: "This mutation identity was already used for a different hydration entry." });
    }
  });

  app.patch("/api/health-fitness/hydration/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const parsed = hydrationUpdateSchema.safeParse(req.body);
    if (!Number.isInteger(id) || !parsed.success) return res.status(400).json({ error: "Invalid hydration entry.", details: parsed.success ? undefined : parsed.error.flatten() });
    const values = hydrationValues(parsed.data);
    if (values.volumeMl < 1 || values.volumeMl > 20_000) return res.status(400).json({ error: "Hydration amount must convert to between 1 and 20,000 ml." });
    const [entry] = await db.update(hydrationEntries).set({ ...values, note: parsed.data.note || null })
      .where(and(eq(hydrationEntries.id, id), eq(hydrationEntries.userId, req.session.userId!))).returning();
    return entry ? res.json({ entry }) : res.status(404).json({ error: "Hydration entry not found." });
  });

  app.delete("/api/health-fitness/hydration/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid hydration entry." });
    const [entry] = await db.delete(hydrationEntries).where(and(eq(hydrationEntries.id, id), eq(hydrationEntries.userId, req.session.userId!))).returning({ id: hydrationEntries.id });
    return entry ? res.status(204).send() : res.status(404).json({ error: "Hydration entry not found." });
  });

  app.get("/api/health-fitness/supplements", isAuthenticated, async (req: Request, res: Response) => {
    const { timeZone } = requestTimeContext(req);
    const date = localDate(req.query.date) || dateInTimeZone(new Date(), timeZone);
    const { start, end } = dayBounds(date, timeZone);
    const entries = await db.select().from(supplementEntries).where(and(eq(supplementEntries.userId, req.session.userId!), gte(supplementEntries.occurredAt, start), lt(supplementEntries.occurredAt, end))).orderBy(desc(supplementEntries.occurredAt));
    return res.json({ date, entries, disclosure: "Supplement entries are private self-reports, not medical advice or a medication record." });
  });

  app.post("/api/health-fitness/supplements", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = supplementSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid supplement entry.", details: parsed.error.flatten() });
    const userId = req.session.userId!;
    const rawMutationId = req.header("x-lyfeos-mutation-id");
    const clientMutationId = healthMutationId(rawMutationId);
    if (rawMutationId && !clientMutationId) return res.status(400).json({ error: "Invalid mutation identity." });
    const mutationPayloadHash = clientMutationId ? healthMutationPayloadHash(parsed.data) : null;
    if (clientMutationId) {
      const [existing] = await db.select().from(supplementEntries).where(and(eq(supplementEntries.userId, userId), eq(supplementEntries.clientMutationId, clientMutationId))).limit(1);
      if (existing) return existing.mutationPayloadHash === mutationPayloadHash ? res.json({ entry: existing, replayed: true }) : res.status(409).json({ error: "This mutation identity was already used for a different supplement entry." });
    }
    const occurredAt = parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) return res.status(400).json({ error: "Invalid supplement time." });
    const timeContext = requestTimeContext(req, occurredAt);
    try {
      const [entry] = await db.insert(supplementEntries).values({ userId, name: parsed.data.name, amount: parsed.data.amount ?? null, unit: parsed.data.unit || null, brand: parsed.data.brand || null, manufacturer: parsed.data.manufacturer || null, form: parsed.data.form || null, barcode: parsed.data.barcode || null, lotNumber: parsed.data.lotNumber || null, expiresOn: parsed.data.expiresOn || null, occurredAt, source: "manual", note: parsed.data.note || null, recordedTimeZone: timeContext.timeZone, recordedUtcOffsetMinutes: timeContext.utcOffsetMinutes, clientMutationId, mutationPayloadHash }).returning();
      return res.status(201).json({ entry, replayed: false });
    } catch (error) {
      if (!clientMutationId) throw error;
      const [existing] = await db.select().from(supplementEntries).where(and(eq(supplementEntries.userId, userId), eq(supplementEntries.clientMutationId, clientMutationId))).limit(1);
      if (!existing) throw error;
      return existing.mutationPayloadHash === mutationPayloadHash ? res.json({ entry: existing, replayed: true }) : res.status(409).json({ error: "This mutation identity was already used for a different supplement entry." });
    }
  });

  app.patch("/api/health-fitness/supplements/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const parsed = supplementUpdateSchema.safeParse(req.body);
    if (!Number.isInteger(id) || !parsed.success) return res.status(400).json({ error: "Invalid supplement entry.", details: parsed.success ? undefined : parsed.error.flatten() });
    const [entry] = await db.update(supplementEntries).set({ name: parsed.data.name, amount: parsed.data.amount ?? null, unit: parsed.data.unit || null, brand: parsed.data.brand || null, manufacturer: parsed.data.manufacturer || null, form: parsed.data.form || null, barcode: parsed.data.barcode || null, lotNumber: parsed.data.lotNumber || null, expiresOn: parsed.data.expiresOn || null, note: parsed.data.note || null })
      .where(and(eq(supplementEntries.id, id), eq(supplementEntries.userId, req.session.userId!))).returning();
    return entry ? res.json({ entry }) : res.status(404).json({ error: "Supplement entry not found." });
  });

  app.delete("/api/health-fitness/supplements/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid supplement entry." });
    const [entry] = await db.delete(supplementEntries).where(and(eq(supplementEntries.id, id), eq(supplementEntries.userId, req.session.userId!))).returning({ id: supplementEntries.id });
    return entry ? res.status(204).send() : res.status(404).json({ error: "Supplement entry not found." });
  });

  app.get("/api/health-fitness/fasting", isAuthenticated, async (req: Request, res: Response) => {
    const userId = req.session.userId!;
    const requestedDays = Number(req.query.days || 30);
    const days = Number.isInteger(requestedDays) && requestedDays >= 7 && requestedDays <= 3650 ? requestedDays : 30;
    const { timeZone } = requestTimeContext(req);
    const endDate = dateInTimeZone(new Date(), timeZone);
    const firstDate = new Date(`${endDate}T00:00:00.000Z`); firstDate.setUTCDate(firstDate.getUTCDate() - (days - 1));
    const { start } = dayBounds(firstDate.toISOString().slice(0, 10), timeZone);
    const { end } = dayBounds(endDate, timeZone);
    const [active, recentWithOverflow] = await Promise.all([
      db.select().from(fastingWindows).where(and(eq(fastingWindows.userId, userId), isNull(fastingWindows.endedAt))).orderBy(desc(fastingWindows.startedAt)).limit(1),
      db.select().from(fastingWindows).where(and(eq(fastingWindows.userId, userId), gte(fastingWindows.startedAt, start), lt(fastingWindows.startedAt, end))).orderBy(desc(fastingWindows.startedAt)).limit(5001),
    ]);
    const truncated = recentWithOverflow.length > 5000;
    const recent = recentWithOverflow.slice(0, 5000);
    return res.json({
      active: active[0] || null,
      windows: recent,
      summary: fastingTimingSummary(recent),
      days,
      timeZone,
      truncated,
      aggregationBasis: "windows_started_in_selected_period",
      disclosure: "Fasting windows are private self-reported timing records. Summary durations add completed records as entered; overlapping windows are disclosed and not deduplicated. LyfeOS does not provide fasting recommendations, adherence scores, or medical guidance.",
    });
  });

  app.post("/api/health-fitness/fasting/start", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = fastingStartSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid fasting start.", details: parsed.error.flatten() });
    const userId = req.session.userId!;
    const [active] = await db.select({ id: fastingWindows.id }).from(fastingWindows).where(and(eq(fastingWindows.userId, userId), isNull(fastingWindows.endedAt))).limit(1);
    if (active) return res.status(409).json({ error: "A fasting window is already active." });
    const startedAt = parsed.data.startedAt ? new Date(parsed.data.startedAt) : new Date();
    if (Number.isNaN(startedAt.getTime())) return res.status(400).json({ error: "Invalid fasting start time." });
    const timeContext = requestTimeContext(req, startedAt);
    const [window] = await db.insert(fastingWindows).values({ userId, startedAt, note: parsed.data.note || null, source: "manual", recordedTimeZone: timeContext.timeZone, recordedUtcOffsetMinutes: timeContext.utcOffsetMinutes }).returning();
    return res.status(201).json({ window });
  });

  app.post("/api/health-fitness/fasting/:id/end", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const parsed = fastingEndSchema.safeParse(req.body);
    if (!Number.isInteger(id) || !parsed.success) return res.status(400).json({ error: "Invalid fasting end.", details: parsed.success ? undefined : parsed.error.flatten() });
    const endedAt = parsed.data.endedAt ? new Date(parsed.data.endedAt) : new Date();
    if (Number.isNaN(endedAt.getTime())) return res.status(400).json({ error: "Invalid fasting end time." });
    const [window] = await db.update(fastingWindows).set({ endedAt }).where(and(eq(fastingWindows.id, id), eq(fastingWindows.userId, req.session.userId!), isNull(fastingWindows.endedAt), lte(fastingWindows.startedAt, endedAt))).returning();
    return window ? res.json({ window }) : res.status(404).json({ error: "Active fasting window not found." });
  });

  app.patch("/api/health-fitness/fasting/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const parsed = fastingUpdateSchema.safeParse(req.body);
    if (!Number.isInteger(id) || !parsed.success) return res.status(400).json({ error: "Invalid fasting window.", details: parsed.success ? undefined : parsed.error.flatten() });
    const startedAt = new Date(parsed.data.startedAt);
    const timeContext = requestTimeContext(req, startedAt);
    const [window] = await db.update(fastingWindows).set({
      startedAt, endedAt: parsed.data.endedAt ? new Date(parsed.data.endedAt) : null, note: parsed.data.note || null,
      recordedTimeZone: timeContext.timeZone, recordedUtcOffsetMinutes: timeContext.utcOffsetMinutes,
    }).where(and(eq(fastingWindows.id, id), eq(fastingWindows.userId, req.session.userId!))).returning();
    return window ? res.json({ window }) : res.status(404).json({ error: "Fasting window not found." });
  });

  app.delete("/api/health-fitness/fasting/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid fasting window." });
    const [window] = await db.delete(fastingWindows).where(and(eq(fastingWindows.id, id), eq(fastingWindows.userId, req.session.userId!))).returning({ id: fastingWindows.id });
    return window ? res.status(204).send() : res.status(404).json({ error: "Fasting window not found." });
  });

  app.get("/api/health-fitness/summary", isAuthenticated, async (req: Request, res: Response) => {
    const { timeZone } = requestTimeContext(req);
    const date = localDate(req.query.date) || dateInTimeZone(new Date(), timeZone);
    const { start, end } = dayBounds(date, timeZone);
    const userId = req.session.userId!;
    const [hydration, targets, measurements] = await Promise.all([
      db.select({ total: sum(hydrationEntries.volumeMl) }).from(hydrationEntries).where(and(eq(hydrationEntries.userId, userId), gte(hydrationEntries.occurredAt, start), lt(hydrationEntries.occurredAt, end))),
      db.select().from(healthTargets).where(and(eq(healthTargets.userId, userId), lte(healthTargets.effectiveFrom, date))).orderBy(desc(healthTargets.effectiveFrom)),
      db.select().from(bodyMeasurements).where(and(eq(bodyMeasurements.userId, userId), eq(bodyMeasurements.metric, "weight"))).orderBy(desc(bodyMeasurements.observedAt), desc(bodyMeasurements.createdAt)).limit(1),
    ]);
    const hydrationTarget = targets.find((target) => target.kind === "hydration" && (!target.effectiveTo || target.effectiveTo >= date));
    return res.json(healthDaySummary({ date, hydrationMl: Number(hydration[0]?.total || 0), hydrationTargetMl: hydrationTarget?.unit === "ml" ? hydrationTarget.targetValue : null, latestWeight: measurements[0] ? { value: measurements[0].value, unit: measurements[0].unit, observedAt: measurements[0].observedAt } : null }));
  });

  app.get("/api/health-fitness/capability-coverage", isAuthenticated, async (req: Request, res: Response) => {
    const requestedDays = Number(req.query.days || 30);
    if (!Number.isInteger(requestedDays) || requestedDays < 7 || requestedDays > 365) return res.status(400).json({ error: "Capability evidence periods must be between 7 and 365 whole days." });
    const days = requestedDays;
    const { timeZone } = requestTimeContext(req);
    const endDate = dateInTimeZone(new Date(), timeZone);
    const startDay = new Date(`${endDate}T00:00:00.000Z`); startDay.setUTCDate(startDay.getUTCDate() - (days - 1));
    const startDate = startDay.toISOString().slice(0, 10);
    const { start } = dayBounds(startDate, timeZone);
    const { end } = dayBounds(endDate, timeZone);
    const userId = req.session.userId!;
    const [trainingSets, recovery, observations, measurements] = await Promise.all([
      db.select({ loadValue: workoutSets.loadValue, distanceMeters: workoutSets.distanceMeters, durationSeconds: workoutSets.durationSeconds, occurredAt: workouts.occurredAt, source: workouts.source }).from(workoutSets)
        .innerJoin(workoutExercises, eq(workoutSets.workoutExerciseId, workoutExercises.id))
        .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
        .where(and(eq(workouts.userId, userId), eq(workoutSets.completed, true), gte(workouts.occurredAt, start), lt(workouts.occurredAt, end))),
      db.select({ activityType: recoveryActivities.activityType, occurredAt: recoveryActivities.occurredAt, source: recoveryActivities.source }).from(recoveryActivities).where(and(eq(recoveryActivities.userId, userId), gte(recoveryActivities.occurredAt, start), lt(recoveryActivities.occurredAt, end))),
      db.select({ category: healthObservations.category, observedAt: healthObservations.observedAt, source: healthObservations.source, method: healthObservations.method, methodVersion: healthObservations.methodVersion, metricDefinitionId: healthObservations.metricDefinitionId }).from(healthObservations).where(and(eq(healthObservations.userId, userId), gte(healthObservations.observedAt, start), lt(healthObservations.observedAt, end))),
      db.select({ observedAt: bodyMeasurements.observedAt, source: bodyMeasurements.source, measurementMethod: bodyMeasurements.measurementMethod, measurementProtocol: bodyMeasurements.measurementProtocol }).from(bodyMeasurements).where(and(eq(bodyMeasurements.userId, userId), gte(bodyMeasurements.observedAt, startDate), lte(bodyMeasurements.observedAt, endDate))),
    ]);
    const observationCount = (category: string) => observations.filter((observation) => observation.category === category).length;
    const recoveryCount = (...types: string[]) => recovery.filter((activity) => types.includes(activity.activityType)).length;
    const trainingCount = (predicate: (setRecord: typeof trainingSets[number]) => boolean) => trainingSets.filter(predicate).length;
    const trainingEvidence = (predicate: (setRecord: typeof trainingSets[number]) => boolean): EvidenceDocumentationRecord[] => trainingSets.filter(predicate).map((setRecord) => ({ recordedDate: dateInTimeZone(setRecord.occurredAt, timeZone), sourceDocumented: Boolean(setRecord.source?.trim()) }));
    const recoveryEvidence = (...types: string[]): EvidenceDocumentationRecord[] => recovery.filter((activity) => !types.length || types.includes(activity.activityType)).map((activity) => ({ recordedDate: dateInTimeZone(activity.occurredAt, timeZone), sourceDocumented: Boolean(activity.source?.trim()) }));
    const observationEvidence = (category: string): EvidenceDocumentationRecord[] => observations.filter((observation) => observation.category === category).map((observation) => ({ recordedDate: dateInTimeZone(observation.observedAt, timeZone), sourceDocumented: Boolean(observation.source?.trim()), methodDocumented: Boolean((observation.method?.trim() && observation.methodVersion?.trim()) || observation.metricDefinitionId) }));
    const measurementEvidence: EvidenceDocumentationRecord[] = measurements.map((measurement) => ({ recordedDate: measurement.observedAt, sourceDocumented: Boolean(measurement.source?.trim()), methodDocumented: measurement.measurementMethod !== "unspecified" || Boolean(measurement.measurementProtocol?.trim()) }));
    const combineEvidence = (...sets: EvidenceDocumentationRecord[][]) => sets.flat();
    const domains = [
      { key: "strength", label: "Strength", records: trainingCount((setRecord) => setRecord.loadValue != null), evidenceRecords: trainingEvidence((setRecord) => setRecord.loadValue != null), basis: "Completed loaded training sets", inputs: ["Completed atomic workout sets", "Recorded set load", "Workout occurrence date"], method: "Counts completed set records that contain a load inside the selected local-date window.", limitations: "Record presence does not establish maximal strength, technique, force, progress, or competence." },
      { key: "endurance", label: "Endurance", records: trainingCount((setRecord) => setRecord.distanceMeters != null || setRecord.durationSeconds != null), evidenceRecords: trainingEvidence((setRecord) => setRecord.distanceMeters != null || setRecord.durationSeconds != null), basis: "Completed distance or duration training sets", inputs: ["Completed atomic workout sets", "Recorded set distance or duration", "Workout occurrence date"], method: "Counts completed set records that contain distance or duration inside the selected local-date window.", limitations: "Record presence does not establish endurance capacity, pace quality, fatigue, or improvement." },
      { key: "cardiovascular", label: "Cardiovascular", records: observationCount("cardiovascular"), evidenceRecords: observationEvidence("cardiovascular"), basis: "Recorded cardiovascular observations", inputs: ["Observation category", "Observation timestamp"], method: "Counts private observation-ledger rows categorized as cardiovascular inside the selected local-date window.", limitations: "Different metrics, units, devices, and methods remain separate; presence is not cardiovascular status." },
      { key: "flexibility", label: "Flexibility", records: observationCount("flexibility") + recoveryCount("yoga", "stretching"), evidenceRecords: combineEvidence(observationEvidence("flexibility"), recoveryEvidence("yoga", "stretching")), basis: "Recorded flexibility observations or selected practices", inputs: ["Flexibility-category observations", "Yoga or stretching activity records", "Event timestamp"], method: "Adds record counts from the named inputs inside the selected local-date window without weighting or scoring them.", limitations: "Practice records and heterogeneous observations do not prove range of motion, quality, or adaptation." },
      { key: "mobility", label: "Mobility", records: observationCount("mobility") + recoveryCount("mobility", "yoga"), evidenceRecords: combineEvidence(observationEvidence("mobility"), recoveryEvidence("mobility", "yoga")), basis: "Recorded mobility observations or selected practices", inputs: ["Mobility-category observations", "Mobility or yoga activity records", "Event timestamp"], method: "Adds record counts from the named inputs inside the selected local-date window without weighting or scoring them.", limitations: "Practice records and heterogeneous observations do not prove usable range, movement quality, or adaptation." },
      { key: "recovery", label: "Recovery", records: recovery.length + observationCount("recovery"), evidenceRecords: combineEvidence(recoveryEvidence(), observationEvidence("recovery")), basis: "Recorded recovery activities or observations", inputs: ["Recovery activity records", "Recovery-category observations", "Event timestamp"], method: "Adds all recorded recovery activities and recovery-category observations inside the selected local-date window.", limitations: "This shows tracking coverage only and does not infer efficacy, readiness, restoration, or treatment effect." },
      { key: "body_composition", label: "Body composition", records: measurements.length + observationCount("body_composition"), evidenceRecords: combineEvidence(measurementEvidence, observationEvidence("body_composition")), basis: "Recorded body measurements or observations", inputs: ["Body measurement records", "Body-composition-category observations", "Observation date or timestamp"], method: "Adds body measurement and body-composition observation record counts inside the selected local-date window.", limitations: "Methods and metrics may differ; counts do not estimate body composition or make a health judgment." },
      { key: "longevity", label: "Longevity", records: 0, evidenceRecords: [], basis: "No universal longevity metric is defined or inferred by LyfeOS", inputs: [], method: "No calculation is performed.", limitations: "LyfeOS does not infer lifespan, biological age, healthspan, or longevity from other records." },
    ].map(({ evidenceRecords, ...domain }) => ({ ...domain, coverage: domain.records > 0 ? "recorded" : "not_recorded", documentation: assessEvidenceDocumentation(days, evidenceRecords) }));
    return res.json({ days, period: { startDate, endDate, timeZone }, domains, disclosure: "Coverage counts record presence only. Record-documentation confidence weights date coverage, source provenance, and applicable method metadata; it does not validate the source value and does not measure competence, health, readiness, longevity, or causal effects. It also does not establish progress." });
  });
}
