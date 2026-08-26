import type { Express, Request, Response } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { aiExecutionPreferences, aiOrchestrationRuns, aiOrchestrationSteps } from "@shared/schema";
import { db } from "../db";
import { AI_AGENT_KINDS, executeOrchestrationRoles, type AIAgentKind } from "../ai-orchestration";
import { resolveOrchestrationGenerator, type AIExecutionMode, type AIProviderId } from "../ai-providers";
import { isAuthenticated } from "./middleware";

const idSchema = z.string().uuid();
const agentSchema = z.enum(AI_AGENT_KINDS);
const createSchema = z.object({
  objective: z.string().trim().min(3).max(4000),
  contextText: z.string().trim().max(12000).optional(),
  agents: z.array(agentSchema).min(1).max(5).refine((agents) => new Set(agents).size === agents.length, "Specialist roles must be unique."),
  allowedDomains: z.array(z.enum(["identity", "goals", "learning", "health", "capacity", "relationships", "routines", "transformation", "projects", "finance", "integrations"])).max(11).default([]),
});
const transitionSchema = z.object({ expectedVersion: z.number().int().positive() });
const instructions: Record<AIAgentKind, string> = {
  research: "Synthesize supplied material and identify evidence gaps without external browsing.",
  scheduling: "Propose a capacity-aware sequence without reading or changing a calendar.",
  content: "Create an editable content draft or plan without publishing or sending.",
  analysis: "Evaluate assumptions, options, tradeoffs, and failure modes.",
  integration: "Map system boundaries, contracts, failure states, and implementation steps.",
};

function privateNoStore(res: Response): void {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Vary", "Cookie");
}

async function readOwnedRun(id: string, userId: number) {
  const [run] = await db.select().from(aiOrchestrationRuns).where(and(eq(aiOrchestrationRuns.id, id), eq(aiOrchestrationRuns.userId, userId))).limit(1);
  if (!run) return null;
  const steps = await db.select().from(aiOrchestrationSteps).where(and(eq(aiOrchestrationSteps.runId, id), eq(aiOrchestrationSteps.userId, userId))).orderBy(asc(aiOrchestrationSteps.stepOrder));
  return { run, steps };
}

export function registerAIOrchestrationRoutes(app: Express): void {
  app.post("/api/ai/orchestration-runs", isAuthenticated, async (req: Request, res: Response) => {
    privateNoStore(res);
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid orchestration draft.", details: parsed.error.flatten() });
    const userId = req.session.userId!;
    const [savedPreference] = await db.select().from(aiExecutionPreferences).where(eq(aiExecutionPreferences.userId, userId)).limit(1);
    const executionPolicy = savedPreference || { executionMode: "cloud", preferredProvider: "anthropic", cloudFallbackEnabled: false };
    const created = await db.transaction(async (tx) => {
      const now = new Date();
      const [run] = await tx.insert(aiOrchestrationRuns).values({
        userId,
        objective: parsed.data.objective,
        contextText: parsed.data.contextText || null,
        requestedAgents: parsed.data.agents,
        allowedDomains: parsed.data.allowedDomains,
        capabilitySnapshot: { externalAccess: false, mutations: false, externalSend: false },
        sourceManifest: [{ type: "user_objective", included: true }, { type: "user_supplied_context", included: Boolean(parsed.data.contextText) }],
        executionMode: executionPolicy.executionMode,
        providerPreference: executionPolicy.preferredProvider,
        cloudFallbackEnabled: executionPolicy.cloudFallbackEnabled,
        providerResolution: { state: "not_resolved" },
        status: "draft",
        createdAt: now,
        updatedAt: now,
      }).returning();
      const steps = await tx.insert(aiOrchestrationSteps).values(parsed.data.agents.map((agentKind, index) => ({ userId, runId: run.id, stepOrder: index + 1, agentKind, instruction: instructions[agentKind] }))).returning();
      return { run, steps };
    });
    return res.status(201).json(created);
  });

  app.get("/api/ai/orchestration-runs", isAuthenticated, async (req: Request, res: Response) => {
    privateNoStore(res);
    const runs = await db.select().from(aiOrchestrationRuns).where(eq(aiOrchestrationRuns.userId, req.session.userId!)).orderBy(desc(aiOrchestrationRuns.createdAt)).limit(30);
    return res.json({ runs });
  });

  app.get("/api/ai/orchestration-runs/:id", isAuthenticated, async (req: Request, res: Response) => {
    privateNoStore(res);
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ error: "Invalid orchestration run id." });
    const record = await readOwnedRun(id.data, req.session.userId!);
    return record ? res.json(record) : res.status(404).json({ error: "Orchestration run not found." });
  });

  app.post("/api/ai/orchestration-runs/:id/approve", isAuthenticated, async (req: Request, res: Response) => {
    privateNoStore(res);
    const id = idSchema.safeParse(req.params.id);
    const parsed = transitionSchema.safeParse(req.body);
    if (!id.success || !parsed.success) return res.status(400).json({ error: "A valid expectedVersion is required." });
    const [run] = await db.update(aiOrchestrationRuns).set({ status: "approved", approvedAt: new Date(), version: parsed.data.expectedVersion + 1, updatedAt: new Date() }).where(and(eq(aiOrchestrationRuns.id, id.data), eq(aiOrchestrationRuns.userId, req.session.userId!), eq(aiOrchestrationRuns.version, parsed.data.expectedVersion), eq(aiOrchestrationRuns.status, "draft"))).returning();
    if (run) return res.json({ run });
    const current = await readOwnedRun(id.data, req.session.userId!);
    return current ? res.status(409).json({ error: "The orchestration draft changed before approval.", current: current.run }) : res.status(404).json({ error: "Orchestration run not found." });
  });

  app.post("/api/ai/orchestration-runs/:id/retry", isAuthenticated, async (req: Request, res: Response) => {
    privateNoStore(res);
    const id = idSchema.safeParse(req.params.id);
    const parsed = transitionSchema.safeParse(req.body);
    if (!id.success || !parsed.success) return res.status(400).json({ error: "A valid expectedVersion is required." });
    const userId = req.session.userId!;
    const run = await db.transaction(async (tx) => {
      const [updated] = await tx.update(aiOrchestrationRuns).set({ status: "approved", failureCode: null, provider: null, model: null, providerResolution: { state: "not_resolved" }, startedAt: null, completedAt: null, version: parsed.data.expectedVersion + 1, updatedAt: new Date() }).where(and(eq(aiOrchestrationRuns.id, id.data), eq(aiOrchestrationRuns.userId, userId), eq(aiOrchestrationRuns.version, parsed.data.expectedVersion), eq(aiOrchestrationRuns.status, "failed"))).returning();
      if (!updated) return null;
      await tx.update(aiOrchestrationSteps).set({ status: "pending", output: null, provider: null, model: null, startedAt: null, completedAt: null, updatedAt: new Date() }).where(and(eq(aiOrchestrationSteps.runId, id.data), eq(aiOrchestrationSteps.userId, userId)));
      return updated;
    });
    return run ? res.json({ run }) : res.status(409).json({ error: "Only a current failed run can be prepared for retry." });
  });

  app.post("/api/ai/orchestration-runs/:id/execute", isAuthenticated, async (req: Request, res: Response) => {
    privateNoStore(res);
    const id = idSchema.safeParse(req.params.id);
    const parsed = transitionSchema.safeParse(req.body);
    if (!id.success || !parsed.success) return res.status(400).json({ error: "A valid expectedVersion is required." });
    const userId = req.session.userId!;
    const record = await readOwnedRun(id.data, userId);
    if (!record) return res.status(404).json({ error: "Orchestration run not found." });
    const resolved = resolveOrchestrationGenerator({ executionMode: record.run.executionMode as AIExecutionMode, preferredProvider: record.run.providerPreference as AIProviderId, cloudFallbackEnabled: record.run.cloudFallbackEnabled });
    if (!resolved.generator) {
      await db.update(aiOrchestrationRuns).set({ providerResolution: resolved.resolution, updatedAt: new Date() }).where(and(eq(aiOrchestrationRuns.id, id.data), eq(aiOrchestrationRuns.userId, userId), eq(aiOrchestrationRuns.version, parsed.data.expectedVersion), eq(aiOrchestrationRuns.status, "approved")));
      return res.status(503).json({ error: "No provider is configured for this run's approved execution policy. The run was not executed and no context was sent.", resolution: resolved.resolution });
    }
    const generator = resolved.generator;
    const [running] = await db.update(aiOrchestrationRuns).set({ status: "running", providerResolution: resolved.resolution, startedAt: new Date(), failureCode: null, version: parsed.data.expectedVersion + 1, updatedAt: new Date() }).where(and(eq(aiOrchestrationRuns.id, id.data), eq(aiOrchestrationRuns.userId, userId), eq(aiOrchestrationRuns.version, parsed.data.expectedVersion), eq(aiOrchestrationRuns.status, "approved"))).returning();
    if (!running) {
      const current = await readOwnedRun(id.data, userId);
      return current ? res.status(409).json({ error: "The approved run changed before execution.", current: current.run }) : res.status(404).json({ error: "Orchestration run not found." });
    }
    const agentKinds = running.requestedAgents as AIAgentKind[];
    try {
      const results = await executeOrchestrationRoles({
        objective: running.objective,
        contextText: running.contextText,
        agentKinds,
        generator,
        onStep: async (event) => {
          const now = new Date();
          await db.update(aiOrchestrationSteps).set(event.state === "running"
            ? { status: "running", startedAt: now, updatedAt: now }
            : { status: "completed", output: event.output!, provider: event.provider!, model: event.model!, completedAt: now, updatedAt: now })
            .where(and(eq(aiOrchestrationSteps.runId, id.data), eq(aiOrchestrationSteps.userId, userId), eq(aiOrchestrationSteps.stepOrder, event.stepOrder), eq(aiOrchestrationSteps.agentKind, event.agentKind)));
        },
      });
      const providers = Array.from(new Set(results.map((result) => result.provider)));
      const models = Array.from(new Set(results.map((result) => result.model)));
      const [run] = await db.update(aiOrchestrationRuns).set({ status: "completed", provider: providers.join(","), model: models.join(","), completedAt: new Date(), version: running.version + 1, updatedAt: new Date() }).where(and(eq(aiOrchestrationRuns.id, id.data), eq(aiOrchestrationRuns.userId, userId), eq(aiOrchestrationRuns.version, running.version), eq(aiOrchestrationRuns.status, "running"))).returning();
      if (!run) return res.status(409).json({ error: "The run completed but its final state could not be reconciled. Reload the record." });
      return res.json({ run, steps: (await readOwnedRun(id.data, userId))?.steps || [] });
    } catch (error) {
      const failureCode = error instanceof Error && error.message === "AI_ORCHESTRATION_EMPTY_OUTPUT" ? "empty_output" : "provider_failure";
      const now = new Date();
      await db.update(aiOrchestrationSteps).set({ status: "failed", completedAt: now, updatedAt: now }).where(and(eq(aiOrchestrationSteps.runId, id.data), eq(aiOrchestrationSteps.userId, userId), eq(aiOrchestrationSteps.status, "running")));
      const [failed] = await db.update(aiOrchestrationRuns).set({ status: "failed", failureCode, completedAt: now, version: running.version + 1, updatedAt: now }).where(and(eq(aiOrchestrationRuns.id, id.data), eq(aiOrchestrationRuns.userId, userId), eq(aiOrchestrationRuns.version, running.version), eq(aiOrchestrationRuns.status, "running"))).returning();
      return res.status(502).json({ error: "The AI provider did not complete this run. Review the recorded steps before retrying.", run: failed || null });
    }
  });

  app.post("/api/ai/orchestration-runs/:id/cancel", isAuthenticated, async (req: Request, res: Response) => {
    privateNoStore(res);
    const id = idSchema.safeParse(req.params.id);
    const parsed = transitionSchema.safeParse(req.body);
    if (!id.success || !parsed.success) return res.status(400).json({ error: "A valid expectedVersion is required." });
    const userId = req.session.userId!;
    const [run] = await db.update(aiOrchestrationRuns).set({ status: "cancelled", completedAt: new Date(), version: parsed.data.expectedVersion + 1, updatedAt: new Date() }).where(and(eq(aiOrchestrationRuns.id, id.data), eq(aiOrchestrationRuns.userId, userId), eq(aiOrchestrationRuns.version, parsed.data.expectedVersion), eq(aiOrchestrationRuns.status, "draft"))).returning();
    if (!run) return res.status(409).json({ error: "Only a current draft can be cancelled." });
    await db.update(aiOrchestrationSteps).set({ status: "cancelled", completedAt: new Date(), updatedAt: new Date() }).where(and(eq(aiOrchestrationSteps.runId, id.data), eq(aiOrchestrationSteps.userId, userId)));
    return res.json({ run });
  });
}
