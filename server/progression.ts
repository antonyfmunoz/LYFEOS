import { and, desc, eq } from "drizzle-orm";
import { getProgressionRank, type ProgressionRank } from "@shared/progression";
import {
  progressionBadgeAwards,
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
  skills: Array<{ id: number; key: string; name: string; experience: number }>;
  skillEvents: Array<{ skillNodeId: number; questId: number | null; sourceType: string }>;
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
  if (input.evidence.length >= 3) {
    candidates.push({
      key: "evidence-builder",
      name: "Evidence builder",
      description: "Recorded after three Thread evidence entries.",
      evidence: { evidenceRecords: input.evidence.length },
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

  for (const skill of input.skills) {
    const completedMissionIds = new Set(
      input.skillEvents
        .filter((event) => event.skillNodeId === skill.id && event.sourceType === "mission_completion" && event.questId !== null)
        .map((event) => event.questId!),
    );
    if (skill.experience >= 100 && completedMissionIds.size >= 3 && reviews >= 2) {
      candidates.push({
        key: `skill-practitioner:${skill.id}`,
        name: `${skill.name} practitioner`,
        description: "Evidence-backed repeated practice in this private LyfeOS skill. This is not external certification.",
        evidence: { skillKey: skill.key, skillExperience: skill.experience, distinctCompletedMissions: completedMissionIds.size, reviews },
      });
    }
  }
  return candidates;
}

async function progressionData(userId: number, rank: ProgressionRank) {
  const [completedMissions, evidence, skills, skillEvents, awards] = await Promise.all([
    db.select({ id: quests.id, completedAt: quests.completedAt }).from(quests)
      .where(and(eq(quests.userId, userId), eq(quests.completed, true))),
    db.select({ sourceType: transformationThreadEvidence.sourceType }).from(transformationThreadEvidence)
      .where(eq(transformationThreadEvidence.userId, userId)),
    db.select({ id: skillNodes.id, key: skillNodes.key, name: skillNodes.name, experience: skillNodes.experience }).from(skillNodes)
      .where(eq(skillNodes.userId, userId)),
    db.select({ skillNodeId: skillProgressionEvents.skillNodeId, questId: skillProgressionEvents.questId, sourceType: skillProgressionEvents.sourceType }).from(skillProgressionEvents)
      .where(eq(skillProgressionEvents.userId, userId)),
    db.select().from(progressionBadgeAwards).where(eq(progressionBadgeAwards.userId, userId))
      .orderBy(desc(progressionBadgeAwards.awardedAt)),
  ]);
  const candidates = badgeCandidates({ completedMissions, evidence, skills, skillEvents });
  const definitions = new Map(candidates.map((candidate) => [candidate.key, candidate]));
  const badges: ProgressionBadge[] = awards.flatMap((award) => {
    const definition = definitions.get(award.badgeKey);
    if (!definition) return [];
    return [{ ...definition, evidence: award.evidence as Record<string, unknown>, awardedAt: award.awardedAt }];
  });
  const evidenceBackedSkills = candidates.filter((candidate) => candidate.key.startsWith("skill-practitioner:")).length;
  return { completedMissions, evidence, skills, candidates, badges, evidenceBackedSkills, rank };
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
      practicingSkills: data.skills.filter((skill) => skill.experience > 0).length,
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
      practicingSkills: data.skills.filter((skill) => skill.experience > 0).length,
      evidenceBackedSkills: data.evidenceBackedSkills,
      note: "Signals summarize LyfeOS-recorded practice and reflection. They are not external certification.",
    },
  };
}
