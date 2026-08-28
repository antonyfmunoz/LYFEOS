import type { Express, Request, Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { isAuthenticated } from "./middleware";
import { aiExecutionPreferences, aiMemoryPolicies, aiPersonaProfiles, userStats } from "@shared/schema";
import { aiMemoryPolicyInput, assistantPersonaInput, buildPortablePersonaProjection } from "../ai-governance";
import { listAIProviderAvailability } from "../ai-providers";
import { z } from "zod";

const DEFAULT_POLICY = {
  chatHistoryDays: null as number | null,
  contextReceiptDays: 90,
  actionReceiptDays: 365,
  crossProductMemoryEnabled: false,
  allowedDestinations: [] as string[],
  revision: 1,
};

async function ensurePersona(userId: number) {
  const existing = await db.select().from(aiPersonaProfiles).where(eq(aiPersonaProfiles.userId, userId)).limit(1);
  if (existing[0]) return existing[0];
  const stats = await storage.getUserStats(userId);
  const [created] = await db.insert(aiPersonaProfiles).values({ userId, name: stats?.aiAssistantName?.trim() || "NOVA" }).returning();
  return created;
}

async function ensureMemoryPolicy(userId: number) {
  const existing = await db.select().from(aiMemoryPolicies).where(eq(aiMemoryPolicies.userId, userId)).limit(1);
  if (existing[0]) return existing[0];
  const [created] = await db.insert(aiMemoryPolicies).values({ userId }).onConflictDoNothing().returning();
  if (created) return created;
  const [concurrent] = await db.select().from(aiMemoryPolicies).where(eq(aiMemoryPolicies.userId, userId)).limit(1);
  if (!concurrent) throw new Error("memory_policy_convergence_failed");
  return concurrent;
}

async function ensureExecutionPreference(userId: number) {
  const existing = await db.select().from(aiExecutionPreferences).where(eq(aiExecutionPreferences.userId, userId)).limit(1);
  if (existing[0]) return existing[0];
  const [created] = await db.insert(aiExecutionPreferences).values({ userId }).onConflictDoNothing().returning();
  if (created) return created;
  const [concurrent] = await db.select().from(aiExecutionPreferences).where(eq(aiExecutionPreferences.userId, userId)).limit(1);
  if (!concurrent) throw new Error("execution_preference_convergence_failed");
  return concurrent;
}

const executionPreferenceInput = z.object({
  executionMode: z.enum(["local", "hybrid", "cloud"]),
  cloudFallbackEnabled: z.boolean().default(false),
  expectedRevision: z.number().int().positive(),
}).superRefine((value, context) => {
  if (value.executionMode !== "hybrid" && value.cloudFallbackEnabled) context.addIssue({ code: z.ZodIssueCode.custom, path: ["cloudFallbackEnabled"], message: "Cloud fallback is available only in hybrid mode." });
});

type AIMemoryRetentionResult = {
  conversations: number;
  legacyMessages: number;
  voiceSessions: number;
  contextReceipts: number;
  actionReceipts: number;
};

type AIMemoryPolicy = typeof aiMemoryPolicies.$inferSelect;
type AIMemorySQLExecutor = Pick<typeof db, "execute">;

function affectedRows(result: unknown): number {
  return (result as { rows?: unknown[] }).rows?.length || 0;
}

async function applyAIMemoryRetentionWithPolicy(executor: AIMemorySQLExecutor, userId: number, policy: AIMemoryPolicy): Promise<AIMemoryRetentionResult> {
  let conversations = 0;
  let legacyMessages = 0;
  let voiceSessions = 0;
  if (policy.chatHistoryDays !== null) {
    voiceSessions = affectedRows(await executor.execute(sql`
      DELETE FROM "ai_voice_sessions"
      WHERE "user_id" = ${userId}
        AND "status" <> 'active'
        AND "created_at" < now() - (${policy.chatHistoryDays} * interval '1 day')
      RETURNING "id"
    `));
    conversations = affectedRows(await executor.execute(sql`
      DELETE FROM "conversations"
      WHERE "user_id" = ${userId} AND "created_at" < now() - (${policy.chatHistoryDays} * interval '1 day')
      RETURNING "id"
    `));
    legacyMessages = affectedRows(await executor.execute(sql`
      DELETE FROM "ai_messages"
      WHERE "user_id" = ${userId} AND "timestamp" < now() - (${policy.chatHistoryDays} * interval '1 day')
      RETURNING "id"
    `));
  }
  const contextReceipts = affectedRows(await executor.execute(sql`
    DELETE FROM "ai_context_receipts"
    WHERE "user_id" = ${userId} AND ("expires_at" <= now() OR "created_at" < now() - (${policy.contextReceiptDays} * interval '1 day'))
    RETURNING "id"
  `));
  const actionReceipts = affectedRows(await executor.execute(sql`
    DELETE FROM "ai_action_records"
    WHERE "user_id" = ${userId}
      AND "state" NOT IN ('started','pending_approval','executing')
      AND "created_at" < now() - (${policy.actionReceiptDays} * interval '1 day')
    RETURNING "id"
  `));
  return { conversations, legacyMessages, voiceSessions, contextReceipts, actionReceipts };
}

export async function applyAIMemoryRetention(userId: number): Promise<AIMemoryRetentionResult> {
  const policy = await ensureMemoryPolicy(userId);
  return db.transaction((tx) => applyAIMemoryRetentionWithPolicy(tx, userId, policy));
}

export function registerAIGovernanceRoutes(app: Express): void {
  app.get("/api/ai/execution", isAuthenticated, async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      const preference = await ensureExecutionPreference(req.session.userId!);
      return res.json({ preference, providers: listAIProviderAvailability(), disclosure: "Local means an installation-controlled OpenAI-compatible endpoint. Hybrid uses it first and reaches Anthropic only when cloud fallback is explicitly enabled. Provider credentials never enter this response." });
    } catch {
      return res.status(500).json({ error: "Could not load AI execution settings." });
    }
  });

  app.put("/api/ai/execution", isAuthenticated, async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "private, no-store");
    const parsed = executionPreferenceInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "AI execution settings are invalid.", details: parsed.error.flatten() });
    const userId = req.session.userId!;
    try {
      await ensureExecutionPreference(userId);
      const preferredProvider = parsed.data.executionMode === "cloud" ? "anthropic" : "self_hosted";
      const [preference] = await db.update(aiExecutionPreferences).set({ executionMode: parsed.data.executionMode, preferredProvider, cloudFallbackEnabled: parsed.data.cloudFallbackEnabled, revision: parsed.data.expectedRevision + 1, updatedAt: new Date() }).where(and(eq(aiExecutionPreferences.userId, userId), eq(aiExecutionPreferences.revision, parsed.data.expectedRevision))).returning();
      if (!preference) return res.status(409).json({ error: "AI execution settings changed in another session. Reload before saving." });
      return res.json({ preference, providers: listAIProviderAvailability() });
    } catch {
      return res.status(500).json({ error: "Could not save AI execution settings." });
    }
  });

  app.get("/api/ai/persona", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const persona = await ensurePersona(req.session.userId!);
      return res.json({ persona });
    } catch {
      return res.status(500).json({ error: "Could not load assistant persona." });
    }
  });

  app.put("/api/ai/persona", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = assistantPersonaInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Assistant persona settings are invalid." });
    try {
      const userId = req.session.userId!;
      const current = await ensurePersona(userId);
      if (parsed.data.expectedRevision && parsed.data.expectedRevision !== current.revision) {
        return res.status(409).json({ error: "Assistant persona changed in another session. Reload before saving." });
      }
      const destinations = parsed.data.ecosystemSharingEnabled ? parsed.data.allowedDestinations : [];
      const [updated] = await db.transaction(async (tx) => {
        const personaRows = await tx.update(aiPersonaProfiles).set({
          name: parsed.data.name,
          interactionStyle: parsed.data.interactionStyle,
          ecosystemSharingEnabled: parsed.data.ecosystemSharingEnabled,
          allowedDestinations: destinations,
          revision: current.revision + 1,
          updatedAt: new Date(),
        }).where(and(eq(aiPersonaProfiles.userId, userId), eq(aiPersonaProfiles.revision, current.revision))).returning();
        if (!personaRows[0]) throw new Error("revision_conflict");
        await tx.update(userStats).set({ aiAssistantName: parsed.data.name, updatedAt: new Date() }).where(eq(userStats.userId, userId));
        return personaRows;
      });
      return res.json({ persona: updated });
    } catch (error) {
      if (error instanceof Error && error.message === "revision_conflict") return res.status(409).json({ error: "Assistant persona changed in another session. Reload before saving." });
      return res.status(500).json({ error: "Could not save assistant persona." });
    }
  });

  app.get("/api/ai/persona/projection", isAuthenticated, async (req: Request, res: Response) => {
    const destination = typeof req.query.destination === "string" ? req.query.destination : "";
    if (!['umh', 'entrepreneuros', 'creatoros'].includes(destination)) return res.status(400).json({ error: "Choose a supported destination." });
    try {
      const persona = await ensurePersona(req.session.userId!);
      return res.json(buildPortablePersonaProjection({
        id: persona.id,
        name: persona.name,
        interactionStyle: persona.interactionStyle as Record<string, unknown>,
        lyfeosPresentation: persona.lyfeosPresentation as Record<string, unknown>,
        ecosystemSharingEnabled: persona.ecosystemSharingEnabled,
        allowedDestinations: Array.isArray(persona.allowedDestinations) ? persona.allowedDestinations as string[] : [],
        revision: persona.revision,
      }, destination));
    } catch (error) {
      return res.status(403).json({ error: error instanceof Error ? error.message : "Persona sharing is not authorized." });
    }
  });

  app.get("/api/account/ai-memory-policy", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const policy = await ensureMemoryPolicy(req.session.userId!);
      return res.json({ policy });
    } catch {
      return res.json({ policy: DEFAULT_POLICY, migrationRequired: true });
    }
  });

  app.patch("/api/account/ai-memory-policy", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = aiMemoryPolicyInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Memory retention settings are invalid." });
    try {
      const userId = req.session.userId!;
      await ensureMemoryPolicy(userId);
      const destinations = parsed.data.crossProductMemoryEnabled ? parsed.data.allowedDestinations : [];
      const { expectedRevision, ...settings } = parsed.data;
      const { policy, removed } = await db.transaction(async (tx) => {
        const [policy] = await tx.update(aiMemoryPolicies).set({ ...settings, allowedDestinations: destinations, revision: expectedRevision + 1, updatedAt: new Date() }).where(and(eq(aiMemoryPolicies.userId, userId), eq(aiMemoryPolicies.revision, expectedRevision))).returning();
        if (!policy) throw new Error("memory_policy_revision_conflict");
        const removed = await applyAIMemoryRetentionWithPolicy(tx, userId, policy);
        return { policy, removed };
      });
      return res.json({ policy, removed });
    } catch (error) {
      if (error instanceof Error && error.message === "memory_policy_revision_conflict") return res.status(409).json({ error: "Memory settings changed in another session. Reload before saving." });
      return res.status(500).json({ error: "Could not save memory retention settings." });
    }
  });

  app.post("/api/account/ai-memory/apply-retention", isAuthenticated, async (req: Request, res: Response) => {
    try {
      return res.json({ removed: await applyAIMemoryRetention(req.session.userId!) });
    } catch {
      return res.status(500).json({ error: "Could not apply AI memory retention." });
    }
  });

  app.get("/api/ai/context-receipts", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const result = await db.execute(sql`
        SELECT "id", "conversation_id", "purpose", "sources", "disclosure", "created_at", "expires_at"
        FROM "ai_context_receipts" WHERE "user_id" = ${req.session.userId!}
        ORDER BY "created_at" DESC LIMIT 20
      `);
      return res.json({ receipts: (result as { rows?: unknown[] }).rows || [] });
    } catch {
      return res.status(500).json({ error: "Could not load AI context receipts." });
    }
  });
}
