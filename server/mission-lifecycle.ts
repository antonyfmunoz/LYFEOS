import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { logger } from "./utils";
import { kanbanBoards, missionContracts, missionDeferrals, missionDependencies, missionReviews, personalCapabilities, projectEvents, questSkillContributions, quests, skillNodes, skillProgressionEvents, type Quest } from "@shared/schema";
import { recordTransformationThreadEvidence } from "./transformation-thread-evidence";
import { refreshProgressionState } from "./progression";
import { queueLinkedWorkItemState } from "./cross-product";
import { sendPushToUser } from "./notificationScheduler";
import { calculateMissionCosts } from "./routes/middleware";
import { classifyMission } from "./utils";
import type { InsertQuest } from "@shared/schema";
import { capabilityLevelForExperience } from "./capabilities";
import { buildPlanningContextSnapshot } from "./context-snapshot";
import { calibrateMissionDifficulty } from "./transformation-intelligence";

/** The sole completion/reopening path for a LyfeOS mission. */
export type MissionLifecycleSource = "ui" | "ai" | "onboarding" | "umh" | "system";

export class MissionLifecycleError extends Error {
  constructor(readonly status: number, message: string, readonly currentQuest?: Quest) {
    super(message);
  }
}

type InternalMissionCreation = InsertQuest & {
  lifecycleKey?: string | null;
  lifecyclePayloadHash?: string | null;
};

/** Creates a normal LyfeOS mission with the same classification, capacity
 * costing, and activity provenance regardless of whether it came from the UI
 * or the assistant. Federation creation stays transactional with its inbound
 * command receipt and has a dedicated adapter. */
export async function prepareMissionCreation(
  questInput: InternalMissionCreation,
  options: { source?: MissionLifecycleSource } = {},
): Promise<typeof quests.$inferInsert> {
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
  const [profile, stats, dailyLog] = await Promise.all([
    storage.getUserProfile(questInput.userId),
    storage.getUserStats(questInput.userId),
    storage.getUserDailyLogByDate(questInput.userId, new Date()),
  ]);
  const planningContextSnapshot = buildPlanningContextSnapshot({ profile, stats, dailyLog });
  let reviewedExperience = 0;
  let reviewedMissions = 0;
  let revisionReviews = 0;
  if (questInput.transformationThreadId) {
    const threadSkills = await db.select({
      id: skillNodes.id,
      kind: skillNodes.kind,
      capabilityId: skillNodes.capabilityId,
      capabilityExperience: personalCapabilities.experience,
    }).from(skillNodes)
      .leftJoin(personalCapabilities, and(
        eq(personalCapabilities.id, skillNodes.capabilityId),
        eq(personalCapabilities.userId, questInput.userId),
      ))
      .where(and(
        eq(skillNodes.userId, questInput.userId),
        eq(skillNodes.transformationThreadId, questInput.transformationThreadId),
      ));
    const focusSkill = threadSkills.find((skill) => skill.kind === "primary") || threadSkills[0];
    reviewedExperience = focusSkill?.capabilityExperience || 0;
    if (focusSkill?.capabilityId) {
      const [progressionEvents, revisions] = await Promise.all([
        db.select({ questId: skillProgressionEvents.questId, delta: skillProgressionEvents.experienceDelta })
          .from(skillProgressionEvents)
          .innerJoin(skillNodes, eq(skillNodes.id, skillProgressionEvents.skillNodeId))
          .where(and(
            eq(skillProgressionEvents.userId, questInput.userId),
            eq(skillNodes.capabilityId, focusSkill.capabilityId),
          )),
        db.select({ reviewId: missionReviews.id })
          .from(missionReviews)
          .innerJoin(missionContracts, eq(missionContracts.id, missionReviews.missionContractId))
          .innerJoin(quests, eq(quests.id, missionContracts.questId))
          .innerJoin(questSkillContributions, eq(questSkillContributions.questId, quests.id))
          .innerJoin(skillNodes, eq(skillNodes.id, questSkillContributions.skillNodeId))
          .where(and(
            eq(missionReviews.userId, questInput.userId),
            eq(missionReviews.decision, "revisions_needed"),
            eq(skillNodes.capabilityId, focusSkill.capabilityId),
          )),
      ]);
      const netByMission = new Map<number, number>();
      for (const event of progressionEvents) {
        if (event.questId !== null) netByMission.set(event.questId, (netByMission.get(event.questId) || 0) + event.delta);
      }
      reviewedMissions = Array.from(netByMission.values()).filter((total) => total > 0).length;
      revisionReviews = new Set(revisions.map((review) => review.reviewId)).size;
    }
  }
  const difficultyCalibration = calibrateMissionDifficulty({
    classifiedDifficulty: classification.difficulty,
    explicitlySelected: questInput.difficulty !== undefined && questInput.difficulty !== null,
    reviewedExperience,
    reviewedMissions,
    revisionReviews,
    context: planningContextSnapshot,
  });
  return {
    ...questInput,
    completed: false,
    completedAt: null,
    category: classification.category,
    difficulty: difficultyCalibration.selectedDifficulty,
    attentionCost,
    timeCost,
    energyCost,
    planningContextSnapshot,
    difficultyCalibration,
    planningDecisionSource: options.source || "system",
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

export async function createMissionLifecycle(input: InternalMissionCreation & { source: MissionLifecycleSource; suppressAutomations?: boolean }) {
  const { source, suppressAutomations = false, ...questInput } = input;
  const shouldComplete = questInput.completed === true;
  const quest = await storage.createQuest(await prepareMissionCreation(questInput, { source }));
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
  expectedRevision?: number;
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
  const updateValues = {
    ...updates,
    ...(category ? { category } : {}),
    ...(difficulty ? { difficulty } : {}),
    attentionCost,
    timeCost,
    energyCost,
  };
  const updatedQuest = input.expectedRevision === undefined
    ? await storage.updateQuest(quest.id, updateValues)
    : (await db.update(quests).set(updateValues)
      .where(and(
        eq(quests.id, quest.id),
        eq(quests.userId, input.userId),
        eq(quests.revision, input.expectedRevision),
        isNull(quests.deletedAt),
      ))
      .returning())[0];
  if (!updatedQuest) {
    const [current] = await db.select().from(quests)
      .where(and(eq(quests.id, quest.id), eq(quests.userId, input.userId)))
      .limit(1);
    throw new MissionLifecycleError(409, "This mission changed elsewhere. Review the current version before applying your queued change.", current);
  }
  storage.logActivityEvent(quest.userId, "mission_updated", { questId: quest.id, source: input.source }).catch(() => {});
  return updatedQuest;
}

/** Atomically changes Project membership while keeping the Mission row as the
 * sole task authority. Locking both aggregates serializes linking against
 * Project completion and prevents silent moves between Projects. */
export async function changeMissionProjectMembershipLifecycle(input: {
  userId: number;
  projectId: number;
  missionId: number;
  expectedProjectRevision: number;
  expectedMissionRevision: number;
  mode: "link" | "unlink";
}) {
  const result = await db.transaction(async (tx) => {
    const [project] = await tx.select().from(kanbanBoards).where(and(
      eq(kanbanBoards.id, input.projectId), eq(kanbanBoards.userId, input.userId), isNull(kanbanBoards.deletedAt),
    )).for("update").limit(1);
    if (!project) throw new MissionLifecycleError(404, "Project not found");
    const [mission] = await tx.select().from(quests).where(and(
      eq(quests.id, input.missionId), eq(quests.userId, input.userId), isNull(quests.deletedAt),
    )).for("update").limit(1);
    if (!mission) throw new MissionLifecycleError(404, "Mission not found");
    if (input.mode === "link" && mission.projectId === project.id) return { project, mission, replayed: true };
    if (input.mode === "link" && (project.state === "completed" || project.state === "archived")) throw new MissionLifecycleError(409, "Reopen this Project before linking another Mission.");
    if (project.revision !== input.expectedProjectRevision) throw new MissionLifecycleError(409, "Project changed in another session. Refresh before changing Missions.");
    if (mission.revision !== input.expectedMissionRevision) throw new MissionLifecycleError(409, "Mission changed in another session. Refresh before changing its Project.", mission);
    if (input.mode === "link" && mission.projectId !== null) throw new MissionLifecycleError(409, "This Mission already belongs to another Project. Unlink it there first.", mission);
    if (input.mode === "unlink" && mission.projectId !== project.id) throw new MissionLifecycleError(404, "Linked mission not found");

    const [updatedMission] = await tx.update(quests).set({ projectId: input.mode === "link" ? project.id : null })
      .where(and(eq(quests.id, mission.id), eq(quests.userId, input.userId), eq(quests.revision, input.expectedMissionRevision)))
      .returning();
    if (!updatedMission) throw new MissionLifecycleError(409, "Mission changed in another session. Refresh before changing its Project.");
    const [updatedProject] = await tx.update(kanbanBoards).set({ revision: project.revision + 1, updatedAt: new Date() })
      .where(and(eq(kanbanBoards.id, project.id), eq(kanbanBoards.userId, input.userId), eq(kanbanBoards.revision, project.revision)))
      .returning();
    if (!updatedProject) throw new MissionLifecycleError(409, "Project changed in another session. Refresh before changing Missions.");
    await tx.insert(projectEvents).values({
      userId: input.userId,
      projectId: project.id,
      eventType: input.mode === "link" ? "ProjectTaskLinked.v1" : "ProjectTaskUnlinked.v1",
      fromState: project.state,
      toState: project.state,
      aggregateRevision: updatedProject.revision,
    });
    return { project: updatedProject, mission: updatedMission, replayed: false };
  });
  if (!result.replayed) storage.logActivityEvent(input.userId, "mission_updated", { questId: input.missionId, source: "ui" }).catch(() => {});
  return result;
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
  progressionRevision: number;
}): Promise<number> {
  const { quest, direction, sourceType, evidenceSummary, progressionRevision } = input;
  const contributionRefs = await db.select({
    skillNodeId: questSkillContributions.skillNodeId,
    experienceAmount: questSkillContributions.experienceAmount,
    capabilityId: skillNodes.capabilityId,
  })
    .from(questSkillContributions)
    .innerJoin(skillNodes, eq(skillNodes.id, questSkillContributions.skillNodeId))
    .leftJoin(personalCapabilities, eq(personalCapabilities.id, skillNodes.capabilityId))
    .where(and(
      eq(questSkillContributions.questId, quest.id),
      eq(questSkillContributions.userId, quest.userId),
      eq(skillNodes.userId, quest.userId),
    ));

  if (contributionRefs.length === 0) return 0;
  await db.transaction(async (tx) => {
    const skillIds = contributionRefs.map((contribution) => contribution.skillNodeId);
    await tx.select({ id: skillNodes.id }).from(skillNodes)
      .where(and(eq(skillNodes.userId, quest.userId), inArray(skillNodes.id, skillIds)))
      .for("update");
    const capabilityIds = Array.from(new Set(contributionRefs.flatMap((contribution) => contribution.capabilityId === null ? [] : [contribution.capabilityId])));
    if (capabilityIds.length) await tx.select({ id: personalCapabilities.id }).from(personalCapabilities)
      .where(and(eq(personalCapabilities.userId, quest.userId), inArray(personalCapabilities.id, capabilityIds)))
      .for("update");
    const contributions = await tx.select({
      skillNodeId: questSkillContributions.skillNodeId,
      experienceAmount: questSkillContributions.experienceAmount,
      currentExperience: skillNodes.experience,
      capabilityId: skillNodes.capabilityId,
      capabilityExperience: personalCapabilities.experience,
    }).from(questSkillContributions)
      .innerJoin(skillNodes, eq(skillNodes.id, questSkillContributions.skillNodeId))
      .leftJoin(personalCapabilities, eq(personalCapabilities.id, skillNodes.capabilityId))
      .where(and(
        eq(questSkillContributions.questId, quest.id),
        eq(questSkillContributions.userId, quest.userId),
        eq(skillNodes.userId, quest.userId),
      ));
    const capabilityDeltas = new Map<number, { currentExperience: number; delta: number }>();
    for (const contribution of contributions) {
      const delta = contribution.experienceAmount * direction;
      const nextExperience = Math.max(0, contribution.currentExperience + delta);
      await tx.update(skillNodes)
        .set({ experience: nextExperience, level: skillLevelForExperience(nextExperience), updatedAt: new Date() })
        .where(and(eq(skillNodes.id, contribution.skillNodeId), eq(skillNodes.userId, quest.userId)));
      const [creditedEvent] = direction === -1
        ? await tx.select({ id: skillProgressionEvents.id }).from(skillProgressionEvents).where(and(
          eq(skillProgressionEvents.userId, quest.userId),
          eq(skillProgressionEvents.skillNodeId, contribution.skillNodeId),
          eq(skillProgressionEvents.questId, quest.id),
          eq(skillProgressionEvents.sourceType, "mission_evidence_review"),
          eq(skillProgressionEvents.progressionRevision, progressionRevision),
        )).orderBy(desc(skillProgressionEvents.createdAt)).limit(1)
        : [];
      await tx.insert(skillProgressionEvents).values({
        userId: quest.userId,
        skillNodeId: contribution.skillNodeId,
        questId: quest.id,
        transformationThreadId: quest.transformationThreadId || null,
        sourceType,
        progressionRevision,
        reversalOfId: creditedEvent?.id || null,
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
  return contributionRefs.reduce((total, contribution) => total + contribution.experienceAmount, 0);
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

  let claimedRevision: number | null = null;
  await db.transaction(async (tx) => {
    const [contract] = await tx.update(missionContracts)
      .set({ progressionAppliedAt: new Date(), progressionRevision: sql`${missionContracts.progressionRevision} + 1`, updatedAt: new Date() })
      .where(and(
        eq(missionContracts.questId, input.questId),
        eq(missionContracts.userId, input.userId),
        eq(missionContracts.state, "reviewed"),
        isNull(missionContracts.progressionAppliedAt),
      ))
      .returning({ revision: missionContracts.progressionRevision });
    claimedRevision = contract?.revision ?? null;
  });
  if (claimedRevision === null) return { skillExperienceAwarded: 0, applied: false };

  try {
    const skillExperienceAwarded = await applyQuestSkillProgression({
      quest,
      direction: 1,
      sourceType: "mission_evidence_review",
      evidenceSummary: `Evidence review confirmed: ${input.reviewSummary}`,
      progressionRevision: claimedRevision,
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
      .set({ progressionAppliedAt: null, progressionRevision: sql`GREATEST(0, ${missionContracts.progressionRevision} - 1)`, updatedAt: new Date() })
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
    .returning({ id: missionContracts.id, progressionRevision: missionContracts.progressionRevision });
  if (!contract) return { skillExperienceAwarded: 0, revoked: false };

  try {
    const skillExperienceAwarded = await applyQuestSkillProgression({
      quest,
      direction: -1,
      sourceType: "mission_evidence_reversal",
      evidenceSummary: input.reason,
      progressionRevision: contract.progressionRevision,
    });
    const progression = await refreshProgressionState(quest.userId, `mission:${quest.id}:evidence-reversed`);
    return { skillExperienceAwarded, revoked: true, progression };
  } catch (error) {
    await db.update(missionContracts).set({ progressionAppliedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(missionContracts.id, contract.id),
        eq(missionContracts.userId, input.userId),
        isNull(missionContracts.progressionAppliedAt),
        eq(missionContracts.progressionRevision, contract.progressionRevision),
      )).catch(() => {});
    throw error;
  }
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

  const [preToggleStats, preToggleProfile] = await Promise.all([
    storage.getUserStats(quest.userId),
    storage.getUserProfile(quest.userId),
  ]);
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
    progression = await refreshProgressionState(
      quest.userId,
      `mission:${quest.id}:${updatedQuest.completed ? "completed" : "reopened"}:${input.source}`,
      { totalExperience: preToggleProfile?.totalXP || 0, level: previousLevel },
    );
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
