import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCalendarMissionWindow, calendarDateDistance, calendarVisibleRange, isCalendarDate, parseCalendarDurationMinutes, shiftCalendarDate } from "../shared/calendar";

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
    expect(quests).toContain("const allQuests = applySearchAndFilters(calendarQuests.filter(q => !q.deletedAt))");
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

  it("derives bounded visible ranges for every Calendar zoom", () => {
    expect(calendarVisibleRange("day", "2026-08-25")).toEqual({ from: "2026-08-25", to: "2026-08-25", days: 1 });
    expect(calendarVisibleRange("week", "2026-08-23")).toEqual({ from: "2026-08-23", to: "2026-08-29", days: 7 });
    expect(calendarVisibleRange("month", "2026-08-25")).toEqual({ from: "2026-07-26", to: "2026-09-05", days: 42 });
    expect(calendarVisibleRange("year", "2028-06-01")).toEqual({ from: "2028-01-01", to: "2028-12-31", days: 366 });
    expect(calendarDateDistance("2026-08-26", "2026-08-25")).toBeNull();
    expect(calendarVisibleRange("month", "2026-02-30")).toBeNull();
  });

  it("reconciles provider cancellation and keeps imported missions after credential revocation", () => {
    const google = source("server/routes/google.ts");
    const syncAdapter = source("server/google-calendar-sync.ts");
    const profile = source("client/src/pages/ProfilePage.tsx");
    expect((google.match(/showDeleted: true/g) || []).length + (syncAdapter.match(/showDeleted: true/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(google).toContain('updates: { missionStatus: "cancelled" }');
    expect(google).toContain("cancelled++");
    expect(google).toContain('status: "revoked"');
    expect(google).toContain("accessToken: null");
    expect(google).toContain("refreshToken: null");
    expect(google).toContain("retainedMissionCount");
    expect(google).not.toContain("storage.deleteIntegration(googleIntegration.id)");
    expect(profile).toContain("Disconnected — imported LyfeOS missions retained");
    expect(profile).toContain("description: result.message");
    expect(source("client/src/pages/QuestsPage.tsx")).not.toContain("const result = await res.json()");
  });

  it("uses bounded resumable Google pagination without exposing provider cursors", () => {
    const google = source("server/routes/google.ts");
    const adapter = source("server/google-calendar-sync.ts");
    const profile = source("server/routes/profile.ts");
    const client = source("client/src/pages/QuestsPage.tsx");
    const syncRoute = google.slice(google.indexOf('app.post("/api/google/calendar/sync"'), google.indexOf('app.post("/api/google/calendar/push"'));
    expect(syncRoute).toContain("fetchGoogleCalendarSyncBatch");
    expect(syncRoute).toContain("pg_try_advisory_lock");
    expect(syncRoute).toContain("maxPages: 8");
    expect(syncRoute).toContain("lastSyncedAt: new Date()");
    expect(syncRoute).toContain('res.setHeader("Cache-Control", "private, no-store")');
    expect(syncRoute).not.toContain("fourWeeksLater");
    expect(syncRoute).not.toContain("timeMax:");
    expect(adapter).toContain('mode: "incremental"');
    expect(adapter).toContain("resetFromExpiredToken");
    expect(adapter).toContain("nextPageToken");
    expect(adapter).toContain("nextSyncToken");
    expect(profile).toContain("sanitizeIntegrationSettingsForExport");
    expect(client).toContain("Calendar sync progress saved");
  });

  it("loads Calendar from an owner-scoped, indexed, cursor-paginated mission window", () => {
    const routes = source("server/routes/quests.ts");
    const page = source("client/src/pages/QuestsPage.tsx");
    const context = source("client/src/lib/context.tsx");
    const migration = source("migrations/0112_quests_calendar_window.sql");
    const release = source("server/release-migrate.ts");
    const workflow = source(".github/workflows/verify.yml");
    expect(routes).toContain('app.get("/api/users/:userId/calendar-missions", isOwner');
    expect(routes).toContain("days !== null && days <= 370");
    expect(routes).toContain("parsed.data.limit + 1");
    expect(routes).toContain("if (!cursor)");
    expect(routes).toContain("convertTodoIdeasToMissions");
    expect(routes).toContain("encodeCalendarCursor");
    expect(routes).toContain("(${questsTable.startDate}, ${questsTable.id}) > (${cursor.startDate}, ${cursor.id})");
    expect(routes).toContain("eq(questsTable.userId, userId)");
    expect(routes).toContain("isNull(questsTable.deletedAt)");
    expect(routes).toContain('res.setHeader("Cache-Control", "private, no-store")');
    expect(page).toContain('queryKey: ["calendar-missions"');
    expect(page).toContain("calendarVisibleRange(calendarZoom, anchor)");
    expect(page).toContain("calendarMissionQuery.fetchNextPage()");
    expect(page).toContain("applySearchAndFilters(calendarQuests.filter");
    expect(context).toContain('window.location.pathname === "/calendar"');
    expect(context).toContain('queryKey: ["calendar-missions"]');
    expect(migration).toContain('WHERE "deleted_at" IS NULL AND "start_date" IS NOT NULL');
    expect(release).toContain('id: "0112_quests_calendar_window"');
    expect(workflow).toContain("tests/api-calendar-window.test.ts");
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
    expect(quests).toContain("aria-label={`Edit ${q.missionStatus === 'cancelled' ? 'cancelled ' : ''}mission ${q.title}");
    expect(quests).toContain('aria-label="Close selected date details"');
    expect(quests).toContain("event.target !== event.currentTarget");
    expect(quests).toContain("focus-visible:ring-2");
  });
});
