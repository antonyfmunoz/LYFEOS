import { describe, expect, it } from "vitest";
import { buildPlanningContextSnapshot } from "../server/context-snapshot";

describe("planning context snapshot", () => {
  it("uses available capacity and records an explainable low-capacity state", () => {
    const snapshot = buildPlanningContextSnapshot({
      profile: { desiredTrait: "Sales", weeklyCapacity: { hours: 8, cap: "No evenings" }, lockedHabit: "Sleep routine" } as any,
      stats: {
        energyPointsCurrent: 20, energyPointsMax: 100,
        timeTokensCurrent: 40, timeTokensMax: 100,
        attentionTokensCurrent: 30, attentionTokensMax: 100,
      } as any,
      dailyLog: { mentalState: 4, physicalState: 5, emotionalState: 6 } as any,
      capturedAt: new Date("2026-08-14T12:00:00.000Z"),
    });

    expect(snapshot).toMatchObject({
      capturedAt: "2026-08-14T12:00:00.000Z",
      focus: "Sales",
      declaredWeeklyHours: 8,
      capacity: { energy: 20, time: 40, attention: 30, availability: "low" },
      dailyState: { mental: 4, physical: 5, emotional: 6 },
      constraints: ["No evenings", "Sleep routine"],
    });
  });

  it("does not invent a capacity or daily-state signal when the inputs are absent", () => {
    const snapshot = buildPlanningContextSnapshot({
      profile: {} as any,
      stats: {} as any,
      dailyLog: {} as any,
    });

    expect(snapshot.capacity.availability).toBe("unknown");
    expect(snapshot.dailyState).toBeNull();
  });
});
