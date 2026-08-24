import { and, desc, eq } from "drizzle-orm";
import { getProgressionRank, type ProgressionRank } from "@shared/progression";
import {
  progressionBadgeAwards,
  missionContracts,
  missionReviews,
  personalCapabilities,
  quests,
  skillNodes,
  skillProgressionEvents,
  transformationThreadEvidence,
} from "@shared/schema";
import { db } from "./db";
import { storage } from "./storage";

export type ProgressionBadge = {
  key: string;
  name: string;
  description: string;
  evidence: Record<string, unknown>;
  awardedAt: Date;
};

type BadgeCandidate = Omit<ProgressionBadge, "awardedAt">;

/**
 * These markers describe evidence LyfeOS has recorded. They deliberately do
 * not represent external accreditation, professional licensure, or a verdict
 * on a person's inherent ability.
 */
function badgeCandidates(input: {
  completedMissions: Array<{ id: number; completedAt: Date | null }>;
  evidence: Array<{ sourceType: string }>;
  reviewedMissionCount: number;
  capabilities: Array<{ id: number; key: string; name: string; experience: number }>;
  capabilityEvents: Array<{ capabilityId: number; questId: number | null; sourceType: string; experienceDelta: number }>;
}): BadgeCandidate[] {
  const candidates: BadgeCandidate[] = [];
  const distinctPracticeDays = new Set(
    input.completedMissions.flatMap((mission) => mission.completedAt ? [mission.completedAt.toISOString().slice(0, 10)] : []),
  ).size;
  const reviews = input.evidence.filter((item) => item.sourceType === "weekly_review").length;

  if (input.completedMissions.length >= 1) {
    candidates.push({
      key: "first-real-action",
      name: "First real action",
      description: "Recorded after completing a mission in LyfeOS.",
      evidence: { completedMissions: input.completedMissions.length },
    });
  }
  if (distinctPracticeDays >= 7) {
    candidates.push({
      key: "week-of-practice",
      name: "Week of practice",
      description: "Recorded after mission completions on seven distinct calendar days.",
      evidence: { distinctPracticeDays },
    });
  }
  if (input.reviewedMissionCount >= 3) {
    candidates.push({
      key: "evidence-builder",
      name: "Evidence builder",
      description: "Recorded after three mission evidence reviews met their declared threshold.",
      evidence: { reviewedMissions: input.reviewedMissionCount },
    });
  }
  if (reviews >= 2) {
    candidates.push({
      key: "review-rhythm",
      name: "Review rhythm",
      description: "Recorded after two reflective Thread reviews.",
      evidence: { reviews },
    });
  }

  for (const capability of input.capabilities) {
    const completedMissionIds = new Set(
      input.capabilityEvents
        .filter((event) => event.capabilityId === capability.id && event.sourceType === "mission_evidence_review" && event.questId !== null)
        .map((event) => event.questId!),
    );
    const evidenceBackedExperience = input.capabilityEvents
      .filter((event) => event.capabilityId === capability.id && (event.sourceType === "mission_evidence_review" || event.sourceType === "mission_evidence_reversal"))
      .reduce((total, event) => total + event.experienceDelta, 0);
    if (evidenceBackedExperience >= 100 && completedMissionIds.size >= 3 && reviews >= 2) {
      candidates.push({
        key: `capability-practitioner:${capability.id}`,
        name: `${capability.name} practitioner`,
        description: "Evidence-backed repeated practice in this private LyfeOS skill. This is not external certification.",
        evidence: { capabilityKey: capability.key, evidenceBackedExperience, distinctReviewedMissions: completedMissionIds.size, reviews },
      });
    }
  }
  return candidates;
}

async function progressionData(userId: number, rank: ProgressionRank) {
  const [completedMissions, evidence, reviewedMissions, skills, skillEvents, awards] = await Promise.all([
    db.select({ id: quests.id, completedAt: quests.completedAt }).from(quests)
      .where(and(eq(quests.userId, userId), eq(quests.completed, true))),
    db.select({ sourceType: transformationThreadEvidence.sourceType }).from(transformationThreadEvidence)
      .where(eq(transformationThreadEvidence.userId, userId)),
    db.select({ questId: missionContracts.questId }).from(missionReviews)
      .innerJoin(missionContracts, eq(missionContracts.id, missionReviews.missionContractId))
      .where(and(
        eq(missionReviews.userId, userId),
        eq(missionContracts.userId, userId),
        eq(missionReviews.decision, "meets_evidence"),
      )),
    db.select({ id: personalCapabilities.id, key: personalCapabilities.key, name: personalCapabilities.name, experience: personalCapabilities.experience }).from(personalCapabilities)
      .where(eq(personalCapabilities.userId, userId)),
    db.select({ capabilityId: skillNodes.capabilityId, questId: skillProgressionEvents.questId, sourceType: skillProgressionEvents.sourceType, experienceDelta: skillProgressionEvents.experienceDelta }).from(skillProgressionEvents)
      .innerJoin(skillNodes, eq(skillNodes.id, skillProgressionEvents.skillNodeId))
      .where(and(eq(skillProgressionEvents.userId, userId), eq(skillNodes.userId, userId))),
    db.select().from(progressionBadgeAwards).where(eq(progressionBadgeAwards.userId, userId))
      .orderBy(desc(progressionBadgeAwards.awardedAt)),
  ]);
  const capabilityEvents = skillEvents.flatMap((event) => event.capabilityId === null ? [] : [{ ...event, capabilityId: event.capabilityId }]);
  const candidates = badgeCandidates({
    completedMissions,
    evidence,
    reviewedMissionCount: new Set(reviewedMissions.map((review) => review.questId)).size,
    capabilities: skills,
    capabilityEvents,
  });
  const definitions = new Map(candidates.map((candidate) => [candidate.key, candidate]));
  const badges: ProgressionBadge[] = awards.flatMap((award) => {
    const definition = definitions.get(award.badgeKey);
    if (!definition) return [];
    return [{ ...definition, evidence: award.evidence as Record<string, unknown>, awardedAt: award.awardedAt }];
  });
  const evidenceBackedSkills = candidates.filter((candidate) => candidate.key.startsWith("capability-practitioner:")).length;
  return { completedMissions, evidence, capabilities: skills, candidates, badges, evidenceBackedSkills, rank };
}

export async function getProgressionSummary(userId: number) {
  const [stats, profile] = await Promise.all([
    storage.getUserStats(userId),
    storage.getUserProfile(userId),
  ]);
  const level = stats?.level ?? 1;
  const rank = getProgressionRank(level);
  const data = await progressionData(userId, rank);
  return {
    totalExperience: profile?.totalXP ?? 0,
    level,
    rank,
    badges: data.badges,
    competenceSignals: {
      practicingSkills: data.capabilities.filter((capability) => capability.experience > 0).length,
      evidenceBackedSkills: data.evidenceBackedSkills,
      note: "Signals summarize LyfeOS-recorded practice and reflection. They are not external certification.",
    },
  };
}

/** Rebuild deterministic, LyfeOS-local progression after a real action. */
export async function refreshProgressionState(userId: number, reason: string) {
  const xp = await storage.recalculateXP(userId);
  const rank = getProgressionRank(xp.level);
  const data = await progressionData(userId, rank);
  const existingKeys = new Set(data.badges.map((badge) => badge.key));
  const newBadges = data.candidates.filter((candidate) => !existingKeys.has(candidate.key));
  if (newBadges.length > 0) {
    await db.insert(progressionBadgeAwards).values(newBadges.map((badge) => ({
      userId,
      badgeKey: badge.key,
      evidence: badge.evidence,
    }))).onConflictDoNothing();
  }

  return {
    totalExperience: xp.totalXP,
    level: xp.level,
    rank,
    newlyAwardedBadges: newBadges.map((badge) => ({ ...badge, awardedAt: new Date() })),
    competenceSignals: {
      practicingSkills: data.capabilities.filter((capability) => capability.experience > 0).length,
      evidenceBackedSkills: data.evidenceBackedSkills,
      note: "Signals summarize LyfeOS-recorded practice and reflection. They are not external certification.",
    },
  };
}
