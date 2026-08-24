import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { getActivityProgressionSnapshot, reconcileActivityProgression } from "./activity-progression";
import { getHealthProgressionSummary } from "./health-progression";
import {
  missionContracts,
  personalCapabilities,
  progressionBadgeEvents,
  quests,
  skillNodes,
  skillProgressionEvents,
  transformationThreadEvidence,
} from "@shared/schema";
import { db } from "./db";
import { storage } from "./storage";

export const GAMIFICATION_CONTRACT_VERSION = "lyfeos-gamification.v1";

type BadgeDefinition = {
  name: string;
  description: string;
  track: "activity" | "consistency" | "capability";
  unit: string;
  target: number;
  nextAction: string;
};

const BADGE_DEFINITIONS: Record<string, BadgeDefinition> = {
  "first-real-action": {
    name: "First real action", description: "A canonical LyfeOS mission is currently complete.", track: "activity",
    unit: "completed missions", target: 1, nextAction: "Complete one real-world mission.",
  },
  "week-of-practice": {
    name: "Week of practice", description: "Current mission evidence spans seven distinct practice days.", track: "consistency",
    unit: "practice days", target: 7, nextAction: "Complete a mission on another distinct day.",
  },
  "evidence-builder": {
    name: "Evidence builder", description: "Three missions currently have accepted evidence-backed progression.", track: "capability",
    unit: "reviewed missions", target: 3, nextAction: "Complete a proof plan and receive a meets-evidence review.",
  },
  "review-rhythm": {
    name: "Review rhythm", description: "Two reflective Thread reviews are recorded.", track: "consistency",
    unit: "Thread reviews", target: 2, nextAction: "Record another Thread review.",
  },
};

type BadgeCandidate = {
  key: string;
  definition: BadgeDefinition;
  current: number;
  qualifies?: boolean;
  evidence: Record<string, unknown>;
};

type CapabilityRow = { id: number; key: string; name: string; experience: number };
type CapabilityEvent = {
  id: number;
  capabilityId: number;
  skillName: string;
  questId: number | null;
  sourceType: string;
  experienceDelta: number;
  evidenceSummary: string;
  createdAt: Date;
};

function calendarDate(value: Date, timeZone: string): string {
  try {
    return value.toLocaleDateString("en-CA", { timeZone });
  } catch {
    return value.toISOString().slice(0, 10);
  }
}

function badgeCandidates(input: {
  completedMissionCount: number;
  distinctPracticeDays: number;
  threadReviews: number;
  reviewedMissionCount: number;
  capabilities: CapabilityRow[];
  capabilityEvents: CapabilityEvent[];
}): BadgeCandidate[] {
  const candidates: BadgeCandidate[] = [
    { key: "first-real-action", definition: BADGE_DEFINITIONS["first-real-action"], current: input.completedMissionCount, evidence: { completedMissions: input.completedMissionCount } },
    { key: "week-of-practice", definition: BADGE_DEFINITIONS["week-of-practice"], current: input.distinctPracticeDays, evidence: { distinctPracticeDays: input.distinctPracticeDays } },
    { key: "evidence-builder", definition: BADGE_DEFINITIONS["evidence-builder"], current: input.reviewedMissionCount, evidence: { reviewedMissions: input.reviewedMissionCount } },
    { key: "review-rhythm", definition: BADGE_DEFINITIONS["review-rhythm"], current: input.threadReviews, evidence: { reviews: input.threadReviews } },
  ];
  for (const capability of input.capabilities) {
    const events = input.capabilityEvents.filter((event) => event.capabilityId === capability.id);
    const reviewedQuestIds = new Set(events.flatMap((event) => event.sourceType === "mission_evidence_review" && event.questId !== null ? [event.questId] : []));
    const netByMission = new Map<number, number>();
    for (const event of events) if (event.questId !== null) netByMission.set(event.questId, (netByMission.get(event.questId) || 0) + event.experienceDelta);
    const reviewedMissions = Array.from(netByMission.entries()).filter(([questId, experience]) => reviewedQuestIds.has(questId) && experience > 0).length;
    const definition: BadgeDefinition = {
      name: `${capability.name} practitioner`,
      description: `Repeated evidence-backed practice in ${capability.name}. This is not external certification.`,
      track: "capability",
      unit: "reviewed missions (plus 100 reviewed XP and two Thread reviews)",
      target: 3,
      nextAction: `Complete another mission linked to ${capability.name}, submit its declared evidence, and receive review.`,
    };
    candidates.push({
      key: `capability-practitioner:${capability.id}`,
      definition,
      current: reviewedMissions,
      qualifies: capability.experience >= 100 && reviewedMissions >= 3 && input.threadReviews >= 2,
      evidence: { capabilityKey: capability.key, evidenceBackedExperience: capability.experience, distinctReviewedMissions: reviewedMissions, threadReviews: input.threadReviews },
    });
  }
  return candidates;
}

async function progressionData(userId: number) {
  const [profile, completedMissions, threadEvidence, reviewedMissions, capabilities, rawSkillEvents, badgeEvents] = await Promise.all([
    storage.getUserProfile(userId),
    db.select({ id: quests.id, category: quests.category, completedAt: quests.completedAt }).from(quests)
      .where(and(eq(quests.userId, userId), eq(quests.completed, true), isNull(quests.deletedAt))),
    db.select({ sourceType: transformationThreadEvidence.sourceType }).from(transformationThreadEvidence)
      .where(eq(transformationThreadEvidence.userId, userId)),
    db.select({ questId: missionContracts.questId }).from(missionContracts)
      .where(and(eq(missionContracts.userId, userId), eq(missionContracts.state, "reviewed"), isNotNull(missionContracts.progressionAppliedAt))),
    db.select({ id: personalCapabilities.id, key: personalCapabilities.key, name: personalCapabilities.name, experience: personalCapabilities.experience })
      .from(personalCapabilities).where(eq(personalCapabilities.userId, userId)),
    db.select({
      id: skillProgressionEvents.id,
      capabilityId: skillNodes.capabilityId,
      skillName: skillNodes.name,
      questId: skillProgressionEvents.questId,
      sourceType: skillProgressionEvents.sourceType,
      experienceDelta: skillProgressionEvents.experienceDelta,
      evidenceSummary: skillProgressionEvents.evidenceSummary,
      createdAt: skillProgressionEvents.createdAt,
    }).from(skillProgressionEvents)
      .innerJoin(skillNodes, eq(skillNodes.id, skillProgressionEvents.skillNodeId))
      .where(and(eq(skillProgressionEvents.userId, userId), eq(skillNodes.userId, userId)))
      .orderBy(desc(skillProgressionEvents.createdAt)),
    db.select().from(progressionBadgeEvents).where(eq(progressionBadgeEvents.userId, userId)).orderBy(asc(progressionBadgeEvents.id)),
  ]);
  const capabilityEvents = rawSkillEvents.flatMap((event) => event.capabilityId === null ? [] : [{ ...event, capabilityId: event.capabilityId }]);
  const timeZone = profile?.timezone || "UTC";
  const practiceMissions = completedMissions.filter((mission) => !["onboarding", "todo"].includes((mission.category || "").toLowerCase()));
  const distinctPracticeDays = new Set(practiceMissions.flatMap((mission) => mission.completedAt
    ? [calendarDate(mission.completedAt, timeZone)]
    : [])).size;
  const candidates = badgeCandidates({
    completedMissionCount: practiceMissions.length,
    distinctPracticeDays,
    threadReviews: threadEvidence.filter((item) => item.sourceType === "weekly_review").length,
    reviewedMissionCount: new Set(reviewedMissions.map((review) => review.questId)).size,
    capabilities,
    capabilityEvents,
  });
  const lastBadgeEvent = new Map<string, typeof badgeEvents[number]>();
  for (const event of badgeEvents) lastBadgeEvent.set(event.badgeKey, event);
  const activeBadges = candidates.flatMap((candidate) => {
    const event = lastBadgeEvent.get(candidate.key);
    return event?.action === "awarded" ? [{
      key: candidate.key,
      ...candidate.definition,
      evidence: event.evidence as Record<string, unknown>,
      awardedAt: event.createdAt,
    }] : [];
  });
  return { profile, completedMissions, capabilities, capabilityEvents, candidates, badgeEvents, lastBadgeEvent, activeBadges };
}

async function reconcileBadges(userId: number) {
  const data = await progressionData(userId);
  const desired = new Map(data.candidates.filter((candidate) => candidate.qualifies ?? candidate.current >= candidate.definition.target).map((candidate) => [candidate.key, candidate]));
  const inserts: Array<typeof progressionBadgeEvents.$inferInsert> = [];
  for (const [key, candidate] of Array.from(desired.entries())) {
    const latest = data.lastBadgeEvent.get(key);
    if (latest?.action !== "awarded") {
      const generation = data.badgeEvents.filter((event) => event.badgeKey === key && event.action === "awarded").length + 1;
      inserts.push({ userId, eventKey: `progression-badge:${userId}:${key}:awarded:${generation}`, badgeKey: key, action: "awarded", evidence: candidate.evidence });
    }
  }
  for (const [key, latest] of Array.from(data.lastBadgeEvent.entries())) {
    if (latest.action === "awarded" && !desired.has(key)) {
      inserts.push({
        userId,
        eventKey: `progression-badge:${userId}:${key}:reversed:${latest.id}`,
        badgeKey: key,
        action: "reversed",
        evidence: { reason: "qualifying_evidence_no_longer_active" },
        reversalOfId: latest.id,
        reason: "The supporting record was reopened, removed, or no longer meets the declared threshold.",
      });
    }
  }
  if (!inserts.length) return [];
  return db.insert(progressionBadgeEvents).values(inserts).onConflictDoNothing().returning();
}

async function buildProgressionSummary(userId: number) {
  const data = await progressionData(userId);
  const activity = await getActivityProgressionSnapshot(userId, db, data.profile?.timezone || "UTC");
  const healthPractice = await getHealthProgressionSummary(userId);
  const badgeProgress = data.candidates.map((candidate) => ({
    key: candidate.key,
    ...candidate.definition,
    current: candidate.current,
    remaining: Math.max(0, candidate.definition.target - candidate.current),
    requirementsMet: candidate.qualifies ?? candidate.current >= candidate.definition.target,
    evidence: candidate.evidence,
    active: data.lastBadgeEvent.get(candidate.key)?.action === "awarded",
  }));
  const nearestBadge = badgeProgress.filter((badge) => !badge.active).sort((left, right) => left.remaining - right.remaining)[0];
  const totalVerifiedCapabilityExperience = data.capabilities.reduce((total, capability) => total + capability.experience, 0);
  return {
    version: GAMIFICATION_CONTRACT_VERSION,
    totalExperience: activity.totalExperience,
    level: activity.level,
    rank: activity.rank,
    nextRank: activity.nextRank,
    badges: data.activeBadges,
    badgeProgress,
    tracks: {
      activity: {
        label: "Activity record",
        totalExperience: activity.totalExperience,
        level: activity.level,
        currentLevelExperience: activity.currentLevelExperience,
        nextLevelExperience: activity.nextLevelExperience,
        percent: activity.percent,
        rank: activity.rank,
        nextRank: activity.nextRank,
        levelsToNextRank: activity.levelsToNextRank,
        sourceTotals: activity.sourceTotals,
        recentEvents: activity.recentEvents,
        disclosure: "Activity XP, levels, and rank recognize completed LyfeOS missions and goals. They do not prove skill, certification, authority, or personal worth.",
      },
      consistency: {
        label: "Practice consistency",
        ...activity.streak,
        disclosure: "The practice streak advances from completed non-onboarding missions, not logins. Reopening supporting missions can change the active record.",
      },
      capability: {
        label: "Demonstrated capability",
        practicingSkills: data.capabilities.filter((capability) => capability.experience > 0).length,
        evidenceBackedSkills: data.candidates.filter((candidate) => candidate.key.startsWith("capability-practitioner:") && candidate.qualifies).length,
        totalVerifiedExperience: totalVerifiedCapabilityExperience,
        capabilities: data.capabilities,
        recentEvents: data.capabilityEvents.slice(0, 20),
        disclosure: "Capability XP moves only through reviewed mission evidence and reverses when that support is withdrawn. It remains a private practice record, not external certification.",
      },
      healthPractice: {
        label: "Health practice record",
        ...healthPractice,
      },
      authority: {
        label: "Certification and authority",
        certifications: [],
        entrustedRoles: [],
        disclosure: "LyfeOS does not currently grant external certification, licensure, professional authority, or entrusted responsibility.",
      },
    },
    competenceSignals: {
      practicingSkills: data.capabilities.filter((capability) => capability.experience > 0).length,
      evidenceBackedSkills: data.candidates.filter((candidate) => candidate.key.startsWith("capability-practitioner:") && candidate.qualifies).length,
      note: "Signals summarize reviewed LyfeOS practice. They are not external certification.",
    },
    nextUnlocks: [
      ...(activity.nextRank ? [{
        type: "activity_rank" as const,
        label: `${activity.nextRank.name} activity rank`,
        explanation: `${activity.levelsToNextRank} level${activity.levelsToNextRank === 1 ? "" : "s"} remain. Activity rank changes only from completed missions and goals.`,
      }] : []),
      ...(nearestBadge ? [{
        type: "badge" as const,
        label: nearestBadge.name,
        explanation: nearestBadge.key.startsWith("capability-practitioner:")
          ? `${Math.max(0, 3 - Number(nearestBadge.evidence.distinctReviewedMissions || 0))} reviewed missions, ${Math.max(0, 100 - Number(nearestBadge.evidence.evidenceBackedExperience || 0))} reviewed XP, and ${Math.max(0, 2 - Number(nearestBadge.evidence.threadReviews || 0))} Thread reviews remain. ${nearestBadge.nextAction}`
          : `${nearestBadge.remaining} more ${nearestBadge.unit}. ${nearestBadge.nextAction}`,
      }] : []),
    ],
    recentBadgeEvents: [...data.badgeEvents].reverse().slice(0, 20),
  };
}

export async function getProgressionSummary(userId: number) {
  await storage.recalculateXP(userId);
  await reconcileBadges(userId);
  return buildProgressionSummary(userId);
}

/** Rebuild deterministic, LyfeOS-local progression after a real action. */
export async function refreshProgressionState(
  userId: number,
  reason: string,
  prior?: { totalExperience: number; level: number },
) {
  const previous = await buildProgressionSummary(userId).catch(() => null);
  const xp = await storage.recalculateXP(userId);
  const badgeEvents = await reconcileBadges(userId);
  const summary = await buildProgressionSummary(userId);
  const newlyAwardedKeys = new Set(badgeEvents.filter((event) => event.action === "awarded").map((event) => event.badgeKey));
  const reversedKeys = new Set(badgeEvents.filter((event) => event.action === "reversed").map((event) => event.badgeKey));
  return {
    ...summary,
    totalExperience: xp.totalXP,
    transition: {
      reason,
      activityExperienceDelta: xp.totalXP - (prior?.totalExperience ?? previous?.totalExperience ?? xp.totalXP),
      levelChanged: (prior?.level ?? previous?.level ?? summary.level) !== summary.level,
      previousLevel: prior?.level ?? previous?.level ?? summary.level,
      currentLevel: summary.level,
    },
    newlyAwardedBadges: summary.badges.filter((badge) => newlyAwardedKeys.has(badge.key)),
    reversedBadges: summary.badgeProgress.filter((badge) => reversedKeys.has(badge.key)),
  };
}
