import type { Express, Request, Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { isAuthenticated } from "./middleware";
import { aiMemoryPolicies, aiPersonaProfiles, userStats } from "@shared/schema";
import { aiMemoryPolicyInput, assistantPersonaInput, buildPortablePersonaProjection } from "../ai-governance";

const DEFAULT_POLICY = {
  chatHistoryDays: null as number | null,
  contextReceiptDays: 90,
  actionReceiptDays: 365,
  crossProductMemoryEnabled: false,
  allowedDestinations: [] as string[],
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
  const [created] = await db.insert(aiMemoryPolicies).values({ userId }).returning();
  return created;
}

export async function applyAIMemoryRetention(userId: number): Promise<{ conversations: number; contextReceipts: number; actionReceipts: number }> {
  const policy = await ensureMemoryPolicy(userId);
  return db.transaction(async (tx) => {
    let conversations = 0;
    if (policy.chatHistoryDays !== null) {
      const result = await tx.execute(sql`
        DELETE FROM "conversations"
        WHERE "user_id" = ${userId} AND "created_at" < now() - (${policy.chatHistoryDays} * interval '1 day')
        RETURNING "id"
      `);
      conversations = (result as { rows?: unknown[] }).rows?.length || 0;
    }
    const context = await tx.execute(sql`
      DELETE FROM "ai_context_receipts"
      WHERE "user_id" = ${userId} AND ("expires_at" <= now() OR "created_at" < now() - (${policy.contextReceiptDays} * interval '1 day'))
      RETURNING "id"
    `);
    const actions = await tx.execute(sql`
      DELETE FROM "ai_action_records"
      WHERE "user_id" = ${userId}
        AND "state" NOT IN ('started','pending_approval','executing')
        AND "created_at" < now() - (${policy.actionReceiptDays} * interval '1 day')
      RETURNING "id"
    `);
    return {
      conversations,
      contextReceipts: (context as { rows?: unknown[] }).rows?.length || 0,
      actionReceipts: (actions as { rows?: unknown[] }).rows?.length || 0,
    };
  });
}

export function registerAIGovernanceRoutes(app: Express): void {
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
      const [policy] = await db.update(aiMemoryPolicies).set({ ...parsed.data, allowedDestinations: destinations, updatedAt: new Date() }).where(eq(aiMemoryPolicies.userId, userId)).returning();
      const removed = await applyAIMemoryRetention(userId);
      return res.json({ policy, removed });
    } catch {
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

