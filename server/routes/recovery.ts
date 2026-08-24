import type { Express, Request, Response } from "express";
import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import { z } from "zod";
import { recoveryActivities, recoveryRoutines, recoveryTagPolicies } from "@shared/schema";
import { db } from "../db";
import { dateInTimeZone, dayBounds, localDate, recoveryRoutineDueOnDate, requestTimeContext, zonedDateTime } from "../health-fitness";
import { isAuthenticated } from "./middleware";
import { healthMutationId, healthMutationPayloadHash } from "../health-mutation-integrity";
import { normalizeRecoveryTag } from "@shared/recovery-tags";

const recoveryTypes = ["sauna", "breath_training", "yoga", "meditation", "red_light", "mobility", "walk", "stretching", "cold_exposure", "other"] as const;
const recoveryInput = z.object({ activityType: z.enum(recoveryTypes), customLabel: z.string().trim().min(1).max(120).nullable().optional(), durationMinutes: z.number().int().positive().max(1440).nullable().optional(), intensity: z.number().int().min(1).max(10).nullable().optional(), perceivedEffect: z.number().int().min(1).max(5).nullable().optional(), occurredAt: z.string().datetime().optional(), note: z.string().trim().max(500).nullable().optional(), tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]).transform((tags) => Array.from(new Set(tags))) });
const recoverySchema = recoveryInput
  .refine((input) => input.activityType !== "other" || !!input.customLabel, { message: "Name a custom recovery activity." });
const recoveryUpdateSchema = recoveryInput.omit({ occurredAt: true })
  .refine((input) => input.activityType !== "other" || !!input.customLabel, { message: "Name a custom recovery activity." });
const routineInput = z.object({
  name: z.string().trim().min(1).max(120),
  activityType: z.enum(recoveryTypes),
  customLabel: z.string().trim().min(1).max(120).nullable().optional(),
  durationMinutes: z.number().int().positive().max(1440).nullable().optional(),
  intensity: z.number().int().min(1).max(10).nullable().optional(),
  cadence: z.enum(["daily", "specific_days", "as_needed"]).default("daily"),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]).transform((days) => Array.from(new Set(days)).sort()),
  timeOfDay: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  reminderEnabled: z.boolean().default(false),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]).transform((tags) => Array.from(new Set(tags))),
  note: z.string().trim().max(500).nullable().optional(),
  active: z.boolean().default(true),
}).superRefine((input, context) => {
  if (input.activityType === "other" && !input.customLabel) context.addIssue({ code: z.ZodIssueCode.custom, message: "Name a custom recovery activity." });
  if (input.cadence === "specific_days" && input.weekdays.length === 0) context.addIssue({ code: z.ZodIssueCode.custom, message: "Choose at least one weekday." });
});
const routineLogInput = z.object({
  date: z.string().refine((value) => !!localDate(value), "Choose a valid date."),
  perceivedEffect: z.number().int().min(1).max(5).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});
const tagPolicyInput = z.object({
  tag: z.string().trim().min(1).max(40),
  classification: z.enum(["private_sensitive", "private_standard"]),
});

function stringQuery(value: unknown, max = 40): string | undefined {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max ? value.trim() : undefined;
}

export function registerRecoveryRoutes(app: Express): void {
  app.get("/api/recovery-tag-policies", isAuthenticated, async (req: Request, res: Response) => {
    const userId = req.session.userId!;
    const [activities, routines, policies] = await Promise.all([
      db.select({ tags: recoveryActivities.tags }).from(recoveryActivities).where(eq(recoveryActivities.userId, userId)),
      db.select({ tags: recoveryRoutines.tags }).from(recoveryRoutines).where(eq(recoveryRoutines.userId, userId)),
      db.select().from(recoveryTagPolicies).where(eq(recoveryTagPolicies.userId, userId)).orderBy(asc(recoveryTagPolicies.displayTag)),
    ]);
    const vocabulary = new Map<string, string>();
    for (const record of [...activities, ...routines]) for (const rawTag of Array.isArray(record.tags) ? record.tags : []) {
      const tag = String(rawTag).trim();
      const normalized = normalizeRecoveryTag(tag);
      if (normalized && !vocabulary.has(normalized)) vocabulary.set(normalized, tag);
    }
    for (const policy of policies) if (!vocabulary.has(policy.normalizedTag)) vocabulary.set(policy.normalizedTag, policy.displayTag);
    const policyByTag = new Map(policies.map((policy) => [policy.normalizedTag, policy]));
    return res.json({
      tags: Array.from(vocabulary.entries()).map(([normalizedTag, displayTag]) => ({
        normalizedTag, displayTag,
        classification: policyByTag.get(normalizedTag)?.classification || "private_sensitive",
        explicitlyClassified: policyByTag.has(normalizedTag), sharing: "excluded",
      })).sort((left, right) => left.displayTag.localeCompare(right.displayTag)),
      disclosure: "Every recovery tag is private and excluded from AI, planning, social, and cross-product federation. New and unclassified tags default to private sensitive; changing a tag to standard private does not enable sharing.",
    });
  });

  app.put("/api/recovery-tag-policies", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = tagPolicyInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid recovery tag policy.", details: parsed.error.flatten() });
    const normalizedTag = normalizeRecoveryTag(parsed.data.tag);
    const [policy] = await db.insert(recoveryTagPolicies).values({
      userId: req.session.userId!, normalizedTag, displayTag: parsed.data.tag, classification: parsed.data.classification,
    }).onConflictDoUpdate({
      target: [recoveryTagPolicies.userId, recoveryTagPolicies.normalizedTag],
      set: { displayTag: parsed.data.tag, classification: parsed.data.classification, updatedAt: new Date() },
    }).returning();
    return res.json({ policy, sharing: "excluded" });
  });

  app.get("/api/recovery-activities", isAuthenticated, async (req: Request, res: Response) => {
    const { timeZone } = requestTimeContext(req);
    const date = localDate(req.query.date) || dateInTimeZone(new Date(), timeZone);
    const { start, end } = dayBounds(date, timeZone);
    const activityType = stringQuery(req.query.activityType);
    const tag = stringQuery(req.query.tag);
    const conditions = [eq(recoveryActivities.userId, req.session.userId!), gte(recoveryActivities.occurredAt, start), lt(recoveryActivities.occurredAt, end)];
    if (activityType && recoveryTypes.includes(activityType as typeof recoveryTypes[number])) conditions.push(eq(recoveryActivities.activityType, activityType));
    const rows = await db.select().from(recoveryActivities).where(and(...conditions)).orderBy(desc(recoveryActivities.occurredAt));
    const activities = tag ? rows.filter((activity) => Array.isArray(activity.tags) && activity.tags.includes(tag)) : rows;
    return res.json({ date, activities, disclosure: "Recovery activities are private self-reports. LyfeOS does not infer treatment, readiness, or health outcomes from them." });
  });

  app.post("/api/recovery-activities", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = recoverySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid recovery activity.", details: parsed.error.flatten() });
    const userId = req.session.userId!;
    const rawMutationId = req.header("x-lyfeos-mutation-id");
    const clientMutationId = healthMutationId(rawMutationId);
    if (rawMutationId && !clientMutationId) return res.status(400).json({ error: "Invalid mutation identity." });
    const mutationPayloadHash = clientMutationId ? healthMutationPayloadHash(parsed.data) : null;
    if (clientMutationId) {
      const [existing] = await db.select().from(recoveryActivities).where(and(eq(recoveryActivities.userId, userId), eq(recoveryActivities.clientMutationId, clientMutationId))).limit(1);
      if (existing) return existing.mutationPayloadHash === mutationPayloadHash
        ? res.json({ activity: existing, replayed: true })
        : res.status(409).json({ error: "This mutation identity was already used for a different recovery activity." });
    }
    const occurredAt = parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) return res.status(400).json({ error: "Invalid recovery time." });
    const timeContext = requestTimeContext(req, occurredAt);
    try {
      const [activity] = await db.insert(recoveryActivities).values({ userId, activityType: parsed.data.activityType, customLabel: parsed.data.customLabel || null, durationMinutes: parsed.data.durationMinutes ?? null, intensity: parsed.data.intensity ?? null, perceivedEffect: parsed.data.perceivedEffect ?? null, occurredAt, note: parsed.data.note || null, tags: parsed.data.tags, source: "manual", recordedTimeZone: timeContext.timeZone, recordedUtcOffsetMinutes: timeContext.utcOffsetMinutes, clientMutationId, mutationPayloadHash }).returning();
      return res.status(201).json({ activity, replayed: false });
    } catch (error) {
      if (!clientMutationId) throw error;
      const [existing] = await db.select().from(recoveryActivities).where(and(eq(recoveryActivities.userId, userId), eq(recoveryActivities.clientMutationId, clientMutationId))).limit(1);
      if (!existing) throw error;
      return existing.mutationPayloadHash === mutationPayloadHash
        ? res.json({ activity: existing, replayed: true })
        : res.status(409).json({ error: "This mutation identity was already used for a different recovery activity." });
    }
  });

  app.patch("/api/recovery-activities/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const parsed = recoveryUpdateSchema.safeParse(req.body);
    if (!Number.isInteger(id) || !parsed.success) return res.status(400).json({ error: "Invalid recovery activity.", details: parsed.success ? undefined : parsed.error.flatten() });
    const [activity] = await db.update(recoveryActivities).set({
      activityType: parsed.data.activityType, customLabel: parsed.data.customLabel || null,
      durationMinutes: parsed.data.durationMinutes ?? null, intensity: parsed.data.intensity ?? null,
      perceivedEffect: parsed.data.perceivedEffect ?? null, note: parsed.data.note || null, tags: parsed.data.tags,
    }).where(and(eq(recoveryActivities.id, id), eq(recoveryActivities.userId, req.session.userId!))).returning();
    return activity ? res.json({ activity }) : res.status(404).json({ error: "Recovery activity not found." });
  });

  app.get("/api/recovery-activities/trends", isAuthenticated, async (req: Request, res: Response) => {
    const requestedDays = Number(req.query.days || 14);
    const days = Number.isInteger(requestedDays) && requestedDays >= 7 && requestedDays <= 3650 ? requestedDays : 14;
    const activityType = stringQuery(req.query.activityType);
    const tag = stringQuery(req.query.tag);
    const { timeZone } = requestTimeContext(req);
    const endDate = dateInTimeZone(new Date(), timeZone);
    const startDay = new Date(`${endDate}T00:00:00.000Z`); startDay.setUTCDate(startDay.getUTCDate() - (days - 1));
    const startDate = startDay.toISOString().slice(0, 10);
    const { start } = dayBounds(startDate, timeZone);
    const conditions = [eq(recoveryActivities.userId, req.session.userId!), gte(recoveryActivities.occurredAt, start)];
    if (activityType && recoveryTypes.includes(activityType as typeof recoveryTypes[number])) conditions.push(eq(recoveryActivities.activityType, activityType));
    const rows = await db.select().from(recoveryActivities).where(and(...conditions)).orderBy(recoveryActivities.occurredAt);
    const activities = tag ? rows.filter((activity) => Array.isArray(activity.tags) && activity.tags.includes(tag)) : rows;
    const byDate = new Map<string, { minutes: number; entries: number }>();
    for (const activity of activities) {
      const date = dateInTimeZone(activity.occurredAt, timeZone);
      const current = byDate.get(date) || { minutes: 0, entries: 0 };
      byDate.set(date, { minutes: current.minutes + (activity.durationMinutes || 0), entries: current.entries + 1 });
    }
    const trend = Array.from({ length: days }, (_, index) => {
      const date = new Date(`${startDate}T00:00:00.000Z`);
      date.setUTCDate(date.getUTCDate() + index);
      const key = date.toISOString().slice(0, 10);
      return { date: key, ...(byDate.get(key) || { minutes: 0, entries: 0 }) };
    });
    return res.json({ days, timeZone, trend, disclosure: "This chart summarizes only self-reported recovery activity records. It does not infer readiness, treatment, or outcomes." });
  });

  app.delete("/api/recovery-activities/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid recovery activity." });
    const [activity] = await db.delete(recoveryActivities).where(and(eq(recoveryActivities.id, id), eq(recoveryActivities.userId, req.session.userId!))).returning({ id: recoveryActivities.id });
    return activity ? res.status(204).send() : res.status(404).json({ error: "Recovery activity not found." });
  });

  app.get("/api/recovery-routines", isAuthenticated, async (req: Request, res: Response) => {
    const { timeZone } = requestTimeContext(req);
    const date = localDate(req.query.date) || dateInTimeZone(new Date(), timeZone);
    const includeInactive = req.query.includeInactive === "true";
    const conditions = [eq(recoveryRoutines.userId, req.session.userId!)];
    if (!includeInactive) conditions.push(eq(recoveryRoutines.active, true));
    const routines = await db.select().from(recoveryRoutines).where(and(...conditions)).orderBy(asc(recoveryRoutines.timeOfDay), asc(recoveryRoutines.name));
    const { start, end } = dayBounds(date, timeZone);
    const loggedActivities = await db.select().from(recoveryActivities).where(and(
      eq(recoveryActivities.userId, req.session.userId!),
      gte(recoveryActivities.occurredAt, start),
      lt(recoveryActivities.occurredAt, end),
    ));
    const loggedByRoutine = new Map(loggedActivities.filter((activity) => activity.routineId !== null).map((activity) => [activity.routineId!, activity]));
    return res.json({
      date,
      routines: routines.map((routine) => ({
        ...routine,
        due: routine.active && recoveryRoutineDueOnDate(routine.cadence as "daily" | "specific_days" | "as_needed", Array.isArray(routine.weekdays) ? routine.weekdays as number[] : [], date),
        loggedActivity: loggedByRoutine.get(routine.id) || null,
      })),
      disclosure: "Routine reminders are in-app schedule cues. A recovery activity is recorded only after you explicitly log it.",
    });
  });

  app.post("/api/recovery-routines", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = routineInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid recovery routine.", details: parsed.error.flatten() });
    const [routine] = await db.insert(recoveryRoutines).values({
      userId: req.session.userId!, ...parsed.data,
      customLabel: parsed.data.customLabel || null, durationMinutes: parsed.data.durationMinutes ?? null,
      intensity: parsed.data.intensity ?? null, timeOfDay: parsed.data.timeOfDay || null,
      note: parsed.data.note || null,
    }).returning();
    return res.status(201).json({ routine });
  });

  app.patch("/api/recovery-routines/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const parsed = routineInput.safeParse(req.body);
    if (!Number.isInteger(id) || !parsed.success) return res.status(400).json({ error: "Invalid recovery routine.", details: parsed.success ? undefined : parsed.error.flatten() });
    const [routine] = await db.update(recoveryRoutines).set({
      ...parsed.data, customLabel: parsed.data.customLabel || null,
      durationMinutes: parsed.data.durationMinutes ?? null, intensity: parsed.data.intensity ?? null,
      timeOfDay: parsed.data.timeOfDay || null, note: parsed.data.note || null, updatedAt: new Date(),
    }).where(and(eq(recoveryRoutines.id, id), eq(recoveryRoutines.userId, req.session.userId!))).returning();
    return routine ? res.json({ routine }) : res.status(404).json({ error: "Recovery routine not found." });
  });

  app.post("/api/recovery-routines/:id/log", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const parsed = routineLogInput.safeParse(req.body);
    if (!Number.isInteger(id) || !parsed.success) return res.status(400).json({ error: "Invalid routine log.", details: parsed.success ? undefined : parsed.error.flatten() });
    const [routine] = await db.select().from(recoveryRoutines).where(and(eq(recoveryRoutines.id, id), eq(recoveryRoutines.userId, req.session.userId!))).limit(1);
    if (!routine || !routine.active) return res.status(404).json({ error: "Active recovery routine not found." });
    const baseTimeContext = requestTimeContext(req);
    const { start, end } = dayBounds(parsed.data.date, baseTimeContext.timeZone);
    const [existing] = await db.select({ id: recoveryActivities.id }).from(recoveryActivities).where(and(
      eq(recoveryActivities.userId, req.session.userId!), eq(recoveryActivities.routineId, id),
      gte(recoveryActivities.occurredAt, start), lt(recoveryActivities.occurredAt, end),
    )).limit(1);
    if (existing) return res.status(409).json({ error: "This routine is already logged for that date.", activityId: existing.id });
    const clock = routine.timeOfDay || "12:00";
    const [hours, minutes] = clock.split(":").map(Number);
    const occurredAt = zonedDateTime(parsed.data.date, baseTimeContext.timeZone, hours, minutes);
    const timeContext = requestTimeContext(req, occurredAt);
    const [activity] = await db.insert(recoveryActivities).values({
      userId: req.session.userId!, routineId: routine.id, activityType: routine.activityType,
      customLabel: routine.customLabel, durationMinutes: routine.durationMinutes, intensity: routine.intensity,
      perceivedEffect: parsed.data.perceivedEffect ?? null, occurredAt, source: "routine_confirmation",
      note: parsed.data.note || routine.note, tags: routine.tags, recordedTimeZone: timeContext.timeZone, recordedUtcOffsetMinutes: timeContext.utcOffsetMinutes,
    }).returning();
    return res.status(201).json({ activity, disclosure: "Logged from your explicit confirmation; no completion was inferred." });
  });

  app.delete("/api/recovery-routines/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid recovery routine." });
    const [routine] = await db.delete(recoveryRoutines).where(and(eq(recoveryRoutines.id, id), eq(recoveryRoutines.userId, req.session.userId!))).returning({ id: recoveryRoutines.id });
    return routine ? res.status(204).send() : res.status(404).json({ error: "Recovery routine not found." });
  });
}
