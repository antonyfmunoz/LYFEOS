import type { Express, Response } from "express";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { ZodError, z } from "zod";
import { canTransitionProject, createProjectSchema, projectMissionSchema, projectStateSchema, transitionProjectSchema, updateProjectSchema } from "@shared/projects";
import { kanbanBoards, projectEvents, quests } from "@shared/schema";
import { db } from "../db";
import { createMissionLifecycle, updateMissionLifecycle } from "../mission-lifecycle";
import { logger } from "../utils";
import { isAuthenticated } from "./middleware";

function idParam(value: string): number | null { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; }
function requestError(res: Response, error: unknown) {
  if (error instanceof ZodError) return res.status(400).json({ error: error.errors[0]?.message || "Invalid request" });
  logger.error("Project request failed", { error: error instanceof Error ? error.message : "unknown" });
  return res.status(500).json({ error: "Project request could not be completed." });
}
async function ownedProject(id: number, userId: number) {
  const [project] = await db.select().from(kanbanBoards).where(and(eq(kanbanBoards.id, id), eq(kanbanBoards.userId, userId))).limit(1);
  return project;
}

async function recordProjectTaskEvent(userId: number, projectId: number, eventType: "ProjectTaskLinked.v1" | "ProjectTaskUnlinked.v1") {
  return db.transaction(async (tx) => {
    const [project] = await tx.update(kanbanBoards).set({ revision: sql`${kanbanBoards.revision} + 1`, updatedAt: new Date() })
      .where(and(eq(kanbanBoards.id, projectId), eq(kanbanBoards.userId, userId))).returning();
    if (!project) throw new Error("PROJECT_NOT_FOUND");
    await tx.insert(projectEvents).values({ userId, projectId, eventType, fromState: project.state, toState: project.state, aggregateRevision: project.revision });
    return project;
  });
}

export function registerProjectRoutes(app: Express): void {
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/projects")) { res.setHeader("Cache-Control", "private, no-store, max-age=0"); res.setHeader("Pragma", "no-cache"); res.setHeader("Vary", "Cookie"); }
    next();
  });

  app.get("/api/projects", isAuthenticated, async (req, res) => {
    const userId = req.session.userId!;
    const [projects, missions] = await Promise.all([
      db.select().from(kanbanBoards).where(eq(kanbanBoards.userId, userId)).orderBy(desc(kanbanBoards.updatedAt)),
      db.select({ id: quests.id, projectId: quests.projectId, completed: quests.completed }).from(quests).where(and(eq(quests.userId, userId), isNull(quests.deletedAt))),
    ]);
    res.json({ projects: projects.map((project) => { const linked = missions.filter((mission) => mission.projectId === project.id); return { ...project, taskCount: linked.length, completedTaskCount: linked.filter((mission) => mission.completed).length }; }) });
  });

  app.post("/api/projects", isAuthenticated, async (req, res) => {
    try {
      const input = createProjectSchema.parse(req.body), userId = req.session.userId!;
      const project = await db.transaction(async (tx) => {
        const [created] = await tx.insert(kanbanBoards).values({ userId, ...input, state: "planned", revision: 1, isDefault: false }).returning();
        await tx.insert(projectEvents).values({ userId, projectId: created.id, eventType: "ProjectCreated.v1", toState: "planned", aggregateRevision: 1 });
        return created;
      });
      res.status(201).json({ project });
    } catch (error) { return requestError(res, error); }
  });

  app.get("/api/projects/:id", isAuthenticated, async (req, res) => {
    const id = idParam(req.params.id); if (!id) return res.status(400).json({ error: "Invalid project ID" });
    const project = await ownedProject(id, req.session.userId!); if (!project) return res.status(404).json({ error: "Project not found" });
    const [missions, history] = await Promise.all([
      db.select().from(quests).where(and(eq(quests.userId, req.session.userId!), eq(quests.projectId, id), isNull(quests.deletedAt))).orderBy(desc(quests.updatedAt)),
      db.select().from(projectEvents).where(and(eq(projectEvents.userId, req.session.userId!), eq(projectEvents.projectId, id))).orderBy(desc(projectEvents.occurredAt)).limit(50),
    ]);
    res.json({ project, missions, history });
  });

  app.patch("/api/projects/:id", isAuthenticated, async (req, res) => {
    try {
      const id = idParam(req.params.id); if (!id) return res.status(400).json({ error: "Invalid project ID" });
      const input = updateProjectSchema.parse(req.body), userId = req.session.userId!;
      const existing = await ownedProject(id, userId); if (!existing) return res.status(404).json({ error: "Project not found" });
      createProjectSchema.parse({
        title: input.title ?? existing.title,
        description: input.description !== undefined ? input.description : existing.description,
        outcome: input.outcome ?? existing.outcome,
        startDate: input.startDate !== undefined ? input.startDate : existing.startDate,
        dueDate: input.dueDate !== undefined ? input.dueDate : existing.dueDate,
      });
      const { expectedRevision, ...updates } = input;
      const project = await db.transaction(async (tx) => {
        const [updated] = await tx.update(kanbanBoards).set({ ...updates, revision: expectedRevision + 1, updatedAt: new Date() })
          .where(and(eq(kanbanBoards.id, id), eq(kanbanBoards.userId, userId), eq(kanbanBoards.revision, expectedRevision))).returning();
        if (updated) await tx.insert(projectEvents).values({ userId, projectId: id, eventType: "ProjectUpdated.v1", fromState: updated.state, toState: updated.state, aggregateRevision: updated.revision });
        return updated;
      });
      if (!project) return res.status(409).json({ error: "Project changed in another session. Refresh before saving." });
      res.json({ project });
    } catch (error) { return requestError(res, error); }
  });

  app.post("/api/projects/:id/state", isAuthenticated, async (req, res) => {
    try {
      const id = idParam(req.params.id); if (!id) return res.status(400).json({ error: "Invalid project ID" });
      const input = transitionProjectSchema.parse(req.body), userId = req.session.userId!;
      const existing = await ownedProject(id, userId); if (!existing) return res.status(404).json({ error: "Project not found" });
      const from = projectStateSchema.parse(existing.state);
      if (!canTransitionProject(from, input.state)) return res.status(409).json({ error: `Project cannot move from ${from} to ${input.state}.` });
      if (from === input.state) return res.json({ project: existing });
      if (input.state === "completed") {
        const incomplete = await db.select({ id: quests.id }).from(quests).where(and(eq(quests.userId, userId), eq(quests.projectId, id), eq(quests.completed, false), isNull(quests.deletedAt))).limit(1);
        if (incomplete.length) return res.status(409).json({ error: "Complete or unlink every open mission before completing this project." });
      }
      const project = await db.transaction(async (tx) => {
        const [updated] = await tx.update(kanbanBoards).set({ state: input.state, completedAt: input.state === "completed" ? new Date() : null, revision: input.expectedRevision + 1, updatedAt: new Date() })
          .where(and(eq(kanbanBoards.id, id), eq(kanbanBoards.userId, userId), eq(kanbanBoards.revision, input.expectedRevision))).returning();
        if (updated) await tx.insert(projectEvents).values({ userId, projectId: id, eventType: input.state === "completed" ? "ProjectCompleted.v1" : "ProjectStateChanged.v1", fromState: from, toState: input.state, aggregateRevision: updated.revision });
        return updated;
      });
      if (!project) return res.status(409).json({ error: "Project changed in another session. Refresh before changing state." });
      res.json({ project });
    } catch (error) { return requestError(res, error); }
  });

  app.post("/api/projects/:id/missions", isAuthenticated, async (req, res) => {
    try {
      const id = idParam(req.params.id); if (!id) return res.status(400).json({ error: "Invalid project ID" });
      const input = projectMissionSchema.parse(req.body), userId = req.session.userId!;
      const [project, mission] = await Promise.all([ownedProject(id, userId), db.select().from(quests).where(and(eq(quests.id, input.missionId), eq(quests.userId, userId), isNull(quests.deletedAt))).limit(1).then((rows) => rows[0])]);
      if (!project) return res.status(404).json({ error: "Project not found" }); if (!mission) return res.status(404).json({ error: "Mission not found" });
      if (project.revision !== input.expectedRevision) return res.status(409).json({ error: "Project changed in another session. Refresh before linking." });
      const updated = await updateMissionLifecycle({ questId: mission.id, userId, updates: { projectId: id }, source: "ui" });
      await recordProjectTaskEvent(userId, id, "ProjectTaskLinked.v1");
      res.json({ mission: updated });
    } catch (error) { return requestError(res, error); }
  });

  app.delete("/api/projects/:id/missions/:missionId", isAuthenticated, async (req, res) => {
    const id = idParam(req.params.id), missionId = idParam(req.params.missionId), userId = req.session.userId!;
    if (!id || !missionId) return res.status(400).json({ error: "Invalid project or mission ID" });
    const project = await ownedProject(id, userId); if (!project) return res.status(404).json({ error: "Project not found" });
    const [mission] = await db.select().from(quests).where(and(eq(quests.id, missionId), eq(quests.userId, userId), eq(quests.projectId, id))).limit(1);
    if (!mission) return res.status(404).json({ error: "Linked mission not found" });
    const updated = await updateMissionLifecycle({ questId: mission.id, userId, updates: { projectId: null }, source: "ui" });
    await recordProjectTaskEvent(userId, id, "ProjectTaskUnlinked.v1");
    res.json({ mission: updated });
  });

  app.post("/api/projects/:id/missions/new", isAuthenticated, async (req, res) => {
    try {
      const id = idParam(req.params.id); if (!id) return res.status(400).json({ error: "Invalid project ID" });
      const input = z.object({ title: z.string().trim().min(1).max(160), description: z.string().trim().max(1_000).default(""), dueDate: z.string().trim().nullable().refine((value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), "Use YYYY-MM-DD.") }).strict().parse(req.body), userId = req.session.userId!;
      const project = await ownedProject(id, userId); if (!project) return res.status(404).json({ error: "Project not found" });
      const mission = await createMissionLifecycle({ userId, title: input.title, description: input.description, dueDate: input.dueDate, projectId: id, source: "ui" });
      await recordProjectTaskEvent(userId, id, "ProjectTaskLinked.v1");
      res.status(201).json({ mission });
    } catch (error) { return requestError(res, error); }
  });
}
