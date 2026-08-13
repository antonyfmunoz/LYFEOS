import type { Express, Request, Response } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { quests, transformationThreads } from "@shared/schema";
import { isAuthenticated } from "./middleware";

type StarterMission = {
  title: string;
  description: string;
  category: string;
  experienceReward: number;
  rationale: string;
};

const REQUIRED_ONBOARDING_MISSIONS = Array.from({ length: 8 }, (_, id) => id);

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function shorten(value: string, maxLength = 72): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trimEnd()}…` : value;
}

function buildStarterMissions(profile: Awaited<ReturnType<typeof storage.getUserProfile>>): StarterMission[] {
  const focus = cleanText(profile?.desiredTrait) || cleanText(profile?.primaryCraft) || cleanText(profile?.vision90Day) || "your next 90 days";
  const vision = cleanText(profile?.vision90Day);
  const craft = cleanText(profile?.primaryCraft);
  const habit = cleanText(profile?.lockedHabit);
  const capacity = (profile?.weeklyCapacity as { hours?: unknown } | null)?.hours;
  const capacityText = typeof capacity === "number" || typeof capacity === "string" ? String(capacity).trim() : "";

  return [
    {
      title: "Define the proof of progress",
      description: vision
        ? `Write the observable evidence that will show progress toward: ${shorten(vision, 160)}`
        : `Write the observable evidence that will show progress in ${shorten(focus)}.`,
      category: "planning",
      experienceReward: 20,
      rationale: "Creates a user-owned definition of progress before execution begins.",
    },
    {
      title: craft ? `Advance ${shorten(craft, 52)}` : `Take one focused step in ${shorten(focus, 52)}`,
      description: craft
        ? `Choose and complete one focused action that advances your ${shorten(craft, 120)} practice.`
        : `Choose one concrete action that advances ${shorten(focus, 120)}.`,
      category: craft ? "learning" : "personal",
      experienceReward: 30,
      rationale: "Turns the selected focus into a concrete, editable first action.",
    },
    {
      title: habit ? `Protect ${shorten(habit, 52)}` : "Protect the capacity for this thread",
      description: habit
        ? `Schedule or complete the ritual that supports this focus: ${shorten(habit, 160)}.`
        : capacityText
          ? `Reserve a realistic portion of your stated ${capacityText} weekly hours for this focus.`
          : "Choose a realistic time and energy boundary that makes this focus sustainable.",
      category: "personal",
      experienceReward: 20,
      rationale: "Connects the plan to the user's stated ritual or available capacity.",
    },
  ];
}

function buildThread(profile: Awaited<ReturnType<typeof storage.getUserProfile>>) {
  const focus = cleanText(profile?.desiredTrait) || cleanText(profile?.primaryCraft) || cleanText(profile?.vision90Day) || "your next 90 days";
  const vision = cleanText(profile?.vision90Day);
  const title = vision ? `Build toward ${shorten(vision, 56)}` : `Develop ${shorten(focus, 56)}`;
  const primaryValues = Array.isArray(profile?.primaryValues) ? profile.primaryValues.filter((value): value is string => typeof value === "string") : [];
  const sourceSnapshot = {
    focus,
    primaryCraft: cleanText(profile?.primaryCraft) || null,
    desiredTrait: cleanText(profile?.desiredTrait) || null,
    vision90Day: vision || null,
    weeklyCapacity: profile?.weeklyCapacity || {},
    lockedHabit: cleanText(profile?.lockedHabit) || null,
    primaryValues,
  };
  const rationale = vision
    ? `This focus begins with your 90-day vision and is bounded by the capacity and rituals you provided during onboarding.`
    : `This focus begins with the direction and capacity you provided during onboarding.`;

  return { title, focus, rationale, sourceSnapshot, starterMissions: buildStarterMissions(profile) };
}

export function registerTransformationThreadRoutes(app: Express): void {
  app.get("/api/transformation-thread", isAuthenticated, async (req: Request, res: Response) => {
    const userId = req.session.userId!;
    const [thread] = await db
      .select()
      .from(transformationThreads)
      .where(and(eq(transformationThreads.userId, userId), inArray(transformationThreads.status, ["draft", "active", "paused"])))
      .orderBy(desc(transformationThreads.updatedAt))
      .limit(1);
    res.json({ thread: thread || null });
  });

  app.post("/api/transformation-thread/initialize", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const profile = await storage.getUserProfile(userId);
      const completed = new Set(profile?.completedOnboardingMissions || []);
      const missing = REQUIRED_ONBOARDING_MISSIONS.filter((id) => !completed.has(id));
      if (missing.length > 0) {
        return res.status(409).json({ error: "Complete the onboarding missions before initializing your system.", missing });
      }

      const [existing] = await db
        .select()
        .from(transformationThreads)
        .where(and(eq(transformationThreads.userId, userId), inArray(transformationThreads.status, ["draft", "active", "paused"])))
        .orderBy(desc(transformationThreads.updatedAt))
        .limit(1);
      if (existing) return res.json({ thread: existing, existing: true });

      const draft = buildThread(profile);
      const [thread] = await db.insert(transformationThreads).values({ userId, ...draft }).returning();
      return res.status(201).json({ thread, existing: false });
    } catch (error) {
      return res.status(500).json({ error: "Could not initialize the transformation thread." });
    }
  });

  app.post("/api/transformation-thread/:id/activate", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const threadId = Number(req.params.id);
      if (!Number.isInteger(threadId)) return res.status(400).json({ error: "Invalid transformation thread." });

      const [thread] = await db
        .select()
        .from(transformationThreads)
        .where(and(eq(transformationThreads.id, threadId), eq(transformationThreads.userId, userId)))
        .limit(1);
      if (!thread) return res.status(404).json({ error: "Transformation thread not found." });
      if (thread.status === "active") return res.json({ thread, createdMissions: 0 });
      if (thread.status !== "draft") return res.status(409).json({ error: "Only a draft thread can be activated." });

      const [otherActive] = await db
        .select({ id: transformationThreads.id })
        .from(transformationThreads)
        .where(and(eq(transformationThreads.userId, userId), eq(transformationThreads.status, "active")))
        .limit(1);
      if (otherActive) return res.status(409).json({ error: "Pause or complete your current thread before activating another." });

      const starterMissions = Array.isArray(thread.starterMissions) ? thread.starterMissions as StarterMission[] : [];
      const today = new Date().toISOString().slice(0, 10);
      const createdMissions = await db.transaction(async (tx) => {
        const inserted = starterMissions.length > 0
          ? await tx.insert(quests).values(starterMissions.map((mission, index) => ({
              userId,
              title: mission.title,
              description: mission.description,
              category: mission.category,
              experienceReward: mission.experienceReward,
              transformationThreadId: thread.id,
              dueDate: index === 0 ? today : null,
              sortOrder: index,
              linkedItems: [{ type: "transformation-thread", id: thread.id, rationale: mission.rationale }],
            }))).returning()
          : [];
        const [activated] = await tx
          .update(transformationThreads)
          .set({ status: "active", activatedAt: new Date(), updatedAt: new Date() })
          .where(eq(transformationThreads.id, thread.id))
          .returning();
        return { activated, count: inserted.length };
      });

      return res.json({ thread: createdMissions.activated, createdMissions: createdMissions.count });
    } catch (error) {
      return res.status(500).json({ error: "Could not activate the transformation thread." });
    }
  });
}
