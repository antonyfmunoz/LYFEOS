import type { Express, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { pushSubscriptions } from "@shared/schema";
import { db } from "../db";
import { sendPushToUser } from "../notificationScheduler";
import { webPushConfiguration } from "../web-push";
import { isAuthenticated } from "./middleware";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2048).refine((value) => value.startsWith("https://")),
  expirationTime: z.number().int().positive().nullable().optional(),
  keys: z.object({ p256dh: z.string().min(20).max(300), auth: z.string().min(8).max(200) }),
}).strict();
const deleteSchema = z.object({ endpoint: z.string().url().max(2048) });

function privateNoStore(res: Response): void { res.setHeader("Cache-Control", "private, no-store"); res.setHeader("Vary", "Cookie"); }

export function registerPushNotificationRoutes(app: Express): void {
  app.get("/api/push/config", isAuthenticated, (_req: Request, res: Response) => {
    privateNoStore(res);
    const config = webPushConfiguration();
    return res.json({ ...config, supported: true, provider: config.configured ? "web_push" : null });
  });

  app.get("/api/push/subscriptions", isAuthenticated, async (req: Request, res: Response) => {
    privateNoStore(res);
    const subscriptions = await db.select({ id: pushSubscriptions.id, endpoint: pushSubscriptions.endpoint, status: pushSubscriptions.status, createdAt: pushSubscriptions.createdAt, lastSuccessAt: pushSubscriptions.lastSuccessAt, failureCount: pushSubscriptions.failureCount }).from(pushSubscriptions).where(and(eq(pushSubscriptions.userId, req.session.userId!), eq(pushSubscriptions.status, "active")));
    return res.json({ subscriptions });
  });

  app.post("/api/push/subscriptions", isAuthenticated, async (req: Request, res: Response) => {
    privateNoStore(res);
    if (!webPushConfiguration().configured) return res.status(503).json({ error: "Web Push is not configured." });
    const parsed = subscriptionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid push subscription." });
    const userId = req.session.userId!;
    const [existing] = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, parsed.data.endpoint)).limit(1);
    if (existing && existing.userId !== userId) return res.status(409).json({ error: "This browser subscription belongs to another account. Revoke browser permission before switching accounts." });
    const values = { userId, endpoint: parsed.data.endpoint, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth, expirationTime: parsed.data.expirationTime ? new Date(parsed.data.expirationTime) : null, fcmToken: null, status: "active", userAgent: req.get("user-agent")?.slice(0, 300) || null, failureCount: 0, lastFailureAt: null, updatedAt: new Date() } as const;
    const [subscription] = existing
      ? await db.update(pushSubscriptions).set(values).where(and(eq(pushSubscriptions.id, existing.id), eq(pushSubscriptions.userId, userId))).returning()
      : await db.insert(pushSubscriptions).values(values).returning();
    return res.status(existing ? 200 : 201).json({ subscription: { id: subscription.id, endpoint: subscription.endpoint, status: subscription.status, createdAt: subscription.createdAt } });
  });

  app.delete("/api/push/subscriptions", isAuthenticated, async (req: Request, res: Response) => {
    privateNoStore(res);
    const parsed = deleteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "A valid push endpoint is required." });
    const [subscription] = await db.update(pushSubscriptions).set({ status: "revoked", updatedAt: new Date() }).where(and(eq(pushSubscriptions.userId, req.session.userId!), eq(pushSubscriptions.endpoint, parsed.data.endpoint))).returning({ id: pushSubscriptions.id });
    return subscription ? res.json({ revoked: true }) : res.status(404).json({ error: "Push subscription not found." });
  });

  app.post("/api/push/test", isAuthenticated, async (req: Request, res: Response) => {
    privateNoStore(res);
    const delivered = await sendPushToUser(req.session.userId!, { title: "LyfeOS notifications are ready", body: "This device can receive private mission and reminder notifications.", tag: "lyfeos-test", url: "/profile" });
    return delivered ? res.json({ delivered: true }) : res.status(503).json({ error: "No active device accepted the test notification." });
  });
}
