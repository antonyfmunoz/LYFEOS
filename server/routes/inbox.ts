import type { Express, Request, Response } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { createMissionLifecycle } from "../mission-lifecycle";
import { isAuthenticated } from "./middleware";
import { db } from "../db";
import { quests } from "@shared/schema";

const captureSchema = z.object({
  text: z.string().trim().min(2).max(2000),
});

const batchCaptureSchema = z.object({
  text: z.string().trim().min(2).max(8000),
  sourceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function captureLines(text: string): string[] {
  return Array.from(new Set(text.split(/\r?\n/)
    .map((line) => line.trim().replace(/^(?:[-*•]|\d+[.)])\s*/, ""))
    .filter((line) => line.length >= 2)
    .map((line) => line.slice(0, 180))));
}

/**
 * The universal capture boundary. Clear user intent becomes a private inbox
 * mission immediately; ambiguous meaning remains in the user's words rather
 * than being silently classified into a high-consequence plan.
 */
export function registerInboxRoutes(app: Express): void {
  app.post("/api/inbox/captures", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = captureSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Capture must contain 2 to 2000 characters." });
    const text = parsed.data.text;
    const firstLine = text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || text;
    const title = firstLine.replace(/^[\-•*\d.\s]+/, "").slice(0, 180) || "Captured idea";
    const quest = await createMissionLifecycle({
      userId: req.session.userId!,
      title,
      description: `Captured in Universal Inbox:\n${text}`,
      category: "todo",
      experienceReward: 25,
      completed: false,
      source: "ui",
    });
    return res.status(201).json({ quest, route: "mission_inbox" });
  });

  app.post("/api/inbox/captures/batch", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = batchCaptureSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Add one or more captured ideas before routing them." });
    const ideas = captureLines(parsed.data.text);
    if (!ideas.length) return res.status(400).json({ error: "Add one or more captured ideas before routing them." });
    if (ideas.length > 30) return res.status(400).json({ error: "Route up to 30 ideas at a time." });

    const existing = await db.select({ title: quests.title }).from(quests).where(eq(quests.userId, req.session.userId!));
    const existingTitles = new Set(existing.map((quest) => quest.title.trim().toLocaleLowerCase()));
    const created = [];
    for (const idea of ideas) {
      if (existingTitles.has(idea.toLocaleLowerCase())) continue;
      const quest = await createMissionLifecycle({
        userId: req.session.userId!,
        title: idea,
        description: `Captured from daily To-Do Ideas${parsed.data.sourceDate ? ` on ${parsed.data.sourceDate}` : ""}.`,
        category: "todo",
        experienceReward: 25,
        completed: false,
        source: "ui",
      });
      existingTitles.add(idea.toLocaleLowerCase());
      created.push(quest);
    }
    return res.status(201).json({ created, skipped: ideas.length - created.length, route: "mission_inbox" });
  });
}
