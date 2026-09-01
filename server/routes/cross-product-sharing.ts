import crypto from "crypto";
import type { Express, Request, Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { crossProductWorkLinks, integrations, quests } from "@shared/schema";
import {
  ECOSYSTEM_INTEGRATION_SERVICES,
  ecosystemIntegrationProvider,
  parseEcosystemIntegrationPermissionPatch,
  writeEcosystemIntegrationPermissions,
  type EcosystemIntegrationService,
} from "@shared/ecosystem-integration-permissions";
import { db } from "../db";
import {
  crossProductDestinations,
  crossProductPurposes,
  CrossProductSharingConflictError,
  CrossProductSharingUnavailableError,
  getCrossProductSharing,
  getCrossProductSharingAvailability,
  queueCoordinationContext,
  queueLinkedWorkItemState,
  reconcileEcosystemIntegrationConsent,
  updateCrossProductSharing,
} from "../cross-product";
import { isAuthenticated } from "./middleware";

const destinationsSchema = z.array(z.enum(crossProductDestinations)).max(2).transform((items) => Array.from(new Set(items)));
const purposesSchema = z.array(z.enum(crossProductPurposes)).max(2).transform((items) => Array.from(new Set(items)));
const workLinkDestinationsSchema = destinationsSchema.refine((items) => items.length > 0, "Choose at least one product for the linked work item.");
const updateSchema = z.object({ enabled: z.boolean(), destinations: destinationsSchema, purposes: purposesSchema, expectedRevision: z.number().int().nonnegative() })
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

const ecosystemNames: Record<EcosystemIntegrationService, string> = {
  entrepreneuros: "EntrepreneurOS",
  creativesos: "CreativesOS",
};

function parseEcosystemService(value: unknown): EcosystemIntegrationService | null {
  return typeof value === "string" && (ECOSYSTEM_INTEGRATION_SERVICES as readonly string[]).includes(value)
    ? value as EcosystemIntegrationService
    : null;
}

async function ecosystemIntegrationFor(userId: number, service: EcosystemIntegrationService) {
  const [integration] = await db.select().from(integrations).where(and(
    eq(integrations.userId, userId),
    eq(integrations.provider, ecosystemIntegrationProvider(service)),
  )).limit(1);
  return integration;
}

export function registerCrossProductSharingRoutes(app: Express): void {
  app.get("/api/cross-product-sharing", isAuthenticated, async (req: Request, res: Response) => {
    return res.json({ sharing: await getCrossProductSharing(req.session.userId!) });
  });

  app.patch("/api/cross-product-sharing", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid sharing preference.", details: parsed.error.flatten() });
    const availability = getCrossProductSharingAvailability();
    if (parsed.data.enabled && !availability.available) {
      return res.status(503).json({ error: availability.reason });
    }
    const userId = req.session.userId!;
    try {
      const receipt = await updateCrossProductSharing({ userId, ...parsed.data });
      const contextQueued = !receipt.replayed && parsed.data.enabled && parsed.data.purposes.includes("correlation")
        ? await queueCoordinationContext(userId, new Date().toISOString().slice(0, 10)) : false;
      return res.json({ sharing: await getCrossProductSharing(userId), contextQueued, receipt });
    } catch (error) {
      if (error instanceof CrossProductSharingConflictError) {
        return res.status(409).json({ error: error.message, currentRevision: error.currentRevision });
      }
      if (error instanceof CrossProductSharingUnavailableError) return res.status(503).json({ error: error.message });
      throw error;
    }
  });

  // Ecosystem products are ordinary connected apps. UMH is the transport, not
  // an implicit grant: each product receives its own connection and controls.
  app.get("/api/ecosystem-integrations/status", isAuthenticated, async (req: Request, res: Response) => {
    const sharing = await getCrossProductSharing(req.session.userId!);
    return res.json({ availability: sharing.availability, integrations: sharing.integrations, revision: sharing.revision });
  });

  app.post("/api/ecosystem-integrations/:service/connect", isAuthenticated, async (req: Request, res: Response) => {
    const service = parseEcosystemService(req.params.service);
    if (!service) return res.status(404).json({ error: "Unknown ecosystem integration." });
    const availability = getCrossProductSharingAvailability();
    if (!availability.available) return res.status(503).json({ error: availability.reason });
    const userId = req.session.userId!;
    const existing = await ecosystemIntegrationFor(userId, service);
    if (existing) await db.update(integrations).set({ status: "active" }).where(eq(integrations.id, existing.id));
    else await db.insert(integrations).values({ userId, provider: ecosystemIntegrationProvider(service), providerName: ecosystemNames[service], scope: "user-managed", status: "active", settings: {} });
    const sharing = await getCrossProductSharing(userId);
    return res.status(201).json({ integration: sharing.integrations.find((item) => item.service === service), sharing });
  });

  app.patch("/api/ecosystem-integrations/:service/permissions", isAuthenticated, async (req: Request, res: Response) => {
    const service = parseEcosystemService(req.params.service);
    const parsed = parseEcosystemIntegrationPermissionPatch(req.body);
    if (!service) return res.status(404).json({ error: "Unknown ecosystem integration." });
    if (!parsed) return res.status(400).json({ error: "Invalid ecosystem integration permission settings." });
    if ((parsed.capabilities.coordination || parsed.capabilities.correlation) && !getCrossProductSharingAvailability().available) {
      return res.status(503).json({ error: getCrossProductSharingAvailability().reason });
    }
    const userId = req.session.userId!;
    const integration = await ecosystemIntegrationFor(userId, service);
    if (!integration || integration.status !== "active") return res.status(409).json({ error: `Connect ${ecosystemNames[service]} before changing its permissions.` });
    try {
      await db.update(integrations).set({ settings: writeEcosystemIntegrationPermissions(integration.settings, parsed) }).where(eq(integrations.id, integration.id));
      await reconcileEcosystemIntegrationConsent(userId);
      const sharing = await getCrossProductSharing(userId);
      return res.json({ integration: sharing.integrations.find((item) => item.service === service), sharing });
    } catch (error) {
      if (error instanceof CrossProductSharingConflictError) return res.status(409).json({ error: "This connection changed in another session. Refresh and try again." });
      if (error instanceof CrossProductSharingUnavailableError) return res.status(503).json({ error: error.message });
      throw error;
    }
  });

  app.post("/api/ecosystem-integrations/:service/disconnect", isAuthenticated, async (req: Request, res: Response) => {
    const service = parseEcosystemService(req.params.service);
    if (!service) return res.status(404).json({ error: "Unknown ecosystem integration." });
    const userId = req.session.userId!;
    const integration = await ecosystemIntegrationFor(userId, service);
    if (!integration || integration.status !== "active") return res.status(404).json({ error: `${ecosystemNames[service]} is not connected.` });
    await db.update(integrations).set({ status: "revoked" }).where(eq(integrations.id, integration.id));
    try {
      await reconcileEcosystemIntegrationConsent(userId);
    } catch (error) {
      if (error instanceof CrossProductSharingConflictError) return res.status(409).json({ error: "This connection changed in another session. Refresh and try again." });
      throw error;
    }
    return res.status(204).send();
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
    const availability = getCrossProductSharingAvailability();
    if (!availability.available) return res.status(503).json({ error: availability.reason });
    const [quest] = await db.select({ id: quests.id }).from(quests).where(and(eq(quests.id, parsed.data.questId), eq(quests.userId, userId))).limit(1);
    if (!quest) return res.status(404).json({ error: "Mission not found." });
    const sharing = await getCrossProductSharing(userId);
    const coordinationDestinations = sharing.integrations
      .filter((integration) => integration.connected && integration.permissions.capabilities.coordination)
      .map((integration) => integration.service);
    if (!sharing.enabled || coordinationDestinations.length === 0) {
      return res.status(409).json({ error: "Enable linked work coordination before creating a work link." });
    }
    if (parsed.data.destinations.some((destination) => !coordinationDestinations.includes(destination))) {
      return res.status(409).json({ error: "Every linked product needs Linked work coordination enabled before it can receive a work link." });
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
