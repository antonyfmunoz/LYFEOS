import type { Express, Request, Response } from "express";
import { createHash } from "node:crypto";
import { and, desc, eq, gte, lt, lte, sql } from "drizzle-orm";
import { z } from "zod";
import {
  bodyMeasurements, healthAiDrafts, healthAiRequests, healthConnections, healthDataRightsAudit, healthInsightInterpretations, healthMetricPanels, healthObservationCalculationPreferences, healthObservations, healthPlanningDraftEvents, healthPlanningDrafts, healthPracticeReviews, healthProfiles, healthSyncCursors, hydrationEntries,
  nutritionDiaryEntries, quests, recoveryActivities, sleepSessions, userActivityEvents, userDailyLogs, workouts,
} from "@shared/schema";
import { db } from "../db";
import { sleepDurationMinutes } from "../health-fitness";
import { aggregateDailyValues, aggregateObservationDailyValues, associationFromDailySeries, comparisonCsv, healthSeriesCoverage, rollingAverage, type HealthObservationAggregationKind, type HealthSeriesPoint } from "../health-insights";
import { isAuthenticated } from "./middleware";
import { getHealthProgressionSummary, reconcileHealthProgression } from "../health-progression";
import { dateInTimeZone, dayBounds, requestTimeContext } from "../health-fitness";
import { prepareMissionCreation } from "../mission-lifecycle";
import { nutrientDefinitions, nutrientKeys } from "../nutrition";
import { parseExpectedResourceRevision } from "../revision-concurrency";
import { generateHealthAssistance, healthAssistantBoundary } from "../health-assistant";
import { HYPOTHESIS_CONSENT_VERSION } from "@shared/hypotheses";

const insightQuery = z.object({
  left: z.string().min(1).max(300), right: z.string().min(1).max(300).optional(),
  days: z.coerce.number().int().min(7).max(3650).default(30), format: z.enum(["json", "csv"]).default("json"),
});
const associationInput = z.object({ left: z.string().min(1).max(300), right: z.string().min(1).max(300), days: z.number().int().min(7).max(3650), lagDays: z.number().int().min(-30).max(30).default(0), confirmed: z.literal(true) });
const insightInterpretationInput = associationInput.extend({
  interpretation: z.enum(["worth_revisiting", "needs_more_context", "not_meaningful_to_me"]),
  note: z.string().trim().max(2000).nullable().optional(),
  acknowledgedExploratory: z.literal(true),
  clientMutationId: z.string().uuid(),
}).strict();
const preferenceInput = z.object({ aiContextEnabled: z.boolean(), planningContextEnabled: z.boolean() });
const deletionInput = z.object({ confirmation: z.literal("DELETE MY HEALTH DATA") });
const planningDraftInput = z.object({
  title: z.string().trim().min(3).max(180),
  category: z.enum(["health", "fitness", "nutrition", "recovery", "personal"]),
  left: z.string().min(1).max(300), right: z.string().min(1).max(300),
  days: z.number().int().min(7).max(3650), confirmed: z.literal(true),
});
const planningDraftTtlMs = 7 * 24 * 60 * 60 * 1000;
const planningHandoffScope = "mission_title_only";
const metricPanelInput = z.object({
  name: z.string().trim().min(1).max(80),
  seriesIds: z.array(z.string().min(1).max(300)).min(2).max(4),
  periodDays: z.union([z.literal(30), z.literal(90), z.literal(365), z.literal(730), z.literal(3650)]),
  rollingAverage: z.boolean().default(false),
}).superRefine((input, context) => {
  if (new Set(input.seriesIds).size !== input.seriesIds.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "Choose different series for each panel position." });
  if (input.seriesIds.some((seriesId) => !parseSeries(seriesId))) context.addIssue({ code: z.ZodIssueCode.custom, message: "A panel contains an unsupported series selector." });
});
const healthReviewDomains = ["nutrition", "training", "recovery", "sleep", "hydration", "body", "metrics", "planning"] as const;
const healthPracticeReviewInput = z.object({
  reviewDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  domains: z.array(z.enum(healthReviewDomains)).min(1).max(8).transform((domains) => Array.from(new Set(domains))),
  reflection: z.string().trim().min(3).max(2000),
  nextExperiment: z.string().trim().max(500).nullable().optional(),
});
const healthPracticeReviewUpdate = healthPracticeReviewInput.omit({ reviewDate: true });
const healthAssistantInput = z.object({
  question: z.string().trim().min(3).max(500),
  seriesIds: z.array(z.string().min(1).max(300)).min(1).max(4),
  days: z.union([z.literal(7), z.literal(30), z.literal(90)]),
  proposeReflection: z.boolean().default(false),
  confirmed: z.literal(true),
}).superRefine((input, context) => {
  if (new Set(input.seriesIds).size !== input.seriesIds.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "Choose each health series only once." });
  if (input.seriesIds.some((seriesId) => !parseSeries(seriesId))) context.addIssue({ code: z.ZodIssueCode.custom, message: "Choose only supported health series." });
});
const healthAiDecisionInput = z.object({ decision: z.enum(["save", "reject"]), confirmed: z.literal(true) });

const fixedSeries = [
  { id: "hydration_ml", label: "Hydration", unit: "ml", aggregation: "sum" as const },
  { id: "recovery_minutes", label: "Recovery activity", unit: "minutes", aggregation: "sum" as const },
  { id: "workout_minutes", label: "Training", unit: "minutes", aggregation: "sum" as const },
  { id: "sleep_minutes", label: "Calculated sleep interval", unit: "minutes", aggregation: "average" as const },
  { id: "sleep_session_minutes", label: "Recorded sleep session", unit: "minutes", aggregation: "sum" as const },
];

const healthDirectTables = [
  "health_profiles", "health_targets", "health_target_revisions", "body_measurements", "health_observation_calculation_preferences", "health_observations", "health_metric_definitions", "health_metric_panels",
  "hydration_entries", "supplement_entries", "supplement_schedules", "supplement_schedule_events", "fasting_windows",
  "recovery_activities", "recovery_routines", "recovery_tag_policies", "sleep_naps", "sleep_sessions", "nutrition_foods", "nutrition_food_portions",
  "nutrition_diary_entries", "nutrition_recipes", "nutrition_recipe_revisions", "nutrition_meal_plans", "health_practice_reviews", "health_insight_interpretations",
  "nutrition_meal_plan_entries", "health_deletion_receipts", "health_data_rights_audit", "health_planning_drafts", "health_planning_draft_events", "health_ai_requests", "health_ai_drafts", "health_progression_events", "health_badge_events", "ingredient_scans",
  "ingredient_scan_items", "ingredient_preference_rules", "exercise_definitions", "workout_programs",
  "workout_program_sessions", "workouts", "workout_revisions", "workout_templates", "workout_template_revisions", "heart_rate_zone_profiles", "workout_heart_rate_samples",
  "health_source_records", "health_source_suppressions", "health_import_failures", "health_import_runs", "health_source_preferences", "health_connection_audits",
] as const;
const healthCountTables = [...healthDirectTables, "health_connections", "health_sync_cursors"] as const;
const healthDeleteOrder = [
  "health_source_records", "health_source_suppressions", "health_import_failures", "health_import_runs", "health_sync_cursors", "health_source_preferences", "health_connection_audits", "health_connections",
  "ingredient_scan_items", "ingredient_scans", "ingredient_preference_rules", "workout_heart_rate_samples", "heart_rate_zone_profiles",
  "workout_program_sessions", "workout_programs", "workout_template_revisions", "workout_templates", "workout_revisions", "workouts",
  "exercise_definitions", "nutrition_meal_plan_entries", "nutrition_meal_plans", "nutrition_diary_entries",
  "nutrition_recipe_revisions", "nutrition_recipes", "nutrition_food_portions", "nutrition_foods", "sleep_naps", "sleep_sessions",
  "health_observation_calculation_preferences", "health_observations", "health_metric_panels", "health_metric_definitions", "recovery_activities", "recovery_routines", "recovery_tag_policies", "fasting_windows",
  "supplement_schedule_events", "supplement_schedules", "supplement_entries", "hydration_entries", "body_measurements",
  "health_planning_draft_events", "health_planning_drafts", "health_ai_drafts", "health_ai_requests", "health_insight_interpretations", "health_practice_reviews", "health_target_revisions", "health_targets", "health_profiles", "health_deletion_receipts", "health_badge_events", "health_progression_events",
] as const;

const healthRetentionBehavior = {
  status: "implementation_behavior_not_approved_policy",
  timedPurgeConfigured: false,
  nativeRecords: "Stored until the user deletes the record, deletes the Health domain, or deletes the account.",
  providerRecords: "Revocation stops authorization but imported records remain until separately deleted.",
  suppressionHashes: "A one-way provider record key remains while the connection exists so a user-deleted record is not re-imported. Full provider, Health-domain, or account deletion removes it.",
  credentialReferences: "LyfeOS stores only an opaque credential reference and clears it on revocation. External vault retention is not asserted here.",
  rightsReceipts: "A minimal Health deletion receipt remains after Health-domain deletion and is removed by account deletion.",
} as const;

type SeriesDescriptor = { id: string; label: string; unit: string; aggregation: HealthObservationAggregationKind; source?: string };
type SeriesQuality = { omittedAmbiguousDates: string[]; disclosure: string };

function dateKey(value: Date | string, timeZone: string): string { return value instanceof Date ? dateInTimeZone(value, timeZone) : String(value).slice(0, 10); }
function dateRange(days: number, timeZone: string) {
  const endDate = dateInTimeZone(new Date(), timeZone);
  const first = new Date(`${endDate}T00:00:00.000Z`); first.setUTCDate(first.getUTCDate() - (days - 1));
  const startDate = first.toISOString().slice(0, 10);
  return { startDate, start: dayBounds(startDate, timeZone).start, endDate, end: dayBounds(endDate, timeZone).end };
}
function dateKeys(startDate: string, days: number): string[] {
  return Array.from({ length: days }, (_, index) => { const date = new Date(`${startDate}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate() + index); return date.toISOString().slice(0, 10); });
}

async function expirePlanningDrafts(userId: number): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    const expired = await tx.update(healthPlanningDrafts).set({ state: "expired", decidedAt: now }).where(and(
      eq(healthPlanningDrafts.userId, userId), eq(healthPlanningDrafts.state, "pending"), lte(healthPlanningDrafts.expiresAt, now),
    )).returning();
    for (const draft of expired) {
      await tx.insert(healthPlanningDraftEvents).values({
        userId, draftId: draft.id, action: "expired", titleSnapshot: draft.title, categorySnapshot: draft.category,
        scopeSnapshot: planningHandoffScope, expiresAtSnapshot: draft.expiresAt,
      }).onConflictDoNothing();
    }
  });
}
function encodedObservationSeries(key: string, unit: string, source: string) { return `observation|${encodeURIComponent(key)}|${encodeURIComponent(unit)}|${encodeURIComponent(source)}`; }
function encodedBodySeries(key: string, unit: string) { return `body|${encodeURIComponent(key)}|${encodeURIComponent(unit)}`; }
function encodedNutritionSeries(key: string) { return `nutrition|${encodeURIComponent(key)}`; }
function parseSeries(id: string): { kind: "fixed"; id: string } | { kind: "observation"; key: string; unit: string; source: string } | { kind: "body"; key: string; unit: string } | { kind: "nutrition"; key: keyof typeof nutrientDefinitions } | null {
  if (fixedSeries.some((item) => item.id === id)) return { kind: "fixed", id };
  const parts = id.split("|");
  try {
    if (parts[0] === "body" && parts.length === 3 && parts[1] && parts[2]) return { kind: "body", key: decodeURIComponent(parts[1]), unit: decodeURIComponent(parts[2]) };
    if (parts[0] === "observation" && parts.length === 4 && parts[1] && parts[2] && parts[3]) return { kind: "observation", key: decodeURIComponent(parts[1]), unit: decodeURIComponent(parts[2]), source: decodeURIComponent(parts[3]) };
    if (parts[0] === "nutrition" && parts.length === 2 && parts[1]) { const key = decodeURIComponent(parts[1]); return key in nutrientDefinitions ? { kind: "nutrition", key: key as keyof typeof nutrientDefinitions } : null; }
  } catch { return null; }
  return null;
}

const completeQuality: SeriesQuality = { omittedAmbiguousDates: [], disclosure: "Daily values use the recorded aggregation method and preserve missing dates." };

async function loadSeries(userId: number, id: string, days: number, timeZone: string): Promise<{ descriptor: SeriesDescriptor; points: HealthSeriesPoint[]; quality: SeriesQuality } | null> {
  const parsed = parseSeries(id);
  if (!parsed) return null;
  const { start, startDate, end, endDate } = dateRange(days, timeZone);
  if (parsed.kind === "fixed") {
    const descriptor = fixedSeries.find((item) => item.id === parsed.id)!;
    if (parsed.id === "hydration_ml") {
      const rows = await db.select({ occurredAt: hydrationEntries.occurredAt, value: hydrationEntries.volumeMl }).from(hydrationEntries).where(and(eq(hydrationEntries.userId, userId), gte(hydrationEntries.occurredAt, start), lt(hydrationEntries.occurredAt, end)));
      return { descriptor, points: aggregateDailyValues(rows.map((row) => ({ date: dateKey(row.occurredAt, timeZone), value: row.value })), descriptor.aggregation), quality: completeQuality };
    }
    if (parsed.id === "recovery_minutes") {
      const rows = await db.select({ occurredAt: recoveryActivities.occurredAt, value: recoveryActivities.durationMinutes }).from(recoveryActivities).where(and(eq(recoveryActivities.userId, userId), gte(recoveryActivities.occurredAt, start), lt(recoveryActivities.occurredAt, end)));
      return { descriptor, points: aggregateDailyValues(rows.flatMap((row) => row.value === null ? [] : [{ date: dateKey(row.occurredAt, timeZone), value: row.value }]), descriptor.aggregation), quality: completeQuality };
    }
    if (parsed.id === "workout_minutes") {
      const rows = await db.select({ occurredAt: workouts.occurredAt, value: workouts.durationMinutes }).from(workouts).where(and(eq(workouts.userId, userId), gte(workouts.occurredAt, start), lt(workouts.occurredAt, end)));
      return { descriptor, points: aggregateDailyValues(rows.flatMap((row) => row.value === null ? [] : [{ date: dateKey(row.occurredAt, timeZone), value: row.value }]), descriptor.aggregation), quality: completeQuality };
    }
    if (parsed.id === "sleep_session_minutes") {
      const rows = await db.select({ startedAt: sleepSessions.startedAt, endedAt: sleepSessions.endedAt, timeZone: sleepSessions.recordedTimeZone }).from(sleepSessions).where(and(eq(sleepSessions.userId, userId), gte(sleepSessions.startedAt, start), lt(sleepSessions.startedAt, end)));
      return { descriptor, points: aggregateDailyValues(rows.map((row) => ({ date: dateInTimeZone(row.startedAt, row.timeZone || "UTC"), value: Math.round((row.endedAt.getTime() - row.startedAt.getTime()) / 60_000) })), descriptor.aggregation), quality: completeQuality };
    }
    const rows = await db.select({ date: userDailyLogs.date, sleepTime: userDailyLogs.sleepTime, wakeTime: userDailyLogs.wakeTime }).from(userDailyLogs).where(and(eq(userDailyLogs.userId, userId), gte(userDailyLogs.date, startDate), lte(userDailyLogs.date, endDate)));
    return { descriptor, points: aggregateDailyValues(rows.flatMap((row) => { const value = sleepDurationMinutes(row.sleepTime, row.wakeTime); return value === null ? [] : [{ date: dateKey(row.date, timeZone), value }]; }), descriptor.aggregation), quality: completeQuality };
  }
  if (parsed.kind === "nutrition") {
    const definition = nutrientDefinitions[parsed.key];
    const rows = await db.select({ occurredAt: nutritionDiaryEntries.occurredAt, servingGrams: nutritionDiaryEntries.servingGrams, nutrientSnapshot: nutritionDiaryEntries.nutrientSnapshot })
      .from(nutritionDiaryEntries).where(and(eq(nutritionDiaryEntries.userId, userId), gte(nutritionDiaryEntries.occurredAt, start), lt(nutritionDiaryEntries.occurredAt, end)));
    const values = rows.flatMap((row) => {
      if (!Array.isArray(row.nutrientSnapshot)) return [];
      const nutrient = row.nutrientSnapshot.find((item) => !!item && typeof item === "object" && (item as { nutrientKey?: unknown }).nutrientKey === parsed.key && (item as { unit?: unknown }).unit === definition.unit) as { amountPer100g?: unknown } | undefined;
      return nutrient && typeof nutrient.amountPer100g === "number" && Number.isFinite(nutrient.amountPer100g)
        ? [{ date: dateKey(row.occurredAt, timeZone), value: nutrient.amountPer100g * row.servingGrams / 100 }]
        : [];
    });
    return {
      descriptor: { id, label: `Nutrition · ${definition.label}`, unit: definition.unit, aggregation: "sum" },
      points: aggregateDailyValues(values, "sum"),
      quality: { omittedAmbiguousDates: [], disclosure: "Daily nutrition totals use immutable diary snapshots with the registry unit. Entries without this nutrient stay unknown and are not counted as zero." },
    };
  }
  if (parsed.kind === "observation") {
    const rows = await db.select({
      observedAt: healthObservations.observedAt, value: healthObservations.value, displayName: healthObservations.displayName,
      temporalType: healthObservations.temporalType, intervalStartAt: healthObservations.intervalStartAt, intervalEndAt: healthObservations.intervalEndAt,
      aggregationKind: healthObservations.aggregationKind, includedInCalculations: healthObservationCalculationPreferences.included,
    }).from(healthObservations).leftJoin(healthObservationCalculationPreferences, and(
      eq(healthObservationCalculationPreferences.observationId, healthObservations.id), eq(healthObservationCalculationPreferences.userId, userId),
    )).where(and(
      eq(healthObservations.userId, userId), eq(healthObservations.metricKey, parsed.key), eq(healthObservations.unit, parsed.unit), eq(healthObservations.source, parsed.source), gte(healthObservations.observedAt, start), lt(healthObservations.observedAt, end),
    ));
    const label = rows[0]?.displayName || parsed.key.replaceAll("_", " ");
    const includedRows = rows.filter((row) => row.includedInCalculations !== false);
    const excludedCount = rows.length - includedRows.length;
    const modes = Array.from(new Set(includedRows.map((row) => row.aggregationKind).filter((mode): mode is HealthObservationAggregationKind => mode === "sum" || mode === "average" || mode === "latest")));
    if (modes.length > 1) return {
      descriptor: { id, label: `${label} · ${parsed.source.replaceAll("_", " ")}`, unit: parsed.unit, aggregation: "average", source: parsed.source },
      points: [],
      quality: { omittedAmbiguousDates: Array.from(new Set(includedRows.map((row) => dateKey(row.observedAt, timeZone)))).sort(), disclosure: `This series contains mixed aggregation semantics and is withheld rather than combined.${excludedCount ? ` ${excludedCount} user-excluded record${excludedCount === 1 ? " is" : "s are"} omitted from calculations.` : ""}` },
    };
    const aggregation = modes[0] || "average";
    const aggregated = aggregateObservationDailyValues(includedRows.map((row) => ({
      date: dateKey(row.observedAt, timeZone), value: row.value, observedAt: row.observedAt, temporalType: row.temporalType,
      intervalStartAt: row.intervalStartAt, intervalEndAt: row.intervalEndAt,
      intervalStartDate: row.intervalStartAt ? dateKey(row.intervalStartAt, timeZone) : null,
      intervalEndDate: row.intervalEndAt ? dateKey(row.intervalEndAt, timeZone) : null,
    })), aggregation);
    return {
      descriptor: { id, label: `${label} · ${parsed.source.replaceAll("_", " ")}`, unit: parsed.unit, aggregation, source: parsed.source },
      points: aggregated.points,
      quality: { omittedAmbiguousDates: aggregated.omittedAmbiguousDates, disclosure: `${aggregated.disclosure}${excludedCount ? ` ${excludedCount} user-excluded record${excludedCount === 1 ? " is" : "s are"} omitted from calculations.` : ""}` },
    };
  }
  const rows = await db.select({ observedAt: bodyMeasurements.observedAt, value: bodyMeasurements.value }).from(bodyMeasurements).where(and(
    eq(bodyMeasurements.userId, userId), eq(bodyMeasurements.metric, parsed.key), eq(bodyMeasurements.unit, parsed.unit), gte(bodyMeasurements.observedAt, startDate), lte(bodyMeasurements.observedAt, endDate),
  ));
  return { descriptor: { id, label: parsed.key.replaceAll("_", " "), unit: parsed.unit, aggregation: "average" }, points: aggregateDailyValues(rows.map((row) => ({ date: dateKey(row.observedAt, timeZone), value: row.value })), "average"), quality: completeQuality };
}

async function associationBundle(userId: number, input: { left: string; right: string; days: number; lagDays: number }, timeZone: string) {
  const [left, right] = await Promise.all([loadSeries(userId, input.left, input.days, timeZone), loadSeries(userId, input.right, input.days, timeZone)]);
  if (!left || !right) return null;
  const lagAlignment = input.lagDays === 0
    ? "The two series are aligned on the same local-calendar day."
    : input.lagDays > 0
      ? `The second series is aligned ${input.lagDays} day${input.lagDays === 1 ? "" : "s"} after the first series.`
      : `The first series is aligned ${Math.abs(input.lagDays)} day${input.lagDays === -1 ? "" : "s"} after the second series.`;
  return {
    left: left.descriptor,
    right: right.descriptor,
    result: associationFromDailySeries(left.points, right.points, input.days, input.lagDays),
    lagDays: input.lagDays,
    lagAlignment,
    leftQuality: { ...left.quality, coverage: healthSeriesCoverage(left.points, left.quality.omittedAmbiguousDates, input.days) },
    rightQuality: { ...right.quality, coverage: healthSeriesCoverage(right.points, right.quality.omittedAmbiguousDates, input.days) },
    limitations: {
      adjustmentMethod: "none" as const,
      multipleLagSearchPerformed: false as const,
      missingValuesImputed: false as const,
      unadjustedFactors: ["schedule and day-of-week changes", "travel, illness, medication, and environmental changes", "device, source, or measurement-method changes", "unrecorded behavior and non-random missing data"],
      disclosure: "LyfeOS did not adjust this calculation for these or other possible confounders. The list is illustrative, not a claim that any factor occurred.",
    },
    requestedByUser: true as const,
    timeZone,
  };
}

function interpretationPayloadHash(input: z.infer<typeof insightInterpretationInput>): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

async function rowsForUser(table: string, userId: number): Promise<unknown[]> {
  const result = await db.execute(sql`SELECT * FROM ${sql.identifier(table)} WHERE "user_id" = ${userId}`);
  return (result as { rows?: unknown[] }).rows || [];
}
async function healthCounts(userId: number, tables: readonly string[] = healthDirectTables): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  await Promise.all(tables.map(async (table) => {
    const result = await db.execute(sql`SELECT COUNT(*)::integer AS "count" FROM ${sql.identifier(table)} WHERE "user_id" = ${userId}`);
    counts[table] = Number((result as unknown as { rows?: Array<{ count: number }> }).rows?.[0]?.count || 0);
  }));
  return counts;
}

export function registerHealthInsightRoutes(app: Express): void {
  app.get("/api/health-practice-reviews", isAuthenticated, async (req: Request, res: Response) => {
    const reviews = await db.select().from(healthPracticeReviews).where(eq(healthPracticeReviews.userId, req.session.userId!)).orderBy(desc(healthPracticeReviews.reviewDate), desc(healthPracticeReviews.id)).limit(100);
    return res.json({ reviews, disclosure: "These are private, user-authored reflections on recorded practice. They do not verify an activity, health outcome, or clinical conclusion." });
  });

  app.post("/api/health-practice-reviews", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = healthPracticeReviewInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid health practice review.", details: parsed.error.flatten() });
    const { timeZone } = requestTimeContext(req);
    if (parsed.data.reviewDate > dateInTimeZone(new Date(), timeZone)) return res.status(400).json({ error: "A practice review cannot be dated in the future." });
    try {
      const [review] = await db.insert(healthPracticeReviews).values({ userId: req.session.userId!, ...parsed.data, nextExperiment: parsed.data.nextExperiment || null }).returning();
      return res.status(201).json({ review });
    } catch (error) {
      const [existing] = await db.select({ id: healthPracticeReviews.id }).from(healthPracticeReviews).where(and(eq(healthPracticeReviews.userId, req.session.userId!), eq(healthPracticeReviews.reviewDate, parsed.data.reviewDate))).limit(1);
      if (existing) return res.status(409).json({ error: "A practice review already exists for this date. Open it before making a correction.", reviewId: existing.id });
      throw error;
    }
  });

  app.patch("/api/health-practice-reviews/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const expectedRevision = parseExpectedResourceRevision(req.header("x-lyfeos-expected-revision"));
    const parsed = healthPracticeReviewUpdate.safeParse(req.body);
    if (!Number.isInteger(id) || !parsed.success || (!expectedRevision.ok && expectedRevision.reason === "invalid")) return res.status(400).json({ error: "Invalid health practice review.", details: parsed.success ? undefined : parsed.error.flatten() });
    if (!expectedRevision.ok) return res.status(428).json({ error: "Reload this practice review before saving a correction." });
    const outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM health_practice_reviews WHERE id = ${id} AND user_id = ${req.session.userId!} FOR UPDATE`);
      const [current] = await tx.select().from(healthPracticeReviews).where(and(eq(healthPracticeReviews.id, id), eq(healthPracticeReviews.userId, req.session.userId!))).limit(1);
      if (!current) return { kind: "missing" as const };
      if (current.revision !== expectedRevision.revision) return { kind: "conflict" as const, currentRevision: current.revision };
      const [review] = await tx.update(healthPracticeReviews).set({ ...parsed.data, nextExperiment: parsed.data.nextExperiment || null, revision: current.revision + 1, updatedAt: new Date() }).where(and(eq(healthPracticeReviews.id, id), eq(healthPracticeReviews.userId, req.session.userId!))).returning();
      return { kind: "updated" as const, review };
    });
    if (outcome.kind === "missing") return res.status(404).json({ error: "Health practice review not found." });
    if (outcome.kind === "conflict") return res.status(409).json({ error: "This review changed after you opened it. Your correction was not applied.", currentRevision: outcome.currentRevision });
    return res.json({ review: outcome.review });
  });

  app.delete("/api/health-practice-reviews/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const expectedRevision = parseExpectedResourceRevision(req.header("x-lyfeos-expected-revision"));
    if (!Number.isInteger(id) || (!expectedRevision.ok && expectedRevision.reason === "invalid")) return res.status(400).json({ error: "Invalid health practice review." });
    if (!expectedRevision.ok) return res.status(428).json({ error: "Reload this practice review before deleting it." });
    const outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM health_practice_reviews WHERE id = ${id} AND user_id = ${req.session.userId!} FOR UPDATE`);
      const [current] = await tx.select().from(healthPracticeReviews).where(and(eq(healthPracticeReviews.id, id), eq(healthPracticeReviews.userId, req.session.userId!))).limit(1);
      if (!current) return { kind: "missing" as const };
      if (current.revision !== expectedRevision.revision) return { kind: "conflict" as const, currentRevision: current.revision };
      await tx.delete(healthPracticeReviews).where(and(eq(healthPracticeReviews.id, id), eq(healthPracticeReviews.userId, req.session.userId!)));
      return { kind: "deleted" as const };
    });
    if (outcome.kind === "missing") return res.status(404).json({ error: "Health practice review not found." });
    if (outcome.kind === "conflict") return res.status(409).json({ error: "This review changed after you opened it. It was not deleted.", currentRevision: outcome.currentRevision });
    return res.status(204).send();
  });

  app.get("/api/health-progression", isAuthenticated, async (req: Request, res: Response) => {
    return res.json({ progression: await getHealthProgressionSummary(req.session.userId!) });
  });

  app.post("/api/health-progression/reconcile", isAuthenticated, async (req: Request, res: Response) => {
    return res.json({ progression: await reconcileHealthProgression(req.session.userId!) });
  });

  app.get("/api/health-assistant/drafts", isAuthenticated, async (req: Request, res: Response) => {
    const drafts = await db.select().from(healthAiDrafts).where(eq(healthAiDrafts.userId, req.session.userId!)).orderBy(desc(healthAiDrafts.createdAt)).limit(50);
    return res.json({ drafts, disclosure: "These are optional assistant-generated reflection drafts. Saved does not mean verified, clinician-reviewed, or included in Health XP." });
  });

  app.post("/api/health-assistant/explain", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = healthAssistantInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Choose valid private records and confirm this one-time AI request.", details: parsed.error.flatten() });
    const userId = req.session.userId!;
    const [profile] = await db.select({ aiContextEnabled: healthProfiles.aiContextEnabled }).from(healthProfiles).where(eq(healthProfiles.userId, userId)).limit(1);
    if (!profile?.aiContextEnabled) return res.status(403).json({ error: "Enable private Health AI context in Health data controls before sending selected records." });
    const oneMinuteAgo = new Date(Date.now() - 60_000);
    const [recent] = await db.select({ count: sql<number>`count(*)::integer` }).from(healthAiRequests).where(and(eq(healthAiRequests.userId, userId), gte(healthAiRequests.createdAt, oneMinuteAgo)));
    if (Number(recent?.count || 0) >= 6) return res.status(429).json({ error: "Health assistant request limit reached. Try again in a minute." });
    const boundary = healthAssistantBoundary(parsed.data.question);
    if (boundary) {
      const [request] = await db.insert(healthAiRequests).values({ userId, seriesIds: parsed.data.seriesIds, periodDays: parsed.data.days, sourceSummary: [], state: "blocked", boundaryKind: boundary.kind, completedAt: new Date() }).returning({ id: healthAiRequests.id });
      return res.json({ status: "blocked", requestId: request.id, boundary, citations: [], disclosure: "No selected health values were sent to an AI provider." });
    }
    const { timeZone } = requestTimeContext(req);
    const loaded = await Promise.all(parsed.data.seriesIds.map((seriesId) => loadSeries(userId, seriesId, parsed.data.days, timeZone)));
    if (loaded.some((series) => !series)) return res.status(400).json({ error: "One selected series is no longer available. Reload the choices and try again." });
    const sources = loaded.map((series, index) => ({
      id: `S${index + 1}`,
      seriesId: parsed.data.seriesIds[index],
      label: series!.descriptor.label,
      unit: series!.descriptor.unit,
      points: series!.points,
      quality: series!.quality,
    }));
    const sourceSummary = sources.map((source) => ({ id: source.id, seriesId: source.seriesId, label: source.label, unit: source.unit, recordedDays: source.points.length, withheldDays: source.quality.omittedAmbiguousDates.length }));
    const [request] = await db.insert(healthAiRequests).values({ userId, seriesIds: parsed.data.seriesIds, periodDays: parsed.data.days, sourceSummary, state: "started" }).returning();
    try {
      const generated = await generateHealthAssistance({
        question: parsed.data.question,
        sources: sources.map((source) => ({ id: source.id, label: source.label, unit: source.unit, points: source.points })),
        proposeReflection: parsed.data.proposeReflection,
      });
      const draft = generated.output.proposedReflection ? (await db.insert(healthAiDrafts).values({
        userId, requestId: request.id, title: generated.output.proposedReflection.title,
        reflection: generated.output.proposedReflection.reflection, domains: Array.from(new Set(generated.output.proposedReflection.domains)),
        nextExperiment: generated.output.proposedReflection.nextExperiment,
      }).returning())[0] : null;
      await db.update(healthAiRequests).set({ state: "succeeded", provider: generated.provider, model: generated.model, completedAt: new Date() }).where(and(eq(healthAiRequests.id, request.id), eq(healthAiRequests.userId, userId)));
      return res.json({
        status: "available", requestId: request.id, summary: generated.output.summary, observations: generated.output.observations,
        citations: sourceSummary.map((source) => ({ ...source, periodDays: parsed.data.days, timeZone })), draft,
        disclosure: "This optional explanation used only the selected private daily records. It is not diagnosis, treatment, medical advice, causal analysis, readiness scoring, or validation of source accuracy. No automatic action was taken.",
      });
    } catch (error) {
      await db.update(healthAiRequests).set({ state: "failed", completedAt: new Date() }).where(and(eq(healthAiRequests.id, request.id), eq(healthAiRequests.userId, userId)));
      if (error instanceof Error && error.message === "HEALTH_AI_PROVIDER_UNAVAILABLE") return res.status(503).json({ error: "The private Health AI provider is not configured. No assistant explanation was generated." });
      return res.status(502).json({ error: "The Health assistant did not return a valid bounded response. No draft or action was created." });
    }
  });

  app.post("/api/health-assistant/drafts/:id/decision", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const parsed = healthAiDecisionInput.safeParse(req.body);
    if (!Number.isInteger(id) || !parsed.success) return res.status(400).json({ error: "Choose a valid assistant draft decision." });
    const userId = req.session.userId!;
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM health_ai_drafts WHERE id = ${id} AND user_id = ${userId} FOR UPDATE`);
      const [draft] = await tx.select().from(healthAiDrafts).where(and(eq(healthAiDrafts.id, id), eq(healthAiDrafts.userId, userId))).limit(1);
      if (!draft) return { kind: "missing" as const };
      if (draft.state !== "pending") return { kind: "decided" as const, state: draft.state };
      const state = parsed.data.decision === "save" ? "saved" : "rejected";
      const [updated] = await tx.update(healthAiDrafts).set({ state, decidedAt: new Date() }).where(and(eq(healthAiDrafts.id, id), eq(healthAiDrafts.userId, userId), eq(healthAiDrafts.state, "pending"))).returning();
      return { kind: "updated" as const, draft: updated };
    });
    if (result.kind === "missing") return res.status(404).json({ error: "Assistant reflection draft not found." });
    if (result.kind === "decided") return res.status(409).json({ error: "This assistant draft was already decided.", state: result.state });
    return res.json({ draft: result.draft, disclosure: result.draft.state === "saved" ? "Saved as an assistant-generated reflection only; it is not a verified health fact and earns no Health XP." : "Rejected; no health record or action was created." });
  });

  app.get("/api/health-insights/series-options", isAuthenticated, async (req: Request, res: Response) => {
    const userId = req.session.userId!;
    const [observations, measurements] = await Promise.all([
      db.select({ metricKey: healthObservations.metricKey, displayName: healthObservations.displayName, unit: healthObservations.unit, source: healthObservations.source, aggregationKind: healthObservations.aggregationKind }).from(healthObservations).where(eq(healthObservations.userId, userId)),
      db.select({ metric: bodyMeasurements.metric, unit: bodyMeasurements.unit }).from(bodyMeasurements).where(eq(bodyMeasurements.userId, userId)),
    ]);
    const options: SeriesDescriptor[] = [...fixedSeries, ...nutrientKeys.map((key): SeriesDescriptor => ({ id: encodedNutritionSeries(key), label: `Nutrition · ${nutrientDefinitions[key].label}`, unit: nutrientDefinitions[key].unit, aggregation: "sum" }))];
    const seen = new Set(options.map((option) => option.id));
    for (const item of observations) {
      const id = encodedObservationSeries(item.metricKey, item.unit, item.source);
      const aggregation = item.aggregationKind === "sum" || item.aggregationKind === "latest" ? item.aggregationKind : "average";
      if (!seen.has(id)) { options.push({ id, label: `${item.displayName} · ${item.source.replaceAll("_", " ")}`, unit: item.unit, aggregation }); seen.add(id); }
    }
    for (const item of measurements) {
      const id = encodedBodySeries(item.metric, item.unit);
      if (!seen.has(id)) { options.push({ id, label: item.metric.replaceAll("_", " "), unit: item.unit, aggregation: "average" }); seen.add(id); }
    }
    return res.json({ options, disclosure: "Only private, owner-scoped series are available. Observation sources stay separate, and missing dates remain missing rather than becoming zero." });
  });

  app.get("/api/health-insights/panels", isAuthenticated, async (req: Request, res: Response) => {
    const panels = await db.select().from(healthMetricPanels)
      .where(eq(healthMetricPanels.userId, req.session.userId!))
      .orderBy(desc(healthMetricPanels.updatedAt));
    return res.json({ panels, disclosure: "Panels save private series selectors and display choices only. Values are resolved from the current ledgers when opened." });
  });

  app.post("/api/health-insights/panels", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = metricPanelInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid metric panel.", details: parsed.error.flatten() });
    const [leftSeriesId, rightSeriesId] = parsed.data.seriesIds;
    const [panel] = await db.insert(healthMetricPanels).values({ userId: req.session.userId!, ...parsed.data, leftSeriesId, rightSeriesId }).onConflictDoUpdate({
      target: [healthMetricPanels.userId, healthMetricPanels.name],
      set: { leftSeriesId, rightSeriesId, seriesIds: parsed.data.seriesIds, periodDays: parsed.data.periodDays, rollingAverage: parsed.data.rollingAverage, updatedAt: new Date() },
    }).returning();
    return res.status(201).json({ panel });
  });

  app.get("/api/health-insights/panels/:id/data", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid metric panel." });
    const [panel] = await db.select().from(healthMetricPanels).where(and(eq(healthMetricPanels.id, id), eq(healthMetricPanels.userId, req.session.userId!))).limit(1);
    if (!panel) return res.status(404).json({ error: "Metric panel not found." });
    const stored = Array.isArray(panel.seriesIds) ? panel.seriesIds.filter((value): value is string => typeof value === "string") : [];
    const seriesIds = stored.length >= 2 && stored.length <= 4 ? stored : [panel.leftSeriesId, panel.rightSeriesId];
    if (new Set(seriesIds).size !== seriesIds.length || seriesIds.some((seriesId) => !parseSeries(seriesId))) return res.status(409).json({ error: "This saved panel contains unsupported or duplicate selectors." });
    const { timeZone } = requestTimeContext(req);
    const loaded = await Promise.all(seriesIds.map((seriesId) => loadSeries(req.session.userId!, seriesId, panel.periodDays, timeZone)));
    if (loaded.some((series) => !series)) return res.status(409).json({ error: "A saved panel series is no longer available." });
    const { startDate } = dateRange(panel.periodDays, timeZone);
    return res.json({
      panel, dates: dateKeys(startDate, panel.periodDays), timeZone,
      series: loaded.map((series) => ({ ...series!.descriptor, points: rollingAverage(series!.points), quality: { ...series!.quality, coverage: healthSeriesCoverage(series!.points, series!.quality.omittedAmbiguousDates, panel.periodDays) } })),
      disclosure: "Each series uses its own unit scale. Missing and withheld dates remain gaps; this panel does not produce a combined score or health conclusion.",
    });
  });

  app.delete("/api/health-insights/panels/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid metric panel." });
    const [panel] = await db.delete(healthMetricPanels).where(and(eq(healthMetricPanels.id, id), eq(healthMetricPanels.userId, req.session.userId!))).returning({ id: healthMetricPanels.id });
    return panel ? res.status(204).send() : res.status(404).json({ error: "Metric panel not found." });
  });

  app.get("/api/health-insights/trends", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = insightQuery.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Invalid trend request.", details: parsed.error.flatten() });
    const { timeZone } = requestTimeContext(req);
    const [left, right] = await Promise.all([loadSeries(req.session.userId!, parsed.data.left, parsed.data.days, timeZone), parsed.data.right ? loadSeries(req.session.userId!, parsed.data.right, parsed.data.days, timeZone) : Promise.resolve(null)]);
    if (!left || (parsed.data.right && !right)) return res.status(400).json({ error: "Unknown health series." });
    const { startDate } = dateRange(parsed.data.days, timeZone);
    const dates = dateKeys(startDate, parsed.data.days);
    if (parsed.data.format === "csv") {
      const csv = comparisonCsv({ dates, left: { ...left.descriptor, points: left.points }, right: right ? { ...right.descriptor, points: right.points } : null });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="lyfeos-health-trends-${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.send(csv);
    }
    return res.json({
      days: parsed.data.days, dates, timeZone,
      left: { ...left.descriptor, points: rollingAverage(left.points), quality: { ...left.quality, coverage: healthSeriesCoverage(left.points, left.quality.omittedAmbiguousDates, parsed.data.days) } },
      right: right ? { ...right.descriptor, points: rollingAverage(right.points), quality: { ...right.quality, coverage: healthSeriesCoverage(right.points, right.quality.omittedAmbiguousDates, parsed.data.days) } } : null,
      disclosure: "Charts summarize only recorded values in the selected local-calendar window. Observation sources stay separate. Missing or withheld dates are not zero and no health outcome or cause is inferred.",
    });
  });

  app.post("/api/health-insights/associations", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = associationInput.safeParse(req.body);
    if (!parsed.success || parsed.data.left === parsed.data.right) return res.status(400).json({ error: "Choose two different series and explicitly confirm this private analysis.", details: parsed.success ? undefined : parsed.error.flatten() });
    const { timeZone } = requestTimeContext(req);
    const bundle = await associationBundle(req.session.userId!, parsed.data, timeZone);
    return bundle ? res.json(bundle) : res.status(400).json({ error: "Unknown health series." });
  });

  app.get("/api/health-insights/interpretations", isAuthenticated, async (req: Request, res: Response) => {
    const interpretations = await db.select().from(healthInsightInterpretations)
      .where(eq(healthInsightInterpretations.userId, req.session.userId!))
      .orderBy(desc(healthInsightInterpretations.createdAt), desc(healthInsightInterpretations.id)).limit(50);
    res.setHeader("Cache-Control", "private, no-store");
    return res.json({
      interpretations,
      disclosure: "These are private user-authored interpretations of saved calculation snapshots. They are not verified health facts, causal findings, medical records, or instructions from LyfeOS.",
    });
  });

  app.post("/api/health-insights/interpretations", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = insightInterpretationInput.safeParse(req.body);
    if (!parsed.success || parsed.data.left === parsed.data.right) return res.status(400).json({ error: "Review an available association and explicitly acknowledge its exploratory limits before saving your interpretation.", details: parsed.success ? undefined : parsed.error.flatten() });
    const userId = req.session.userId!;
    const mutationPayloadHash = interpretationPayloadHash(parsed.data);
    const [existing] = await db.select().from(healthInsightInterpretations).where(and(
      eq(healthInsightInterpretations.userId, userId),
      eq(healthInsightInterpretations.clientMutationId, parsed.data.clientMutationId),
    )).limit(1);
    if (existing) {
      return existing.mutationPayloadHash === mutationPayloadHash
        ? res.json({ interpretation: existing, replayed: true })
        : res.status(409).json({ error: "This interpretation identity was already used for different content." });
    }
    const { timeZone } = requestTimeContext(req);
    const bundle = await associationBundle(userId, parsed.data, timeZone);
    if (!bundle) return res.status(400).json({ error: "Unknown health series." });
    if (bundle.result.status !== "available") {
      return res.status(409).json({ error: "There is not enough aligned evidence to save an interpretation snapshot.", reasons: bundle.result.reasons, pairedSamples: bundle.result.pairedSamples, coverage: bundle.result.coverage });
    }
    const { startDate, endDate } = dateRange(parsed.data.days, timeZone);
    const { aligned: _privateAlignedValues, ...safeResult } = bundle.result;
    const [created] = await db.insert(healthInsightInterpretations).values({
      userId,
      leftSeriesId: parsed.data.left,
      leftSeriesLabel: bundle.left.label,
      rightSeriesId: parsed.data.right,
      rightSeriesLabel: bundle.right.label,
      periodDays: parsed.data.days,
      lagDays: parsed.data.lagDays,
      evidenceStart: startDate,
      evidenceEnd: endDate,
      associationSnapshot: {
        result: safeResult,
        leftQuality: bundle.leftQuality,
        rightQuality: bundle.rightQuality,
        limitations: bundle.limitations,
        lagAlignment: bundle.lagAlignment,
        timeZone,
        rawDailyValuesStored: false,
      },
      interpretation: parsed.data.interpretation,
      note: parsed.data.note || null,
      acknowledgedExploratory: true,
      clientMutationId: parsed.data.clientMutationId,
      mutationPayloadHash,
    }).onConflictDoNothing().returning();
    if (created) return res.status(201).json({ interpretation: created, replayed: false });
    const [raced] = await db.select().from(healthInsightInterpretations).where(and(
      eq(healthInsightInterpretations.userId, userId),
      eq(healthInsightInterpretations.clientMutationId, parsed.data.clientMutationId),
    )).limit(1);
    return raced?.mutationPayloadHash === mutationPayloadHash
      ? res.json({ interpretation: raced, replayed: true })
      : res.status(409).json({ error: "This interpretation identity was already used for different content." });
  });

  app.delete("/api/health-insights/interpretations/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid insight interpretation." });
    const [removed] = await db.delete(healthInsightInterpretations).where(and(
      eq(healthInsightInterpretations.id, id),
      eq(healthInsightInterpretations.userId, req.session.userId!),
    )).returning({ id: healthInsightInterpretations.id });
    return removed ? res.status(204).send() : res.status(404).json({ error: "Insight interpretation not found." });
  });

  app.get("/api/health-insights/planning-drafts", isAuthenticated, async (req: Request, res: Response) => {
    await expirePlanningDrafts(req.session.userId!);
    const [drafts, events] = await Promise.all([
      db.select().from(healthPlanningDrafts).where(eq(healthPlanningDrafts.userId, req.session.userId!)).orderBy(desc(healthPlanningDrafts.createdAt)).limit(20),
      db.select().from(healthPlanningDraftEvents).where(eq(healthPlanningDraftEvents.userId, req.session.userId!)).orderBy(desc(healthPlanningDraftEvents.createdAt), desc(healthPlanningDraftEvents.id)).limit(100),
    ]);
    return res.json({ drafts, events, disclosure: "Evidence selectors stay private in Health. A handoff is limited to the reviewed mission title/category, expires after seven days if left pending, and can be revoked after confirmation. Receipts contain no health values or evidence selectors." });
  });

  app.post("/api/health-insights/planning-drafts", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = planningDraftInput.safeParse(req.body);
    if (!parsed.success || parsed.data.left === parsed.data.right) return res.status(400).json({ error: "Choose two different series, review the title, and explicitly confirm the private draft.", details: parsed.success ? undefined : parsed.error.flatten() });
    const userId = req.session.userId!;
    const { timeZone } = requestTimeContext(req);
    const [left, right] = await Promise.all([loadSeries(userId, parsed.data.left, parsed.data.days, timeZone), loadSeries(userId, parsed.data.right, parsed.data.days, timeZone)]);
    if (!left || !right) return res.status(400).json({ error: "Unknown health series." });
    const { startDate } = dateRange(parsed.data.days, timeZone);
    const evidenceEnd = dateInTimeZone(new Date(), timeZone);
    const expiresAt = new Date(Date.now() + planningDraftTtlMs);
    const draft = await db.transaction(async (tx) => {
      const [created] = await tx.insert(healthPlanningDrafts).values({
        userId, title: parsed.data.title, category: parsed.data.category, evidenceStart: startDate, evidenceEnd,
        evidenceSeries: [{ id: left.descriptor.id, label: left.descriptor.label, unit: left.descriptor.unit }, { id: right.descriptor.id, label: right.descriptor.label, unit: right.descriptor.unit }], expiresAt,
      }).returning();
      await tx.insert(healthPlanningDraftEvents).values({ userId, draftId: created.id, action: "created", titleSnapshot: created.title, categorySnapshot: created.category, scopeSnapshot: planningHandoffScope, expiresAtSnapshot: created.expiresAt });
      return created;
    });
    return res.status(201).json({ draft, disclosure: "This private title-only handoff expires after seven days. No mission or external action has occurred." });
  });

  app.post("/api/health-insights/planning-drafts/:id/confirm", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid planning draft." });
    const userId = req.session.userId!;
    await expirePlanningDrafts(userId);
    const [draft] = await db.select().from(healthPlanningDrafts).where(and(
      eq(healthPlanningDrafts.id, id), eq(healthPlanningDrafts.userId, userId),
    )).limit(1);
    if (!draft) return res.status(404).json({ error: "Planning draft not found." });
    if (draft.state === "succeeded" && draft.questId) {
      const [quest] = await db.select().from(quests).where(and(eq(quests.id, draft.questId), eq(quests.userId, userId))).limit(1);
      if (!quest) return res.status(409).json({ error: "This confirmed draft no longer has its linked mission. Review Health integrity before retrying." });
      return res.json({ quest: { id: quest.id, title: quest.title, category: quest.category }, replayed: true, disclosure: "Mission was already created from this draft. No duplicate was created and no health values or evidence references were copied into it." });
    }
    if (draft.state !== "pending") return res.status(409).json({ error: "This planning draft is no longer pending." });
    try {
      const prepared = await prepareMissionCreation({
        userId, title: draft.title, category: draft.category, experienceReward: 25, completed: false,
        description: "Created after you confirmed a private Health planning draft. Health values and evidence references remain in Health.",
      }, { source: "ui" });
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM health_planning_drafts WHERE id = ${id} AND user_id = ${userId} FOR UPDATE`);
        const [current] = await tx.select().from(healthPlanningDrafts).where(and(
          eq(healthPlanningDrafts.id, id), eq(healthPlanningDrafts.userId, userId),
        )).limit(1);
        if (!current) throw new Error("planning_draft_missing");
        if (current.state === "succeeded" && current.questId) {
          const [existing] = await tx.select().from(quests).where(and(eq(quests.id, current.questId), eq(quests.userId, userId))).limit(1);
          if (!existing) throw new Error("planning_draft_mission_missing");
          return { quest: existing, replayed: true };
        }
        if (current.state !== "pending") throw new Error("planning_draft_not_pending");

        const lifecycleKey = `health-planning-draft:${id}`;
        const [existing] = await tx.select().from(quests).where(and(
          eq(quests.userId, userId), eq(quests.lifecycleKey, lifecycleKey),
        )).limit(1);
        const [quest] = existing ? [existing] : await tx.insert(quests).values({ ...prepared, lifecycleKey }).returning();
        if (!existing) {
          await tx.insert(userActivityEvents).values({
            userId, eventType: "mission_created", metadata: { questId: quest.id, title: quest.title, source: "ui", lifecycleKey },
          });
        }
        await tx.update(healthPlanningDrafts).set({ state: "succeeded", questId: quest.id, decidedAt: new Date() }).where(and(
          eq(healthPlanningDrafts.id, id), eq(healthPlanningDrafts.userId, userId),
        ));
        await tx.insert(healthPlanningDraftEvents).values({ userId, draftId: id, action: "confirmed", titleSnapshot: current.title, categorySnapshot: current.category, questIdSnapshot: quest.id, scopeSnapshot: planningHandoffScope, expiresAtSnapshot: current.expiresAt }).onConflictDoNothing();
        return { quest, replayed: Boolean(existing) };
      });
      return res.status(result.replayed ? 200 : 201).json({ quest: { id: result.quest.id, title: result.quest.title, category: result.quest.category }, replayed: result.replayed, disclosure: "Mission created from your confirmed title. No health values or evidence references were copied into it." });
    } catch (error) {
      if (error instanceof Error && error.message === "planning_draft_missing") {
        return res.status(404).json({ error: "Planning draft not found." });
      }
      if (error instanceof Error && ["planning_draft_not_pending", "planning_draft_mission_missing"].includes(error.message)) {
        return res.status(409).json({ error: "This planning draft changed while it was being confirmed. Refresh its current state before trying again." });
      }
      return res.status(500).json({ error: "The mission could not be created. The draft remains pending so a confirmed retry is safe." });
    }
  });

  app.post("/api/health-insights/planning-drafts/:id/reject", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid planning draft." });
    const userId = req.session.userId!;
    const rejected = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM health_planning_drafts WHERE id = ${id} AND user_id = ${userId} FOR UPDATE`);
      const [current] = await tx.select().from(healthPlanningDrafts).where(and(eq(healthPlanningDrafts.id, id), eq(healthPlanningDrafts.userId, userId))).limit(1);
      if (!current || current.state !== "pending") return false;
      await tx.update(healthPlanningDrafts).set({ state: "rejected", decidedAt: new Date() }).where(and(eq(healthPlanningDrafts.id, id), eq(healthPlanningDrafts.userId, userId)));
      await tx.insert(healthPlanningDraftEvents).values({ userId, draftId: id, action: "rejected", titleSnapshot: current.title, categorySnapshot: current.category, scopeSnapshot: planningHandoffScope, expiresAtSnapshot: current.expiresAt }).onConflictDoNothing();
      return true;
    });
    return rejected ? res.json({ state: "rejected", disclosure: "No mission or external action was created. The private decision receipt was retained." }) : res.status(409).json({ error: "This planning draft is no longer pending." });
  });

  app.post("/api/health-insights/planning-drafts/:id/revoke", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid planning draft." });
    const userId = req.session.userId!;
    await expirePlanningDrafts(userId);
    const revoked = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM health_planning_drafts WHERE id = ${id} AND user_id = ${userId} FOR UPDATE`);
      const [current] = await tx.select().from(healthPlanningDrafts).where(and(eq(healthPlanningDrafts.id, id), eq(healthPlanningDrafts.userId, userId))).limit(1);
      if (!current || !["pending", "succeeded"].includes(current.state)) return null;
      await tx.update(healthPlanningDrafts).set({ state: "revoked", decidedAt: new Date() }).where(and(eq(healthPlanningDrafts.id, id), eq(healthPlanningDrafts.userId, userId)));
      await tx.insert(healthPlanningDraftEvents).values({
        userId, draftId: id, action: "revoked", titleSnapshot: current.title, categorySnapshot: current.category,
        questIdSnapshot: current.questId, scopeSnapshot: planningHandoffScope, expiresAtSnapshot: current.expiresAt,
      }).onConflictDoNothing();
      return { questId: current.questId };
    });
    return revoked
      ? res.json({ state: "revoked", questId: revoked.questId, disclosure: revoked.questId ? "The Health handoff consent was revoked. The already-created generic mission remains independently user-owned and still contains no health values or evidence references." : "The pending handoff was revoked. No mission was created." })
      : res.status(409).json({ error: "This planning handoff cannot be revoked from its current state." });
  });

  app.get("/api/health-data/rights", isAuthenticated, async (req: Request, res: Response) => {
    const userId = req.session.userId!;
    const [[profile], providerConnections] = await Promise.all([
      db.select().from(healthProfiles).where(eq(healthProfiles.userId, userId)).limit(1),
      db.select({ id: healthConnections.id, provider: healthConnections.provider, providerName: healthConnections.providerName, status: healthConnections.status, scopes: healthConnections.scopes, lastSyncAt: healthConnections.lastSyncAt, revokedAt: healthConnections.revokedAt }).from(healthConnections).where(eq(healthConnections.userId, userId)),
    ]);
    return res.json({
      preferences: { aiContextEnabled: profile?.aiContextEnabled || false, planningContextEnabled: profile?.planningContextEnabled || false },
      recordCounts: await healthCounts(userId, healthCountTables),
      providerConnections,
      retentionBehavior: healthRetentionBehavior,
      disclosure: "Connection status and consent scopes are visible here; credential references and tokens are never returned. Raw health records are not federated. Daily Wellness records remain governed by full account export/deletion.",
    });
  });

  app.patch("/api/health-data/preferences", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = preferenceInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid health data preferences.", details: parsed.error.flatten() });
    const userId = req.session.userId!;
    const [profile] = await db.insert(healthProfiles).values({ userId, ...parsed.data }).onConflictDoUpdate({ target: healthProfiles.userId, set: { ...parsed.data, updatedAt: new Date() } }).returning();
    await db.insert(healthDataRightsAudit).values({ userId, action: "preferences_updated", scope: "health_context", details: parsed.data });
    return res.json({ preferences: { aiContextEnabled: profile.aiContextEnabled, planningContextEnabled: profile.planningContextEnabled } });
  });

  app.get("/api/health-data/export", isAuthenticated, async (req: Request, res: Response) => {
    const userId = req.session.userId!;
    await db.insert(healthDataRightsAudit).values({ userId, action: "exported", scope: "health_domain", details: { format: "json" } });
    const tables = Object.fromEntries(await Promise.all(healthDirectTables.map(async (table) => [table, await rowsForUser(table, userId)]))) as Record<string, unknown[]>;
    tables.health_connections = await db.select({ id: healthConnections.id, provider: healthConnections.provider, providerName: healthConnections.providerName, status: healthConnections.status, scopes: healthConnections.scopes, consentVersion: healthConnections.consentVersion, consentedAt: healthConnections.consentedAt, lastSyncAt: healthConnections.lastSyncAt, lastErrorCode: healthConnections.lastErrorCode, revokedAt: healthConnections.revokedAt, createdAt: healthConnections.createdAt, updatedAt: healthConnections.updatedAt }).from(healthConnections).where(eq(healthConnections.userId, userId));
    tables.health_sync_cursors = await db.select({ id: healthSyncCursors.id, connectionId: healthSyncCursors.connectionId, resourceType: healthSyncCursors.resourceType, status: healthSyncCursors.status, consecutiveFailures: healthSyncCursors.consecutiveFailures, lastAttemptAt: healthSyncCursors.lastAttemptAt, lastSuccessAt: healthSyncCursors.lastSuccessAt, nextRetryAt: healthSyncCursors.nextRetryAt, updatedAt: healthSyncCursors.updatedAt }).from(healthSyncCursors).where(eq(healthSyncCursors.userId, userId));
    const childQueries = await Promise.all([
      db.execute(sql`SELECT n.* FROM "nutrition_food_nutrients" n INNER JOIN "nutrition_foods" f ON f."id" = n."food_id" WHERE f."user_id" = ${userId}`),
      db.execute(sql`SELECT i.* FROM "nutrition_recipe_ingredients" i INNER JOIN "nutrition_recipes" r ON r."id" = i."recipe_id" WHERE r."user_id" = ${userId}`),
      db.execute(sql`SELECT e.* FROM "workout_exercises" e INNER JOIN "workouts" w ON w."id" = e."workout_id" WHERE w."user_id" = ${userId}`),
      db.execute(sql`SELECT s.* FROM "workout_sets" s INNER JOIN "workout_exercises" e ON e."id" = s."workout_exercise_id" INNER JOIN "workouts" w ON w."id" = e."workout_id" WHERE w."user_id" = ${userId}`),
    ]);
    tables.nutrition_food_nutrients = (childQueries[0] as { rows?: unknown[] }).rows || [];
    tables.nutrition_recipe_ingredients = (childQueries[1] as { rows?: unknown[] }).rows || [];
    tables.workout_exercises = (childQueries[2] as { rows?: unknown[] }).rows || [];
    tables.workout_sets = (childQueries[3] as { rows?: unknown[] }).rows || [];
    const healthHypotheses = await db.execute(sql`SELECT * FROM "cross_domain_hypotheses" WHERE "user_id" = ${userId} AND ("left_signal_id" LIKE 'health.%' OR "right_signal_id" LIKE 'health.%')`);
    const healthHypothesisIds = sql`SELECT "id" FROM "cross_domain_hypotheses" WHERE "user_id" = ${userId} AND ("left_signal_id" LIKE 'health.%' OR "right_signal_id" LIKE 'health.%')`;
    const healthHypothesisSnapshots = await db.execute(sql`SELECT * FROM "cross_domain_hypothesis_snapshots" WHERE "user_id" = ${userId} AND "hypothesis_id" IN (${healthHypothesisIds})`);
    const healthHypothesisInterpretations = await db.execute(sql`SELECT * FROM "cross_domain_hypothesis_interpretations" WHERE "user_id" = ${userId} AND "hypothesis_id" IN (${healthHypothesisIds})`);
    tables.cross_domain_hypotheses = (healthHypotheses as { rows?: unknown[] }).rows || [];
    tables.cross_domain_hypothesis_snapshots = (healthHypothesisSnapshots as { rows?: unknown[] }).rows || [];
    tables.cross_domain_hypothesis_interpretations = (healthHypothesisInterpretations as { rows?: unknown[] }).rows || [];
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="lyfeos-health-export-${new Date().toISOString().slice(0, 10)}.json"`);
    return res.send(JSON.stringify({ exportedAt: new Date().toISOString(), scope: "LyfeOS private health domain", tables }, null, 2));
  });

  app.delete("/api/health-data", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = deletionInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Type DELETE MY HEALTH DATA to confirm." });
    const userId = req.session.userId!;
    const counts = await healthCounts(userId, healthDeleteOrder);
    const hypothesisCountResult = await db.execute(sql`SELECT count(*)::integer AS "count" FROM "cross_domain_hypotheses" WHERE "user_id" = ${userId} AND ("left_signal_id" LIKE 'health.%' OR "right_signal_id" LIKE 'health.%')`);
    counts.cross_domain_hypotheses = Number((hypothesisCountResult as { rows?: Array<{ count: number }> }).rows?.[0]?.count || 0);
    await db.transaction(async (tx) => {
      await tx.execute(sql`DELETE FROM "cross_domain_hypotheses" WHERE "user_id" = ${userId} AND ("left_signal_id" LIKE 'health.%' OR "right_signal_id" LIKE 'health.%')`);
      await tx.execute(sql`INSERT INTO "hypothesis_domain_consents" ("user_id", "domain", "state", "policy_version") VALUES (${userId}, 'health', 'revoked', ${HYPOTHESIS_CONSENT_VERSION})`);
      for (const table of healthDeleteOrder) await tx.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE "user_id" = ${userId}`);
      await tx.execute(sql`UPDATE "user_daily_logs" SET "sleep_time" = NULL, "wake_time" = NULL, "sleep_quality" = NULL, "sleep_note" = NULL WHERE "user_id" = ${userId}`);
      await tx.insert(healthDataRightsAudit).values({ userId, action: "health_data_deleted", scope: "health_domain", details: { deletedRecordCounts: counts, dailyWellnessSleepFieldsCleared: true } });
    });
    return res.json({ deleted: true, deletedRecordCounts: counts, disclosure: "Private health-domain records, Health-derived cross-domain hypotheses, and Daily Wellness sleep fields were deleted. Health hypothesis consent was revoked; the rights receipt and non-health account data remain." });
  });
}
