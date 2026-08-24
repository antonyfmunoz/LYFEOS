import type { Express, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import { quests, workoutPrograms, workoutProgramSessions, workouts, workoutTemplates } from "@shared/schema";
import { db } from "../db";
import { localDate } from "../health-fitness";
import { calendarDayDelta, recurringSeriesShiftPlan, recurringWeeklyDates, trainingProgramReport } from "../training-planning";
import { isAuthenticated } from "./middleware";

const programSchema = z.object({ name: z.string().trim().min(1).max(120), note: z.string().trim().max(1000).nullable() });
const sessionSchema = z.object({
  title: z.string().trim().min(1).max(120),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  templateId: z.number().int().positive().nullable(),
  missionId: z.number().int().positive().nullable().default(null),
  status: z.enum(["planned", "skipped"]),
  substitutionReason: z.string().trim().min(1).max(500).nullable().optional(),
  note: z.string().trim().max(1000).nullable(),
});
const recurringSessionSchema = sessionSchema.omit({ status: true, substitutionReason: true }).extend({
  repeatEveryWeeks: z.number().int().min(1).max(12),
  occurrences: z.number().int().min(2).max(104),
});
const seriesSessionSchema = sessionSchema.omit({ status: true });

async function ownedProgram(id: number, userId: number) {
  const [program] = await db.select().from(workoutPrograms).where(and(eq(workoutPrograms.id, id), eq(workoutPrograms.userId, userId))).limit(1);
  return program;
}

async function validOwnedTemplate(id: number | null, userId: number): Promise<boolean> {
  if (id === null) return true;
  const [template] = await db.select({ id: workoutTemplates.id }).from(workoutTemplates).where(and(eq(workoutTemplates.id, id), eq(workoutTemplates.userId, userId))).limit(1);
  return !!template;
}

async function validOwnedMission(id: number | null, userId: number): Promise<boolean> {
  if (id === null) return true;
  const [mission] = await db.select({ id: quests.id }).from(quests).where(and(eq(quests.id, id), eq(quests.userId, userId), isNull(quests.deletedAt))).limit(1);
  return !!mission;
}

export function registerTrainingProgramRoutes(app: Express): void {
  app.get("/api/workout-programs", isAuthenticated, async (req: Request, res: Response) => {
    const userId = req.session.userId!;
    const programs = await db.select().from(workoutPrograms)
      .where(req.query.includeArchived === "true" ? eq(workoutPrograms.userId, userId) : and(eq(workoutPrograms.userId, userId), isNull(workoutPrograms.archivedAt)))
      .orderBy(desc(workoutPrograms.updatedAt));
    const sessions = programs.length ? await db.select().from(workoutProgramSessions)
      .where(and(eq(workoutProgramSessions.userId, userId), inArray(workoutProgramSessions.programId, programs.map((program) => program.id))))
      .orderBy(asc(workoutProgramSessions.scheduledDate), asc(workoutProgramSessions.id)) : [];
    return res.json({ programs: programs.map((program) => ({ ...program, sessions: sessions.filter((session) => session.programId === program.id) })), disclosure: "Program sessions are plans. A session is completed only when linked to one of your submitted workout records." });
  });

  app.get("/api/workout-program-mission-options", isAuthenticated, async (req: Request, res: Response) => {
    const missions = await db.select({ id: quests.id, title: quests.title, completed: quests.completed }).from(quests)
      .where(and(eq(quests.userId, req.session.userId!), isNull(quests.deletedAt)))
      .orderBy(desc(quests.updatedAt), desc(quests.id))
      .limit(500);
    return res.json({ missions, disclosure: "A training session can reference a private mission for context. Scheduling or completing the session never completes or changes the mission." });
  });

  app.get("/api/workout-programs/:id/report", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const startDate = localDate(req.query.start);
    const endDate = localDate(req.query.end);
    const userId = req.session.userId!;
    if (!Number.isInteger(id) || !startDate || !endDate || startDate > endDate) return res.status(400).json({ error: "Choose a valid program report period." });
    const rangeDays = Math.round((new Date(`${endDate}T00:00:00.000Z`).getTime() - new Date(`${startDate}T00:00:00.000Z`).getTime()) / 86_400_000) + 1;
    if (rangeDays > 3660) return res.status(400).json({ error: "Program reports are limited to ten years." });
    const program = await ownedProgram(id, userId);
    if (!program) return res.status(404).json({ error: "Workout program not found." });
    const sessions = await db.select().from(workoutProgramSessions).where(and(
      eq(workoutProgramSessions.userId, userId), eq(workoutProgramSessions.programId, id),
      gte(workoutProgramSessions.scheduledDate, startDate), lte(workoutProgramSessions.scheduledDate, endDate),
    )).orderBy(asc(workoutProgramSessions.scheduledDate), asc(workoutProgramSessions.id));
    const linkedWorkoutIds = Array.from(new Set(sessions.flatMap((session) => session.completedWorkoutId == null ? [] : [session.completedWorkoutId])));
    const linkedWorkouts = linkedWorkoutIds.length ? await db.select({ id: workouts.id, occurredAt: workouts.occurredAt, activityType: workouts.activityType }).from(workouts)
      .where(and(eq(workouts.userId, userId), inArray(workouts.id, linkedWorkoutIds))) : [];
    return res.json({
      program: { id: program.id, name: program.name },
      startDate,
      endDate,
      ...trainingProgramReport(sessions, linkedWorkouts),
      disclosure: "This compares scheduled plan records with retained completion links. It is not an adherence, fitness, readiness, or health score. A missing link means the submitted workout evidence is no longer available and is not counted as linked completion.",
    });
  });

  app.post("/api/workout-programs", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = programSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid workout program.", details: parsed.error.flatten() });
    const [program] = await db.insert(workoutPrograms).values({ userId: req.session.userId!, ...parsed.data, updatedAt: new Date() }).returning();
    return res.status(201).json({ program: { ...program, sessions: [] } });
  });

  app.patch("/api/workout-programs/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const parsed = programSchema.safeParse(req.body);
    if (!Number.isInteger(id) || !parsed.success) return res.status(400).json({ error: "Invalid workout program.", details: parsed.success ? undefined : parsed.error.flatten() });
    const [program] = await db.update(workoutPrograms).set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(workoutPrograms.id, id), eq(workoutPrograms.userId, req.session.userId!))).returning();
    return program ? res.json({ program }) : res.status(404).json({ error: "Workout program not found." });
  });

  app.patch("/api/workout-programs/:id/archive", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const parsed = z.object({ archived: z.boolean() }).safeParse(req.body);
    if (!Number.isInteger(id) || !parsed.success) return res.status(400).json({ error: "Invalid archive request." });
    const [program] = await db.update(workoutPrograms).set({ archivedAt: parsed.data.archived ? new Date() : null, updatedAt: new Date() })
      .where(and(eq(workoutPrograms.id, id), eq(workoutPrograms.userId, req.session.userId!))).returning();
    return program ? res.json({ program }) : res.status(404).json({ error: "Workout program not found." });
  });

  app.delete("/api/workout-programs/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid workout program." });
    const [program] = await db.delete(workoutPrograms).where(and(eq(workoutPrograms.id, id), eq(workoutPrograms.userId, req.session.userId!))).returning({ id: workoutPrograms.id });
    return program ? res.status(204).send() : res.status(404).json({ error: "Workout program not found." });
  });

  app.post("/api/workout-programs/:programId/sessions", isAuthenticated, async (req: Request, res: Response) => {
    const programId = Number(req.params.programId);
    const parsed = sessionSchema.safeParse(req.body);
    const userId = req.session.userId!;
    if (!Number.isInteger(programId) || !parsed.success || !localDate(parsed.data?.scheduledDate)) return res.status(400).json({ error: "Invalid program session.", details: parsed.success ? undefined : parsed.error.flatten() });
    if (!await ownedProgram(programId, userId)) return res.status(404).json({ error: "Workout program not found." });
    if (!await validOwnedTemplate(parsed.data.templateId, userId)) return res.status(400).json({ error: "Workout template not found." });
    if (!await validOwnedMission(parsed.data.missionId, userId)) return res.status(400).json({ error: "Mission not found." });
    const [session] = await db.insert(workoutProgramSessions).values({ userId, programId, ...parsed.data, originalTemplateId: parsed.data.templateId, completedWorkoutId: null, updatedAt: new Date() }).returning();
    return res.status(201).json({ session });
  });

  app.post("/api/workout-programs/:programId/sessions/recurring", isAuthenticated, async (req: Request, res: Response) => {
    const programId = Number(req.params.programId);
    const parsed = recurringSessionSchema.safeParse(req.body);
    const userId = req.session.userId!;
    if (!Number.isInteger(programId) || !parsed.success || !localDate(parsed.data?.scheduledDate)) return res.status(400).json({ error: "Invalid recurring program session.", details: parsed.success ? undefined : parsed.error.flatten() });
    if (!await ownedProgram(programId, userId)) return res.status(404).json({ error: "Workout program not found." });
    if (!await validOwnedTemplate(parsed.data.templateId, userId)) return res.status(400).json({ error: "Workout template not found." });
    if (!await validOwnedMission(parsed.data.missionId, userId)) return res.status(400).json({ error: "Mission not found." });
    const recurrenceGroupId = randomUUID();
    const dates = recurringWeeklyDates(parsed.data.scheduledDate, parsed.data.repeatEveryWeeks, parsed.data.occurrences);
    const sessions = await db.transaction(async (tx) => tx.insert(workoutProgramSessions).values(dates.map((scheduledDate, recurrenceIndex) => ({ userId, programId, title: parsed.data.title, scheduledDate, templateId: parsed.data.templateId, originalTemplateId: parsed.data.templateId, missionId: parsed.data.missionId, completedWorkoutId: null, status: "planned", note: parsed.data.note, recurrenceGroupId, recurrenceIndex, updatedAt: new Date() }))).returning());
    return res.status(201).json({ recurrenceGroupId, sessions });
  });

  app.patch("/api/workout-program-sessions/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const parsed = sessionSchema.safeParse(req.body);
    const userId = req.session.userId!;
    if (!Number.isInteger(id) || !parsed.success || !localDate(parsed.data?.scheduledDate)) return res.status(400).json({ error: "Invalid program session.", details: parsed.success ? undefined : parsed.error.flatten() });
    if (!await validOwnedTemplate(parsed.data.templateId, userId)) return res.status(400).json({ error: "Workout template not found." });
    if (!await validOwnedMission(parsed.data.missionId, userId)) return res.status(400).json({ error: "Mission not found." });
    const [current] = await db.select().from(workoutProgramSessions).where(and(eq(workoutProgramSessions.id, id), eq(workoutProgramSessions.userId, userId))).limit(1);
    if (!current) return res.status(404).json({ error: "Program session not found." });
    if (current.status === "completed") return res.status(409).json({ error: "Completed program sessions keep their submitted-workout evidence and cannot be edited as plans." });
    const isSubstitution = current.templateId !== parsed.data.templateId;
    if (isSubstitution && !parsed.data.substitutionReason) return res.status(400).json({ error: "Record why the planned template changed." });
    const [session] = await db.update(workoutProgramSessions).set({
      title: parsed.data.title, scheduledDate: parsed.data.scheduledDate, templateId: parsed.data.templateId, missionId: parsed.data.missionId, status: parsed.data.status, note: parsed.data.note,
      originalTemplateId: current.originalTemplateId ?? current.templateId, substitutionReason: isSubstitution ? parsed.data.substitutionReason : current.substitutionReason,
      substitutedAt: isSubstitution ? new Date() : current.substitutedAt, completedWorkoutId: null, completionLinkLostAt: null, updatedAt: new Date(),
    }).where(and(eq(workoutProgramSessions.id, id), eq(workoutProgramSessions.userId, userId))).returning();
    return session ? res.json({ session }) : res.status(404).json({ error: "Program session not found." });
  });

  app.patch("/api/workout-program-sessions/:id/series", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const parsed = seriesSessionSchema.safeParse(req.body);
    const userId = req.session.userId!;
    if (!Number.isInteger(id) || !parsed.success || !localDate(parsed.data?.scheduledDate)) return res.status(400).json({ error: "Invalid program series update.", details: parsed.success ? undefined : parsed.error.flatten() });
    if (!await validOwnedTemplate(parsed.data.templateId, userId)) return res.status(400).json({ error: "Workout template not found." });
    if (!await validOwnedMission(parsed.data.missionId, userId)) return res.status(400).json({ error: "Mission not found." });
    const [anchor] = await db.select().from(workoutProgramSessions).where(and(eq(workoutProgramSessions.id, id), eq(workoutProgramSessions.userId, userId))).limit(1);
    if (!anchor) return res.status(404).json({ error: "Program session not found." });
    if (!anchor.recurrenceGroupId || anchor.recurrenceIndex === null) return res.status(400).json({ error: "This session is not part of a recurring series." });
    if (anchor.status === "completed") return res.status(409).json({ error: "Choose an unfinished occurrence. Completed sessions are preserved as submitted-workout evidence." });
    const dayDelta = calendarDayDelta(anchor.scheduledDate, parsed.data.scheduledDate);
    if (dayDelta === null || Math.abs(dayDelta) > 3660) return res.status(400).json({ error: "Choose a valid date shift within ten years." });
    const anchorIndex = anchor.recurrenceIndex;
    try {
      const result = await db.transaction(async (tx) => {
        const futureSessions = await tx.select().from(workoutProgramSessions).where(and(
          eq(workoutProgramSessions.userId, userId),
          eq(workoutProgramSessions.programId, anchor.programId),
          eq(workoutProgramSessions.recurrenceGroupId, anchor.recurrenceGroupId!),
          gte(workoutProgramSessions.recurrenceIndex, anchorIndex),
        )).orderBy(asc(workoutProgramSessions.recurrenceIndex), asc(workoutProgramSessions.id));
        const shiftPlan = recurringSeriesShiftPlan(futureSessions, dayDelta);
        if (!shiftPlan) throw new Error("series_invalid_date");
        const datesBySessionId = new Map(shiftPlan.updates.map((update) => [update.id, update.scheduledDate]));
        const unfinished = futureSessions.filter((session) => datesBySessionId.has(session.id));
        const templateChanged = unfinished.some((session) => session.templateId !== parsed.data.templateId);
        if (templateChanged && !parsed.data.substitutionReason) throw new Error("series_substitution_reason");
        const updatedSessions = [];
        for (const session of unfinished) {
          const shiftedDate = datesBySessionId.get(session.id)!;
          const isSubstitution = session.templateId !== parsed.data.templateId;
          const [updated] = await tx.update(workoutProgramSessions).set({
            title: parsed.data.title,
            scheduledDate: shiftedDate,
            templateId: parsed.data.templateId,
            missionId: parsed.data.missionId,
            note: parsed.data.note,
            originalTemplateId: session.originalTemplateId ?? session.templateId,
            substitutionReason: isSubstitution ? parsed.data.substitutionReason : session.substitutionReason,
            substitutedAt: isSubstitution ? new Date() : session.substitutedAt,
            completedWorkoutId: null,
            completionLinkLostAt: null,
            updatedAt: new Date(),
          }).where(and(
            eq(workoutProgramSessions.id, session.id),
            eq(workoutProgramSessions.userId, userId),
            eq(workoutProgramSessions.status, session.status),
          )).returning();
          if (!updated) throw new Error("series_conflict");
          updatedSessions.push(updated);
        }
        return { updatedSessions, skippedCompletedSessions: shiftPlan.preservedCompletedSessionIds.length };
      });
      return res.json({ ...result, disclosure: "Only this and later unfinished occurrences were updated. Completed occurrences and their submitted-workout links were preserved." });
    } catch (error) {
      if (error instanceof Error && error.message === "series_substitution_reason") return res.status(400).json({ error: "Record why the planned template changed across this series." });
      if (error instanceof Error && error.message === "series_invalid_date") return res.status(400).json({ error: "The date shift would create an invalid program date." });
      if (error instanceof Error && error.message === "series_conflict") return res.status(409).json({ error: "A program session changed while the series was being updated. Review the program and try again." });
      throw error;
    }
  });

  app.patch("/api/workout-program-sessions/:id/complete", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const parsed = z.object({ workoutId: z.number().int().positive() }).safeParse(req.body);
    const userId = req.session.userId!;
    if (!Number.isInteger(id) || !parsed.success) return res.status(400).json({ error: "Invalid completion link." });
    const [workout] = await db.select({ id: workouts.id }).from(workouts).where(and(eq(workouts.id, parsed.data.workoutId), eq(workouts.userId, userId))).limit(1);
    if (!workout) return res.status(400).json({ error: "Submitted workout not found." });
    const [session] = await db.update(workoutProgramSessions).set({ status: "completed", completedWorkoutId: workout.id, completionLinkLostAt: null, updatedAt: new Date() })
      .where(and(eq(workoutProgramSessions.id, id), eq(workoutProgramSessions.userId, userId))).returning();
    return session ? res.json({ session }) : res.status(404).json({ error: "Program session not found." });
  });

  app.delete("/api/workout-program-sessions/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid program session." });
    const [session] = await db.delete(workoutProgramSessions).where(and(eq(workoutProgramSessions.id, id), eq(workoutProgramSessions.userId, req.session.userId!))).returning({ id: workoutProgramSessions.id });
    return session ? res.status(204).send() : res.status(404).json({ error: "Program session not found." });
  });
}
