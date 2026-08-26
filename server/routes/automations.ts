import type { Express, Response } from "express";
import { and, desc, eq, isNull } from "drizzle-orm";
import { ZodError } from "zod";
import { automationDefinitionSchema, automationRunRequestSchema, createAutomationSchema, updateAutomationSchema } from "@shared/automations";
import { quests, workflowAutomationRuns, workflowAutomations } from "@shared/schema";
import { db } from "../db";
import { executeAutomation, getAutomationPreview, repairAutomationRun } from "../automation-engine";
import { logger } from "../utils";
import { isAuthenticated } from "./middleware";
import { nextScheduledOccurrence } from "../automation-schedule";

function idParam(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function requestError(res: Response, error: unknown) {
  if (error instanceof ZodError) return res.status(400).json({ error: error.errors[0]?.message || "Invalid request" });
  logger.error("Workflow automation request failed", { error: error instanceof Error ? error.message : "unknown" });
  return res.status(500).json({ error: "Automation request could not be completed." });
}

async function ownedAutomation(id: number, userId: number) {
  const [automation] = await db.select().from(workflowAutomations)
    .where(and(eq(workflowAutomations.id, id), eq(workflowAutomations.userId, userId))).limit(1);
  return automation;
}

async function ownedQuest(id: number, userId: number) {
  const [quest] = await db.select().from(quests)
    .where(and(eq(quests.id, id), eq(quests.userId, userId), isNull(quests.deletedAt))).limit(1);
  return quest;
}

async function ownedRun(id: number, automationId: number, userId: number) {
  const [run] = await db.select().from(workflowAutomationRuns)
    .where(and(
      eq(workflowAutomationRuns.id, id),
      eq(workflowAutomationRuns.automationId, automationId),
      eq(workflowAutomationRuns.userId, userId),
    )).limit(1);
  return run;
}

export function registerAutomationRoutes(app: Express): void {
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/automations")) {
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Vary", "Cookie");
    }
    next();
  });

  app.get("/api/automations", isAuthenticated, async (req, res) => {
    const records = await db.select().from(workflowAutomations)
      .where(eq(workflowAutomations.userId, req.session.userId!))
      .orderBy(desc(workflowAutomations.updatedAt));
    res.json({ automations: records, limits: { automations: 25, actionsPerAutomation: 3 } });
  });

  app.get("/api/automations/missions", isAuthenticated, async (req, res) => {
    const records = await db.select({
      id: quests.id, title: quests.title, description: quests.description, category: quests.category,
      completed: quests.completed, completedAt: quests.completedAt, dueDate: quests.dueDate, projectId: quests.projectId, revision: quests.revision, updatedAt: quests.updatedAt,
    }).from(quests)
      .where(and(eq(quests.userId, req.session.userId!), isNull(quests.deletedAt)))
      .orderBy(desc(quests.updatedAt)).limit(100);
    res.json({ missions: records });
  });

  app.post("/api/automations", isAuthenticated, async (req, res) => {
    try {
      const existing = await db.select({ id: workflowAutomations.id }).from(workflowAutomations)
        .where(eq(workflowAutomations.userId, req.session.userId!)).limit(25);
      if (existing.length >= 25) return res.status(409).json({ error: "Automation limit reached. Archive or delete one before creating another." });
      const input = createAutomationSchema.parse(req.body);
      const definition = automationDefinitionSchema.parse(input.definition);
      const scheduleNextRunAt = definition.trigger.type === "schedule" ? nextScheduledOccurrence(definition.trigger, new Date()) : null;
      if (definition.trigger.type === "schedule" && !scheduleNextRunAt) return res.status(400).json({ error: "This bounded schedule has no future occurrence." });
      if (definition.trigger.type === "schedule" && !await ownedQuest(definition.trigger.questId, req.session.userId!)) return res.status(400).json({ error: "Choose an existing Mission owned by this account as the schedule anchor." });
      const [automation] = await db.insert(workflowAutomations).values({ ...input, definition, userId: req.session.userId!, enabled: false, scheduleNextRunAt }).returning();
      res.status(201).json({ automation });
    } catch (error) { return requestError(res, error); }
  });

  app.get("/api/automations/:id", isAuthenticated, async (req, res) => {
    const id = idParam(req.params.id); if (!id) return res.status(400).json({ error: "Invalid automation ID" });
    const automation = await ownedAutomation(id, req.session.userId!); if (!automation) return res.status(404).json({ error: "Automation not found" });
    const runs = await db.select({
      id: workflowAutomationRuns.id,
      status: workflowAutomationRuns.status,
      triggerType: workflowAutomationRuns.triggerType,
      triggerQuestId: workflowAutomationRuns.triggerQuestId,
      actionResults: workflowAutomationRuns.actionResults,
      errorCode: workflowAutomationRuns.errorCode,
      triggerContext: workflowAutomationRuns.triggerContext,
      createdAt: workflowAutomationRuns.createdAt,
      completedAt: workflowAutomationRuns.completedAt,
    }).from(workflowAutomationRuns)
      .where(and(eq(workflowAutomationRuns.automationId, id), eq(workflowAutomationRuns.userId, req.session.userId!)))
      .orderBy(desc(workflowAutomationRuns.createdAt)).limit(50);
    res.json({ automation, runs });
  });

  app.patch("/api/automations/:id", isAuthenticated, async (req, res) => {
    try {
      const id = idParam(req.params.id); if (!id) return res.status(400).json({ error: "Invalid automation ID" });
      const existing = await ownedAutomation(id, req.session.userId!); if (!existing) return res.status(404).json({ error: "Automation not found" });
      const input = updateAutomationSchema.parse(req.body);
      const definition = automationDefinitionSchema.parse(input.definition || existing.definition);
      const definitionChanged = input.definition !== undefined && JSON.stringify(definition) !== JSON.stringify(existing.definition);
      if (definition.trigger.type === "schedule" && !await ownedQuest(definition.trigger.questId, req.session.userId!)) return res.status(400).json({ error: "Choose an existing Mission owned by this account as the schedule anchor." });
      if (input.enabled === true && !definitionChanged && existing.pauseReason === "SCHEDULE_COMPLETE") return res.status(409).json({ error: "This bounded schedule is complete. Save a revised schedule before enabling it again." });
      const resuming = input.enabled === true && !existing.enabled;
      const scheduleNextRunAt = definition.trigger.type === "schedule" && (definitionChanged || resuming || !existing.scheduleNextRunAt)
        ? nextScheduledOccurrence(definition.trigger, new Date())
        : definition.trigger.type === "schedule" ? existing.scheduleNextRunAt : null;
      if (definition.trigger.type === "schedule" && input.enabled === true && !scheduleNextRunAt) return res.status(400).json({ error: "This bounded schedule has no future occurrence." });
      const recoveryReset = input.enabled === true
        ? { consecutiveFailures: 0, pausedAt: null, pauseReason: null }
        : {};
      const [automation] = await db.update(workflowAutomations).set({
        ...input,
        definition,
        ...recoveryReset,
        scheduleNextRunAt,
        scheduleClaimedAt: null,
        ...(definitionChanged ? { scheduleOccurrencesRun: 0, scheduleLastScheduledFor: null } : {}),
        updatedAt: new Date(),
      })
        .where(and(eq(workflowAutomations.id, id), eq(workflowAutomations.userId, req.session.userId!))).returning();
      res.json({ automation });
    } catch (error) { return requestError(res, error); }
  });

  app.delete("/api/automations/:id", isAuthenticated, async (req, res) => {
    const id = idParam(req.params.id); if (!id) return res.status(400).json({ error: "Invalid automation ID" });
    const [deleted] = await db.delete(workflowAutomations)
      .where(and(eq(workflowAutomations.id, id), eq(workflowAutomations.userId, req.session.userId!)))
      .returning({ id: workflowAutomations.id });
    if (!deleted) return res.status(404).json({ error: "Automation not found" });
    res.status(204).end();
  });

  app.post("/api/automations/:id/preview", isAuthenticated, async (req, res) => {
    try {
      const id = idParam(req.params.id), questId = idParam(String(req.body?.questId || ""));
      if (!id || !questId) return res.status(400).json({ error: "A valid automation and mission are required." });
      const [automation, quest] = await Promise.all([ownedAutomation(id, req.session.userId!), ownedQuest(questId, req.session.userId!)]);
      if (!automation) return res.status(404).json({ error: "Automation not found" });
      if (!quest) return res.status(404).json({ error: "Mission not found" });
      res.json({ preview: await getAutomationPreview(automation, quest) });
    } catch (error) { return requestError(res, error); }
  });

  app.post("/api/automations/:id/run", isAuthenticated, async (req, res) => {
    try {
      const id = idParam(req.params.id);
      if (!id) return res.status(400).json({ error: "A valid automation is required." });
      const request = automationRunRequestSchema.parse(req.body);
      const questId = request.questId;
      const [automation, quest] = await Promise.all([ownedAutomation(id, req.session.userId!), ownedQuest(questId, req.session.userId!)]);
      if (!automation) return res.status(404).json({ error: "Automation not found" });
      if (!quest) return res.status(404).json({ error: "Mission not found" });
      const definition = automationDefinitionSchema.parse(automation.definition);
      if (definition.trigger.type !== "manual") return res.status(409).json({ error: "Event automations run only from their selected mission event. Use Preview to test this rule." });
      if (!automation.enabled) return res.status(409).json({ error: "Enable this automation before running it." });
      const result = await executeAutomation({ automation, quest, triggerType: "manual", idempotencyKey: `manual:${request.mutationId}` });
      res.json({ result });
    } catch (error) { return requestError(res, error); }
  });

  app.post("/api/automations/:id/runs/:runId/repair", isAuthenticated, async (req, res) => {
    try {
      const id = idParam(req.params.id), runId = idParam(req.params.runId);
      if (!id || !runId) return res.status(400).json({ error: "A valid automation run is required." });
      const [automation, run] = await Promise.all([
        ownedAutomation(id, req.session.userId!),
        ownedRun(runId, id, req.session.userId!),
      ]);
      if (!automation || !run) return res.status(404).json({ error: "Automation run not found" });
      if (!run.triggerQuestId) return res.status(409).json({ error: "The trigger mission no longer exists, so this run cannot be repaired safely." });
      const quest = await ownedQuest(run.triggerQuestId, req.session.userId!);
      if (!quest) return res.status(409).json({ error: "The trigger mission is unavailable, so this run cannot be repaired safely." });
      if (!run.definitionSnapshot) return res.status(409).json({ error: "This legacy run has no immutable rule snapshot and cannot be repaired safely." });
      const result = await repairAutomationRun({ automation, run, quest });
      res.status(result.status === "running" ? 202 : 200).json({ result });
    } catch (error) { return requestError(res, error); }
  });
}
