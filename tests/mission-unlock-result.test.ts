import { describe, expect, it } from "vitest";
import { buildMissionUnlockResult } from "../server/mission-unlock-result";

describe("Mission unlock result", () => {
  const contribution = {
    skillNodeId: 12,
    skillName: "Discovery conversations",
    experienceAmount: 25,
    capabilityId: 4,
    capabilityName: "Communication",
  };

  it("fails closed when no reviewed capability mapping exists", () => {
    const result = buildMissionUnlockResult([]);
    expect(result.state).toBe("not_configured");
    expect(result.totalReviewedSkillExperience).toBe(0);
    expect(result.disclosure).toContain("does not establish capability progress");
  });

  it("declares only exact, reversible reviewed progression", () => {
    const result = buildMissionUnlockResult([contribution]);
    expect(result.state).toBe("declared");
    expect(result.condition).toBe("mission_completed_and_evidence_meets_rubric");
    expect(result.reviewedSkillExperience).toEqual([contribution]);
    expect(result.totalReviewedSkillExperience).toBe(25);
    expect(result.reversible).toBe(true);
    expect(result.certificationGranted).toBe(false);
    expect(result.authorityGranted).toBe(false);
  });

  it("labels the same declared result applied without rewriting its value", () => {
    const result = buildMissionUnlockResult([contribution], true);
    expect(result.state).toBe("applied");
    expect(result.reviewedSkillExperience[0].experienceAmount).toBe(25);
  });
});
