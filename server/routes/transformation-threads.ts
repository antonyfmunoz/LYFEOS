import type { Express, Request, Response } from "express";
import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { storage } from "../storage";
import { missionContracts, missionDeferrals, missionEvidence, missionReviews, personalCapabilities, questSkillContributions, quests, skillEdges, skillNodes, skillProgressionEvents, transformationThreadEvidence, transformationThreads, userActivityEvents } from "@shared/schema";
import { isAuthenticated } from "./middleware";
import { recordTransformationThreadEvidence } from "../transformation-thread-evidence";
import { getProgressionSummary, refreshProgressionState } from "../progression";
import { buildSkillGraph, recommendNextSkill, type SkillMasteryRequirements, type SkillUnlockRequirement } from "../skill-graph";
import { ensurePersonalCapability } from "../capabilities";
import { prepareMissionCreation } from "../mission-lifecycle";
import { buildPlanningContextSnapshot, type PlanningContextSnapshot } from "../context-snapshot";
import { buildMissionSupportPlan, calibrateMissionDifficulty, missionFitsResources, selectNextPracticeMission, type PracticeMissionCandidate } from "../transformation-intelligence";
import { buildMissionUnlockResult } from "../mission-unlock-result";
import { reconcileThreadContinuation } from "../transformation-thread-continuation";
import { logger } from "../utils";
import { MIN_TRANSFORMATION_THREAD_COMPLETION_DAYS } from "../transformation-thread-policy";

type StarterMission = {
  title: string;
  description: string;
  category: string;
  experienceReward: number;
  rationale: string;
  dayOffset: 0 | 1 | 2;
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

// The final integration mission records a deliberate private-by-default choice.
// "Not now" satisfies it; no external connection is required or created.
const REQUIRED_ONBOARDING_MISSIONS = Array.from({ length: 9 }, (_, id) => id);
const MIN_COMPLETION_DAYS = MIN_TRANSFORMATION_THREAD_COMPLETION_DAYS;

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function shorten(value: string, maxLength = 72): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trimEnd()}…` : value;
}

function firstDeclaredItem(value: unknown): string {
  if (Array.isArray(value)) {
    const item = value.find((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0);
    return item ? item.trim() : "";
  }
  return typeof value === "string" ? value.split(/[\n,;]+/).map((item) => item.trim()).find(Boolean) || "" : "";
}

function localCalendarDate(timeZone: unknown, dayOffset: number): string {
  const normalizedTimeZone = cleanText(timeZone) || "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: normalizedTimeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const base = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) + dayOffset));
    return base.toISOString().slice(0, 10);
  } catch {
    const fallback = new Date();
    fallback.setUTCDate(fallback.getUTCDate() + dayOffset);
    return fallback.toISOString().slice(0, 10);
  }
}

const LEGACY_STARTER_REPAIR_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Repairs only a recent, untouched pre-schedule starter set. */
export async function reconcileLegacyThreadStarterSchedule(userId: number): Promise<number> {
  const [thread] = await db.select().from(transformationThreads)
    .where(and(eq(transformationThreads.userId, userId), eq(transformationThreads.status, "active")))
    .orderBy(desc(transformationThreads.updatedAt)).limit(1);
  if (!thread?.activatedAt || Date.now() - thread.activatedAt.getTime() > LEGACY_STARTER_REPAIR_WINDOW_MS) return 0;
  const starters = await db.select({ id: quests.id, sortOrder: quests.sortOrder, completed: quests.completed, startDate: quests.startDate, endDate: quests.endDate, deletedAt: quests.deletedAt })
    .from(quests).where(and(eq(quests.userId, userId), eq(quests.transformationThreadId, thread.id), eq(quests.planningDecisionSource, "system"), isNull(quests.deletedAt)));
  const untouchedStarterSet = starters.length === 3
    && starters.every((mission) => !mission.completed && !mission.startDate && !mission.endDate && !mission.deletedAt)
    && [0, 1, 2].every((sortOrder) => starters.some((mission) => mission.sortOrder === sortOrder));
  if (!untouchedStarterSet) return 0;
  const profile = await storage.getUserProfile(userId);
  const sourceSnapshot = thread.sourceSnapshot && typeof thread.sourceSnapshot === "object" ? thread.sourceSnapshot as { timeZone?: unknown } : {};
  const timeZone = cleanText(profile?.timezone) || cleanText(sourceSnapshot.timeZone) || "UTC";
  let repaired = 0;
  for (const mission of starters.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))) {
    const dayOffset = mission.sortOrder === 0 || mission.sortOrder === 1 || mission.sortOrder === 2 ? mission.sortOrder : 0;
    const scheduledDate = localCalendarDate(timeZone, dayOffset);
    const [updated] = await db.update(quests).set({ startDate: scheduledDate, endDate: scheduledDate, dueDate: scheduledDate, timezone: timeZone, updatedAt: new Date() })
      .where(and(eq(quests.id, mission.id), eq(quests.userId, userId), isNull(quests.startDate))).returning({ id: quests.id });
    if (updated) repaired += 1;
  }
  return repaired;
}

type FocusCapability = Pick<typeof personalCapabilities.$inferSelect, "id" | "name" | "description">;

function buildSkillBlueprint(profile: Awaited<ReturnType<typeof storage.getUserProfile>>, focusCapability?: FocusCapability): SkillBlueprint {
  const craft = cleanText(profile?.primaryCraft);
  const desiredTrait = cleanText(profile?.desiredTrait);
  const vocation = cleanText(profile?.careerVocation);
  const habit = cleanText(profile?.lockedHabit);
  const primary = shorten(focusCapability?.name || craft || desiredTrait || vocation || "Focused execution", 72);
  const supporting = desiredTrait && desiredTrait.toLocaleLowerCase() !== primary.toLocaleLowerCase()
    ? shorten(desiredTrait, 72)
    : "Deliberate practice";

  return {
    nodes: [
      {
        key: "primary",
        name: primary,
        description: focusCapability?.description || `Your current Thread is centered on building ${primary} through real-world practice.`,
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

function buildStarterMissions(profile: Awaited<ReturnType<typeof storage.getUserProfile>>, context: PlanningContextSnapshot, focusOverride?: string): StarterMission[] {
  const focus = cleanText(focusOverride) || cleanText(profile?.desiredTrait) || cleanText(profile?.primaryCraft) || cleanText(profile?.vision90Day) || "your next 90 days";
  const vision = cleanText(profile?.vision90Day);
  const visionMetric = cleanText(profile?.vision90DayMetric);
  const craft = focusOverride ? "" : cleanText(profile?.primaryCraft);
  const declaredSkill = firstDeclaredItem(profile?.skillsToAcquire);
  const habit = cleanText(profile?.lockedHabit);
  const capacity = (profile?.weeklyCapacity as { hours?: unknown } | null)?.hours;
  const capacityText = typeof capacity === "number" || typeof capacity === "string" ? String(capacity).trim() : "";
  const scopeGuidance = context.capacity.availability === "low"
    ? "Keep it deliberately small enough to complete with your current capacity."
    : context.capacity.availability === "steady"
      ? "Choose a realistic scope that fits your current capacity."
      : "Choose one focused action with a clear finish line.";

  return [
    {
      title: visionMetric ? `Establish the baseline for ${shorten(visionMetric, 52)}` : "Establish the current proof point",
      description: visionMetric
        ? `Record the current starting point for the 90-day measure you chose: ${shorten(visionMetric, 160)}. This creates a factual baseline for ${vision ? shorten(vision, 120) : shorten(focus, 120)}.`
        : vision
          ? `Record the observable evidence you will use to judge progress toward: ${shorten(vision, 160)}`
          : `Record the observable evidence you will use to judge progress in ${shorten(focus)}.`,
      category: "planning",
      experienceReward: 20,
      rationale: visionMetric
        ? "Starts from the 90-day measure the member already declared during onboarding instead of asking them to invent a new target."
        : "Creates a user-owned proof point before execution begins.",
      dayOffset: 0,
      skillContributions: [{ key: "calibration", experienceAmount: 20 }],
    },
    {
      title: craft ? `Advance ${shorten(craft, 52)}` : `Take one focused step in ${shorten(focus, 52)}`,
      description: craft
        ? `Complete one bounded practice block for ${shorten(craft, 120)}${declaredSkill ? `, centered on ${shorten(declaredSkill, 100)}` : ""}. ${scopeGuidance}`
        : `Choose one concrete action that advances ${shorten(focus, 120)}. ${scopeGuidance}`,
      category: craft ? "learning" : "personal",
      experienceReward: 30,
      rationale: declaredSkill
        ? "Uses the declared skill acquisition direction to make the first practice step concrete and editable."
        : "Turns the selected focus into a concrete, editable first action.",
      dayOffset: 1,
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
      dayOffset: 2,
      skillContributions: [{ key: "capacity", experienceAmount: 20 }],
    },
  ];
}

function buildThread(profile: Awaited<ReturnType<typeof storage.getUserProfile>>, planningContext: PlanningContextSnapshot, focusCapability?: FocusCapability) {
  const focus = cleanText(focusCapability?.name) || cleanText(profile?.desiredTrait) || cleanText(profile?.primaryCraft) || cleanText(profile?.vision90Day) || "your next 90 days";
  const vision = cleanText(profile?.vision90Day);
  const title = focusCapability ? `Deepen ${shorten(focus, 56)}` : vision ? `Build toward ${shorten(vision, 56)}` : `Develop ${shorten(focus, 56)}`;
  const primaryValues = Array.isArray(profile?.primaryValues) ? profile.primaryValues.filter((value): value is string => typeof value === "string") : [];
  const sourceSnapshot = {
    focus,
    primaryCraft: cleanText(profile?.primaryCraft) || null,
    desiredTrait: cleanText(profile?.desiredTrait) || null,
    vision90Day: vision || null,
    weeklyCapacity: profile?.weeklyCapacity || {},
    lockedHabit: cleanText(profile?.lockedHabit) || null,
    timeZone: cleanText(profile?.timezone) || null,
    primaryValues,
    planningContext,
    primaryCapabilityId: focusCapability?.id || null,
  };
  const rationale = focusCapability
    ? `This focus returns to a capability already in your private LyfeOS history while keeping this Thread's missions, reviews and completion state distinct.`
    : vision
      ? `This focus begins with your 90-day vision and is bounded by the capacity and rituals you provided during onboarding.`
      : `This focus begins with the direction and capacity you provided during onboarding.`;

  return { title, focus, rationale, sourceSnapshot, starterMissions: buildStarterMissions(profile, planningContext, focusCapability?.name), skillBlueprint: buildSkillBlueprint(profile, focusCapability) };
}

async function getCompletionReadiness(userId: number, thread: typeof transformationThreads.$inferSelect) {
  const [linkedMissions, evidence] = await Promise.all([
    db.select({ id: quests.id, completed: quests.completed, progressionAppliedAt: missionContracts.progressionAppliedAt })
      .from(quests)
      .leftJoin(missionContracts, and(eq(missionContracts.questId, quests.id), eq(missionContracts.userId, quests.userId)))
      .where(and(eq(quests.userId, userId), eq(quests.transformationThreadId, thread.id))),
    db.select({ sourceType: transformationThreadEvidence.sourceType })
      .from(transformationThreadEvidence)
      .where(and(eq(transformationThreadEvidence.userId, userId), eq(transformationThreadEvidence.transformationThreadId, thread.id))),
  ]);
  const reviewCount = evidence.filter((item) => item.sourceType === "weekly_review").length;
  const completedMissionCount = linkedMissions.filter((mission) => mission.completed).length;
  const evidenceBackedMissionCount = linkedMissions.filter((mission) => mission.completed && mission.progressionAppliedAt).length;
  const startedAt = thread.activatedAt || thread.createdAt;
  const activeDays = Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / (1000 * 60 * 60 * 24)));
  const remainingDays = Math.max(0, MIN_COMPLETION_DAYS - activeDays);

  return {
    completedMissionCount,
    evidenceBackedMissionCount,
    requiredMissionCount: 3,
    reviewCount,
    requiredReviewCount: 2,
    activeDays,
    requiredActiveDays: MIN_COMPLETION_DAYS,
    remainingDays,
    ready: evidenceBackedMissionCount >= 3 && reviewCount >= 2 && activeDays >= MIN_COMPLETION_DAYS,
  };
}

export function registerTransformationThreadRoutes(app: Express): void {
  app.get("/api/capabilities", isAuthenticated, async (req: Request, res: Response) => {
    const userId = req.session.userId!;
    try {
      const [capabilities, focusRows] = await Promise.all([
        db.select().from(personalCapabilities)
          .where(eq(personalCapabilities.userId, userId))
          .orderBy(desc(personalCapabilities.experience), personalCapabilities.name),
        db.select({
          id: transformationThreads.id,
          capabilityId: skillNodes.capabilityId,
          title: transformationThreads.title,
          status: transformationThreads.status,
          createdAt: transformationThreads.createdAt,
          completedAt: transformationThreads.completedAt,
        }).from(skillNodes)
          .innerJoin(transformationThreads, and(
            eq(transformationThreads.id, skillNodes.transformationThreadId),
            eq(transformationThreads.userId, userId),
          ))
          .where(and(eq(skillNodes.userId, userId), isNotNull(skillNodes.capabilityId)))
          .orderBy(desc(transformationThreads.createdAt)),
      ]);
      const focusesByCapability = new Map<number, typeof focusRows>();
      for (const focus of focusRows) {
        if (focus.capabilityId === null) continue;
        const existing = focusesByCapability.get(focus.capabilityId) || [];
        if (!existing.some((candidate) => candidate.id === focus.id)) {
          focusesByCapability.set(focus.capabilityId, [...existing, focus]);
        }
      }
      return res.json({
        capabilities: capabilities.map((capability) => {
          const focuses = focusesByCapability.get(capability.id) || [];
          return {
            ...capability,
            focusCount: focuses.length,
            latestFocus: focuses[0] ? {
              threadId: focuses[0].id,
              title: focuses[0].title,
              status: focuses[0].status,
              createdAt: focuses[0].createdAt,
              completedAt: focuses[0].completedAt,
            } : null,
          };
        }),
        note: "Capability totals aggregate LyfeOS-recorded practice across linked Threads. They are not external certification.",
      });
    } catch {
      return res.status(500).json({ error: "Could not load capability map." });
    }
  });

  app.get("/api/capabilities/:id/history", isAuthenticated, async (req: Request, res: Response) => {
    const userId = req.session.userId!;
    const capabilityId = Number(req.params.id);
    if (!Number.isInteger(capabilityId)) return res.status(400).json({ error: "Invalid capability." });
    const [capability] = await db.select().from(personalCapabilities).where(and(
      eq(personalCapabilities.id, capabilityId),
      eq(personalCapabilities.userId, userId),
    )).limit(1);
    if (!capability) return res.status(404).json({ error: "Capability not found." });
    const [focuses, events] = await Promise.all([
      db.select({
        threadId: transformationThreads.id,
        title: transformationThreads.title,
        focus: transformationThreads.focus,
        status: transformationThreads.status,
        activatedAt: transformationThreads.activatedAt,
        completedAt: transformationThreads.completedAt,
        createdAt: transformationThreads.createdAt,
        skillNodeId: skillNodes.id,
        threadExperience: skillNodes.experience,
        threadLevel: skillNodes.level,
      }).from(skillNodes)
        .innerJoin(transformationThreads, and(
          eq(transformationThreads.id, skillNodes.transformationThreadId),
          eq(transformationThreads.userId, userId),
        ))
        .where(and(
          eq(skillNodes.userId, userId),
          eq(skillNodes.capabilityId, capabilityId),
        ))
        .orderBy(desc(transformationThreads.createdAt)),
      db.select({
        id: skillProgressionEvents.id,
        skillNodeId: skillProgressionEvents.skillNodeId,
        questId: skillProgressionEvents.questId,
        transformationThreadId: skillProgressionEvents.transformationThreadId,
        sourceType: skillProgressionEvents.sourceType,
        progressionRevision: skillProgressionEvents.progressionRevision,
        reversalOfId: skillProgressionEvents.reversalOfId,
        experienceDelta: skillProgressionEvents.experienceDelta,
        evidenceSummary: skillProgressionEvents.evidenceSummary,
        createdAt: skillProgressionEvents.createdAt,
      }).from(skillProgressionEvents)
        .innerJoin(skillNodes, and(
          eq(skillNodes.id, skillProgressionEvents.skillNodeId),
          eq(skillNodes.userId, userId),
          eq(skillNodes.capabilityId, capabilityId),
        ))
        .where(eq(skillProgressionEvents.userId, userId))
        .orderBy(desc(skillProgressionEvents.createdAt))
        .limit(100),
    ]);
    const uniqueFocuses = focuses.filter((focus, index, rows) => (
      rows.findIndex((candidate) => candidate.threadId === focus.threadId) === index
    ));
    return res.json({
      capability,
      focuses: uniqueFocuses,
      events,
      disclosure: "Durable capability totals carry across focus periods. Each Thread keeps its own missions, reviews, local XP and completion state; this history is LyfeOS practice evidence, not certification.",
    });
  });

  app.get("/api/transformation-thread", isAuthenticated, async (req: Request, res: Response) => {
    const userId = req.session.userId!;
    try {
      await reconcileThreadContinuation(userId);
    } catch (continuationError) {
      // Planning recovery must not hide the user's existing Thread workspace.
      logger.error("Could not reconcile the next Thread mission", {
        userId,
        error: continuationError instanceof Error ? continuationError.message : "unknown",
      });
    }
    const [thread] = await db
      .select()
      .from(transformationThreads)
      .where(and(eq(transformationThreads.userId, userId), inArray(transformationThreads.status, ["draft", "active", "paused"])))
      .orderBy(desc(transformationThreads.updatedAt))
      .limit(1);
    if (!thread) return res.json({ thread: null });

    const [linkedMissions, evidence, skills, progression, completedSkillMissions, stats, profile, dailyLog] = await Promise.all([
      db.select({ id: quests.id, title: quests.title, completed: quests.completed, difficulty: quests.difficulty, energyCost: quests.energyCost, timeCost: quests.timeCost, attentionCost: quests.attentionCost })
        .from(quests)
        .where(and(eq(quests.userId, userId), eq(quests.transformationThreadId, thread.id))),
      db.select()
        .from(transformationThreadEvidence)
        .where(and(eq(transformationThreadEvidence.userId, userId), eq(transformationThreadEvidence.transformationThreadId, thread.id)))
        .orderBy(desc(transformationThreadEvidence.createdAt))
        .limit(8),
      db.select({
        skill: skillNodes,
        recordedExperience: personalCapabilities.experience,
        recordedLevel: personalCapabilities.level,
        capabilityName: personalCapabilities.name,
      }).from(skillNodes)
        .leftJoin(personalCapabilities, and(
          eq(personalCapabilities.id, skillNodes.capabilityId),
          eq(personalCapabilities.userId, userId),
        ))
        .where(and(eq(skillNodes.userId, userId), eq(skillNodes.transformationThreadId, thread.id))),
      getProgressionSummary(userId),
      db.select({ skillNodeId: questSkillContributions.skillNodeId, questId: questSkillContributions.questId })
        .from(questSkillContributions)
        .innerJoin(quests, eq(questSkillContributions.questId, quests.id))
        .innerJoin(missionContracts, and(eq(missionContracts.questId, quests.id), eq(missionContracts.userId, quests.userId)))
        .where(and(
          eq(questSkillContributions.userId, userId),
          eq(quests.transformationThreadId, thread.id),
          eq(quests.completed, true),
          isNotNull(missionContracts.progressionAppliedAt),
        )),
      storage.getUserStats(userId),
      storage.getUserProfile(userId),
      storage.getUserDailyLogByDate(userId, new Date()),
    ]);
    const skillsWithHistory = skills.map(({ skill, recordedExperience, recordedLevel, capabilityName }) => ({
      ...skill,
      recordedExperience,
      recordedLevel,
      capabilityName,
    }));
    const skillIds = skillsWithHistory.map((skill) => skill.id);
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
    const skillGraph = buildSkillGraph({ skills: skillsWithHistory, completedMissionCountBySkill, reviewCount });
    const recommendedSkill = recommendNextSkill(skillGraph);
    const unfinishedMissions = linkedMissions.filter((mission) => !mission.completed);
    const unfinishedIds = unfinishedMissions.map((mission) => mission.id);
    const [candidateContributions, candidateDeferrals, candidateReviews, candidateEvidence, candidateContracts] = unfinishedIds.length > 0
      ? await Promise.all([
        db.select({ questId: questSkillContributions.questId, skillNodeId: questSkillContributions.skillNodeId, experienceAmount: questSkillContributions.experienceAmount })
          .from(questSkillContributions)
          .where(and(eq(questSkillContributions.userId, userId), inArray(questSkillContributions.questId, unfinishedIds))),
        db.select({ questId: missionDeferrals.questId }).from(missionDeferrals)
          .where(and(eq(missionDeferrals.userId, userId), inArray(missionDeferrals.questId, unfinishedIds))),
        db.select({ questId: missionContracts.questId, decision: missionReviews.decision })
          .from(missionReviews)
          .innerJoin(missionContracts, eq(missionContracts.id, missionReviews.missionContractId))
          .where(and(eq(missionReviews.userId, userId), inArray(missionContracts.questId, unfinishedIds))),
        db.select({ questId: missionContracts.questId })
          .from(missionEvidence)
          .innerJoin(missionContracts, eq(missionContracts.id, missionEvidence.missionContractId))
          .where(and(eq(missionEvidence.userId, userId), inArray(missionContracts.questId, unfinishedIds))),
        db.select({
          questId: missionContracts.questId,
          purpose: missionContracts.purpose,
          expectedOutput: missionContracts.expectedOutput,
          methodSteps: missionContracts.methodSteps,
          toolRequirements: missionContracts.toolRequirements,
          requiredEvidence: missionContracts.requiredEvidence,
          rubricDefinition: missionContracts.rubricDefinition,
          reviewMode: missionContracts.reviewMode,
          escalationPath: missionContracts.escalationPath,
          stopConditions: missionContracts.stopConditions,
        })
          .from(missionContracts)
          .where(and(eq(missionContracts.userId, userId), inArray(missionContracts.questId, unfinishedIds))),
      ])
      : [[], [], [], [], []];
    const groupedCount = <T extends { questId: number }>(rows: T[]) => rows.reduce((map, row) => map.set(row.questId, (map.get(row.questId) || 0) + 1), new Map<number, number>());
    const deferralsByQuest = groupedCount(candidateDeferrals);
    const revisionsByQuest = groupedCount(candidateReviews.filter((review) => review.decision === "revisions_needed"));
    const evidenceByQuest = groupedCount(candidateEvidence);
    const skillsByQuest = candidateContributions.reduce((map, row) => {
      map.set(row.questId, [...(map.get(row.questId) || []), row.skillNodeId]);
      return map;
    }, new Map<number, number[]>());
    const contributionRowsByQuest = candidateContributions.reduce((map, row) => {
      map.set(row.questId, [...(map.get(row.questId) || []), row]);
      return map;
    }, new Map<number, typeof candidateContributions>());
    const skillDetailsById = new Map(skillsWithHistory.map((skill) => [skill.id, skill]));
    const requiredEvidenceByQuest = new Map(candidateContracts.map((contract) => [
      contract.questId,
      Array.isArray(contract.requiredEvidence) ? contract.requiredEvidence.length : 0,
    ]));
    const contractByQuest = new Map(candidateContracts.map((contract) => [contract.questId, {
      purpose: contract.purpose,
      expectedOutput: contract.expectedOutput,
      methodSteps: Array.isArray(contract.methodSteps) ? contract.methodSteps : [],
      toolRequirements: Array.isArray(contract.toolRequirements) ? contract.toolRequirements : [],
      requiredEvidence: Array.isArray(contract.requiredEvidence) ? contract.requiredEvidence : [],
      rubricDefinition: Array.isArray(contract.rubricDefinition) ? contract.rubricDefinition : [],
      reviewMode: contract.reviewMode,
      escalationPath: contract.escalationPath,
      stopConditions: Array.isArray(contract.stopConditions) ? contract.stopConditions : [],
      unlockResult: buildMissionUnlockResult((contributionRowsByQuest.get(contract.questId) || []).flatMap((contribution) => {
        const skill = skillDetailsById.get(contribution.skillNodeId);
        return skill ? [{
          skillNodeId: skill.id,
          skillName: skill.name,
          experienceAmount: contribution.experienceAmount,
          capabilityId: skill.capabilityId,
          capabilityName: skill.capabilityName,
        }] : [];
      })),
    }]));
    const candidates: PracticeMissionCandidate[] = unfinishedMissions.map((mission) => ({
      ...mission,
      skillNodeIds: skillsByQuest.get(mission.id) || [],
      deferralCount: deferralsByQuest.get(mission.id) || 0,
      revisionCount: revisionsByQuest.get(mission.id) || 0,
      evidenceCount: evidenceByQuest.get(mission.id) || 0,
    }));
    const currentPlanningContext = buildPlanningContextSnapshot({ profile, stats, dailyLog });
    const skillCandidates = recommendedSkill ? candidates.filter((mission) => mission.skillNodeIds.includes(recommendedSkill.id)) : [];
    const difficultyCalibration = recommendedSkill ? calibrateMissionDifficulty({
      classifiedDifficulty: "S",
      explicitlySelected: false,
      reviewedExperience: recommendedSkill.experience,
      reviewedMissions: recommendedSkill.completedMissionCount,
      revisionReviews: skillCandidates.reduce((total, mission) => total + mission.revisionCount, 0),
      deferrals: skillCandidates.reduce((total, mission) => total + mission.deferralCount, 0),
      context: currentPlanningContext,
    }) : null;
    const availableResources = {
      energy: stats?.energyPointsCurrent,
      time: stats?.timeTokensCurrent,
      attention: stats?.attentionTokensCurrent,
    };
    const recommendedMission = recommendedSkill && difficultyCalibration
      ? selectNextPracticeMission({
        skillNodeId: recommendedSkill.id,
        recommendedDifficulty: difficultyCalibration.recommendedDifficulty,
        candidates,
        available: availableResources,
      })
      : null;
    const recommendationFitsCapacity = recommendedMission ? missionFitsResources(recommendedMission, availableResources) : true;
    const supportPlan = recommendedMission ? buildMissionSupportPlan({
      fitsCurrentCapacity: recommendationFitsCapacity,
      deferralCount: recommendedMission.deferralCount,
      revisionCount: recommendedMission.revisionCount,
      evidenceRequired: requiredEvidenceByQuest.get(recommendedMission.id) || 0,
      evidenceRecorded: recommendedMission.evidenceCount,
    }) : null;
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
        skills: skillsWithHistory,
        skillEdges: edges,
        skillGraph: {
          nodes: skillGraph,
          reviewCount,
          nextPractice: recommendedSkill ? {
            skillNodeId: recommendedSkill.id,
            skillName: recommendedSkill.name,
            questId: recommendedMission?.id || null,
            deferralCount: recommendedMission?.deferralCount || 0,
            revisionCount: recommendedMission?.revisionCount || 0,
            title: recommendedMission?.title || `Practice ${recommendedSkill.name}`,
            description: recommendedMission
              ? `${recommendationFitsCapacity ? "This mission fits your currently available capacity." : "This is the next linked mission, but its listed cost exceeds your currently available capacity—defer, reduce, or revise it before beginning."} Complete it, then record what you observed.`
              : `LyfeOS will prepare the next bounded, evidence-backed practice step after the current Thread work has been completed and positively reviewed.`,
            fitsCurrentCapacity: recommendationFitsCapacity,
            planningContext: currentPlanningContext,
            difficultyCalibration,
            supportPlan,
            contract: recommendedMission ? contractByQuest.get(recommendedMission.id) || null : null,
            advancement: {
              currentStatus: recommendedSkill.status,
              unmetRequirements: recommendedSkill.unmetRequirements,
              completedMissionCount: recommendedSkill.completedMissionCount,
              requiredMissionCount: recommendedSkill.masteryRequirements.minCompletedMissions,
              reviewCount,
              requiredReviewCount: recommendedSkill.masteryRequirements.minReviews,
              reviewedExperience: recommendedSkill.experience,
              requiredExperience: recommendedSkill.masteryRequirements.minExperience,
              disclosure: "Advancement reflects reviewed LyfeOS practice evidence. It is not certification, authority, or a measure of personal worth.",
            },
            selectionBasis: recommendedMission
              ? "This mission is explicitly linked to the recommended capability and is the closest available fit to the evidence-calibrated scope."
              : "No compatible open Thread mission is available yet. LyfeOS does not create a new step from a checkmark alone; it waits for the current Thread work and its evidence reviews to be complete.",
          } : null,
        },
        progression,
      },
    });
  });

  app.post("/api/transformation-thread/initialize", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const parsed = z.object({ primaryCapabilityId: z.number().int().positive().optional() }).strict().safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ error: "Choose a valid capability focus." });
      const userId = req.session.userId!;
      const [profile, stats, dailyLog] = await Promise.all([
        storage.getUserProfile(userId),
        storage.getUserStats(userId),
        storage.getUserDailyLogByDate(userId, new Date()),
      ]);
      const completed = new Set(profile?.completedOnboardingMissions || []);
      const missing = REQUIRED_ONBOARDING_MISSIONS.filter((id) => !completed.has(id));
      if (missing.length > 0) {
        return res.status(409).json({ error: "Complete the onboarding missions before initializing your system.", missing });
      }

      const [focusCapability] = parsed.data.primaryCapabilityId
        ? await db.select({
          id: personalCapabilities.id,
          name: personalCapabilities.name,
          description: personalCapabilities.description,
        }).from(personalCapabilities).where(and(
          eq(personalCapabilities.id, parsed.data.primaryCapabilityId),
          eq(personalCapabilities.userId, userId),
        )).limit(1)
        : [];
      if (parsed.data.primaryCapabilityId && !focusCapability) return res.status(404).json({ error: "Capability focus not found." });

      const planningContext = buildPlanningContextSnapshot({ profile, stats, dailyLog });
      const draft = buildThread(profile, planningContext, focusCapability);
      const { skillBlueprint, ...threadDraft } = draft;
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(120103, ${userId})`);
        const [existing] = await tx.select().from(transformationThreads)
          .where(and(eq(transformationThreads.userId, userId), inArray(transformationThreads.status, ["draft", "active", "paused"])))
          .orderBy(desc(transformationThreads.updatedAt))
          .limit(1);
        if (existing) return { thread: existing, existing: true };
        const [createdThread] = await tx.insert(transformationThreads).values({
          userId,
          primaryCapabilityId: focusCapability?.id || null,
          ...threadDraft,
        }).returning();
        const createdSkills = [];
        for (const skill of skillBlueprint.nodes) {
          const capability = skill.key === "primary" && focusCapability
            ? focusCapability
            : await ensurePersonalCapability(tx, {
              userId,
              name: skill.name,
              description: skill.description,
            });
          const [createdSkill] = await tx.insert(skillNodes).values({
            userId,
            transformationThreadId: createdThread.id,
            capabilityId: capability.id,
            ...skill,
          }).returning();
          createdSkills.push(createdSkill);
        }
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
        const primaryCapabilityId = createdSkills.find((skill) => skill.key === "primary")?.capabilityId || null;
        const [focusedThread] = await tx.update(transformationThreads)
          .set({ primaryCapabilityId, updatedAt: new Date() })
          .where(and(eq(transformationThreads.id, createdThread.id), eq(transformationThreads.userId, userId)))
          .returning();
        return { thread: focusedThread, existing: false };
      });
      return res.status(result.existing ? 200 : 201).json(result);
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
        const capability = await ensurePersonalCapability(tx, {
          userId,
          name: parsed.data.name,
          description: parsed.data.description || `A user-defined branch connected to ${primary.name}.`,
        });
        const [node] = await tx.insert(skillNodes).values({
          userId,
          transformationThreadId: threadId,
          capabilityId: capability.id,
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

  // Skill edges are user-authored explanations of spillover. They do not
  // silently grant XP, unlock authority, or alter proof requirements.
  app.post("/api/transformation-thread/:id/skill-edges", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = z.object({
      sourceSkillId: z.number().int().positive(),
      targetSkillId: z.number().int().positive(),
      relationship: z.enum(["reinforces", "supports", "requires", "unlocks", "clarifies", "sustains"]),
      influenceWeight: z.number().int().min(1).max(3).default(1),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Choose two skills and a valid relationship." });
    if (parsed.data.sourceSkillId === parsed.data.targetSkillId) {
      return res.status(400).json({ error: "A skill cannot be connected to itself." });
    }
    const userId = req.session.userId!;
    const threadId = Number(req.params.id);
    if (!Number.isInteger(threadId)) return res.status(400).json({ error: "Invalid transformation thread." });
    try {
      const [thread] = await db.select({ id: transformationThreads.id })
        .from(transformationThreads)
        .where(and(
          eq(transformationThreads.id, threadId),
          eq(transformationThreads.userId, userId),
          eq(transformationThreads.status, "active"),
        ))
        .limit(1);
      if (!thread) return res.status(409).json({ error: "Skill relationships can only be added to an active Thread." });
      const ownedSkills = await db.select({ id: skillNodes.id })
        .from(skillNodes)
        .where(and(eq(skillNodes.userId, userId), eq(skillNodes.transformationThreadId, threadId)));
      const ownedIds = new Set(ownedSkills.map((skill) => skill.id));
      if (!ownedIds.has(parsed.data.sourceSkillId) || !ownedIds.has(parsed.data.targetSkillId)) {
        return res.status(403).json({ error: "Both skills must belong to this Thread." });
      }
      await db.insert(skillEdges).values({
        userId,
        sourceSkillId: parsed.data.sourceSkillId,
        targetSkillId: parsed.data.targetSkillId,
        relationship: parsed.data.relationship,
        influenceWeight: parsed.data.influenceWeight,
      }).onConflictDoUpdate({
        target: [skillEdges.sourceSkillId, skillEdges.targetSkillId, skillEdges.relationship],
        set: { influenceWeight: parsed.data.influenceWeight },
      });
      return res.status(201).json({ success: true });
    } catch {
      return res.status(500).json({ error: "Could not connect these skills." });
    }
  });

  app.delete("/api/transformation-thread/:id/skill-edges/:edgeId", isAuthenticated, async (req: Request, res: Response) => {
    const userId = req.session.userId!;
    const threadId = Number(req.params.id);
    const edgeId = Number(req.params.edgeId);
    if (!Number.isInteger(threadId) || !Number.isInteger(edgeId)) {
      return res.status(400).json({ error: "Invalid skill relationship." });
    }
    const [edge] = await db.select({ id: skillEdges.id })
      .from(skillEdges)
      .innerJoin(skillNodes, eq(skillEdges.sourceSkillId, skillNodes.id))
      .innerJoin(transformationThreads, eq(skillNodes.transformationThreadId, transformationThreads.id))
      .where(and(
        eq(skillEdges.id, edgeId),
        eq(skillEdges.userId, userId),
        eq(skillNodes.transformationThreadId, threadId),
        eq(transformationThreads.status, "active"),
      ))
      .limit(1);
    if (!edge) return res.status(404).json({ error: "Active Thread skill relationship not found." });
    await db.delete(skillEdges).where(and(eq(skillEdges.id, edgeId), eq(skillEdges.userId, userId)));
    return res.status(204).send();
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
      const sourceSnapshot = thread.sourceSnapshot && typeof thread.sourceSnapshot === "object" ? thread.sourceSnapshot as { timeZone?: unknown } : {};
      const preparedStarterMissions = await Promise.all(starterMissions.map((mission, index) => prepareMissionCreation({
        ...(() => {
          const dayOffset = mission.dayOffset === 0 || mission.dayOffset === 1 || mission.dayOffset === 2 ? mission.dayOffset : Math.min(index, 2);
          const scheduledDate = localCalendarDate(sourceSnapshot.timeZone, dayOffset);
          return { startDate: scheduledDate, endDate: scheduledDate, dueDate: scheduledDate, timezone: cleanText(sourceSnapshot.timeZone) || null };
        })(),
        userId,
        title: mission.title,
        description: mission.description,
        category: mission.category,
        experienceReward: mission.experienceReward,
        transformationThreadId: thread.id,
        sortOrder: index,
        linkedItems: [{ type: "transformation-thread", id: thread.id, rationale: mission.rationale }],
      }, { source: "system" })));
      const createdMissions = await db.transaction(async (tx) => {
        const inserted = preparedStarterMissions.length > 0
          ? await tx.insert(quests).values(preparedStarterMissions).returning()
          : [];
        if (inserted.length > 0) {
          await tx.insert(userActivityEvents).values(inserted.map((quest) => ({
            userId,
            eventType: "mission_created",
            metadata: { questId: quest.id, title: quest.title, source: "system" },
          })));
        }
        const contributions = inserted.flatMap((quest, index) => (starterMissions[index]?.skillContributions || [])
          .map((contribution) => ({
            userId,
            questId: quest.id,
            skillNodeId: skillIdsByKey.get(contribution.key),
            experienceAmount: contribution.experienceAmount,
          }))
          .filter((contribution): contribution is { userId: number; questId: number; skillNodeId: number; experienceAmount: number } => Boolean(contribution.skillNodeId)));
        if (contributions.length > 0) await tx.insert(questSkillContributions).values(contributions);
        if (inserted.length > 0) {
          await tx.insert(missionContracts).values(inserted.map((quest, index) => ({
            userId,
            questId: quest.id,
            purpose: starterMissions[index]?.rationale || `Practice within ${thread.title}.`,
            expectedOutput: starterMissions[index]?.description || `Record what happened while completing ${quest.title}.`,
            methodSteps: [
              "Complete one bounded real-world attempt of the mission.",
              "Record what happened and attach the declared observation or artifact.",
              "Review the result against the proof plan before claiming capability progress.",
            ],
            toolRequirements: [],
            capabilityTargets: (starterMissions[index]?.skillContributions || []).map((contribution) => contribution.key),
            prerequisites: [],
            requiredEvidence: ["A short observation or artifact showing what happened."],
            rubricDefinition: [{ id: "criterion-1", requirement: "A short observation or artifact showing what happened.", guidance: "Compare the submitted observation or artifact with the starter mission's expected output.", weight: 1, required: true }],
            rubricVersion: 1,
            acceptanceContextSnapshot: quest.planningContextSnapshot,
            reviewMode: "self",
            riskLevel: "low",
            stopConditions: [],
            state: "accepted",
          })));
        }
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
        error: `This focus needs sustained evidence before completion: ${readiness.evidenceBackedMissionCount}/${readiness.requiredMissionCount} reviewed linked missions, ${readiness.reviewCount}/${readiness.requiredReviewCount} reviews, and ${readiness.remainingDays} more active days.`,
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
