import { describe, expect, it } from "vitest";
import {
  buildMissionSupportPlan,
  calibrateMissionDifficulty,
  selectNextPracticeMission,
  type PracticeMissionCandidate,
} from "../server/transformation-intelligence";
import type { PlanningContextSnapshot } from "../server/context-snapshot";

function context(availability: PlanningContextSnapshot["capacity"]["availability"]): PlanningContextSnapshot {
  return {
    capturedAt: "2026-08-24T12:00:00.000Z",
    focus: "Sales",
    declaredWeeklyHours: 8,
    capacity: { energy: 80, time: 70, attention: 75, availability },
    dailyState: null,
    constraints: [],
  };
}

const candidate = (input: Partial<PracticeMissionCandidate> & Pick<PracticeMissionCandidate, "id">): PracticeMissionCandidate => ({
  id: input.id,
  title: input.title || `Mission ${input.id}`,
  difficulty: input.difficulty || "D",
  energyCost: input.energyCost ?? 1,
  timeCost: input.timeCost ?? 1,
  attentionCost: input.attentionCost ?? 1,
  skillNodeIds: input.skillNodeIds || [],
  deferralCount: input.deferralCount || 0,
  revisionCount: input.revisionCount || 0,
  evidenceCount: input.evidenceCount || 0,
});

describe("transformation intelligence", () => {
  it("starts conservatively when there is no reviewed evidence", () => {
    const result = calibrateMissionDifficulty({ classifiedDifficulty: "S", explicitlySelected: false, reviewedExperience: 0, reviewedMissions: 0, context: context("high") });
    expect(result.recommendedDifficulty).toBe("D");
    expect(result.selectedDifficulty).toBe("D");
    expect(result.confidence).toBe("limited");
  });

  it("allows recorded practice to raise the competence edge while respecting current capacity", () => {
    const strong = calibrateMissionDifficulty({ classifiedDifficulty: "S", explicitlySelected: false, reviewedExperience: 550, reviewedMissions: 12, context: context("high") });
    const constrained = calibrateMissionDifficulty({ classifiedDifficulty: "S", explicitlySelected: false, reviewedExperience: 550, reviewedMissions: 12, context: context("low") });
    expect(strong.recommendedDifficulty).toBe("S");
    expect(constrained.recommendedDifficulty).toBe("D");
  });

  it("preserves an explicit selection but explains when the recommendation differs", () => {
    const result = calibrateMissionDifficulty({ classifiedDifficulty: "A", explicitlySelected: true, reviewedExperience: 0, reviewedMissions: 0, context: context("steady") });
    expect(result.selectedDifficulty).toBe("A");
    expect(result.recommendedDifficulty).toBe("D");
    expect(result.rationale.join(" ")).toContain("preserved");
  });

  it("never substitutes an unrelated mission for the recommended capability", () => {
    expect(selectNextPracticeMission({ skillNodeId: 9, recommendedDifficulty: "C", available: { energy: 5, time: 5, attention: 5 }, candidates: [candidate({ id: 1, skillNodeIds: [4] })] })).toBeNull();
  });

  it("prefers a capacity-fitting linked mission closest to the calibrated scope", () => {
    const selected = selectNextPracticeMission({
      skillNodeId: 9,
      recommendedDifficulty: "C",
      available: { energy: 3, time: 3, attention: 3 },
      candidates: [
        candidate({ id: 1, difficulty: "C", energyCost: 5, skillNodeIds: [9] }),
        candidate({ id: 2, difficulty: "B", energyCost: 2, skillNodeIds: [9] }),
        candidate({ id: 3, difficulty: "S", energyCost: 2, skillNodeIds: [9] }),
      ],
    });
    expect(selected?.id).toBe(2);
  });

  it("turns revision, evidence, and deferral friction into user-controlled support options", () => {
    const support = buildMissionSupportPlan({ fitsCurrentCapacity: false, deferralCount: 3, revisionCount: 1, evidenceRequired: 2, evidenceRecorded: 0 });
    expect(support?.reasons).toEqual(["capacity_mismatch", "repeated_deferral", "revision_feedback", "missing_evidence"]);
    expect(support?.actions.map((action) => action.type)).toEqual(expect.arrayContaining(["right_size_scope", "reschedule", "revise_evidence", "practice_prerequisite"]));
    expect(support?.disclosure).toContain("does not change the mission");
  });
});
