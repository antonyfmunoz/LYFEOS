import type { Express, Request, Response } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { storage } from "../storage";
import { questSkillContributions, quests, skillEdges, skillNodes, transformationThreadEvidence, transformationThreads } from "@shared/schema";
import { isAuthenticated } from "./middleware";
import { recordTransformationThreadEvidence } from "../transformation-thread-evidence";
import { getProgressionSummary, refreshProgressionState } from "../progression";
import { buildSkillGraph, recommendNextSkill, type SkillMasteryRequirements, type SkillUnlockRequirement } from "../skill-graph";

type StarterMission = {
  title: string;
  description: string;
  category: string;
  experienceReward: number;
  rationale: string;
  skillContributions: Array<{ key: string; experienceAmount: number }>;
};

type SkillBlueprint = {
  nodes: Array<{
    key: string;
    name: string;
    description: string;
    kind: "primary" | "supporting" | "capacity" | "application";
    unlockRequirements: SkillUnlockRequirement[];
    masteryRequirements: SkillMasteryRequirements;
  }>;
  edges: Array<{ sourceKey: string; targetKey: string; relationship: string }>;
};

const REQUIRED_ONBOARDING_MISSIONS = Array.from({ length: 8 }, (_, id) => id);
const MIN_COMPLETION_DAYS = 28;

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function shorten(value: string, maxLength = 72): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trimEnd()}…` : value;
}

function buildSkillBlueprint(profile: Awaited<ReturnType<typeof storage.getUserProfile>>): SkillBlueprint {
  const craft = cleanText(profile?.primaryCraft);
  const desiredTrait = cleanText(profile?.desiredTrait);
  const vocation = cleanText(profile?.careerVocation);
  const habit = cleanText(profile?.lockedHabit);
  const primary = shorten(craft || desiredTrait || vocation || "Focused execution", 72);
  const supporting = desiredTrait && desiredTrait.toLocaleLowerCase() !== primary.toLocaleLowerCase()
    ? shorten(desiredTrait, 72)
    : "Deliberate practice";

  return {
    nodes: [
      {
        key: "primary",
        name: primary,
        description: `Your current Thread is centered on building ${primary} through real-world practice.`,
        kind: "primary",
        unlockRequirements: [],
        masteryRequirements: { minExperience: 100, minCompletedMissions: 3, minReviews: 2 },
      },
      {
        key: "supporting",
        name: supporting,
        description: desiredTrait
          ? `${supporting} is a connected capability this Thread can develop alongside your primary focus.`
          : "Deliberate practice turns isolated effort into repeatable capability.",
        kind: "supporting",
        unlockRequirements: [{ skillKey: "primary", minExperience: 30 }],
        masteryRequirements: { minExperience: 80, minCompletedMissions: 3, minReviews: 2 },
      },
      {
        key: "capacity",
        name: "Consistency & capacity",
        description: habit
          ? `Your stated ritual, ${shorten(habit, 110)}, protects the capacity to practice consistently.`
          : "Sustainable time and energy make repeated practice possible.",
        kind: "capacity",
        unlockRequirements: [],
        masteryRequirements: { minExperience: 60, minCompletedMissions: 3, minReviews: 1 },
      },
      {
        key: "calibration",
        name: "Reflection & calibration",
        description: "Clear evidence and review let you adjust the route instead of merely checking tasks off.",
        kind: "supporting",
        unlockRequirements: [],
        masteryRequirements: { minExperience: 60, minCompletedMissions: 2, minReviews: 2 },
      },
      {
        key: "application",
        name: `Applied ${primary}`,
        description: `Use ${primary} and ${supporting} together in a real-world situation after each has a practice record.`,
        kind: "application",
        unlockRequirements: [
          { skillKey: "primary", minExperience: 100 },
          { skillKey: "supporting", minExperience: 40 },
        ],
        masteryRequirements: { minExperience: 80, minCompletedMissions: 2, minReviews: 2 },
      },
    ],
    edges: [
      { sourceKey: "primary", targetKey: "supporting", relationship: "unlocks" },
      { sourceKey: "capacity", targetKey: "primary", relationship: "sustains" },
      { sourceKey: "calibration", targetKey: "primary", relationship: "clarifies" },
      { sourceKey: "primary", targetKey: "application", relationship: "requires" },
      { sourceKey: "supporting", targetKey: "application", relationship: "unlocks" },
    ],
  };
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
      skillContributions: [{ key: "calibration", experienceAmount: 20 }],
    },
    {
      title: craft ? `Advance ${shorten(craft, 52)}` : `Take one focused step in ${shorten(focus, 52)}`,
      description: craft
        ? `Choose and complete one focused action that advances your ${shorten(craft, 120)} practice.`
        : `Choose one concrete action that advances ${shorten(focus, 120)}.`,
      category: craft ? "learning" : "personal",
      experienceReward: 30,
      rationale: "Turns the selected focus into a concrete, editable first action.",
      skillContributions: [
        { key: "primary", experienceAmount: 30 },
      ],
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
      skillContributions: [{ key: "capacity", experienceAmount: 20 }],
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

  return { title, focus, rationale, sourceSnapshot, starterMissions: buildStarterMissions(profile), skillBlueprint: buildSkillBlueprint(profile) };
}

async function getCompletionReadiness(userId: number, thread: typeof transformationThreads.$inferSelect) {
  const [linkedMissions, evidence] = await Promise.all([
    db.select({ id: quests.id, completed: quests.completed })
      .from(quests)
      .where(and(eq(quests.userId, userId), eq(quests.transformationThreadId, thread.id))),
    db.select({ sourceType: transformationThreadEvidence.sourceType })
      .from(transformationThreadEvidence)
      .where(and(eq(transformationThreadEvidence.userId, userId), eq(transformationThreadEvidence.transformationThreadId, thread.id))),
  ]);
  const reviewCount = evidence.filter((item) => item.sourceType === "weekly_review").length;
  const completedMissionCount = linkedMissions.filter((mission) => mission.completed).length;
  const startedAt = thread.activatedAt || thread.createdAt;
  const activeDays = Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / (1000 * 60 * 60 * 24)));
  const remainingDays = Math.max(0, MIN_COMPLETION_DAYS - activeDays);

  return {
    completedMissionCount,
    requiredMissionCount: 3,
    reviewCount,
    requiredReviewCount: 2,
    activeDays,
    requiredActiveDays: MIN_COMPLETION_DAYS,
    remainingDays,
    ready: completedMissionCount >= 3 && reviewCount >= 2 && activeDays >= MIN_COMPLETION_DAYS,
  };
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
    if (!thread) return res.json({ thread: null });

    const [linkedMissions, evidence, skills, progression, completedSkillMissions] = await Promise.all([
      db.select({ id: quests.id, title: quests.title, completed: quests.completed })
        .from(quests)
        .where(and(eq(quests.userId, userId), eq(quests.transformationThreadId, thread.id))),
      db.select()
        .from(transformationThreadEvidence)
        .where(and(eq(transformationThreadEvidence.userId, userId), eq(transformationThreadEvidence.transformationThreadId, thread.id)))
        .orderBy(desc(transformationThreadEvidence.createdAt))
        .limit(8),
      db.select().from(skillNodes)
        .where(and(eq(skillNodes.userId, userId), eq(skillNodes.transformationThreadId, thread.id))),
      getProgressionSummary(userId),
      db.select({ skillNodeId: questSkillContributions.skillNodeId, questId: questSkillContributions.questId })
        .from(questSkillContributions)
        .innerJoin(quests, eq(questSkillContributions.questId, quests.id))
        .where(and(
          eq(questSkillContributions.userId, userId),
          eq(quests.transformationThreadId, thread.id),
          eq(quests.completed, true),
        )),
    ]);
    const skillIds = skills.map((skill) => skill.id);
    const edges = skillIds.length > 0
      ? await db.select().from(skillEdges).where(and(eq(skillEdges.userId, userId), inArray(skillEdges.sourceSkillId, skillIds)))
      : [];
    const reviewCount = evidence.filter((item) => item.sourceType === "weekly_review").length;
    const completedMissionCountBySkill = new Map<number, number>();
    for (const contribution of completedSkillMissions) {
      completedMissionCountBySkill.set(
        contribution.skillNodeId,
        (completedMissionCountBySkill.get(contribution.skillNodeId) || 0) + 1,
      );
    }
    const skillGraph = buildSkillGraph({ skills, completedMissionCountBySkill, reviewCount });
    const recommendedSkill = recommendNextSkill(skillGraph);
    const recommendedMission = recommendedSkill
      ? linkedMissions.find((mission) => !mission.completed)
      : undefined;
    res.json({
      thread: {
        ...thread,
        progress: {
          missionsTotal: linkedMissions.length,
          missionsCompleted: linkedMissions.filter((mission) => mission.completed).length,
          evidenceCount: evidence.length,
        },
        completionReadiness: await getCompletionReadiness(userId, thread),
        evidence,
        skills,
        skillEdges: edges,
        skillGraph: {
          nodes: skillGraph,
          reviewCount,
          nextPractice: recommendedSkill ? {
            skillNodeId: recommendedSkill.id,
            skillName: recommendedSkill.name,
            title: recommendedMission?.title || `Practice ${recommendedSkill.name}`,
            description: recommendedMission
              ? `Complete this linked mission, then record what you observed.`
              : `Create one real-world mission for this unlocked skill and define the evidence you will record.`,
          } : null,
        },
        progression,
      },
    });
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
      const { skillBlueprint, ...threadDraft } = draft;
      const thread = await db.transaction(async (tx) => {
        const [createdThread] = await tx.insert(transformationThreads).values({ userId, ...threadDraft }).returning();
        const createdSkills = await tx.insert(skillNodes).values(skillBlueprint.nodes.map((skill) => ({
          userId,
          transformationThreadId: createdThread.id,
          ...skill,
        }))).returning();
        const skillIdsByKey = new Map(createdSkills.map((skill) => [skill.key, skill.id]));
        const edges = skillBlueprint.edges
          .map((edge) => ({
            userId,
            sourceSkillId: skillIdsByKey.get(edge.sourceKey),
            targetSkillId: skillIdsByKey.get(edge.targetKey),
            relationship: edge.relationship,
          }))
          .filter((edge): edge is { userId: number; sourceSkillId: number; targetSkillId: number; relationship: string } => Boolean(edge.sourceSkillId && edge.targetSkillId));
        if (edges.length > 0) await tx.insert(skillEdges).values(edges);
        return createdThread;
      });
      return res.status(201).json({ thread, existing: false });
    } catch (error) {
      return res.status(500).json({ error: "Could not initialize the transformation thread." });
    }
  });

  // Users can extend their own private map without silently changing a shared
  // curriculum. New branches deliberately open after an initial record on the
  // Thread's primary skill, so the graph remains focused rather than a list.
  app.post("/api/transformation-thread/:id/skills", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = z.object({
      name: z.string().trim().min(2).max(72),
      description: z.string().trim().max(240).optional(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Add a branch name of 2 to 72 characters." });
    const userId = req.session.userId!;
    const threadId = Number(req.params.id);
    if (!Number.isInteger(threadId)) return res.status(400).json({ error: "Invalid transformation thread." });
    try {
      const [thread] = await db.select({ id: transformationThreads.id })
        .from(transformationThreads)
        .where(and(
          eq(transformationThreads.id, threadId),
          eq(transformationThreads.userId, userId),
          inArray(transformationThreads.status, ["draft", "active", "paused"]),
        ))
        .limit(1);
      if (!thread) return res.status(404).json({ error: "Transformation thread not found." });
      const currentSkills = await db.select({ id: skillNodes.id, key: skillNodes.key, name: skillNodes.name })
        .from(skillNodes)
        .where(and(eq(skillNodes.userId, userId), eq(skillNodes.transformationThreadId, threadId)));
      const primary = currentSkills.find((skill) => skill.key === "primary");
      if (!primary) return res.status(409).json({ error: "The primary skill is missing from this Thread." });
      const normalized = parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "branch";
      const occupied = new Set(currentSkills.map((skill) => skill.key));
      let key = normalized;
      let suffix = 2;
      while (occupied.has(key)) key = `${normalized}-${suffix++}`;
      const [created] = await db.transaction(async (tx) => {
        const [node] = await tx.insert(skillNodes).values({
          userId,
          transformationThreadId: threadId,
          key,
          name: parsed.data.name,
          description: parsed.data.description || `A user-defined branch connected to ${primary.name}.`,
          kind: "supporting",
          unlockRequirements: [{ skillKey: "primary", minExperience: 30 }],
          masteryRequirements: { minExperience: 80, minCompletedMissions: 3, minReviews: 2 },
        }).returning();
        await tx.insert(skillEdges).values({
          userId,
          sourceSkillId: primary.id,
          targetSkillId: node.id,
          relationship: "unlocks",
        });
        return [node];
      });
      return res.status(201).json({ skill: created });
    } catch (error) {
      return res.status(500).json({ error: "Could not add the skill branch." });
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
      const threadSkills = await db.select({ id: skillNodes.id, key: skillNodes.key })
        .from(skillNodes)
        .where(and(eq(skillNodes.userId, userId), eq(skillNodes.transformationThreadId, thread.id)));
      const skillIdsByKey = new Map(threadSkills.map((skill) => [skill.key, skill.id]));
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
        const contributions = inserted.flatMap((quest, index) => (starterMissions[index]?.skillContributions || [])
          .map((contribution) => ({
            userId,
            questId: quest.id,
            skillNodeId: skillIdsByKey.get(contribution.key),
            experienceAmount: contribution.experienceAmount,
          }))
          .filter((contribution): contribution is { userId: number; questId: number; skillNodeId: number; experienceAmount: number } => Boolean(contribution.skillNodeId)));
        if (contributions.length > 0) await tx.insert(questSkillContributions).values(contributions);
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

  app.post("/api/transformation-thread/:id/pause", isAuthenticated, async (req: Request, res: Response) => {
    const userId = req.session.userId!;
    const threadId = Number(req.params.id);
    if (!Number.isInteger(threadId)) return res.status(400).json({ error: "Invalid transformation thread." });
    const [thread] = await db.update(transformationThreads)
      .set({ status: "paused", updatedAt: new Date() })
      .where(and(
        eq(transformationThreads.id, threadId),
        eq(transformationThreads.userId, userId),
        eq(transformationThreads.status, "active"),
      ))
      .returning();
    if (!thread) return res.status(409).json({ error: "Only an active thread can be paused." });
    return res.json({ thread });
  });

  app.post("/api/transformation-thread/:id/resume", isAuthenticated, async (req: Request, res: Response) => {
    const userId = req.session.userId!;
    const threadId = Number(req.params.id);
    if (!Number.isInteger(threadId)) return res.status(400).json({ error: "Invalid transformation thread." });
    const [otherActive] = await db.select({ id: transformationThreads.id })
      .from(transformationThreads)
      .where(and(eq(transformationThreads.userId, userId), eq(transformationThreads.status, "active")))
      .limit(1);
    if (otherActive) return res.status(409).json({ error: "Pause or complete your current thread before resuming another." });
    const [thread] = await db.update(transformationThreads)
      .set({ status: "active", updatedAt: new Date() })
      .where(and(
        eq(transformationThreads.id, threadId),
        eq(transformationThreads.userId, userId),
        eq(transformationThreads.status, "paused"),
      ))
      .returning();
    if (!thread) return res.status(409).json({ error: "Only a paused thread can be resumed." });
    return res.json({ thread });
  });

  app.post("/api/transformation-thread/:id/review", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = z.object({ reflection: z.string().trim().min(3).max(2000) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Add a short review before recording it." });
    const userId = req.session.userId!;
    const threadId = Number(req.params.id);
    if (!Number.isInteger(threadId)) return res.status(400).json({ error: "Invalid transformation thread." });
    const [thread] = await db.select().from(transformationThreads)
      .where(and(eq(transformationThreads.id, threadId), eq(transformationThreads.userId, userId), eq(transformationThreads.status, "active")))
      .limit(1);
    if (!thread) return res.status(409).json({ error: "Reviews can only be recorded on an active thread." });
    await recordTransformationThreadEvidence({
      userId,
      transformationThreadId: thread.id,
      sourceType: "weekly_review",
      sourceId: new Date().toISOString(),
      summary: parsed.data.reflection,
    });
    const progression = await refreshProgressionState(userId, `thread:${thread.id}:review`);
    return res.status(201).json({ success: true, progression });
  });

  app.post("/api/transformation-thread/:id/complete", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = z.object({ reflection: z.string().trim().min(3).max(2000) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Add a short closing reflection before completing this thread." });
    const userId = req.session.userId!;
    const threadId = Number(req.params.id);
    if (!Number.isInteger(threadId)) return res.status(400).json({ error: "Invalid transformation thread." });
    const [currentThread] = await db.select().from(transformationThreads)
      .where(and(
        eq(transformationThreads.id, threadId),
        eq(transformationThreads.userId, userId),
        inArray(transformationThreads.status, ["active", "paused"]),
      ))
      .limit(1);
    if (!currentThread) return res.status(409).json({ error: "Only an active or paused thread can be completed." });
    const readiness = await getCompletionReadiness(userId, currentThread);
    if (!readiness.ready) {
      return res.status(409).json({
        error: `This focus needs sustained evidence before completion: ${readiness.completedMissionCount}/${readiness.requiredMissionCount} linked missions, ${readiness.reviewCount}/${readiness.requiredReviewCount} reviews, and ${readiness.remainingDays} more active days.`,
        completionReadiness: readiness,
      });
    }
    const [thread] = await db.update(transformationThreads)
      .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(transformationThreads.id, threadId),
        eq(transformationThreads.userId, userId),
        inArray(transformationThreads.status, ["active", "paused"]),
      ))
      .returning();
    if (!thread) return res.status(409).json({ error: "This focus changed before completion could be recorded. Please try again." });
    await recordTransformationThreadEvidence({
      userId,
      transformationThreadId: thread.id,
      sourceType: "thread_completion",
      sourceId: String(thread.id),
      summary: parsed.data.reflection,
    });
    const progression = await refreshProgressionState(userId, `thread:${thread.id}:completed`);
    return res.json({ thread, progression });
  });
}
