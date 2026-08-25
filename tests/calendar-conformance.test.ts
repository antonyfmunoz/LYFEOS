import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCalendarMissionWindow, isCalendarDate, parseCalendarDurationMinutes, shiftCalendarDate } from "../shared/calendar";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("canonical mission Calendar", () => {
  it("validates local calendar dates and duration expressions", () => {
    expect(isCalendarDate("2028-02-29")).toBe(true);
    expect(isCalendarDate("2027-02-29")).toBe(false);
    expect(parseCalendarDurationMinutes("1h 30m")).toBe(90);
    expect(parseCalendarDurationMinutes("1.5 hours")).toBe(90);
    expect(parseCalendarDurationMinutes("45m")).toBe(45);
    expect(parseCalendarDurationMinutes("forever")).toBeNull();
  });

  it("builds a complete mission window across midnight without timezone drift", () => {
    expect(buildCalendarMissionWindow("2026-12-31", "23:30", "90m")).toEqual({
      startDate: "2026-12-31", startTime: "23:30", endDate: "2027-01-01", endTime: "01:00", durationMinutes: 90,
    });
    expect(shiftCalendarDate("2028-02-28", 1)).toBe("2028-02-29");
    expect(shiftCalendarDate("not-a-date", 1)).toBeNull();
  });

  it("exposes one protected Calendar URL backed by the Missions page", () => {
    const app = source("client/src/App.tsx");
    const quests = source("client/src/pages/QuestsPage.tsx");
    const layout = source("client/src/components/layout/RootLayout.tsx");
    expect(app).toContain('<Route path="/calendar">');
    expect(app).toMatch(/<Route path="\/calendar">[\s\S]*?<ProtectedRoute>[\s\S]*?<QuestsPage \/>/);
    expect(quests).toContain("window.location.pathname === '/calendar' ? 'calendar' : 'board'");
    expect(layout).toContain("'calendar': 'missions'");
  });

  it("renders Calendar directly from canonical mission records and discloses that authority", () => {
    const quests = source("client/src/pages/QuestsPage.tsx");
    expect(quests).toContain("const allQuests = applySearchAndFilters((quests || []).filter(q => !q.deletedAt))");
    expect(quests).toContain("if (q.startDate)");
    expect(quests).toContain("Calendar is a scheduling view of your canonical Missions");
    expect(quests).not.toContain("/api/calendar-events");
  });

  it("keeps AI scheduling and provider reconciliation inside the mission lifecycle", () => {
    const chat = source("server/replit_integrations/chat/routes.ts");
    const google = source("server/routes/google.ts");
    const clientActions = source("client/src/hooks/use-nova-actions.ts");
    expect(chat).toContain("buildCalendarMissionWindow(input.date, input.startTime, input.duration)");
    expect(chat).toContain("createMissionLifecycle");
    expect(google).toContain("createMissionLifecycle");
    expect(google).toContain("updateMissionLifecycle");
    expect(google).not.toContain("storage.updateQuest");
    expect(clientActions).toContain("'create_calendar_event'");
    expect(clientActions).not.toContain("/api/calendar-events");
  });

  it("normalizes Google's exclusive all-day end date at the provider boundary", () => {
    const google = source("server/routes/google.ts");
    expect(google).toContain("shiftCalendarDate(end.date, -1)");
    expect(google).toContain("shiftCalendarDate(endDate, 1)");
  });

  it("provides keyboard-operable calendar navigation, scheduling, and mission editing", () => {
    const quests = source("client/src/pages/QuestsPage.tsx");
    expect(quests).toContain("const activateCalendarControl = (event: KeyboardEvent<HTMLElement>");
    expect(quests).toContain("event.key !== 'Enter' && event.key !== ' '");
    expect(quests).toContain("aria-label={`Show ${z} calendar`}");
    expect(quests).toContain("aria-label={`Open ${monthName} ${calendarYear} month`}");
    expect(quests).toContain("aria-label={`Select ${cell.date.toLocaleDateString()}");
    expect(quests).toContain("aria-label={`Create mission on ${d.toLocaleDateString()}");
    expect(quests).toContain("aria-label={`Create mission on ${calendarDay.toLocaleDateString()}");
    expect(quests).toContain("aria-label={`Edit mission ${q.title}");
    expect(quests).toContain('aria-label="Close selected date details"');
    expect(quests).toContain("event.target !== event.currentTarget");
    expect(quests).toContain("focus-visible:ring-2");
  });
});
