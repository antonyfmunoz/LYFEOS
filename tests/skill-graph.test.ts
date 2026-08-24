import { describe, expect, it } from "vitest";
import { allocateSkillExperience, buildSkillGraph, recommendNextSkill } from "../server/skill-graph";

const primary = {
  id: 1,
  key: "primary",
  name: "Sales",
  description: "Practice sales.",
  kind: "primary",
  experience: 30,
  level: 2,
  unlockRequirements: [],
  masteryRequirements: { minExperience: 100, minCompletedMissions: 3, minReviews: 2 },
};

describe("LyfeOS skill graph", () => {
  it("keeps a dependent branch locked until its visible prerequisite is met", () => {
    const graph = buildSkillGraph({
      skills: [primary, {
        ...primary,
        id: 2,
        key: "supporting",
        name: "Negotiation",
        experience: 0,
        level: 1,
        unlockRequirements: [{ skillKey: "primary", minExperience: 40 }],
      }],
      completedMissionCountBySkill: new Map(),
      reviewCount: 0,
    });
    expect(graph[1].status).toBe("locked");
    expect(graph[1].unmetRequirements).toContain("Sales: 30/40 skill XP");
  });

  it("marks mastery only after XP, repeated missions, and reviews are all recorded", () => {
    const graph = buildSkillGraph({
      skills: [{ ...primary, experience: 120 }],
      completedMissionCountBySkill: new Map([[1, 3]]),
      reviewCount: 2,
    });
    expect(graph[0].status).toBe("mastered");
  });

  it("carries reviewed capability history into a new Thread without carrying its mission count", () => {
    const graph = buildSkillGraph({
      skills: [{
        ...primary,
        experience: 0,
        level: 1,
        recordedExperience: 120,
        recordedLevel: 2,
      }],
      completedMissionCountBySkill: new Map(),
      reviewCount: 0,
    });
    expect(graph[0].experience).toBe(120);
    expect(graph[0].threadExperience).toBe(0);
    expect(graph[0].status).toBe("unlocked");
  });

  it("recommends an available skill rather than a locked branch", () => {
    const graph = buildSkillGraph({
      skills: [primary, {
        ...primary,
        id: 2,
        key: "locked",
        name: "Leadership",
        experience: 0,
        level: 1,
        unlockRequirements: [{ skillKey: "primary", minExperience: 100 }],
      }],
      completedMissionCountBySkill: new Map(),
      reviewCount: 0,
    });
    expect(recommendNextSkill(graph)?.key).toBe("primary");
  });

  it("splits earned mission XP without inflating total skill progression", () => {
    const allocations = allocateSkillExperience(31, [8, 9, 10]);
    expect(allocations).toEqual([
      { skillNodeId: 8, experienceAmount: 11 },
      { skillNodeId: 9, experienceAmount: 10 },
      { skillNodeId: 10, experienceAmount: 10 },
    ]);
    expect(allocations.reduce((total, allocation) => total + allocation.experienceAmount, 0)).toBe(31);
  });
});
