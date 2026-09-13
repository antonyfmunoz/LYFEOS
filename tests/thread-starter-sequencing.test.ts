import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("onboarding Thread starter sequencing", () => {
  it("uses declared onboarding context and assigns the bounded first sequence to local calendar days", () => {
    const routes = source("server/routes/transformation-threads.ts");
    expect(routes).toContain("function localCalendarDate");
    expect(routes).toContain("const visionMetric = cleanText(profile?.vision90DayMetric);");
    expect(routes).toContain("const declaredSkill = firstDeclaredItem(profile?.skillsToAcquire);");
    expect(routes).toContain("dayOffset: 0");
    expect(routes).toContain("dayOffset: 1");
    expect(routes).toContain("dayOffset: 2");
    expect(routes).toContain("startDate: scheduledDate, endDate: scheduledDate, dueDate: scheduledDate");
    expect(routes).toContain("localCalendarDate(sourceSnapshot.timeZone, dayOffset)");
  });

  it("makes the generated sequence legible before activation without adding another dashboard planner", () => {
    const panel = source("client/src/components/dashboard/TransformationThreadPanel.tsx");
    expect(panel).toContain("mission.dayOffset === 0 ? \"Today\"");
    expect(panel).toContain("Day after tomorrow");
    expect(panel).toContain('data-testid="transformation-thread-panel"');
  });

  it("repairs only a recent untouched legacy starter set, never a member-edited schedule", () => {
    const routes = source("server/routes/transformation-threads.ts");
    const quests = source("server/routes/quests.ts");
    expect(routes).toContain("export async function reconcileLegacyThreadStarterSchedule");
    expect(routes).toContain("const LEGACY_STARTER_REPAIR_WINDOW_MS = 7 * 24 * 60 * 60 * 1000");
    expect(routes).toContain("starters.length === 3");
    expect(routes).toContain("!mission.completed && !mission.startDate && !mission.endDate && !mission.deletedAt");
    expect(routes).toContain("isNull(quests.startDate)");
    expect(quests).toContain("reconcileLegacyThreadStarterSchedule(userId)");
  });
});
