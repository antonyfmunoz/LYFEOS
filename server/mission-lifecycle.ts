import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { logger } from "./utils";
import { missionContracts, missionDeferrals, missionDependencies, personalCapabilities, questSkillContributions, quests, skillNodes, skillProgressionEvents, type Quest } from "@shared/schema";
import { recordTransformationThreadEvidence } from "./transformation-thread-evidence";
import { refreshProgressionState } from "./progression";
import { queueLinkedWorkItemState } from "./cross-product";
import { sendPushToUser } from "./notificationScheduler";
import { calculateMissionCosts } from "./routes/middleware";
import { classifyMission } from "./utils";
import type { InsertQuest } from "@shared/schema";
import { capabilityLevelForExperience } from "./capabilities";

/** The sole completion/reopening path for a LyfeOS mission. */
export type MissionLifecycleSource = "ui" | "ai" | "onboarding" | "umh" | "system";

export class MissionLifecycleError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** Creates a normal LyfeOS mission with the same classification, capacity
 * costing, and activity provenance regardless of whether it came from the UI
 * or the assistant. Federation creation stays transactional with its inbound
 * command receipt and has a dedicated adapter. */
export async function prepareMissionCreation(questInput: InsertQuest): Promise<InsertQuest> {
  const { attentionCost, timeCost, energyCost } = calculateMissionCosts(
    questInput.startDate || null,
    questInput.startTime || null,
    questInput.endDate || null,
    questInput.endTime || null,
  );
  const classification = await classifyMission(
    questInput.title || "",
    questInput.description,
    { category: questInput.category || "general", difficulty: questInput.difficulty || "D" },
  );
  return {
    ...questInput,
    completed: false,
    completedAt: null,
    category: classification.category,
    difficulty: classification.difficulty,
    attentionCost,
    timeCost,
    energyCost,
  };
}

async function dispatchMissionAutomations(input: {
  userId: number;
  triggerType: "mission_created" | "mission_completed";
  quest: Quest;
  idempotencyReference: string;
}) {
  try {
    const { runMissionAutomations } = await import("./automation-engine");
    await runMissionAutomations(input);
  } catch (error) {
    // A user's canonical mission mutation must remain successful even if a
    // secondary automation cannot run. The automation engine records action
    // failures when a run was claimed; infrastructure failures stay logged.
    logger.error("Could not dispatch mission automations", {
      questId: input.quest.id,
      triggerType: input.triggerType,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

export async function createMissionLifecycle(input: InsertQuest & { source: MissionLifecycleSource; suppressAutomations?: boolean }) {
  const { source, suppressAutomations = false, ...questInput } = input;
  const shouldComplete = questInput.completed === true;
  const quest = await storage.createQuest(await prepareMissionCreation(questInput));
  storage.logActivityEvent(quest.userId, "mission_created", { questId: quest.id, title: quest.title, source }).catch(() => {});
  if (!suppressAutomations) {
    await dispatchMissionAutomations({ userId: quest.userId, triggerType: "mission_created", quest, idempotencyReference: String(quest.id) });
  }
  if (!shouldComplete) return (await storage.getQuest(quest.id)) || quest;
  if (suppressAutomations) return (await toggleMissionLifecycle({ questId: quest.id, userId: quest.userId, source, suppressAutomations: true })).quest;
  return (await toggleMissionLifecycle({ questId: quest.id, userId: quest.userId, source })).quest;
}

/** Keeps editing behavior consistent across the mission UI and assistant tools. */
export async function updateMissionLifecycle(input: {
  questId: number;
  userId: number;
  updates: Partial<InsertQuest>;
  source: MissionLifecycleSource;
}) {
  const quest = await storage.getQuest(input.questId);
  if (!quest) throw new MissionLifecycleError(404, "Mission not found.");
  if (quest.userId !== input.userId) throw new MissionLifecycleError(403, "Not authorized to update this mission.");

  const updates = { ...input.updates } as Partial<InsertQuest>;
  for (const field of ["startDate", "startTime", "endDate", "endTime"] as const) {
    if (updates[field] === "") (updates as Record<string, unknown>)[field] = null;
  }
  const { attentionCost, timeCost, energyCost } = calculateMissionCosts(
    updates.startDate ?? quest.startDate ?? null,
    updates.startTime ?? quest.startTime ?? null,
    updates.endDate ?? quest.endDate ?? null,
    updates.endTime ?? quest.endTime ?? null,
  );
  const titleChanged = updates.title !== undefined && updates.title !== quest.title;
  const descriptionChanged = updates.description !== undefined && updates.description !== quest.description;
  let category = updates.category;
  let difficulty = updates.difficulty;
  if (titleChanged || descriptionChanged) {
    const classification = await classifyMission(
      updates.title ?? quest.title,
      updates.description ?? quest.description,
      { category: updates.category ?? quest.category ?? "general", difficulty: updates.difficulty ?? quest.difficulty ?? "D" },
    );
    category = classification.category;
    difficulty = classification.difficulty;
  }
  const updatedQuest = await storage.updateQuest(quest.id, {
    ...updates,
    ...(category ? { category } : {}),
    ...(difficulty ? { difficulty } : {}),
    attentionCost,
    timeCost,
    energyCost,
  });
  storage.logActivityEvent(quest.userId, "mission_updated", { questId: quest.id, source: input.source }).catch(() => {});
  return updatedQuest;
}

/** Reschedules an incomplete mission while retaining an append-only, user-owned
 * explanation of that capacity decision. This is a lifecycle transition, not
 * a failure state, so it must update the mission and its audit record together. */
export async function deferMissionLifecycle(input: {
  questId: number;
  userId: number;
  deferredToDate: string;
  reason?: string | null;
}) {
  const [quest] = await db.select().from(quests)
    .where(and(eq(quests.id, input.questId), eq(quests.userId, input.userId)))
    .limit(1);
  if (!quest) throw new MissionLifecycleError(404, "Mission not found.");
  if (quest.completed) throw new MissionLifecycleError(409, "Completed missions cannot be deferred.");
  const updatedQuest = await db.transaction(async (tx) => {
    const [updated] = await tx.update(quests)
      .set({ dueDate: input.deferredToDate, updatedAt: new Date() })
      .where(and(eq(quests.id, input.questId), eq(quests.userId, input.userId), eq(quests.completed, false)))
      .returning();
    if (!updated) throw new MissionLifecycleError(409, "This mission is no longer available to defer.");
    await tx.insert(missionDeferrals).values({
      userId: input.userId,
      questId: input.questId,
      previousDueDate: quest.dueDate || null,
      deferredToDate: input.deferredToDate,
      reason: input.reason || null,
    });
    return updated;
  });
  storage.logActivityEvent(input.userId, "mission_deferred", {
    questId: input.questId,
    previousDueDate: quest.dueDate || null,
    deferredToDate: input.deferredToDate,
  }).catch(() => {});
  return updatedQuest;
}

function skillLevelForExperience(experience: number): number {
  let level = 1;
  let remaining = Math.max(0, experience);
  let threshold = 100;
  while (remaining >= threshold) {
    remaining -= threshold;
    level += 1;
    threshold = Math.floor(threshold * 1.35);
  }
  return level;
}

async function applyQuestSkillProgression(input: {
  quest: Quest;
  direction: 1 | -1;
  sourceType: "mission_evidence_review" | "mission_evidence_reversal";
  evidenceSummary: string;
}): Promise<number> {
  const { quest, direction, sourceType, evidenceSummary } = input;
  const contributions = await db.select({
    skillNodeId: questSkillContributions.skillNodeId,
    experienceAmount: questSkillContributions.experienceAmount,
    currentExperience: skillNodes.experience,
    capabilityId: skillNodes.capabilityId,
    capabilityExperience: personalCapabilities.experience,
  })
    .from(questSkillContributions)
    .innerJoin(skillNodes, eq(skillNodes.id, questSkillContributions.skillNodeId))
    .leftJoin(personalCapabilities, eq(personalCapabilities.id, skillNodes.capabilityId))
    .where(and(
      eq(questSkillContributions.questId, quest.id),
      eq(questSkillContributions.userId, quest.userId),
      eq(skillNodes.userId, quest.userId),
    ));

  if (contributions.length === 0) return 0;
  await db.transaction(async (tx) => {
    const capabilityDeltas = new Map<number, { currentExperience: number; delta: number }>();
    for (const contribution of contributions) {
      const delta = contribution.experienceAmount * direction;
      const nextExperience = Math.max(0, contribution.currentExperience + delta);
      await tx.update(skillNodes)
        .set({ experience: nextExperience, level: skillLevelForExperience(nextExperience), updatedAt: new Date() })
        .where(and(eq(skillNodes.id, contribution.skillNodeId), eq(skillNodes.userId, quest.userId)));
      await tx.insert(skillProgressionEvents).values({
        userId: quest.userId,
        skillNodeId: contribution.skillNodeId,
        questId: quest.id,
        transformationThreadId: quest.transformationThreadId || null,
        sourceType,
        experienceDelta: delta,
        evidenceSummary,
      });
      if (contribution.capabilityId !== null && contribution.capabilityExperience !== null) {
        const existing = capabilityDeltas.get(contribution.capabilityId);
        capabilityDeltas.set(contribution.capabilityId, {
          currentExperience: existing?.currentExperience ?? contribution.capabilityExperience,
          delta: (existing?.delta ?? 0) + delta,
        });
      }
    }
    for (const [capabilityId, update] of Array.from(capabilityDeltas.entries())) {
      const nextExperience = Math.max(0, update.currentExperience + update.delta);
      await tx.update(personalCapabilities)
        .set({ experience: nextExperience, level: capabilityLevelForExperience(nextExperience), updatedAt: new Date() })
        .where(and(eq(personalCapabilities.id, capabilityId), eq(personalCapabilities.userId, quest.userId)));
    }
  });
  return contributions.reduce((total, contribution) => total + contribution.experienceAmount, 0);
}

/**
 * Applies capability progress exactly once, only after a completed mission's
 * declared evidence has been positively reviewed. Activity XP is intentionally
 * separate: a checkmark is real activity, not proof of competence.
 */
export async function applyReviewedMissionProgression(input: { questId: number; userId: number; reviewSummary: string }) {
  const [quest] = await db.select().from(quests)
    .where(and(eq(quests.id, input.questId), eq(quests.userId, input.userId)))
    .limit(1);
  if (!quest?.completed) return { skillExperienceAwarded: 0, applied: false };

  let claimed = false;
  await db.transaction(async (tx) => {
    const [contract] = await tx.update(missionContracts)
      .set({ progressionAppliedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(missionContracts.questId, input.questId),
        eq(missionContracts.userId, input.userId),
        eq(missionContracts.state, "reviewed"),
        isNull(missionContracts.progressionAppliedAt),
      ))
      .returning({ id: missionContracts.id });
    claimed = Boolean(contract);
  });
  if (!claimed) return { skillExperienceAwarded: 0, applied: false };

  try {
    const skillExperienceAwarded = await applyQuestSkillProgression({
      quest,
      direction: 1,
      sourceType: "mission_evidence_review",
      evidenceSummary: `Evidence review confirmed: ${input.reviewSummary}`,
    });
    if (quest.transformationThreadId) {
      await recordTransformationThreadEvidence({
        userId: quest.userId,
        transformationThreadId: quest.transformationThreadId,
        sourceType: "mission_evidence_review",
        sourceId: String(quest.id),
        summary: `Evidence review confirmed mission: ${quest.title}`,
      });
    }
    const progression = await refreshProgressionState(quest.userId, `mission:${quest.id}:evidence-reviewed`);
    return { skillExperienceAwarded, applied: true, progression };
  } catch (error) {
    await db.update(missionContracts)
      .set({ progressionAppliedAt: null, updatedAt: new Date() })
      .where(and(eq(missionContracts.questId, input.questId), eq(missionContracts.userId, input.userId)))
      .catch(() => {});
    throw error;
  }
}

/** Reverses previously credited capability experience when the supporting mission is reopened or its review is withdrawn. */
export async function revokeReviewedMissionProgression(input: { questId: number; userId: number; reason: string }) {
  const [quest] = await db.select().from(quests)
    .where(and(eq(quests.id, input.questId), eq(quests.userId, input.userId)))
    .limit(1);
  if (!quest) return { skillExperienceAwarded: 0, revoked: false };
  const [contract] = await db.update(missionContracts)
    .set({ progressionAppliedAt: null, updatedAt: new Date() })
    .where(and(
      eq(missionContracts.questId, input.questId),
      eq(missionContracts.userId, input.userId),
      isNotNull(missionContracts.progressionAppliedAt),
    ))
    .returning({ id: missionContracts.id });
  if (!contract) return { skillExperienceAwarded: 0, revoked: false };

  const skillExperienceAwarded = await applyQuestSkillProgression({
    quest,
    direction: -1,
    sourceType: "mission_evidence_reversal",
    evidenceSummary: input.reason,
  });
  const progression = await refreshProgressionState(quest.userId, `mission:${quest.id}:evidence-reversed`);
  return { skillExperienceAwarded, revoked: true, progression };
}

function missionXp(quest: Quest): number {
  const multiplier = ({ D: 1, C: 1.5, B: 2, A: 3, S: 5 }[quest.difficulty || "D"] || 1);
  return Math.floor(quest.experienceReward * multiplier);
}

export async function toggleMissionLifecycle(input: { questId: number; userId: number; source: MissionLifecycleSource; suppressAutomations?: boolean }) {
  const quest = await storage.getQuest(input.questId);
  if (!quest) throw new MissionLifecycleError(404, "Mission not found.");
  if (quest.userId !== input.userId) throw new MissionLifecycleError(403, "Not authorized to change this mission.");
  if (!quest.completed) {
    const incompletePrerequisites = await db.select({ title: quests.title })
      .from(missionDependencies)
      .innerJoin(quests, eq(quests.id, missionDependencies.prerequisiteQuestId))
      .where(and(
        eq(missionDependencies.userId, input.userId),
        eq(missionDependencies.dependentQuestId, quest.id),
        eq(quests.userId, input.userId),
        eq(quests.completed, false),
      ));
    if (incompletePrerequisites.length) {
      throw new MissionLifecycleError(409, `Complete prerequisite mission${incompletePrerequisites.length === 1 ? "" : "s"} first: ${incompletePrerequisites.map((item) => item.title).join(", ")}.`);
    }
  }

  const preToggleStats = await storage.getUserStats(quest.userId);
  const previousLevel = preToggleStats?.level || 1;
  const { quest: updatedQuest, statsUpdated } = await storage.toggleQuestCompletion(quest.id);
  const xpData = await storage.recalculateXP(quest.userId);
  const userStats = await storage.getUserStats(quest.userId);
  const levelUp = updatedQuest.completed && xpData.level > previousLevel;

  if (updatedQuest.completed) {
    sendPushToUser(quest.userId, {
      title: levelUp ? "Level Up!" : "Mission Complete!",
      body: levelUp ? `${quest.title} completed! +${missionXp(quest)} XP - You leveled up!` : `${quest.title} completed! +${missionXp(quest)} XP`,
      tag: `quest-complete-${quest.id}`,
      url: "/missions",
    }).catch(() => {});
    storage.logActivityEvent(quest.userId, "mission_complete", { questId: quest.id, title: quest.title, source: input.source }).catch(() => {});
    if (quest.transformationThreadId) {
      await recordTransformationThreadEvidence({
        userId: quest.userId,
        transformationThreadId: quest.transformationThreadId,
        sourceType: "mission_activity",
        sourceId: String(quest.id),
        summary: `Completed mission: ${quest.title}`,
      }).catch((error) => logger.error("Could not record Thread evidence for mission lifecycle:", error));
    }
    await db.update(missionContracts)
      .set({ state: "awaiting_review", updatedAt: new Date() })
      .where(and(eq(missionContracts.questId, quest.id), eq(missionContracts.userId, quest.userId)))
      .catch((error) => logger.error("Could not mark mission contract ready for review:", error));
  } else {
    try {
      await revokeReviewedMissionProgression({
        questId: quest.id,
        userId: quest.userId,
        reason: `Mission reopened: ${quest.title}`,
      });
    } catch (error) {
      logger.error("Could not reverse evidence-backed skill progression for reopened mission:", error);
    }
    await db.update(missionContracts)
      .set({ state: "accepted", updatedAt: new Date() })
      .where(and(eq(missionContracts.questId, quest.id), eq(missionContracts.userId, quest.userId), eq(missionContracts.state, "awaiting_review")))
      .catch((error) => logger.error("Could not restore mission contract after reopening:", error));
  }

  let progression;
  try {
    progression = await refreshProgressionState(quest.userId, `mission:${quest.id}:${updatedQuest.completed ? "completed" : "reopened"}:${input.source}`);
  } catch (error) {
    logger.error("Could not refresh progression for mission lifecycle:", error);
  }
  let crossProductWorkUpdates = 0;
  try {
    crossProductWorkUpdates = await queueLinkedWorkItemState(quest.userId, quest.id);
  } catch (error) {
    logger.error("Could not queue cross-product work item update for mission lifecycle:", error);
  }

  if (updatedQuest.completed && !input.suppressAutomations) {
    const completedAt = updatedQuest.completedAt instanceof Date ? updatedQuest.completedAt.toISOString() : String(updatedQuest.completedAt || Date.now());
    await dispatchMissionAutomations({
      userId: quest.userId,
      triggerType: "mission_completed",
      quest: updatedQuest,
      idempotencyReference: `${quest.id}:${completedAt}`,
    });
  }

  const finalQuest = (await storage.getQuest(updatedQuest.id)) || updatedQuest;

  return {
    quest: finalQuest,
    xpAwarded: updatedQuest.completed ? missionXp(quest) : 0,
    skillExperienceAwarded: 0,
    progression,
    crossProductWorkUpdates,
    levelUp,
    statsUpdated,
    stats: userStats ? {
      timeTokens: { current: userStats.timeTokensCurrent, max: userStats.timeTokensMax },
      attentionTokens: { current: userStats.attentionTokensCurrent, max: userStats.attentionTokensMax },
      energyPoints: { current: userStats.energyPointsCurrent, max: userStats.energyPointsMax },
      experience: { current: xpData.experienceCurrent, max: xpData.experienceMax, level: xpData.level, totalXP: xpData.totalXP, showLevelUp: levelUp },
    } : undefined,
  };
}
