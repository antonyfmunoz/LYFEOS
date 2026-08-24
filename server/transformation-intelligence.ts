import type { PlanningContextSnapshot } from "./context-snapshot";

export const TRANSFORMATION_DIFFICULTY_VERSION = "transformation-difficulty.v1";

export type MissionDifficulty = "D" | "C" | "B" | "A" | "S";

export type DifficultyCalibration = {
  version: typeof TRANSFORMATION_DIFFICULTY_VERSION;
  classifiedDifficulty: MissionDifficulty;
  recommendedDifficulty: MissionDifficulty;
  selectedDifficulty: MissionDifficulty;
  selectedBy: "calibrated" | "user_or_source";
  confidence: "limited" | "developing" | "strong";
  capabilityEvidence: {
    reviewedExperience: number;
    reviewedMissions: number;
    revisionReviews: number;
  };
  capacityAvailability: PlanningContextSnapshot["capacity"]["availability"];
  rationale: string[];
};

export type MissionSupportAction = {
  type: "right_size_scope" | "reschedule" | "revise_evidence" | "practice_prerequisite";
  label: string;
  explanation: string;
};

export type MissionSupportPlan = {
  reasons: Array<"capacity_mismatch" | "repeated_deferral" | "revision_feedback" | "missing_evidence">;
  headline: string;
  actions: MissionSupportAction[];
  disclosure: string;
} | null;

export type PracticeMissionCandidate = {
  id: number;
  title: string;
  difficulty: string | null;
  energyCost: number | null;
  timeCost: number | null;
  attentionCost: number | null;
  skillNodeIds: number[];
  deferralCount: number;
  revisionCount: number;
  evidenceCount: number;
};

const difficultyOrder: MissionDifficulty[] = ["D", "C", "B", "A", "S"];

export function normalizeMissionDifficulty(value: unknown): MissionDifficulty {
  return typeof value === "string" && difficultyOrder.includes(value.toUpperCase() as MissionDifficulty)
    ? value.toUpperCase() as MissionDifficulty
    : "D";
}

function difficultyAt(index: number): MissionDifficulty {
  return difficultyOrder[Math.max(0, Math.min(difficultyOrder.length - 1, index))];
}

function evidenceCeiling(experience: number, reviewedMissions: number): number {
  if (experience >= 500 && reviewedMissions >= 10) return 4;
  if (experience >= 250 && reviewedMissions >= 6) return 3;
  if (experience >= 100 && reviewedMissions >= 3) return 2;
  if (experience >= 25 && reviewedMissions >= 1) return 1;
  return 0;
}

/**
 * Produces an explainable practice recommendation from LyfeOS-recorded
 * evidence and the user's current planning context. It never claims that an
 * in-app rank proves competence or silently overrides a selected difficulty.
 */
export function calibrateMissionDifficulty(input: {
  classifiedDifficulty: unknown;
  explicitlySelected: boolean;
  reviewedExperience: number;
  reviewedMissions: number;
  revisionReviews?: number;
  deferrals?: number;
  context: PlanningContextSnapshot;
}): DifficultyCalibration {
  const classifiedDifficulty = normalizeMissionDifficulty(input.classifiedDifficulty);
  const classifiedIndex = difficultyOrder.indexOf(classifiedDifficulty);
  const reviewedExperience = Math.max(0, Math.floor(input.reviewedExperience || 0));
  const reviewedMissions = Math.max(0, Math.floor(input.reviewedMissions || 0));
  const revisionReviews = Math.max(0, Math.floor(input.revisionReviews || 0));
  const deferrals = Math.max(0, Math.floor(input.deferrals || 0));
  const rationale: string[] = [];

  let ceiling = evidenceCeiling(reviewedExperience, reviewedMissions);
  rationale.push(reviewedMissions > 0
    ? `${reviewedMissions} reviewed mission${reviewedMissions === 1 ? "" : "s"} and ${reviewedExperience} reviewed practice XP inform the competence edge.`
    : "No reviewed mission evidence is linked yet, so the recommendation begins with an introductory practice scope.");

  if (input.context.capacity.availability === "low") {
    ceiling = Math.min(ceiling, 0);
    rationale.push("Current recorded capacity is low, so the suggested scope is deliberately small.");
  } else if (input.context.capacity.availability === "steady") {
    ceiling = Math.min(ceiling, 2);
    rationale.push("Current recorded capacity supports a bounded practice, not the largest available challenge.");
  } else if (input.context.capacity.availability === "unknown") {
    ceiling = Math.min(ceiling, 1);
    rationale.push("Current capacity is unknown, so the recommendation stays conservative until the user supplies more context.");
  }
  if (revisionReviews > 0) {
    ceiling = Math.max(0, ceiling - 1);
    rationale.push("Recent revision feedback lowers the next suggested step until the declared evidence is met.");
  }
  if (deferrals >= 2) {
    ceiling = Math.max(0, ceiling - 1);
    rationale.push("Repeated deferrals are treated as a scope or scheduling signal, not a failure.");
  }

  const recommendedDifficulty = difficultyAt(Math.min(classifiedIndex, ceiling));
  const selectedDifficulty = input.explicitlySelected ? classifiedDifficulty : recommendedDifficulty;
  if (input.explicitlySelected && selectedDifficulty !== recommendedDifficulty) {
    rationale.push(`The selected ${selectedDifficulty} scope is preserved; LyfeOS currently recommends ${recommendedDifficulty} for review.`);
  }

  return {
    version: TRANSFORMATION_DIFFICULTY_VERSION,
    classifiedDifficulty,
    recommendedDifficulty,
    selectedDifficulty,
    selectedBy: input.explicitlySelected ? "user_or_source" : "calibrated",
    confidence: reviewedMissions >= 3 ? "strong" : reviewedMissions >= 1 ? "developing" : "limited",
    capabilityEvidence: { reviewedExperience, reviewedMissions, revisionReviews },
    capacityAvailability: input.context.capacity.availability,
    rationale,
  };
}

export function missionFitsResources(
  mission: Pick<PracticeMissionCandidate, "energyCost" | "timeCost" | "attentionCost">,
  available: { energy: number | null | undefined; time: number | null | undefined; attention: number | null | undefined },
): boolean {
  return (mission.energyCost || 0) <= (available.energy ?? Number.MAX_SAFE_INTEGER)
    && (mission.timeCost || 0) <= (available.time ?? Number.MAX_SAFE_INTEGER)
    && (mission.attentionCost || 0) <= (available.attention ?? Number.MAX_SAFE_INTEGER);
}

/** Selects only missions explicitly linked to the recommended capability. */
export function selectNextPracticeMission(input: {
  skillNodeId: number;
  recommendedDifficulty: MissionDifficulty;
  candidates: PracticeMissionCandidate[];
  available: { energy: number | null | undefined; time: number | null | undefined; attention: number | null | undefined };
}): PracticeMissionCandidate | null {
  const linked = input.candidates.filter((candidate) => candidate.skillNodeIds.includes(input.skillNodeId));
  if (!linked.length) return null;
  const targetIndex = difficultyOrder.indexOf(input.recommendedDifficulty);
  return [...linked].sort((left, right) => {
    const leftFits = missionFitsResources(left, input.available);
    const rightFits = missionFitsResources(right, input.available);
    if (leftFits !== rightFits) return leftFits ? -1 : 1;
    const leftDistance = Math.abs(difficultyOrder.indexOf(normalizeMissionDifficulty(left.difficulty)) - targetIndex);
    const rightDistance = Math.abs(difficultyOrder.indexOf(normalizeMissionDifficulty(right.difficulty)) - targetIndex);
    if (leftDistance !== rightDistance) return leftDistance - rightDistance;
    const leftFriction = left.deferralCount + left.revisionCount;
    const rightFriction = right.deferralCount + right.revisionCount;
    return leftFriction - rightFriction || left.id - right.id;
  })[0];
}

export function buildMissionSupportPlan(input: {
  fitsCurrentCapacity: boolean;
  deferralCount: number;
  revisionCount: number;
  evidenceRequired: number;
  evidenceRecorded: number;
}): MissionSupportPlan {
  const reasons: NonNullable<MissionSupportPlan>["reasons"] = [];
  const actions: MissionSupportAction[] = [];
  if (!input.fitsCurrentCapacity) {
    reasons.push("capacity_mismatch");
    actions.push({ type: "right_size_scope", label: "Reduce the scope", explanation: "Keep the intended practice but make the next observable finish line smaller." });
    actions.push({ type: "reschedule", label: "Choose a better time", explanation: "Move the mission without treating the capacity mismatch as failure." });
  }
  if (input.deferralCount >= 2) {
    reasons.push("repeated_deferral");
    if (!actions.some((action) => action.type === "right_size_scope")) {
      actions.push({ type: "right_size_scope", label: "Right-size the mission", explanation: "Repeated deferrals suggest the current scope, timing, or support may need to change." });
    }
    if (!actions.some((action) => action.type === "practice_prerequisite")) {
      actions.push({ type: "practice_prerequisite", label: "Add a prerequisite", explanation: "Create or link a smaller preparation mission if another capability or resource is missing." });
    }
  }
  if (input.revisionCount > 0) {
    reasons.push("revision_feedback");
    actions.push({ type: "revise_evidence", label: "Use the review feedback", explanation: "Revise the output or evidence plan before repeating the same attempt." });
  }
  if (input.evidenceRequired > input.evidenceRecorded) {
    reasons.push("missing_evidence");
    if (!actions.some((action) => action.type === "revise_evidence")) {
      actions.push({ type: "revise_evidence", label: "Complete the proof plan", explanation: "Record the declared evidence before asking for capability progression." });
    }
  }
  if (!reasons.length) return null;
  return {
    reasons,
    headline: reasons.includes("revision_feedback")
      ? "Review feedback shows the next correction."
      : reasons.includes("repeated_deferral")
        ? "This practice needs a smaller step or better support."
        : reasons.includes("capacity_mismatch")
          ? "The current mission exceeds the capacity you recorded."
          : "The mission still needs its declared evidence.",
    actions,
    disclosure: "These are explainable planning options. LyfeOS does not change the mission, infer competence, or penalize the user without explicit confirmation.",
  };
}
