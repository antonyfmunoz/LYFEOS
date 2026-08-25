import type { Express, Request, Response } from "express";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { createMissionLifecycleResult, MissionLifecycleError } from "../mission-lifecycle";
import { isAuthenticated } from "./middleware";
import { db } from "../db";
import { quests } from "@shared/schema";
import { logger } from "../utils";

function publicMission(quest: typeof quests.$inferSelect) {
  const { lifecycleKey: _lifecycleKey, lifecyclePayloadHash: _lifecyclePayloadHash, ...safe } = quest;
  return safe;
}

const captureSchema = z.object({
  text: z.string().trim().min(2).max(2000),
  mutationId: z.string().uuid().optional(),
});

const batchCaptureSchema = z.object({
  text: z.string().trim().min(2).max(8000),
  sourceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  mutationId: z.string().uuid().optional(),
});

function captureLines(text: string): string[] {
  return Array.from(new Set(text.split(/\r?\n/)
    .map((line) => line.trim().replace(/^(?:[-*•]|\d+[.)])\s*/, ""))
    .filter((line) => line.length >= 2)
    .map((line) => line.slice(0, 180))));
}

async function createCaptureMission(input: Parameters<typeof createMissionLifecycleResult>[0], res: Response) {
  try {
    return await createMissionLifecycleResult(input);
  } catch (error) {
    if (error instanceof MissionLifecycleError) {
      res.status(error.status).json({ error: error.message });
      return null;
    }
    throw error;
  }
}

function captureRoute(handler: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response): void => {
    void handler(req, res).catch((error) => {
      logger.error("Inbox capture request failed", { error: error instanceof Error ? error.message : "unknown" });
      if (!res.headersSent) res.status(500).json({ error: "Could not route this capture." });
    });
  };
}

/**
 * The universal capture boundary. Clear user intent becomes a private inbox
 * mission immediately; ambiguous meaning remains in the user's words rather
 * than being silently classified into a high-consequence plan.
 */
export function registerInboxRoutes(app: Express): void {
  app.post("/api/inbox/captures", isAuthenticated, captureRoute(async (req: Request, res: Response) => {
    const parsed = captureSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Capture must contain 2 to 2000 characters." });
    const text = parsed.data.text;
    const firstLine = text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || text;
    const title = firstLine.replace(/^[\-•*\d.\s]+/, "").slice(0, 180) || "Captured idea";
    const creation = await createCaptureMission({
      userId: req.session.userId!,
      title,
      description: `Captured in Universal Inbox:\n${text}`,
      category: "todo",
      experienceReward: 25,
      completed: false,
      ...(parsed.data.mutationId ? { lifecycleKey: `inbox:${parsed.data.mutationId}` } : {}),
      source: "inbox",
    }, res);
    if (!creation) return;
    return res.status(creation.replayed ? 200 : 201).json({ quest: publicMission(creation.quest), route: "mission_inbox", replayed: creation.replayed });
  }));

  app.post("/api/inbox/captures/batch", isAuthenticated, captureRoute(async (req: Request, res: Response) => {
    const parsed = batchCaptureSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Add one or more captured ideas before routing them." });
    const ideas = captureLines(parsed.data.text);
    if (!ideas.length) return res.status(400).json({ error: "Add one or more captured ideas before routing them." });
    if (ideas.length > 30) return res.status(400).json({ error: "Route up to 30 ideas at a time." });

    const existing = await db.select({ title: quests.title }).from(quests).where(eq(quests.userId, req.session.userId!));
    const existingTitles = new Set(existing.map((quest) => quest.title.trim().toLocaleLowerCase()));
    const created = [];
    let replayed = 0;
    for (let ideaIndex = 0; ideaIndex < ideas.length; ideaIndex++) {
      const idea = ideas[ideaIndex];
      const lifecycleKey = parsed.data.mutationId ? `inbox-batch:${parsed.data.mutationId}:${ideaIndex}` : null;
      const [keyed] = lifecycleKey ? await db.select({ id: quests.id }).from(quests).where(and(eq(quests.userId, req.session.userId!), eq(quests.lifecycleKey, lifecycleKey))).limit(1) : [];
      if (!keyed && existingTitles.has(idea.toLocaleLowerCase())) continue;
      const creation = await createCaptureMission({
        userId: req.session.userId!,
        title: idea,
        description: `Captured from daily To-Do Ideas${parsed.data.sourceDate ? ` on ${parsed.data.sourceDate}` : ""}.`,
        category: "todo",
        experienceReward: 25,
        completed: false,
        ...(lifecycleKey ? { lifecycleKey } : {}),
        source: "inbox",
      }, res);
      if (!creation) return;
      existingTitles.add(idea.toLocaleLowerCase());
      created.push(publicMission(creation.quest));
      if (creation.replayed) replayed++;
    }
    return res.status(replayed === created.length && created.length > 0 ? 200 : 201).json({ created, skipped: ideas.length - created.length, replayed, route: "mission_inbox" });
  }));
}
