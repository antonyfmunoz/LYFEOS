export type MissionUnlockContribution = {
  skillNodeId: number;
  skillName: string;
  experienceAmount: number;
  capabilityId?: number | null;
  capabilityName?: string | null;
};

export type MissionUnlockResult = {
  version: "mission-reviewed-progression.v1";
  state: "not_configured" | "declared" | "applied";
  condition: "mission_completed_and_evidence_meets_rubric";
  reviewedSkillExperience: Array<{
    skillNodeId: number;
    skillName: string;
    experienceAmount: number;
    capabilityId: number | null;
    capabilityName: string | null;
  }>;
  totalReviewedSkillExperience: number;
  reversible: true;
  certificationGranted: false;
  authorityGranted: false;
  disclosure: string;
};

/**
 * Describes only progression the canonical Mission lifecycle can actually
 * apply. It deliberately excludes free-form promises, feature unlocks,
 * certification and authority.
 */
export function buildMissionUnlockResult(
  contributions: MissionUnlockContribution[],
  applied = false,
): MissionUnlockResult {
  const reviewedSkillExperience = contributions
    .filter((contribution) => Number.isInteger(contribution.experienceAmount) && contribution.experienceAmount > 0)
    .map((contribution) => ({
      skillNodeId: contribution.skillNodeId,
      skillName: contribution.skillName,
      experienceAmount: contribution.experienceAmount,
      capabilityId: contribution.capabilityId ?? null,
      capabilityName: contribution.capabilityName ?? null,
    }));
  const totalReviewedSkillExperience = reviewedSkillExperience.reduce(
    (total, contribution) => total + contribution.experienceAmount,
    0,
  );

  return {
    version: "mission-reviewed-progression.v1",
    state: totalReviewedSkillExperience === 0 ? "not_configured" : applied ? "applied" : "declared",
    condition: "mission_completed_and_evidence_meets_rubric",
    reviewedSkillExperience,
    totalReviewedSkillExperience,
    reversible: true,
    certificationGranted: false,
    authorityGranted: false,
    disclosure: totalReviewedSkillExperience === 0
      ? "No reviewed skill XP is configured for this Mission. Completion may still count as activity, but it does not establish capability progress."
      : "Reviewed skill XP applies only after completion and a positive evidence review, and is reversed if that supporting result is reopened. It does not grant certification or authority.",
  };
}
