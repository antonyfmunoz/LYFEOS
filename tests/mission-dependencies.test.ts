import { describe, expect, it } from "vitest";
import { wouldCreateMissionDependencyCycle } from "../server/mission-dependencies";

describe("mission dependency graph", () => {
  it("rejects self and indirect dependency cycles", () => {
    const edges = [
      { dependentQuestId: 2, prerequisiteQuestId: 1 },
      { dependentQuestId: 3, prerequisiteQuestId: 2 },
    ];
    expect(wouldCreateMissionDependencyCycle(edges, 1, 1)).toBe(true);
    expect(wouldCreateMissionDependencyCycle(edges, 1, 3)).toBe(true);
  });

  it("allows a new prerequisite that does not make a cycle", () => {
    const edges = [{ dependentQuestId: 3, prerequisiteQuestId: 2 }];
    expect(wouldCreateMissionDependencyCycle(edges, 3, 1)).toBe(false);
  });
});
