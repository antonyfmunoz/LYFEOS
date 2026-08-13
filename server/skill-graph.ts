export type SkillUnlockRequirement = {
  skillKey: string;
  minExperience?: number;
  minLevel?: number;
};

export type SkillMasteryRequirements = {
  minExperience?: number;
  minCompletedMissions?: number;
  minReviews?: number;
};

export type SkillGraphSkill = {
  id: number;
  key: string;
  name: string;
  description: string;
  kind: string;
  experience: number;
  level: number;
  unlockRequirements: unknown;
  masteryRequirements: unknown;
};

export type SkillGraphNode = SkillGraphSkill & {
  status: "locked" | "unlocked" | "mastered";
  unlockRequirements: SkillUnlockRequirement[];
  masteryRequirements: Required<SkillMasteryRequirements>;
  completedMissionCount: number;
  unmetRequirements: string[];
};

const DEFAULT_MASTERY_REQUIREMENTS: Required<SkillMasteryRequirements> = {
  minExperience: 100,
  minCompletedMissions: 3,
  minReviews: 2,
};

function positiveInteger(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback;
}

export function parseUnlockRequirements(value: unknown): SkillUnlockRequirement[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const skillKey = typeof record.skillKey === "string" ? record.skillKey.trim() : "";
    if (!skillKey) return [];
    return [{
      skillKey,
      minExperience: positiveInteger(record.minExperience),
      minLevel: positiveInteger(record.minLevel),
    }];
  });
}

export function parseMasteryRequirements(value: unknown): Required<SkillMasteryRequirements> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_MASTERY_REQUIREMENTS;
  const record = value as Record<string, unknown>;
  return {
    minExperience: positiveInteger(record.minExperience, DEFAULT_MASTERY_REQUIREMENTS.minExperience),
    minCompletedMissions: positiveInteger(record.minCompletedMissions, DEFAULT_MASTERY_REQUIREMENTS.minCompletedMissions),
    minReviews: positiveInteger(record.minReviews, DEFAULT_MASTERY_REQUIREMENTS.minReviews),
  };
}

/**
 * Derives a private, explainable progression graph from recorded actions.
 * This does not infer competence or causality; it only reports the user-owned
 * practice and review rules defined on a Thread.
 */
export function buildSkillGraph(input: {
  skills: SkillGraphSkill[];
  completedMissionCountBySkill: Map<number, number>;
  reviewCount: number;
}): SkillGraphNode[] {
  const byKey = new Map(input.skills.map((skill) => [skill.key, skill]));
  return input.skills.map((skill) => {
    const unlockRequirements = parseUnlockRequirements(skill.unlockRequirements);
    const masteryRequirements = parseMasteryRequirements(skill.masteryRequirements);
    const unmetRequirements = unlockRequirements.flatMap((requirement) => {
      const prerequisite = byKey.get(requirement.skillKey);
      if (!prerequisite) return [`Add the missing prerequisite: ${requirement.skillKey}`];
      const unmet: string[] = [];
      if ((requirement.minExperience || 0) > prerequisite.experience) {
        unmet.push(`${prerequisite.name}: ${prerequisite.experience}/${requirement.minExperience} skill XP`);
      }
      if ((requirement.minLevel || 0) > prerequisite.level) {
        unmet.push(`${prerequisite.name}: level ${prerequisite.level}/${requirement.minLevel}`);
      }
      return unmet;
    });
    const completedMissionCount = input.completedMissionCountBySkill.get(skill.id) || 0;
    const isMastered = unmetRequirements.length === 0
      && skill.experience >= masteryRequirements.minExperience
      && completedMissionCount >= masteryRequirements.minCompletedMissions
      && input.reviewCount >= masteryRequirements.minReviews;
    return {
      ...skill,
      status: isMastered ? "mastered" : unmetRequirements.length > 0 ? "locked" : "unlocked",
      unlockRequirements,
      masteryRequirements,
      completedMissionCount,
      unmetRequirements,
    };
  });
}

export function recommendNextSkill(graph: SkillGraphNode[]): SkillGraphNode | null {
  const candidates = graph.filter((node) => node.status === "unlocked");
  if (candidates.length === 0) return null;
  return [...candidates].sort((left, right) => {
    const leftGap = Math.max(0, left.masteryRequirements.minExperience - left.experience);
    const rightGap = Math.max(0, right.masteryRequirements.minExperience - right.experience);
    return rightGap - leftGap || left.experience - right.experience || left.name.localeCompare(right.name);
  })[0];
}

/** Split a mission's earned XP across explicitly selected skills without
 * manufacturing additional progression value. */
export function allocateSkillExperience(totalExperience: number, skillNodeIds: number[]): Array<{ skillNodeId: number; experienceAmount: number }> {
  const ids = Array.from(new Set(skillNodeIds));
  if (ids.length === 0) return [];
  const total = Math.max(ids.length, Math.floor(Math.max(0, totalExperience)));
  const amountPerSkill = Math.floor(total / ids.length);
  const remainder = total % ids.length;
  return ids.map((skillNodeId, index) => ({
    skillNodeId,
    experienceAmount: amountPerSkill + (index < remainder ? 1 : 0),
  }));
}
