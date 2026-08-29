import { createHash } from "node:crypto";
import type { Express, Response } from "express";
import { and, desc, eq, isNull } from "drizzle-orm";
import { ZodError } from "zod";
import { canTransitionProject, createProjectMissionSchema, createProjectSchema, projectMissionSchema, projectRecoverySchema, projectStateSchema, removeProjectSchema, transitionProjectSchema, updateProjectSchema } from "@shared/projects";
import { kanbanBoards, projectEvents, quests, type Quest } from "@shared/schema";
import { db } from "../db";
import { changeMissionProjectMembershipLifecycle, createProjectMissionLifecycle, MissionLifecycleError } from "../mission-lifecycle";
import { logger } from "../utils";
import { isAuthenticated } from "./middleware";

function idParam(value: string): number | null { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; }
class ProjectRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
function requestError(res: Response, error: unknown) {
  if (error instanceof ZodError) return res.status(400).json({ error: error.errors[0]?.message || "Invalid request" });
  if (error instanceof ProjectRequestError) return res.status(error.status).json({ error: error.message });
  if (error instanceof MissionLifecycleError) return res.status(error.status).json({ error: error.message });
  logger.error("Project request failed", { error: error instanceof Error ? error.message : "unknown" });
  return res.status(500).json({ error: "Project request could not be completed." });
}
async function ownedProject(id: number, userId: number, includeRemoved = false) {
  const [project] = await db.select().from(kanbanBoards).where(and(
    eq(kanbanBoards.id, id),
    eq(kanbanBoards.userId, userId),
    ...(includeRemoved ? [] : [isNull(kanbanBoards.deletedAt)]),
  )).limit(1);
  return project;
}

function publicMission(quest: Quest) {
  const { lifecycleKey: _lifecycleKey, lifecyclePayloadHash: _lifecyclePayloadHash, planningContextSnapshot: _planningContextSnapshot, difficultyCalibration: _difficultyCalibration, ...safe } = quest;
  return safe;
}

export function registerProjectRoutes(app: Express): void {
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/projects")) { res.setHeader("Cache-Control", "private, no-store, max-age=0"); res.setHeader("Pragma", "no-cache"); res.setHeader("Vary", "Cookie"); }
    next();
  });

  app.get("/api/projects", isAuthenticated, async (req, res) => {
    const userId = req.session.userId!;
    const [allProjects, missions] = await Promise.all([
      db.select().from(kanbanBoards).where(eq(kanbanBoards.userId, userId)).orderBy(desc(kanbanBoards.updatedAt)),
      db.select({ id: quests.id, projectId: quests.projectId, completed: quests.completed }).from(quests).where(and(eq(quests.userId, userId), isNull(quests.deletedAt))),
    ]);
    const withCounts = allProjects.map((project) => { const linked = missions.filter((mission) => mission.projectId === project.id); return { ...project, taskCount: linked.length, completedTaskCount: linked.filter((mission) => mission.completed).length }; });
    res.json({ projects: withCounts.filter((project) => !project.deletedAt), removedProjects: withCounts.filter((project) => project.deletedAt) });
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
    res.json({ project, missions: missions.map(publicMission), history });
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
      const project = await db.transaction(async (tx) => {
        const [existing] = await tx.select().from(kanbanBoards).where(and(eq(kanbanBoards.id, id), eq(kanbanBoards.userId, userId), isNull(kanbanBoards.deletedAt))).for("update").limit(1);
        if (!existing) throw new ProjectRequestError(404, "Project not found");
        if (existing.revision !== input.expectedRevision) throw new ProjectRequestError(409, "Project changed in another session. Refresh before changing state.");
        const from = projectStateSchema.parse(existing.state);
        if (!canTransitionProject(from, input.state)) throw new ProjectRequestError(409, `Project cannot move from ${from} to ${input.state}.`);
        if (from === input.state) return existing;
        if (input.state === "completed") {
          const incomplete = await tx.select({ id: quests.id }).from(quests).where(and(eq(quests.userId, userId), eq(quests.projectId, id), eq(quests.completed, false), isNull(quests.deletedAt))).limit(1);
          if (incomplete.length) throw new ProjectRequestError(409, "Complete or unlink every open mission before completing this project.");
        }
        const [updated] = await tx.update(kanbanBoards).set({ state: input.state, completedAt: input.state === "completed" ? new Date() : null, revision: existing.revision + 1, updatedAt: new Date() })
          .where(and(eq(kanbanBoards.id, id), eq(kanbanBoards.userId, userId), eq(kanbanBoards.revision, existing.revision))).returning();
        if (updated) await tx.insert(projectEvents).values({ userId, projectId: id, eventType: input.state === "completed" ? "ProjectCompleted.v1" : "ProjectStateChanged.v1", fromState: from, toState: input.state, aggregateRevision: updated.revision });
        return updated;
      });
      if (!project) return res.status(409).json({ error: "Project changed in another session. Refresh before changing state." });
      res.json({ project });
    } catch (error) { return requestError(res, error); }
  });

  app.post("/api/projects/:id/reconcile-legacy", isAuthenticated, async (req, res) => {
    try {
      const id = idParam(req.params.id); if (!id) return res.status(400).json({ error: "Invalid project ID" });
      const input = projectRecoverySchema.parse(req.body), userId = req.session.userId!;
      const project = await db.transaction(async (tx) => {
        const [existing] = await tx.select().from(kanbanBoards).where(and(eq(kanbanBoards.id, id), eq(kanbanBoards.userId, userId), isNull(kanbanBoards.deletedAt))).for("update").limit(1);
        if (!existing) throw new ProjectRequestError(404, "Project not found");
        if (existing.origin !== "legacy_kanban") throw new ProjectRequestError(409, "This Project is not a preserved legacy board.");
        if (existing.legacyReconciledAt) return existing;
        if (existing.revision !== input.expectedRevision) throw new ProjectRequestError(409, "Project changed in another session. Refresh before confirming it.");
        const now = new Date();
        const [updated] = await tx.update(kanbanBoards).set({ legacyReconciledAt: now, revision: existing.revision + 1, updatedAt: now })
          .where(and(eq(kanbanBoards.id, id), eq(kanbanBoards.userId, userId), eq(kanbanBoards.revision, existing.revision))).returning();
        if (!updated) throw new ProjectRequestError(409, "Project changed in another session. Refresh before confirming it.");
        await tx.insert(projectEvents).values({ userId, projectId: id, eventType: "LegacyProjectReconciled.v1", fromState: existing.state, toState: existing.state, aggregateRevision: updated.revision });
        return updated;
      });
      res.json({ project });
    } catch (error) { return requestError(res, error); }
  });

  app.post("/api/projects/:id/remove", isAuthenticated, async (req, res) => {
    try {
      const id = idParam(req.params.id); if (!id) return res.status(400).json({ error: "Invalid project ID" });
      const input = removeProjectSchema.parse(req.body), userId = req.session.userId!;
      const project = await db.transaction(async (tx) => {
        const [existing] = await tx.select().from(kanbanBoards).where(and(eq(kanbanBoards.id, id), eq(kanbanBoards.userId, userId), isNull(kanbanBoards.deletedAt))).for("update").limit(1);
        if (!existing) throw new ProjectRequestError(404, "Project not found");
        if (existing.revision !== input.expectedRevision) throw new ProjectRequestError(409, "Project changed in another session. Refresh before removing it.");
        if (input.confirmationTitle !== existing.title) throw new ProjectRequestError(409, "Type the exact Project title to confirm removal.");
        if (existing.state !== "archived") throw new ProjectRequestError(409, "Archive the Project before removing it.");
        const linked = await tx.select({ id: quests.id }).from(quests).where(and(eq(quests.userId, userId), eq(quests.projectId, id))).limit(1);
        if (linked.length) throw new ProjectRequestError(409, "Unlink every Mission before removing this Project.");
        const now = new Date();
        const [updated] = await tx.update(kanbanBoards).set({ deletedAt: now, revision: existing.revision + 1, updatedAt: now })
          .where(and(eq(kanbanBoards.id, id), eq(kanbanBoards.userId, userId), eq(kanbanBoards.revision, existing.revision))).returning();
        if (!updated) throw new ProjectRequestError(409, "Project changed in another session. Refresh before removing it.");
        await tx.insert(projectEvents).values({ userId, projectId: id, eventType: "ProjectRemoved.v1", fromState: existing.state, toState: existing.state, aggregateRevision: updated.revision });
        return updated;
      });
      res.json({ project });
    } catch (error) { return requestError(res, error); }
  });

  app.post("/api/projects/:id/restore", isAuthenticated, async (req, res) => {
    try {
      const id = idParam(req.params.id); if (!id) return res.status(400).json({ error: "Invalid project ID" });
      const input = projectRecoverySchema.parse(req.body), userId = req.session.userId!;
      const project = await db.transaction(async (tx) => {
        const [existing] = await tx.select().from(kanbanBoards).where(and(eq(kanbanBoards.id, id), eq(kanbanBoards.userId, userId))).for("update").limit(1);
        if (!existing) throw new ProjectRequestError(404, "Project not found");
        if (!existing.deletedAt) return existing;
        if (existing.revision !== input.expectedRevision) throw new ProjectRequestError(409, "Project changed in another session. Refresh before restoring it.");
        const now = new Date();
        const [updated] = await tx.update(kanbanBoards).set({ deletedAt: null, revision: existing.revision + 1, updatedAt: now })
          .where(and(eq(kanbanBoards.id, id), eq(kanbanBoards.userId, userId), eq(kanbanBoards.revision, existing.revision))).returning();
        if (!updated) throw new ProjectRequestError(409, "Project changed in another session. Refresh before restoring it.");
        await tx.insert(projectEvents).values({ userId, projectId: id, eventType: "ProjectRestored.v1", fromState: existing.state, toState: existing.state, aggregateRevision: updated.revision });
        return updated;
      });
      res.json({ project });
    } catch (error) { return requestError(res, error); }
  });

  app.post("/api/projects/:id/missions", isAuthenticated, async (req, res) => {
    try {
      const id = idParam(req.params.id); if (!id) return res.status(400).json({ error: "Invalid project ID" });
      const input = projectMissionSchema.parse(req.body), userId = req.session.userId!;
      const result = await changeMissionProjectMembershipLifecycle({ userId, projectId: id, missionId: input.missionId, expectedProjectRevision: input.expectedRevision, expectedMissionRevision: input.expectedMissionRevision, mode: "link" });
      res.json({ mission: publicMission(result.mission), project: result.project, replayed: result.replayed });
    } catch (error) { return requestError(res, error); }
  });

  app.delete("/api/projects/:id/missions/:missionId", isAuthenticated, async (req, res) => {
    try {
      const id = idParam(req.params.id), missionId = idParam(req.params.missionId), userId = req.session.userId!;
      if (!id || !missionId) return res.status(400).json({ error: "Invalid project or mission ID" });
      const input = projectMissionSchema.parse(req.body);
      if (input.missionId !== missionId) return res.status(400).json({ error: "Mission ID does not match the requested link." });
      const result = await changeMissionProjectMembershipLifecycle({ userId, projectId: id, missionId, expectedProjectRevision: input.expectedRevision, expectedMissionRevision: input.expectedMissionRevision, mode: "unlink" });
      res.json({ mission: publicMission(result.mission), project: result.project });
    } catch (error) { return requestError(res, error); }
  });

  app.post("/api/projects/:id/missions/new", isAuthenticated, async (req, res) => {
    try {
      const id = idParam(req.params.id); if (!id) return res.status(400).json({ error: "Invalid project ID" });
      const input = createProjectMissionSchema.parse(req.body), userId = req.session.userId!;
      const lifecycleKey = `project:${id}:create:${input.mutationId}`;
      const payloadHash = createHash("sha256").update(JSON.stringify({ title: input.title, description: input.description, dueDate: input.dueDate })).digest("hex");
      const result = await createProjectMissionLifecycle({
        userId,
        projectId: id,
        title: input.title,
        description: input.description,
        dueDate: input.dueDate,
        expectedProjectRevision: input.expectedRevision,
        lifecycleKey,
        lifecyclePayloadHash: payloadHash,
      });
      res.status(result.replayed ? 200 : 201).json({ mission: publicMission(result.mission), project: result.project, replayed: result.replayed });
    } catch (error) { return requestError(res, error); }
  });
}
