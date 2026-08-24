import type { Express, Request, Response } from "express";
import { and, asc, desc, eq, exists, gte, ilike, inArray, isNull, lt, lte, max, notExists, sql } from "drizzle-orm";
import { z } from "zod";
import { healthDeletionReceipts, healthPlanningDrafts, heartRateZoneProfiles, workoutExercises, workoutHeartRateSamples, workoutProgramSessions, workoutRevisions, workouts, workoutSets, workoutTemplateRevisions, workoutTemplates } from "@shared/schema";
import { db } from "../db";
import { dateInTimeZone, dayBounds, localDate, requestTimeContext } from "../health-fitness";
import { deletionReceiptExpiry, healthMutationId, healthMutationPayloadHash, newDeletionReceiptId } from "../health-mutation-integrity";
import { classifyHeartRateAverage, heartRateTimeInZones, summarizeCardioSessions, summarizeExerciseProgress, summarizeExerciseRecords, summarizeWorkoutTimeline, workoutCalculationRegistry } from "../workout-analysis";
import { workoutLedgerExportCsv, workoutLedgerExportRows } from "../workout-export";
import { workoutHistoryPeriod } from "../workout-history";
import { parseExpectedResourceRevision } from "../revision-concurrency";
import { isAuthenticated } from "./middleware";

const setRecordSchema = z.object({
  reps: z.number().int().positive().max(10000).nullable().optional(),
  loadValue: z.number().positive().max(100000).nullable().optional(),
  loadUnit: z.enum(["kg", "lb"]).nullable().optional(),
  distanceMeters: z.number().positive().max(10_000_000).nullable().optional(),
  durationSeconds: z.number().int().positive().max(86400).nullable().optional(),
  perceivedExertion: z.number().int().min(1).max(10).nullable().optional(),
  repsInReserve: z.number().int().min(0).max(20).nullable().optional(),
  completed: z.boolean().optional(),
  note: z.string().trim().max(500).nullable().optional(),
}).refine((record) => record.reps != null || record.loadValue != null || record.distanceMeters != null || record.durationSeconds != null || record.note != null || record.completed === false, { message: "A set needs a performed value, note, or an explicit skipped state." });

const exerciseSchema = z.object({
  name: z.string().trim().min(1).max(120),
  // Existing callers may retain aggregates; new callers use setRecords for
  // exact performed attempts.
  sets: z.number().int().positive().max(100).nullable().optional(),
  reps: z.number().int().positive().max(10000).nullable().optional(),
  loadValue: z.number().positive().max(100000).nullable().optional(),
  loadUnit: z.enum(["kg", "lb"]).nullable().optional(),
  distanceMeters: z.number().positive().max(10_000_000).nullable().optional(),
  durationSeconds: z.number().int().positive().max(86400).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  setRecords: z.array(setRecordSchema).max(100).optional(),
});
const workoutSchema = z.object({
  activityType: z.string().trim().min(1).max(60),
  durationMinutes: z.number().int().positive().max(1440).nullable().optional(),
  perceivedExertion: z.number().int().min(1).max(10).nullable().optional(),
  movingTimeSeconds: z.number().int().positive().max(86400).nullable().optional(),
  elevationGainMeters: z.number().nonnegative().max(100000).nullable().optional(),
  averageHeartRateBpm: z.number().int().min(20).max(260).nullable().optional(),
  maxHeartRateBpm: z.number().int().min(20).max(260).nullable().optional(),
  heartRateSource: z.enum(["manual", "device", "imported"]).nullable().optional(),
  occurredAt: z.string().datetime().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  exercises: z.array(exerciseSchema).max(80).default([]),
}).refine((input) => input.averageHeartRateBpm == null || input.maxHeartRateBpm == null || input.maxHeartRateBpm >= input.averageHeartRateBpm, { message: "Maximum heart rate cannot be below the average." })
  .refine((input) => input.movingTimeSeconds == null || input.durationMinutes == null || input.movingTimeSeconds <= input.durationMinutes * 60, { message: "Moving time cannot exceed total duration." })
  .refine((input) => (input.averageHeartRateBpm == null && input.maxHeartRateBpm == null) || !!input.heartRateSource, { message: "Heart-rate source is required when heart rate is recorded." });
const plannedSetSchema = z.object({
  reps: z.number().int().positive().max(10000).nullable().optional(),
  loadValue: z.number().positive().max(100000).nullable().optional(),
  loadUnit: z.enum(["kg", "lb"]).nullable().optional(),
  distanceMeters: z.number().positive().max(10_000_000).nullable().optional(),
  durationSeconds: z.number().int().positive().max(86400).nullable().optional(),
  perceivedExertion: z.number().int().min(1).max(10).nullable().optional(),
  repsInReserve: z.number().int().min(0).max(20).nullable().optional(),
});
const plannedExerciseSchema = z.object({
  name: z.string().trim().min(1).max(120),
  setRecords: z.array(plannedSetSchema).min(1).max(100),
});
const workoutTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  activityType: z.string().trim().min(1).max(60),
  folder: z.string().trim().max(120).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  exercises: z.array(plannedExerciseSchema).min(1).max(80),
});
const heartRateZonesSchema = z.array(z.object({ name: z.string().trim().min(1).max(60), lowerBpm: z.number().int().min(20).max(260), upperBpm: z.number().int().min(20).max(260) })).min(1).max(10);
const heartRateZoneProfileSchema = z.object({
  name: z.string().trim().min(1).max(120),
  source: z.enum(["user", "professional"]).default("user"),
  methodId: z.string().trim().max(120).nullable().optional(),
  methodVersion: z.string().trim().max(80).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  zones: heartRateZonesSchema,
}).superRefine((profile, context) => {
  const zones = [...profile.zones].sort((left, right) => left.lowerBpm - right.lowerBpm);
  if (new Set(zones.map((zone) => zone.name.toLowerCase())).size !== zones.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "Zone names must be unique." });
  zones.forEach((zone, index) => {
    if (zone.upperBpm < zone.lowerBpm) context.addIssue({ code: z.ZodIssueCode.custom, message: `${zone.name} ends below its start.` });
    if (index > 0 && zone.lowerBpm <= zones[index - 1].upperBpm) context.addIssue({ code: z.ZodIssueCode.custom, message: "Heart-rate zones cannot overlap." });
  });
});
const heartRateSamplesSchema = z.object({
  source: z.enum(["manual", "transcribed_device"]),
  deviceName: z.string().trim().min(1).max(160).nullable().optional(),
  samples: z.array(z.object({ sampledAt: z.string().datetime(), bpm: z.number().int().min(20).max(260) })).min(2).max(1000),
}).superRefine((input, context) => {
  if (input.source === "transcribed_device" && !input.deviceName) context.addIssue({ code: z.ZodIssueCode.custom, message: "Name the device for transcribed samples." });
  if (new Set(input.samples.map((sample) => sample.sampledAt)).size !== input.samples.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "A sample timestamp can appear only once in a batch." });
});
const workoutHistoryFilterSchema = z.object({
  source: z.enum(["manual", "device", "imported"]).optional(),
  heartRateSource: z.enum(["manual", "device", "imported"]).optional(),
  setState: z.enum(["any", "performed", "skipped_only", "no_sets"]).default("any"),
  programLink: z.enum(["any", "linked", "unlinked"]).default("any"),
  rpeMin: z.coerce.number().int().min(1).max(10).optional(),
  rpeMax: z.coerce.number().int().min(1).max(10).optional(),
}).refine((input) => input.rpeMin == null || input.rpeMax == null || input.rpeMin <= input.rpeMax, { message: "Minimum RPE cannot exceed maximum RPE." });

function parsedWorkoutHistoryFilters(query: Request["query"]) {
  return workoutHistoryFilterSchema.safeParse({
    source: query.source || undefined, heartRateSource: query.heartRateSource || undefined,
    setState: query.setState || "any", programLink: query.programLink || "any",
    rpeMin: query.rpeMin || undefined, rpeMax: query.rpeMax || undefined,
  });
}

function workoutHistoryStructuredConditions(filters: z.infer<typeof workoutHistoryFilterSchema>) {
  const performedSet = exists(db.select({ id: workoutSets.id }).from(workoutSets).innerJoin(workoutExercises, eq(workoutSets.workoutExerciseId, workoutExercises.id)).where(and(eq(workoutExercises.workoutId, workouts.id), eq(workoutSets.completed, true))));
  const skippedSet = exists(db.select({ id: workoutSets.id }).from(workoutSets).innerJoin(workoutExercises, eq(workoutSets.workoutExerciseId, workoutExercises.id)).where(and(eq(workoutExercises.workoutId, workouts.id), eq(workoutSets.completed, false))));
  const linkedProgram = exists(db.select({ id: workoutProgramSessions.id }).from(workoutProgramSessions).where(and(eq(workoutProgramSessions.userId, workouts.userId), eq(workoutProgramSessions.completedWorkoutId, workouts.id))));
  return [
    filters.source ? eq(workouts.source, filters.source) : undefined,
    filters.heartRateSource ? eq(workouts.heartRateSource, filters.heartRateSource) : undefined,
    filters.rpeMin != null ? gte(workouts.perceivedExertion, filters.rpeMin) : undefined,
    filters.rpeMax != null ? lte(workouts.perceivedExertion, filters.rpeMax) : undefined,
    filters.setState === "performed" ? performedSet : filters.setState === "skipped_only" ? and(skippedSet, notExists(db.select({ id: workoutSets.id }).from(workoutSets).innerJoin(workoutExercises, eq(workoutSets.workoutExerciseId, workoutExercises.id)).where(and(eq(workoutExercises.workoutId, workouts.id), eq(workoutSets.completed, true))))) : filters.setState === "no_sets" ? notExists(db.select({ id: workoutSets.id }).from(workoutSets).innerJoin(workoutExercises, eq(workoutSets.workoutExerciseId, workoutExercises.id)).where(eq(workoutExercises.workoutId, workouts.id))) : undefined,
    filters.programLink === "linked" ? linkedProgram : filters.programLink === "unlinked" ? notExists(db.select({ id: workoutProgramSessions.id }).from(workoutProgramSessions).where(and(eq(workoutProgramSessions.userId, workouts.userId), eq(workoutProgramSessions.completedWorkoutId, workouts.id)))) : undefined,
  ];
}

async function workoutWithChildren(id: number, userId: number) {
  const [workout] = await db.select().from(workouts).where(and(eq(workouts.id, id), eq(workouts.userId, userId))).limit(1);
  if (!workout) return null;
  const exerciseRows = await db.select().from(workoutExercises).where(eq(workoutExercises.workoutId, workout.id));
  const setRows = exerciseRows.length ? await db.select().from(workoutSets).where(inArray(workoutSets.workoutExerciseId, exerciseRows.map((exercise) => exercise.id))).orderBy(workoutSets.setOrder) : [];
  return { ...workout, exercises: exerciseRows.map((exercise) => ({ ...exercise, setRecords: setRows.filter((setRecord) => setRecord.workoutExerciseId === exercise.id) })) };
}

type ExerciseInput = z.infer<typeof exerciseSchema>;

function legacySetRecords(exercise: ExerciseInput): Array<z.infer<typeof setRecordSchema>> {
  if (exercise.setRecords?.length) return exercise.setRecords;
  if (!exercise.sets) return [];
  return Array.from({ length: exercise.sets }, () => ({
    reps: exercise.reps || null, loadValue: exercise.loadValue || null, loadUnit: exercise.loadUnit || null,
    distanceMeters: exercise.distanceMeters || null, durationSeconds: exercise.durationSeconds || null, completed: true,
  }));
}

export function registerWorkoutRoutes(app: Express): void {
  app.get("/api/workout-templates", isAuthenticated, async (req: Request, res: Response) => {
    const templates = await db.select().from(workoutTemplates).where(eq(workoutTemplates.userId, req.session.userId!)).orderBy(desc(workoutTemplates.updatedAt));
    return res.json({ templates });
  });

  app.post("/api/workout-templates", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = workoutTemplateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid workout template.", details: parsed.error.flatten() });
    const template = await db.transaction(async (tx) => {
      const [created] = await tx.insert(workoutTemplates).values({
        userId: req.session.userId!, name: parsed.data.name, activityType: parsed.data.activityType, folder: parsed.data.folder || null, note: parsed.data.note || null,
        exerciseBlueprint: parsed.data.exercises, updatedAt: new Date(),
      }).returning();
      await tx.insert(workoutTemplateRevisions).values({ userId: req.session.userId!, templateId: created.id, revisionNumber: 1, name: created.name, activityType: created.activityType, folder: created.folder, note: created.note, exerciseBlueprint: created.exerciseBlueprint });
      return created;
    });
    return res.status(201).json({ template });
  });

  app.patch("/api/workout-templates/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid workout template." });
    const parsed = workoutTemplateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid workout template.", details: parsed.error.flatten() });
    const expectedRevision = parseExpectedResourceRevision(req.header("x-lyfeos-expected-revision"));
    if (!expectedRevision.ok) return res.status(expectedRevision.reason === "missing" ? 428 : 400).json({ error: expectedRevision.reason === "missing" ? "Reload this template before saving changes." : "Invalid expected template revision." });
    const outcome = await db.transaction(async (tx) => {
      const locked = await tx.execute(sql`SELECT id FROM workout_templates WHERE id = ${id} AND user_id = ${req.session.userId!} FOR UPDATE`);
      if (!locked.rows.length) return { kind: "missing" } as const;
      const [latest] = await tx.select({ revisionNumber: workoutTemplateRevisions.revisionNumber }).from(workoutTemplateRevisions).where(and(eq(workoutTemplateRevisions.templateId, id), eq(workoutTemplateRevisions.userId, req.session.userId!))).orderBy(desc(workoutTemplateRevisions.revisionNumber)).limit(1);
      const currentRevision = latest?.revisionNumber || 0;
      if (expectedRevision.revision !== currentRevision) return { kind: "conflict", currentRevision } as const;
      const [updated] = await tx.update(workoutTemplates).set({ name: parsed.data.name, activityType: parsed.data.activityType, folder: parsed.data.folder || null, note: parsed.data.note || null, exerciseBlueprint: parsed.data.exercises, updatedAt: new Date() }).where(and(eq(workoutTemplates.id, id), eq(workoutTemplates.userId, req.session.userId!))).returning();
      const nextRevision = currentRevision + 1;
      await tx.insert(workoutTemplateRevisions).values({ userId: req.session.userId!, templateId: id, revisionNumber: nextRevision, name: updated.name, activityType: updated.activityType, folder: updated.folder, note: updated.note, exerciseBlueprint: updated.exerciseBlueprint });
      return { kind: "updated", template: { ...updated, currentRevision: nextRevision } } as const;
    });
    if (outcome.kind === "missing") return res.status(404).json({ error: "Workout template not found." });
    if (outcome.kind === "conflict") return res.status(409).json({ error: "This template changed after you opened it. Reload it before saving another version.", currentRevision: outcome.currentRevision });
    return res.json({ template: outcome.template });
  });

  app.get("/api/workout-templates/:id/revisions", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid workout template." });
    const revisions = await db.select().from(workoutTemplateRevisions).where(and(eq(workoutTemplateRevisions.templateId, id), eq(workoutTemplateRevisions.userId, req.session.userId!))).orderBy(desc(workoutTemplateRevisions.revisionNumber));
    return revisions.length ? res.json({ revisions }) : res.status(404).json({ error: "Workout template not found." });
  });

  app.post("/api/workout-templates/:id/duplicate", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid workout template." });
    const template = await db.transaction(async (tx) => {
      const [source] = await tx.select().from(workoutTemplates).where(and(eq(workoutTemplates.id, id), eq(workoutTemplates.userId, req.session.userId!))).limit(1);
      if (!source) return null;
      const parsed = workoutTemplateSchema.safeParse({ name: `${source.name} copy`, activityType: source.activityType, folder: source.folder, note: source.note, exercises: source.exerciseBlueprint });
      if (!parsed.success) return "invalid" as const;
      const [created] = await tx.insert(workoutTemplates).values({
        userId: req.session.userId!, name: parsed.data.name, activityType: parsed.data.activityType, folder: parsed.data.folder || null, note: parsed.data.note || null,
        exerciseBlueprint: parsed.data.exercises, updatedAt: new Date(),
      }).returning();
      await tx.insert(workoutTemplateRevisions).values({ userId: req.session.userId!, templateId: created.id, revisionNumber: 1, name: created.name, activityType: created.activityType, folder: created.folder, note: created.note, exerciseBlueprint: created.exerciseBlueprint });
      return created;
    });
    if (template === "invalid") return res.status(409).json({ error: "This saved template uses an older format and cannot be duplicated safely." });
    return template ? res.status(201).json({ template }) : res.status(404).json({ error: "Workout template not found." });
  });

  app.post("/api/workout-templates/:id/revisions/:revisionNumber/restore", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const revisionNumber = Number(req.params.revisionNumber);
    if (!Number.isInteger(id) || !Number.isInteger(revisionNumber) || revisionNumber < 1) return res.status(400).json({ error: "Invalid workout template revision." });
    const expectedRevision = parseExpectedResourceRevision(req.header("x-lyfeos-expected-revision"));
    if (!expectedRevision.ok) return res.status(expectedRevision.reason === "missing" ? 428 : 400).json({ error: expectedRevision.reason === "missing" ? "Reload this template before restoring a version." : "Invalid expected template revision." });
    const outcome = await db.transaction(async (tx) => {
      const locked = await tx.execute(sql`SELECT id FROM workout_templates WHERE id = ${id} AND user_id = ${req.session.userId!} FOR UPDATE`);
      if (!locked.rows.length) return { kind: "missing" } as const;
      const [revision] = await tx.select().from(workoutTemplateRevisions).where(and(eq(workoutTemplateRevisions.templateId, id), eq(workoutTemplateRevisions.userId, req.session.userId!), eq(workoutTemplateRevisions.revisionNumber, revisionNumber))).limit(1);
      if (!revision) return { kind: "missing" } as const;
      const parsed = workoutTemplateSchema.safeParse({ name: revision.name, activityType: revision.activityType, folder: revision.folder, note: revision.note, exercises: revision.exerciseBlueprint });
      if (!parsed.success) return { kind: "invalid" } as const;
      const [latest] = await tx.select({ revisionNumber: workoutTemplateRevisions.revisionNumber }).from(workoutTemplateRevisions).where(and(eq(workoutTemplateRevisions.templateId, id), eq(workoutTemplateRevisions.userId, req.session.userId!))).orderBy(desc(workoutTemplateRevisions.revisionNumber)).limit(1);
      const currentRevision = latest?.revisionNumber || 0;
      if (expectedRevision.revision !== currentRevision) return { kind: "conflict", currentRevision } as const;
      const [updated] = await tx.update(workoutTemplates).set({ name: parsed.data.name, activityType: parsed.data.activityType, folder: parsed.data.folder || null, note: parsed.data.note || null, exerciseBlueprint: parsed.data.exercises, updatedAt: new Date() }).where(and(eq(workoutTemplates.id, id), eq(workoutTemplates.userId, req.session.userId!))).returning();
      const nextRevision = currentRevision + 1;
      await tx.insert(workoutTemplateRevisions).values({ userId: req.session.userId!, templateId: id, revisionNumber: nextRevision, name: updated.name, activityType: updated.activityType, folder: updated.folder, note: updated.note, exerciseBlueprint: updated.exerciseBlueprint });
      return { kind: "updated", template: { ...updated, currentRevision: nextRevision } } as const;
    });
    if (outcome.kind === "invalid") return res.status(409).json({ error: "This historical revision uses an older format and cannot be restored safely." });
    if (outcome.kind === "missing") return res.status(404).json({ error: "Workout template revision not found." });
    if (outcome.kind === "conflict") return res.status(409).json({ error: "This template changed after you opened it. Reload it before restoring another version.", currentRevision: outcome.currentRevision });
    return res.json({ template: outcome.template });
  });

  app.post("/api/workout-templates/:id/planning-draft", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid workout template." });
    const [template] = await db.select().from(workoutTemplates).where(and(eq(workoutTemplates.id, id), eq(workoutTemplates.userId, req.session.userId!))).limit(1);
    if (!template) return res.status(404).json({ error: "Workout template not found." });
    const { timeZone } = requestTimeContext(req);
    const today = dateInTimeZone(new Date(), timeZone);
    const title = `Complete ${template.name}`.slice(0, 180);
    const [draft] = await db.insert(healthPlanningDrafts).values({
      userId: req.session.userId!, title, category: "fitness", evidenceStart: today, evidenceEnd: today,
      evidenceSeries: [{ id: `workout_template:${template.id}`, label: template.name, unit: "planned template" }],
    }).returning();
    return res.status(201).json({ draft, disclosure: "This is a private pending draft. Review it in Health planning and confirm it before any Mission is created. No performed workout was inferred." });
  });

  app.delete("/api/workout-templates/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid workout template." });
    const [template] = await db.delete(workoutTemplates).where(and(eq(workoutTemplates.id, id), eq(workoutTemplates.userId, req.session.userId!))).returning({ id: workoutTemplates.id });
    return template ? res.status(204).send() : res.status(404).json({ error: "Workout template not found." });
  });

  app.get("/api/workouts/heart-rate-zones", isAuthenticated, async (req: Request, res: Response) => {
    const profiles = await db.select().from(heartRateZoneProfiles).where(eq(heartRateZoneProfiles.userId, req.session.userId!)).orderBy(desc(heartRateZoneProfiles.updatedAt));
    return res.json({ profiles, disclosure: "These are user- or professional-supplied display ranges. LyfeOS does not calculate a safe training zone, prescribe intensity, or infer cardiovascular health." });
  });

  app.post("/api/workouts/heart-rate-zones", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = heartRateZoneProfileSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid heart-rate zone profile.", details: parsed.error.flatten() });
    const userId = req.session.userId!;
    const profile = await db.transaction(async (tx) => {
      await tx.update(heartRateZoneProfiles).set({ active: false, updatedAt: new Date() }).where(eq(heartRateZoneProfiles.userId, userId));
      const [created] = await tx.insert(heartRateZoneProfiles).values({ userId, ...parsed.data, methodId: parsed.data.methodId || null, methodVersion: parsed.data.methodVersion || null, note: parsed.data.note || null, active: true, updatedAt: new Date() }).returning();
      return created;
    });
    return res.status(201).json({ profile });
  });

  app.patch("/api/workouts/heart-rate-zones/:id/activate", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const userId = req.session.userId!;
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid heart-rate zone profile." });
    const profile = await db.transaction(async (tx) => {
      const [owned] = await tx.select({ id: heartRateZoneProfiles.id }).from(heartRateZoneProfiles).where(and(eq(heartRateZoneProfiles.id, id), eq(heartRateZoneProfiles.userId, userId))).limit(1);
      if (!owned) return null;
      await tx.update(heartRateZoneProfiles).set({ active: false, updatedAt: new Date() }).where(eq(heartRateZoneProfiles.userId, userId));
      const [activated] = await tx.update(heartRateZoneProfiles).set({ active: true, updatedAt: new Date() }).where(and(eq(heartRateZoneProfiles.id, id), eq(heartRateZoneProfiles.userId, userId))).returning();
      return activated;
    });
    return profile ? res.json({ profile }) : res.status(404).json({ error: "Heart-rate zone profile not found." });
  });

  app.delete("/api/workouts/heart-rate-zones/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid heart-rate zone profile." });
    const [profile] = await db.delete(heartRateZoneProfiles).where(and(eq(heartRateZoneProfiles.id, id), eq(heartRateZoneProfiles.userId, req.session.userId!))).returning({ id: heartRateZoneProfiles.id });
    return profile ? res.status(204).send() : res.status(404).json({ error: "Heart-rate zone profile not found." });
  });

  app.get("/api/workouts/:id/heart-rate-samples", isAuthenticated, async (req: Request, res: Response) => {
    const workoutId = Number(req.params.id);
    if (!Number.isInteger(workoutId)) return res.status(400).json({ error: "Invalid workout." });
    const userId = req.session.userId!;
    const [workout] = await db.select({ id: workouts.id }).from(workouts).where(and(eq(workouts.id, workoutId), eq(workouts.userId, userId))).limit(1);
    if (!workout) return res.status(404).json({ error: "Workout not found." });
    const requestedProfileId = Number(req.query.zoneProfileId || 0);
    const [[profile], samples] = await Promise.all([
      db.select().from(heartRateZoneProfiles).where(and(eq(heartRateZoneProfiles.userId, userId), Number.isInteger(requestedProfileId) && requestedProfileId > 0 ? eq(heartRateZoneProfiles.id, requestedProfileId) : eq(heartRateZoneProfiles.active, true))).limit(1),
      db.select().from(workoutHeartRateSamples).where(and(eq(workoutHeartRateSamples.workoutId, workoutId), eq(workoutHeartRateSamples.userId, userId))).orderBy(workoutHeartRateSamples.sampledAt),
    ]);
    const parsedZones = heartRateZonesSchema.safeParse(profile?.zones);
    const zones = parsedZones.success ? parsedZones.data : [];
    return res.json({
      samples,
      zoneProfile: profile ? { id: profile.id, name: profile.name, source: profile.source, methodId: profile.methodId, methodVersion: profile.methodVersion, zones } : null,
      timeInRanges: heartRateTimeInZones(samples.map((sample) => ({ sampledAt: sample.sampledAt, bpm: sample.bpm })), zones),
      disclosure: "Samples remain factual records with source and device provenance. Time in range classifies only adjacent gaps of 120 seconds or less by midpoint BPM against the selected user/professional ranges; longer gaps remain unknown. It is not a prescription, readiness score, or cardiovascular conclusion.",
    });
  });

  app.post("/api/workouts/:id/heart-rate-samples", isAuthenticated, async (req: Request, res: Response) => {
    const workoutId = Number(req.params.id);
    const parsed = heartRateSamplesSchema.safeParse(req.body);
    if (!Number.isInteger(workoutId) || !parsed.success) return res.status(400).json({ error: "Invalid heart-rate sample batch.", details: parsed.success ? undefined : parsed.error.flatten() });
    const userId = req.session.userId!;
    const [workout] = await db.select().from(workouts).where(and(eq(workouts.id, workoutId), eq(workouts.userId, userId))).limit(1);
    if (!workout) return res.status(404).json({ error: "Workout not found." });
    const durationSeconds = workout.movingTimeSeconds || (workout.durationMinutes ? workout.durationMinutes * 60 : 0);
    if (!durationSeconds) return res.status(409).json({ error: "Record workout duration before adding timestamped heart-rate samples." });
    const endAt = new Date(workout.occurredAt.getTime() + durationSeconds * 1000);
    const samples = parsed.data.samples.map((sample) => ({ ...sample, sampledAt: new Date(sample.sampledAt) })).sort((left, right) => left.sampledAt.getTime() - right.sampledAt.getTime());
    if (samples.some((sample) => sample.sampledAt < workout.occurredAt || sample.sampledAt > endAt)) return res.status(400).json({ error: "Every heart-rate sample must fall within the recorded workout interval." });
    try {
      const created = await db.insert(workoutHeartRateSamples).values(samples.map((sample) => ({ userId, workoutId, sampledAt: sample.sampledAt, bpm: sample.bpm, source: parsed.data.source, deviceName: parsed.data.deviceName || null }))).returning();
      return res.status(201).json({ samples: created });
    } catch {
      return res.status(409).json({ error: "One or more heart-rate samples already exist for this workout, timestamp, and source. No duplicate batch was added." });
    }
  });

  app.delete("/api/workouts/:workoutId/heart-rate-samples/:sampleId", isAuthenticated, async (req: Request, res: Response) => {
    const workoutId = Number(req.params.workoutId); const sampleId = Number(req.params.sampleId);
    if (!Number.isInteger(workoutId) || !Number.isInteger(sampleId)) return res.status(400).json({ error: "Invalid heart-rate sample." });
    const [sample] = await db.delete(workoutHeartRateSamples).where(and(eq(workoutHeartRateSamples.id, sampleId), eq(workoutHeartRateSamples.workoutId, workoutId), eq(workoutHeartRateSamples.userId, req.session.userId!))).returning({ id: workoutHeartRateSamples.id });
    return sample ? res.status(204).send() : res.status(404).json({ error: "Heart-rate sample not found." });
  });

  app.get("/api/workouts/progress", isAuthenticated, async (req: Request, res: Response) => {
    const requestedDays = Number(req.query.days || 90);
    const days = Number.isInteger(requestedDays) && requestedDays >= 7 && requestedDays <= 3650 ? requestedDays : 90;
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - (days - 1));
    const rows = await db.select({
      occurredAt: workouts.occurredAt, exerciseName: workoutExercises.name, reps: workoutSets.reps,
      loadValue: workoutSets.loadValue, loadUnit: workoutSets.loadUnit, completed: workoutSets.completed,
    }).from(workoutSets).innerJoin(workoutExercises, eq(workoutSets.workoutExerciseId, workoutExercises.id))
      .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
      .where(and(eq(workouts.userId, req.session.userId!), gte(workouts.occurredAt, start)));
    return res.json({
      days,
      progress: summarizeExerciseProgress(rows),
      method: {
        estimatedOneRepMax: `${workoutCalculationRegistry.estimatedOneRepMax.id}: ${workoutCalculationRegistry.estimatedOneRepMax.definition}`,
        personalRecord: `Period best, ${workoutCalculationRegistry.observedLoadRecord.id}: ${workoutCalculationRegistry.observedLoadRecord.definition}`,
      },
      disclosure: "Training metrics summarize recorded performance only. They do not establish overall fitness, readiness, or competence outside the measured activity.",
    });
  });

  app.get("/api/workouts/records", isAuthenticated, async (req: Request, res: Response) => {
    const rows = await db.select({
      workoutId: workouts.id, setId: workoutSets.id, occurredAt: workouts.occurredAt, exerciseName: workoutExercises.name,
      reps: workoutSets.reps, loadValue: workoutSets.loadValue, loadUnit: workoutSets.loadUnit, completed: workoutSets.completed,
    }).from(workoutSets).innerJoin(workoutExercises, eq(workoutSets.workoutExerciseId, workoutExercises.id))
      .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
      .where(eq(workouts.userId, req.session.userId!));
    return res.json({
      records: summarizeExerciseRecords(rows),
      calculations: workoutCalculationRegistry,
      disclosure: "These are all-time records within your submitted workout ledger. Observed load and formula estimates are not interchangeable and do not establish general strength, rank, health, or competence.",
    });
  });

  app.get("/api/workouts/history", isAuthenticated, async (req: Request, res: Response) => {
    const requestedLimit = Number(req.query.limit || 50);
    const limit = Number.isInteger(requestedLimit) && requestedLimit >= 10 && requestedLimit <= 100 ? requestedLimit : 50;
    const requestedPage = Number(req.query.page || 0);
    const page = Number.isInteger(requestedPage) && requestedPage >= 0 && requestedPage <= 1000 ? requestedPage : 0;
    const activity = typeof req.query.activity === "string" ? req.query.activity.trim().slice(0, 60) : "";
    const exercise = typeof req.query.exercise === "string" ? req.query.exercise.trim().slice(0, 120) : "";
    const parsedFilters = parsedWorkoutHistoryFilters(req.query);
    if (!parsedFilters.success) return res.status(400).json({ error: "Invalid workout-history filter.", details: parsedFilters.error.flatten() });
    const { timeZone } = requestTimeContext(req);
    const period = workoutHistoryPeriod({ today: dateInTimeZone(new Date(), timeZone), days: req.query.days, startDate: req.query.startDate, endDate: req.query.endDate });
    if (!period) return res.status(400).json({ error: "Choose a complete workout-history date range of no more than 3,650 days that does not end in the future." });
    const { start } = dayBounds(period.startDate, timeZone);
    const { end } = dayBounds(period.endDate, timeZone);
    const exerciseMatch = exercise ? exists(db.select({ id: workoutExercises.id }).from(workoutExercises).where(and(eq(workoutExercises.workoutId, workouts.id), ilike(workoutExercises.name, `%${exercise}%`)))) : undefined;
    const fetched = await db.select().from(workouts)
      .where(and(eq(workouts.userId, req.session.userId!), gte(workouts.occurredAt, start), lt(workouts.occurredAt, end), activity ? ilike(workouts.activityType, `%${activity}%`) : undefined, exerciseMatch, ...workoutHistoryStructuredConditions(parsedFilters.data)))
      .orderBy(desc(workouts.occurredAt), desc(workouts.id)).limit(limit + 1).offset(page * limit);
    const hasMore = fetched.length > limit;
    const records = fetched.slice(0, limit);
    if (!records.length) return res.json({ days: period.days, period: { ...period, timeZone }, page, hasMore: false, timeZone, workouts: [], disclosure: "History lists only your recorded workouts. It is not an adherence, readiness, or fitness score." });
    const exerciseRows = await db.select().from(workoutExercises).where(inArray(workoutExercises.workoutId, records.map((workout) => workout.id)));
    const exerciseIds = exerciseRows.map((exercise) => exercise.id);
    const setRows = exerciseIds.length ? await db.select({ workoutExerciseId: workoutSets.workoutExerciseId, id: workoutSets.id, completed: workoutSets.completed }).from(workoutSets).where(inArray(workoutSets.workoutExerciseId, exerciseIds)) : [];
    const programLinks = await db.select({ completedWorkoutId: workoutProgramSessions.completedWorkoutId, sessionId: workoutProgramSessions.id, programId: workoutProgramSessions.programId }).from(workoutProgramSessions).where(and(eq(workoutProgramSessions.userId, req.session.userId!), inArray(workoutProgramSessions.completedWorkoutId, records.map((workout) => workout.id))));
    const recordedSetCountByExercise = new Map<number, number>();
    const performedSetCountByExercise = new Map<number, number>();
    for (const setRecord of setRows) {
      recordedSetCountByExercise.set(setRecord.workoutExerciseId, (recordedSetCountByExercise.get(setRecord.workoutExerciseId) || 0) + 1);
      if (setRecord.completed) performedSetCountByExercise.set(setRecord.workoutExerciseId, (performedSetCountByExercise.get(setRecord.workoutExerciseId) || 0) + 1);
    }
    return res.json({
      days: period.days, period: { ...period, timeZone }, page, hasMore, timeZone,
      workouts: records.map((workout) => {
        const exercises = exerciseRows.filter((exercise) => exercise.workoutId === workout.id);
        return {
          id: workout.id, occurredAt: workout.occurredAt, activityType: workout.activityType,
          durationMinutes: workout.durationMinutes, perceivedExertion: workout.perceivedExertion,
          source: workout.source, heartRateSource: workout.heartRateSource,
          programLink: programLinks.find((link) => link.completedWorkoutId === workout.id) || null,
          exerciseNames: exercises.map((exercise) => exercise.name),
          recordedSets: exercises.reduce((total, exercise) => total + (recordedSetCountByExercise.get(exercise.id) || 0), 0),
          performedSets: exercises.reduce((total, exercise) => total + (performedSetCountByExercise.get(exercise.id) || 0), 0),
        };
      }),
      disclosure: "History lists only your recorded workouts. Performed sets count completed atomic set records; skipped set records remain recorded separately. It is not an adherence, readiness, or fitness score.",
    });
  });

  app.get("/api/workouts/history.csv", isAuthenticated, async (req: Request, res: Response) => {
    const activity = typeof req.query.activity === "string" ? req.query.activity.trim().slice(0, 60) : "";
    const exercise = typeof req.query.exercise === "string" ? req.query.exercise.trim().slice(0, 120) : "";
    const parsedFilters = parsedWorkoutHistoryFilters(req.query);
    if (!parsedFilters.success) return res.status(400).json({ error: "Invalid workout-history filter.", details: parsedFilters.error.flatten() });
    const userId = req.session.userId!;
    const { timeZone } = requestTimeContext(req);
    const period = workoutHistoryPeriod({ today: dateInTimeZone(new Date(), timeZone), days: req.query.days, startDate: req.query.startDate, endDate: req.query.endDate });
    if (!period) return res.status(400).json({ error: "Choose a complete workout-history date range of no more than 3,650 days that does not end in the future." });
    const { start } = dayBounds(period.startDate, timeZone);
    const { end } = dayBounds(period.endDate, timeZone);
    const exerciseMatch = exercise ? exists(db.select({ id: workoutExercises.id }).from(workoutExercises).where(and(eq(workoutExercises.workoutId, workouts.id), ilike(workoutExercises.name, `%${exercise}%`)))) : undefined;
    const workoutRows = await db.select().from(workouts)
      .where(and(eq(workouts.userId, userId), gte(workouts.occurredAt, start), lt(workouts.occurredAt, end), activity ? ilike(workouts.activityType, `%${activity}%`) : undefined, exerciseMatch, ...workoutHistoryStructuredConditions(parsedFilters.data)))
      .orderBy(asc(workouts.occurredAt), asc(workouts.id)).limit(10001);
    if (workoutRows.length > 10000) return res.status(413).json({ error: "This export contains more than 10,000 workouts. Choose a shorter date range, activity filter, or exercise filter so no records are silently omitted." });
    const workoutIds = workoutRows.map((workout) => workout.id);
    const exerciseRows = workoutIds.length ? await db.select().from(workoutExercises).where(inArray(workoutExercises.workoutId, workoutIds)) : [];
    const exerciseIds = exerciseRows.map((exercise) => exercise.id);
    const setRows = exerciseIds.length ? await db.select().from(workoutSets).where(inArray(workoutSets.workoutExerciseId, exerciseIds)) : [];
    const revisionRows = workoutIds.length ? await db.select({ workoutId: workoutRevisions.workoutId, revisionNumber: max(workoutRevisions.revisionNumber) }).from(workoutRevisions)
      .where(and(eq(workoutRevisions.userId, userId), inArray(workoutRevisions.workoutId, workoutIds))).groupBy(workoutRevisions.workoutId) : [];
    const latestRevisionByWorkout = new Map(revisionRows.flatMap((revision) => revision.revisionNumber == null ? [] : [[revision.workoutId, Number(revision.revisionNumber)] as const]));
    const rows = workoutLedgerExportRows(workoutRows, exerciseRows, setRows, latestRevisionByWorkout, timeZone, (value) => dateInTimeZone(value, timeZone));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="lyfeos-workouts-${period.startDate}-to-${period.endDate}.csv"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-LyfeOS-CSV-Formula-Protection", "leading-apostrophe");
    return res.send(workoutLedgerExportCsv(rows));
  });

  app.get("/api/workouts/cardio", isAuthenticated, async (req: Request, res: Response) => {
    const requestedDays = Number(req.query.days || 90);
    const days = Number.isInteger(requestedDays) && requestedDays >= 7 && requestedDays <= 3650 ? requestedDays : 90;
    const { timeZone } = requestTimeContext(req);
    const endDate = dateInTimeZone(new Date(), timeZone);
    const startDay = new Date(`${endDate}T00:00:00.000Z`); startDay.setUTCDate(startDay.getUTCDate() - (days - 1));
    const startDate = startDay.toISOString().slice(0, 10);
    const { start } = dayBounds(startDate, timeZone);
    const { end } = dayBounds(endDate, timeZone);
    const records = await db.select().from(workouts).where(and(eq(workouts.userId, req.session.userId!), gte(workouts.occurredAt, start), lt(workouts.occurredAt, end)));
    const exerciseRows = records.length ? await db.select({ id: workoutExercises.id, workoutId: workoutExercises.workoutId }).from(workoutExercises).where(inArray(workoutExercises.workoutId, records.map((workout) => workout.id))) : [];
    const setRows = exerciseRows.length ? await db.select().from(workoutSets).where(inArray(workoutSets.workoutExerciseId, exerciseRows.map((exercise) => exercise.id))) : [];
    const exerciseIdsByWorkout = new Map<number, number[]>();
    for (const exercise of exerciseRows) {
      const existing = exerciseIdsByWorkout.get(exercise.workoutId) || [];
      existing.push(exercise.id);
      exerciseIdsByWorkout.set(exercise.workoutId, existing);
    }
    const setsByExercise = new Map<number, typeof setRows>();
    for (const setRecord of setRows) {
      const existing = setsByExercise.get(setRecord.workoutExerciseId) || [];
      existing.push(setRecord);
      setsByExercise.set(setRecord.workoutExerciseId, existing);
    }
    const rows = records.flatMap((workout) => {
      const cardioSets = (exerciseIdsByWorkout.get(workout.id) || []).flatMap((exerciseId) => setsByExercise.get(exerciseId) || []);
      const metadata = { workoutId: workout.id, occurredAt: workout.occurredAt, movingTimeSeconds: workout.movingTimeSeconds, elevationGainMeters: workout.elevationGainMeters, averageHeartRateBpm: workout.averageHeartRateBpm, maxHeartRateBpm: workout.maxHeartRateBpm, heartRateSource: workout.heartRateSource };
      return cardioSets.length ? cardioSets.map((setRecord) => ({ ...metadata, distanceMeters: setRecord.distanceMeters, durationSeconds: setRecord.durationSeconds, completed: setRecord.completed })) : [{ ...metadata, distanceMeters: null, durationSeconds: null, completed: false }];
    });
    const requestedProfileId = Number(req.query.zoneProfileId || 0);
    const [zoneProfile] = await db.select().from(heartRateZoneProfiles).where(and(
      eq(heartRateZoneProfiles.userId, req.session.userId!),
      Number.isInteger(requestedProfileId) && requestedProfileId > 0 ? eq(heartRateZoneProfiles.id, requestedProfileId) : eq(heartRateZoneProfiles.active, true),
    )).limit(1);
    const zoneResult = heartRateZonesSchema.safeParse(zoneProfile?.zones);
    const zones = zoneResult.success ? zoneResult.data : [];
    const sessions = summarizeCardioSessions(rows).map((session) => ({
      ...session,
      averageHeartRateZone: classifyHeartRateAverage(session.averageHeartRateBpm, zones),
    }));
    return res.json({ days, period: { startDate, endDate, timeZone }, sessions, zoneProfile: zoneProfile ? { id: zoneProfile.id, name: zoneProfile.name, source: zoneProfile.source, methodId: zoneProfile.methodId, methodVersion: zoneProfile.methodVersion, zones } : null, disclosure: "Cardio history derives pace and speed from recorded distance and moving time when available, otherwise recorded set duration. Elevation and heart-rate observations retain their source. An optional zone label classifies only the recorded session-average against the selected user/professional ranges; it is not time-in-zone or a safe-intensity prescription. It does not establish cardiovascular health, zones, readiness, or a clinical conclusion." });
  });

  app.get("/api/workouts/analytics", isAuthenticated, async (req: Request, res: Response) => {
    const requestedDays = Number(req.query.days || 365);
    const days = Number.isInteger(requestedDays) && requestedDays >= 30 && requestedDays <= 3650 ? requestedDays : 365;
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - (days - 1));
    const workoutRows = await db.select({ id: workouts.id, occurredAt: workouts.occurredAt, activityType: workouts.activityType, durationMinutes: workouts.durationMinutes }).from(workouts).where(and(eq(workouts.userId, req.session.userId!), gte(workouts.occurredAt, start)));
    const exerciseRows = workoutRows.length ? await db.select({ id: workoutExercises.id, workoutId: workoutExercises.workoutId }).from(workoutExercises).where(inArray(workoutExercises.workoutId, workoutRows.map((workout) => workout.id))) : [];
    const exerciseWorkout = new Map(exerciseRows.map((exercise) => [exercise.id, exercise.workoutId]));
    const rawSets = exerciseRows.length ? await db.select().from(workoutSets).where(inArray(workoutSets.workoutExerciseId, exerciseRows.map((exercise) => exercise.id))) : [];
    const summary = summarizeWorkoutTimeline(workoutRows, rawSets.flatMap((set) => {
      const workoutId = exerciseWorkout.get(set.workoutExerciseId);
      return workoutId == null ? [] : [{ workoutId, completed: set.completed, reps: set.reps, loadValue: set.loadValue, loadUnit: set.loadUnit, distanceMeters: set.distanceMeters, durationSeconds: set.durationSeconds }];
    }));
    return res.json({ days, ...summary, method: workoutCalculationRegistry.monthlyTimeline, disclosure: "Monthly summaries count only submitted workout and completed-set records. Missing duration, distance, or load stays missing from that sum; load units are never converted or combined." });
  });

  app.get("/api/workouts", isAuthenticated, async (req: Request, res: Response) => {
    const { timeZone } = requestTimeContext(req);
    const date = localDate(req.query.date) || dateInTimeZone(new Date(), timeZone);
    const { start, end } = dayBounds(date, timeZone);
    const records = await db.select().from(workouts).where(and(eq(workouts.userId, req.session.userId!), gte(workouts.occurredAt, start), lt(workouts.occurredAt, end))).orderBy(desc(workouts.occurredAt));
    if (!records.length) return res.json({ date, workouts: [] });
    const exerciseRows = await db.select().from(workoutExercises).where(inArray(workoutExercises.workoutId, records.map((workout) => workout.id)));
    const exerciseIds = exerciseRows.map((exercise) => exercise.id);
    const setRows = exerciseIds.length ? await db.select().from(workoutSets).where(inArray(workoutSets.workoutExerciseId, exerciseIds)).orderBy(workoutSets.setOrder) : [];
    return res.json({ date, workouts: records.map((workout) => ({ ...workout, exercises: exerciseRows.filter((exercise) => exercise.workoutId === workout.id).map((exercise) => ({ ...exercise, setRecords: setRows.filter((setRecord) => setRecord.workoutExerciseId === exercise.id) })) })) });
  });

  app.get("/api/workouts/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid workout." });
    const [workout] = await db.select().from(workouts).where(and(eq(workouts.id, id), eq(workouts.userId, req.session.userId!))).limit(1);
    if (!workout) return res.status(404).json({ error: "Workout not found." });
    const exerciseRows = await db.select().from(workoutExercises).where(eq(workoutExercises.workoutId, workout.id));
    const setRows = exerciseRows.length ? await db.select().from(workoutSets).where(inArray(workoutSets.workoutExerciseId, exerciseRows.map((exercise) => exercise.id))).orderBy(workoutSets.setOrder) : [];
    const [latestRevision] = await db.select({ revisionNumber: workoutRevisions.revisionNumber }).from(workoutRevisions).where(and(eq(workoutRevisions.workoutId, id), eq(workoutRevisions.userId, req.session.userId!))).orderBy(desc(workoutRevisions.revisionNumber)).limit(1);
    return res.json({ workout: { ...workout, currentRevision: latestRevision?.revisionNumber || 0, exercises: exerciseRows.map((exercise) => ({ ...exercise, setRecords: setRows.filter((setRecord) => setRecord.workoutExerciseId === exercise.id) })) } });
  });

  app.get("/api/workouts/:id/revisions", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid workout." });
    const [owned] = await db.select({ id: workouts.id }).from(workouts).where(and(eq(workouts.id, id), eq(workouts.userId, req.session.userId!))).limit(1);
    if (!owned) return res.status(404).json({ error: "Workout not found." });
    const revisions = await db.select().from(workoutRevisions).where(and(eq(workoutRevisions.workoutId, id), eq(workoutRevisions.userId, req.session.userId!))).orderBy(desc(workoutRevisions.revisionNumber));
    return res.json({ revisions, disclosure: "Each revision is an immutable snapshot of the submitted workout after creation or correction. It records what LyfeOS stored; it does not validate performance or capability." });
  });

  app.post("/api/workouts", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = workoutSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid workout.", details: parsed.error.flatten() });
    const userId = req.session.userId!;
    const rawMutationId = req.header("x-lyfeos-mutation-id");
    const clientMutationId = healthMutationId(rawMutationId);
    if (rawMutationId && !clientMutationId) return res.status(400).json({ error: "Invalid mutation identity." });
    const mutationPayloadHash = clientMutationId ? healthMutationPayloadHash(parsed.data) : null;
    if (clientMutationId) {
      const [existing] = await db.select({ id: workouts.id, mutationPayloadHash: workouts.mutationPayloadHash }).from(workouts).where(and(eq(workouts.userId, userId), eq(workouts.clientMutationId, clientMutationId))).limit(1);
      if (existing) {
        if (existing.mutationPayloadHash !== mutationPayloadHash) return res.status(409).json({ error: "This mutation identity was already used for a different workout." });
        return res.json({ workout: await workoutWithChildren(existing.id, userId), replayed: true });
      }
    }
    const occurredAt = parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) return res.status(400).json({ error: "Invalid workout time." });
    try {
      const timeContext = requestTimeContext(req, occurredAt);
      const workout = await db.transaction(async (tx) => {
        const [created] = await tx.insert(workouts).values({ userId, activityType: parsed.data.activityType, durationMinutes: parsed.data.durationMinutes || null, perceivedExertion: parsed.data.perceivedExertion || null, movingTimeSeconds: parsed.data.movingTimeSeconds ?? null, elevationGainMeters: parsed.data.elevationGainMeters ?? null, averageHeartRateBpm: parsed.data.averageHeartRateBpm ?? null, maxHeartRateBpm: parsed.data.maxHeartRateBpm ?? null, heartRateSource: parsed.data.heartRateSource ?? null, occurredAt, note: parsed.data.note || null, source: "manual", clientMutationId, mutationPayloadHash, recordedTimeZone: timeContext.timeZone, recordedUtcOffsetMinutes: timeContext.utcOffsetMinutes }).returning();
        const exercises = [];
        for (let sortOrder = 0; sortOrder < parsed.data.exercises.length; sortOrder += 1) {
          const exercise = parsed.data.exercises[sortOrder];
          const setRecords = legacySetRecords(exercise);
          const [createdExercise] = await tx.insert(workoutExercises).values({ workoutId: created.id, name: exercise.name, sets: exercise.sets || (setRecords.length || null), reps: exercise.reps || null, loadValue: exercise.loadValue || null, loadUnit: exercise.loadUnit || null, distanceMeters: exercise.distanceMeters || null, durationSeconds: exercise.durationSeconds || null, note: exercise.note || null, sortOrder }).returning();
          const createdSets = setRecords.length ? await tx.insert(workoutSets).values(setRecords.map((setRecord, setOrder) => ({ workoutExerciseId: createdExercise.id, setOrder, reps: setRecord.reps || null, loadValue: setRecord.loadValue || null, loadUnit: setRecord.loadUnit || null, distanceMeters: setRecord.distanceMeters || null, durationSeconds: setRecord.durationSeconds || null, perceivedExertion: setRecord.perceivedExertion || null, repsInReserve: setRecord.repsInReserve ?? null, completed: setRecord.completed ?? true, note: setRecord.note || null }))).returning() : [];
          exercises.push({ ...createdExercise, setRecords: createdSets });
        }
        await tx.insert(workoutRevisions).values({ userId, workoutId: created.id, revisionNumber: 1, snapshot: { workout: created, exercises } });
        return { ...created, exercises };
      });
      return res.status(201).json({ workout, replayed: false });
    } catch (error) {
      if (!clientMutationId) throw error;
      const [existing] = await db.select({ id: workouts.id, mutationPayloadHash: workouts.mutationPayloadHash }).from(workouts).where(and(eq(workouts.userId, userId), eq(workouts.clientMutationId, clientMutationId))).limit(1);
      if (!existing) throw error;
      if (existing.mutationPayloadHash !== mutationPayloadHash) return res.status(409).json({ error: "This mutation identity was already used for a different workout." });
      return res.json({ workout: await workoutWithChildren(existing.id, userId), replayed: true });
    }
  });

  app.put("/api/workouts/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const parsed = workoutSchema.safeParse(req.body);
    if (!Number.isInteger(id) || !parsed.success) return res.status(400).json({ error: "Invalid workout.", details: parsed.success ? undefined : parsed.error.flatten() });
    const expectedRevision = parseExpectedResourceRevision(req.header("x-lyfeos-expected-revision"));
    if (!expectedRevision.ok) return res.status(expectedRevision.reason === "missing" ? 428 : 400).json({ error: expectedRevision.reason === "missing" ? "Reload this workout before saving a correction." : "Invalid expected workout revision." });
    const occurredAt = parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) return res.status(400).json({ error: "Invalid workout time." });
    const outcome = await db.transaction(async (tx) => {
      const locked = await tx.execute(sql`SELECT id FROM workouts WHERE id = ${id} AND user_id = ${req.session.userId!} FOR UPDATE`);
      if (!locked.rows.length) return { kind: "missing" } as const;
      const [latestRevision] = await tx.select({ revisionNumber: workoutRevisions.revisionNumber }).from(workoutRevisions).where(and(eq(workoutRevisions.workoutId, id), eq(workoutRevisions.userId, req.session.userId!))).orderBy(desc(workoutRevisions.revisionNumber)).limit(1);
      const currentRevision = latestRevision?.revisionNumber || 0;
      if (expectedRevision.revision !== currentRevision) return { kind: "conflict", currentRevision } as const;
      const [updated] = await tx.update(workouts).set({
        activityType: parsed.data.activityType,
        durationMinutes: parsed.data.durationMinutes || null,
        perceivedExertion: parsed.data.perceivedExertion || null,
        movingTimeSeconds: parsed.data.movingTimeSeconds ?? null,
        elevationGainMeters: parsed.data.elevationGainMeters ?? null,
        averageHeartRateBpm: parsed.data.averageHeartRateBpm ?? null,
        maxHeartRateBpm: parsed.data.maxHeartRateBpm ?? null,
        heartRateSource: parsed.data.heartRateSource ?? null,
        occurredAt,
        note: parsed.data.note || null,
      }).where(and(eq(workouts.id, id), eq(workouts.userId, req.session.userId!))).returning();
      if (!updated) return { kind: "missing" } as const;
      await tx.delete(workoutExercises).where(eq(workoutExercises.workoutId, updated.id));
      const exercises = [];
      for (let sortOrder = 0; sortOrder < parsed.data.exercises.length; sortOrder += 1) {
        const exercise = parsed.data.exercises[sortOrder];
        const setRecords = legacySetRecords(exercise);
        const [createdExercise] = await tx.insert(workoutExercises).values({ workoutId: updated.id, name: exercise.name, sets: exercise.sets || (setRecords.length || null), reps: exercise.reps || null, loadValue: exercise.loadValue || null, loadUnit: exercise.loadUnit || null, distanceMeters: exercise.distanceMeters || null, durationSeconds: exercise.durationSeconds || null, note: exercise.note || null, sortOrder }).returning();
        const createdSets = setRecords.length ? await tx.insert(workoutSets).values(setRecords.map((setRecord, setOrder) => ({ workoutExerciseId: createdExercise.id, setOrder, reps: setRecord.reps || null, loadValue: setRecord.loadValue || null, loadUnit: setRecord.loadUnit || null, distanceMeters: setRecord.distanceMeters || null, durationSeconds: setRecord.durationSeconds || null, perceivedExertion: setRecord.perceivedExertion || null, repsInReserve: setRecord.repsInReserve ?? null, completed: setRecord.completed ?? true, note: setRecord.note || null }))).returning() : [];
        exercises.push({ ...createdExercise, setRecords: createdSets });
      }
      const nextRevision = currentRevision + 1;
      await tx.insert(workoutRevisions).values({ userId: req.session.userId!, workoutId: updated.id, revisionNumber: nextRevision, snapshot: { workout: updated, exercises } });
      return { kind: "updated", workout: { ...updated, currentRevision: nextRevision, exercises } } as const;
    });
    if (outcome.kind === "missing") return res.status(404).json({ error: "Workout not found." });
    if (outcome.kind === "conflict") return res.status(409).json({ error: "This workout changed after you opened it. Reload it before applying another correction.", currentRevision: outcome.currentRevision });
    return res.json({ workout: outcome.workout });
  });

  app.delete("/api/workouts/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const expectedRevision = parseExpectedResourceRevision(req.header("x-lyfeos-expected-revision"));
    if (!Number.isInteger(id) || (!expectedRevision.ok && expectedRevision.reason === "invalid")) return res.status(400).json({ error: "Invalid workout." });
    if (!expectedRevision.ok) return res.status(428).json({ error: "Reload this workout before deleting it." });
    const userId = req.session.userId!;
    const deleted = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM workouts WHERE id = ${id} AND user_id = ${userId} FOR UPDATE`);
      const [workout] = await tx.select().from(workouts).where(and(eq(workouts.id, id), eq(workouts.userId, userId))).limit(1);
      if (!workout) return { kind: "missing" as const };
      const [latestRevision] = await tx.select({ revisionNumber: workoutRevisions.revisionNumber }).from(workoutRevisions).where(and(eq(workoutRevisions.workoutId, id), eq(workoutRevisions.userId, userId))).orderBy(desc(workoutRevisions.revisionNumber)).limit(1);
      const currentRevision = latestRevision?.revisionNumber || 0;
      if (currentRevision !== expectedRevision.revision) return { kind: "conflict" as const, currentRevision };
      const exerciseRows = await tx.select().from(workoutExercises).where(eq(workoutExercises.workoutId, workout.id));
      const setRows = exerciseRows.length ? await tx.select().from(workoutSets).where(inArray(workoutSets.workoutExerciseId, exerciseRows.map((exercise) => exercise.id))) : [];
      const linkedProgramSessions = await tx.select({ id: workoutProgramSessions.id }).from(workoutProgramSessions).where(and(eq(workoutProgramSessions.userId, userId), eq(workoutProgramSessions.completedWorkoutId, workout.id)));
      const receiptId = newDeletionReceiptId();
      const expiresAt = deletionReceiptExpiry();
      await tx.insert(healthDeletionReceipts).values({ id: receiptId, userId, resourceType: "workout", resourceSnapshot: { workout, linkedProgramSessionIds: linkedProgramSessions.map((session) => session.id), exercises: exerciseRows.map((exercise) => ({ ...exercise, setRecords: setRows.filter((setRecord) => setRecord.workoutExerciseId === exercise.id) })) }, expiresAt });
      await tx.delete(workouts).where(and(eq(workouts.id, id), eq(workouts.userId, userId)));
      return { kind: "deleted" as const, receiptId, expiresAt };
    });
    if (deleted.kind === "missing") return res.status(404).json({ error: "Workout not found." });
    if (deleted.kind === "conflict") return res.status(409).json({ error: "This workout changed after you opened it. It was not deleted.", currentRevision: deleted.currentRevision });
    return res.json({ receiptId: deleted.receiptId, expiresAt: deleted.expiresAt });
  });

  app.post("/api/workouts/deletions/:receiptId/restore", isAuthenticated, async (req: Request, res: Response) => {
    const receiptId = String(req.params.receiptId || "");
    const userId = req.session.userId!;
    const restored = await db.transaction(async (tx) => {
      const [receipt] = await tx.select().from(healthDeletionReceipts).where(and(eq(healthDeletionReceipts.id, receiptId), eq(healthDeletionReceipts.userId, userId), eq(healthDeletionReceipts.resourceType, "workout"))).limit(1);
      if (!receipt || receipt.restoredAt || receipt.expiresAt.getTime() <= Date.now()) return null;
      const snapshot = receipt.resourceSnapshot as { workout: typeof workouts.$inferSelect; linkedProgramSessionIds?: number[]; exercises: Array<typeof workoutExercises.$inferSelect & { setRecords: Array<typeof workoutSets.$inferSelect> }> };
      const source = snapshot.workout;
      const [workout] = await tx.insert(workouts).values({
        userId, activityType: source.activityType, durationMinutes: source.durationMinutes, perceivedExertion: source.perceivedExertion,
        movingTimeSeconds: source.movingTimeSeconds, elevationGainMeters: source.elevationGainMeters, averageHeartRateBpm: source.averageHeartRateBpm,
        maxHeartRateBpm: source.maxHeartRateBpm, heartRateSource: source.heartRateSource, occurredAt: new Date(source.occurredAt),
        source: source.source, note: source.note, clientMutationId: null, mutationPayloadHash: null, recordedTimeZone: source.recordedTimeZone, recordedUtcOffsetMinutes: source.recordedUtcOffsetMinutes,
      }).returning();
      const exercises = [];
      for (const exercise of snapshot.exercises) {
        const [createdExercise] = await tx.insert(workoutExercises).values({ workoutId: workout.id, name: exercise.name, sets: exercise.sets, reps: exercise.reps, loadValue: exercise.loadValue, loadUnit: exercise.loadUnit, distanceMeters: exercise.distanceMeters, durationSeconds: exercise.durationSeconds, sortOrder: exercise.sortOrder, note: exercise.note }).returning();
        const createdSets = exercise.setRecords.length ? await tx.insert(workoutSets).values(exercise.setRecords.map((setRecord) => ({ workoutExerciseId: createdExercise.id, setOrder: setRecord.setOrder, reps: setRecord.reps, loadValue: setRecord.loadValue, loadUnit: setRecord.loadUnit, distanceMeters: setRecord.distanceMeters, durationSeconds: setRecord.durationSeconds, perceivedExertion: setRecord.perceivedExertion, repsInReserve: setRecord.repsInReserve, completed: setRecord.completed, note: setRecord.note }))).returning() : [];
        exercises.push({ ...createdExercise, setRecords: createdSets });
      }
      await tx.insert(workoutRevisions).values({ userId, workoutId: workout.id, revisionNumber: 1, snapshot: { workout, exercises } });
      if (snapshot.linkedProgramSessionIds?.length) await tx.update(workoutProgramSessions).set({ status: "completed", completedWorkoutId: workout.id, completionLinkLostAt: null, updatedAt: new Date() }).where(and(
        eq(workoutProgramSessions.userId, userId), inArray(workoutProgramSessions.id, snapshot.linkedProgramSessionIds), isNull(workoutProgramSessions.completedWorkoutId),
      ));
      const [claimed] = await tx.update(healthDeletionReceipts).set({ restoredAt: new Date() }).where(and(eq(healthDeletionReceipts.id, receiptId), eq(healthDeletionReceipts.userId, userId), isNull(healthDeletionReceipts.restoredAt))).returning({ id: healthDeletionReceipts.id });
      if (!claimed) throw new Error("Deletion receipt was already restored.");
      return { ...workout, exercises };
    });
    return restored ? res.status(201).json({ workout: restored }) : res.status(410).json({ error: "This undo is unavailable, expired, or already used." });
  });
}
