import crypto from "crypto";
import type { Express, Request, Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { crossProductSharingPreferences, crossProductWorkLinks, quests } from "@shared/schema";
import { db } from "../db";
import {
  crossProductDestinations,
  crossProductPurposes,
  getCrossProductSharing,
  queueCoordinationContext,
  queueLinkedWorkItemState,
} from "../cross-product";
import { isAuthenticated } from "./middleware";

const destinationsSchema = z.array(z.enum(crossProductDestinations)).max(2).transform((items) => Array.from(new Set(items)));
const purposesSchema = z.array(z.enum(crossProductPurposes)).max(2).transform((items) => Array.from(new Set(items)));
const workLinkDestinationsSchema = destinationsSchema.refine((items) => items.length > 0, "Choose at least one product for the linked work item.");
const updateSchema = z.object({ enabled: z.boolean(), destinations: destinationsSchema, purposes: purposesSchema })
  .superRefine((value, ctx) => {
    if (value.enabled && value.destinations.length === 0) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Choose at least one product before enabling ecosystem sharing.", path: ["destinations"] });
    if (value.enabled && value.purposes.length === 0) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Choose at least one sharing purpose.", path: ["purposes"] });
  });
const workLinkSchema = z.object({
  questId: z.number().int().positive(),
  workItemId: z.string().uuid().optional(),
  sharedSummary: z.string().trim().min(1).max(280),
  destinations: workLinkDestinationsSchema,
});

export function registerCrossProductSharingRoutes(app: Express): void {
  app.get("/api/cross-product-sharing", isAuthenticated, async (req: Request, res: Response) => {
    return res.json({ sharing: await getCrossProductSharing(req.session.userId!) });
  });

  app.patch("/api/cross-product-sharing", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid sharing preference.", details: parsed.error.flatten() });
    const userId = req.session.userId!;
    const now = new Date();
    await db.insert(crossProductSharingPreferences).values({
      userId, ecosystemSharingEnabled: parsed.data.enabled, allowedDestinations: parsed.data.destinations, allowedPurposes: parsed.data.purposes,
      consentedAt: parsed.data.enabled ? now : null, revokedAt: parsed.data.enabled ? null : now, updatedAt: now,
    }).onConflictDoUpdate({
      target: crossProductSharingPreferences.userId,
      set: { ecosystemSharingEnabled: parsed.data.enabled, allowedDestinations: parsed.data.destinations, allowedPurposes: parsed.data.purposes, consentedAt: parsed.data.enabled ? now : null, revokedAt: parsed.data.enabled ? null : now, updatedAt: now },
    });
    const contextQueued = parsed.data.enabled && parsed.data.purposes.includes("correlation")
      ? await queueCoordinationContext(userId, new Date().toISOString().slice(0, 10)) : false;
    return res.json({ sharing: await getCrossProductSharing(userId), contextQueued });
  });

  app.get("/api/cross-product/work-links", isAuthenticated, async (req: Request, res: Response) => {
    const userId = req.session.userId!;
    const links = await db.select({
      id: crossProductWorkLinks.id, workItemId: crossProductWorkLinks.workItemId, sharedSummary: crossProductWorkLinks.sharedSummary,
      destinations: crossProductWorkLinks.destinations, createdAt: crossProductWorkLinks.createdAt,
      questId: quests.id, missionTitle: quests.title, completed: quests.completed,
    }).from(crossProductWorkLinks).innerJoin(quests, eq(quests.id, crossProductWorkLinks.questId))
      .where(eq(crossProductWorkLinks.userId, userId)).orderBy(desc(crossProductWorkLinks.updatedAt));
    return res.json({ workLinks: links });
  });

  app.post("/api/cross-product/work-links", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = workLinkSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid work link.", details: parsed.error.flatten() });
    const userId = req.session.userId!;
    const [quest] = await db.select({ id: quests.id }).from(quests).where(and(eq(quests.id, parsed.data.questId), eq(quests.userId, userId))).limit(1);
    if (!quest) return res.status(404).json({ error: "Mission not found." });
    const sharing = await getCrossProductSharing(userId);
    if (!sharing.enabled || !sharing.purposes.includes("coordination")) {
      return res.status(409).json({ error: "Enable linked work coordination before creating a work link." });
    }
    if (parsed.data.destinations.some((destination) => !sharing.destinations.includes(destination))) {
      return res.status(409).json({ error: "Every linked product must be enabled in your ecosystem sharing settings." });
    }
    const [link] = await db.insert(crossProductWorkLinks).values({
      userId, questId: quest.id, workItemId: parsed.data.workItemId || crypto.randomUUID(), sharedSummary: parsed.data.sharedSummary,
      destinations: parsed.data.destinations,
    }).onConflictDoNothing().returning();
    if (!link) return res.status(409).json({ error: "That mission is already linked to this work item." });
    const queued = await queueLinkedWorkItemState(userId, quest.id);
    return res.status(201).json({ workLink: link, queued });
  });

  app.delete("/api/cross-product/work-links/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid work link." });
    const [deleted] = await db.delete(crossProductWorkLinks).where(and(eq(crossProductWorkLinks.id, id), eq(crossProductWorkLinks.userId, req.session.userId!))).returning({ id: crossProductWorkLinks.id });
    return deleted ? res.status(204).send() : res.status(404).json({ error: "Work link not found." });
  });
}
