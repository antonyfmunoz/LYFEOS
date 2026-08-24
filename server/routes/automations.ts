import { randomUUID } from "node:crypto";
import type { Express, Response } from "express";
import { and, desc, eq, isNull } from "drizzle-orm";
import { ZodError } from "zod";
import { automationDefinitionSchema, createAutomationSchema, updateAutomationSchema } from "@shared/automations";
import { quests, workflowAutomationRuns, workflowAutomations } from "@shared/schema";
import { db } from "../db";
import { executeAutomation, getAutomationPreview } from "../automation-engine";
import { logger } from "../utils";
import { isAuthenticated } from "./middleware";

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
      completed: quests.completed, completedAt: quests.completedAt, dueDate: quests.dueDate, projectId: quests.projectId, updatedAt: quests.updatedAt,
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
      const [automation] = await db.insert(workflowAutomations).values({ ...input, userId: req.session.userId!, enabled: false }).returning();
      res.status(201).json({ automation });
    } catch (error) { return requestError(res, error); }
  });

  app.get("/api/automations/:id", isAuthenticated, async (req, res) => {
    const id = idParam(req.params.id); if (!id) return res.status(400).json({ error: "Invalid automation ID" });
    const automation = await ownedAutomation(id, req.session.userId!); if (!automation) return res.status(404).json({ error: "Automation not found" });
    const runs = await db.select().from(workflowAutomationRuns)
      .where(and(eq(workflowAutomationRuns.automationId, id), eq(workflowAutomationRuns.userId, req.session.userId!)))
      .orderBy(desc(workflowAutomationRuns.createdAt)).limit(50);
    res.json({ automation, runs });
  });

  app.patch("/api/automations/:id", isAuthenticated, async (req, res) => {
    try {
      const id = idParam(req.params.id); if (!id) return res.status(400).json({ error: "Invalid automation ID" });
      const existing = await ownedAutomation(id, req.session.userId!); if (!existing) return res.status(404).json({ error: "Automation not found" });
      const input = updateAutomationSchema.parse(req.body);
      automationDefinitionSchema.parse(input.definition || existing.definition);
      const [automation] = await db.update(workflowAutomations).set({ ...input, updatedAt: new Date() })
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
      const id = idParam(req.params.id), questId = idParam(String(req.body?.questId || ""));
      if (!id || !questId) return res.status(400).json({ error: "A valid automation and mission are required." });
      const [automation, quest] = await Promise.all([ownedAutomation(id, req.session.userId!), ownedQuest(questId, req.session.userId!)]);
      if (!automation) return res.status(404).json({ error: "Automation not found" });
      if (!quest) return res.status(404).json({ error: "Mission not found" });
      const definition = automationDefinitionSchema.parse(automation.definition);
      if (definition.trigger.type !== "manual") return res.status(409).json({ error: "Event automations run only from their selected mission event. Use Preview to test this rule." });
      if (!automation.enabled) return res.status(409).json({ error: "Enable this automation before running it." });
      const result = await executeAutomation({ automation, quest, triggerType: "manual", idempotencyKey: `manual:${randomUUID()}` });
      res.json({ result });
    } catch (error) { return requestError(res, error); }
  });
}
