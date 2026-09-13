import { and, desc, eq, gt, isNotNull, isNull } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { createMissionLifecycleResult } from "./mission-lifecycle";
import { buildPlanningContextSnapshot } from "./context-snapshot";
import { buildSkillGraph, recommendNextSkill } from "./skill-graph";
import { calibrateMissionDifficulty } from "./transformation-intelligence";
import { MIN_TRANSFORMATION_THREAD_COMPLETION_DAYS } from "./transformation-thread-policy";
import { missionContracts, personalCapabilities, questSkillContributions, quests, skillNodes, skillProgressionEvents, transformationThreadEvidence, transformationThreads } from "@shared/schema";

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function localCalendarDate(timeZone: unknown): string {
  const normalizedTimeZone = cleanText(timeZone) || "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: normalizedTimeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * Creates exactly one next practice only after the current Thread has no live
 * unreviewed work. The stable lifecycle key makes concurrent review requests
 * converge on the same canonical Mission instead of manufacturing duplicates.
 */
export async function prepareThreadContinuationAfterReview(input: { userId: number; reviewedQuestId: number }) {
  const [reviewedQuest] = await db.select({
    transformationThreadId: quests.transformationThreadId,
    title: quests.title,
  }).from(quests).where(and(eq(quests.id, input.reviewedQuestId), eq(quests.userId, input.userId))).limit(1);
  if (!reviewedQuest?.transformationThreadId) return { created: false, reason: "not_a_thread_mission" as const };

  const [thread] = await db.select().from(transformationThreads).where(and(
    eq(transformationThreads.id, reviewedQuest.transformationThreadId),
    eq(transformationThreads.userId, input.userId),
    eq(transformationThreads.status, "active"),
  )).limit(1);
  if (!thread) return { created: false, reason: "thread_not_active" as const };

  const linkedMissions = await db.select({
    id: quests.id,
    completed: quests.completed,
    contractState: missionContracts.state,
  }).from(quests)
    .leftJoin(missionContracts, and(eq(missionContracts.questId, quests.id), eq(missionContracts.userId, quests.userId)))
    .where(and(
      eq(quests.userId, input.userId),
      eq(quests.transformationThreadId, thread.id),
      isNull(quests.deletedAt),
    ));
  const allLiveWorkReviewed = linkedMissions.length > 0
    && linkedMissions.every((mission) => mission.completed && mission.contractState === "reviewed");
  if (!allLiveWorkReviewed) return { created: false, reason: "live_work_remaining" as const };

  const startedAt = thread.activatedAt || thread.createdAt;
  const activeDays = Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / (24 * 60 * 60 * 1000)));
  if (activeDays >= MIN_TRANSFORMATION_THREAD_COMPLETION_DAYS) {
    return { created: false, reason: "focus_completion_window" as const };
  }

  const [profile, stats, dailyLog, skills, reviewedRows, reviewRows] = await Promise.all([
    storage.getUserProfile(input.userId),
    storage.getUserStats(input.userId),
    storage.getUserDailyLogByDate(input.userId, new Date()),
    db.select({
      skill: skillNodes,
      recordedExperience: personalCapabilities.experience,
      recordedLevel: personalCapabilities.level,
    }).from(skillNodes)
      .leftJoin(personalCapabilities, and(eq(personalCapabilities.id, skillNodes.capabilityId), eq(personalCapabilities.userId, input.userId)))
      .where(and(eq(skillNodes.userId, input.userId), eq(skillNodes.transformationThreadId, thread.id))),
    db.select({ skillNodeId: skillProgressionEvents.skillNodeId, questId: skillProgressionEvents.questId })
      .from(skillProgressionEvents)
      .innerJoin(skillNodes, eq(skillNodes.id, skillProgressionEvents.skillNodeId))
      .where(and(
        eq(skillProgressionEvents.userId, input.userId),
        eq(skillNodes.transformationThreadId, thread.id),
        eq(skillProgressionEvents.sourceType, "mission_evidence_review"),
        gt(skillProgressionEvents.experienceDelta, 0),
      )),
    db.select({ id: transformationThreadEvidence.id }).from(transformationThreadEvidence).where(and(
      eq(transformationThreadEvidence.userId, input.userId),
      eq(transformationThreadEvidence.transformationThreadId, thread.id),
      eq(transformationThreadEvidence.sourceType, "weekly_review"),
    )),
  ]);
  const completedMissionCountBySkill = new Map<number, Set<number>>();
  for (const row of reviewedRows) {
    if (row.questId === null) continue;
    const existing = completedMissionCountBySkill.get(row.skillNodeId) || new Set<number>();
    existing.add(row.questId);
    completedMissionCountBySkill.set(row.skillNodeId, existing);
  }
  const graph = buildSkillGraph({
    skills: skills.map(({ skill, recordedExperience, recordedLevel }) => ({ ...skill, recordedExperience, recordedLevel })),
    completedMissionCountBySkill: new Map(Array.from(completedMissionCountBySkill, ([skillId, missionIds]) => [skillId, missionIds.size])),
    reviewCount: reviewRows.length,
  });
  const nextSkill = recommendNextSkill(graph);
  if (!nextSkill) return { created: false, reason: "no_unlocked_skill" as const };

  const planningContext = buildPlanningContextSnapshot({ profile, stats, dailyLog });
  const calibration = calibrateMissionDifficulty({
    classifiedDifficulty: "S",
    explicitlySelected: false,
    reviewedExperience: nextSkill.experience,
    reviewedMissions: nextSkill.completedMissionCount,
    context: planningContext,
  });
  const sourceSnapshot = thread.sourceSnapshot && typeof thread.sourceSnapshot === "object"
    ? thread.sourceSnapshot as { timeZone?: unknown }
    : {};
  const timeZone = cleanText(profile?.timezone) || cleanText(sourceSnapshot.timeZone) || "UTC";
  const scheduledDate = localCalendarDate(timeZone);
  const rationale = `Prepared after the reviewed evidence for “${reviewedQuest.title}.” ${nextSkill.name} is the next unlocked Thread skill with the largest remaining declared practice gap.`;
  const lifecycleKey = `thread-continuation:${thread.id}:after-review:${input.reviewedQuestId}`;
  const creation = await createMissionLifecycleResult({
    userId: input.userId,
    title: `Practice ${nextSkill.name} in one bounded attempt`,
    description: `Complete one observable, real-world practice attempt that advances ${thread.focus} through ${nextSkill.name}. Keep the scope small enough to finish today, then record what happened and one adjustment for the next attempt.`,
    category: "learning",
    difficulty: calibration.recommendedDifficulty,
    experienceReward: 20,
    startDate: scheduledDate,
    endDate: scheduledDate,
    dueDate: scheduledDate,
    timezone: timeZone,
    transformationThreadId: thread.id,
    linkedItems: [{ type: "transformation-thread", id: thread.id, rationale }],
    lifecycleKey,
    source: "system",
  });

  // The Mission exists through the canonical lifecycle first; these two
  // idempotent records make its specific Thread purpose and proof plan durable
  // even if the triggering review is replayed after a transport failure.
  await db.transaction(async (tx) => {
    await tx.insert(questSkillContributions).values({
      userId: input.userId,
      questId: creation.quest.id,
      skillNodeId: nextSkill.id,
      experienceAmount: 20,
    }).onConflictDoNothing();
    await tx.insert(missionContracts).values({
      userId: input.userId,
      questId: creation.quest.id,
      purpose: rationale,
      expectedOutput: `A short observation of the completed ${nextSkill.name} practice and the adjustment it suggests.`,
      methodSteps: [
        "Choose one bounded real-world attempt that fits today's capacity.",
        `Complete the attempt using ${nextSkill.name}.`,
        "Record the observed result and one adjustment before requesting evidence review.",
      ],
      toolRequirements: [],
      capabilityTargets: [nextSkill.key],
      prerequisites: [],
      requiredEvidence: ["A short observation or artifact showing the completed practice attempt."],
      rubricDefinition: [{ id: "criterion-1", requirement: "A short observation or artifact showing the completed practice attempt.", guidance: "Compare the submitted evidence with the expected output and the bounded practice scope.", weight: 1, required: true }],
      rubricVersion: 1,
      acceptanceContextSnapshot: creation.quest.planningContextSnapshot,
      reviewMode: "self",
      riskLevel: "low",
      stopConditions: [],
      escalationPath: "Pause, defer, or right-size this Mission if current capacity changes.",
      state: "accepted",
    }).onConflictDoNothing();
  });
  return { created: !creation.replayed, questId: creation.quest.id, reason: "prepared" as const };
}

/**
 * Read-time recovery for a transient failure after a positive evidence review.
 * It never treats a checkbox as completion: prepareThreadContinuationAfterReview
 * still requires every live Thread mission to be completed and reviewed. Its
 * lifecycle key makes repeated reads converge on one canonical next step.
 */
export async function reconcileThreadContinuation(userId: number) {
  const [thread] = await db.select({ id: transformationThreads.id })
    .from(transformationThreads)
    .where(and(eq(transformationThreads.userId, userId), eq(transformationThreads.status, "active")))
    .orderBy(desc(transformationThreads.updatedAt))
    .limit(1);
  if (!thread) return { created: false, reason: "no_active_thread" as const };

  const [latestReviewedMission] = await db.select({ questId: quests.id })
    .from(quests)
    .innerJoin(missionContracts, and(
      eq(missionContracts.questId, quests.id),
      eq(missionContracts.userId, quests.userId),
    ))
    .where(and(
      eq(quests.userId, userId),
      eq(quests.transformationThreadId, thread.id),
      isNull(quests.deletedAt),
      eq(missionContracts.state, "reviewed"),
      isNotNull(missionContracts.progressionAppliedAt),
    ))
    .orderBy(desc(missionContracts.progressionAppliedAt), desc(quests.id))
    .limit(1);
  if (!latestReviewedMission) return { created: false, reason: "no_reviewed_thread_mission" as const };

  return prepareThreadContinuationAfterReview({ userId, reviewedQuestId: latestReviewedMission.questId });
}
