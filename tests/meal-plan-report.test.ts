import { describe, expect, it } from "vitest";
import { summarizeMealPlanActual } from "../server/meal-plan-report";

describe("meal plan versus diary report", () => {
  it("keeps plan decisions separate from linked and other factual diary records", () => {
    const report = summarizeMealPlanActual("2026-08-20", "2026-08-21", [
      { scheduledDate: "2026-08-20", status: "logged", loggedDiaryEntryIds: [11, 12] },
      { scheduledDate: "2026-08-20", status: "skipped", loggedDiaryEntryIds: [] },
      { scheduledDate: "2026-08-21", status: "planned", loggedDiaryEntryIds: [] },
    ], [
      { id: 11, date: "2026-08-20" }, { id: 12, date: "2026-08-20" }, { id: 90, date: "2026-08-20" },
    ]);
    expect(report.days[0]).toMatchObject({ plannedIntents: 2, confirmedPlanEntries: 1, skippedPlanEntries: 1, linkedDiaryRecords: 2, otherDiaryRecords: 1 });
    expect(report.days[1]).toMatchObject({ plannedIntents: 1, stillPlanned: 1 });
    expect(report.missingLinkedDiaryRecords).toBe(0);
  });

  it("surfaces missing linked evidence without changing the plan state", () => {
    const report = summarizeMealPlanActual("2026-08-20", "2026-08-20", [{ scheduledDate: "2026-08-20", status: "logged", loggedDiaryEntryIds: [44] }], []);
    expect(report.totals.confirmedPlanEntries).toBe(1);
    expect(report.missingLinkedDiaryRecords).toBe(1);
  });
});
