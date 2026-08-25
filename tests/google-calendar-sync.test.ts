import { describe, expect, it } from "vitest";
import {
  fetchGoogleCalendarSyncBatch,
  parseGoogleCalendarDateTime,
  readGoogleCalendarSyncState,
  sanitizeIntegrationSettingsForExport,
  writeGoogleCalendarSyncState,
  type GoogleCalendarListRequest,
  type GoogleCalendarSyncState,
} from "../server/google-calendar-sync";

const startedAt = "2026-08-25T12:00:00.000Z";

describe("Google Calendar incremental synchronization protocol", () => {
  it("preserves provider wall date and time instead of applying the server timezone", () => {
    expect(parseGoogleCalendarDateTime("2026-08-25T23:45:00-07:00")).toEqual({ date: "2026-08-25", time: "23:45" });
    expect(parseGoogleCalendarDateTime("2026-08-26T06:45:00Z")).toEqual({ date: "2026-08-26", time: "06:45" });
    expect(parseGoogleCalendarDateTime("2026-08-25T23:45:00", "America/Los_Angeles")).toEqual({ date: "2026-08-25", time: "23:45" });
    expect(parseGoogleCalendarDateTime("2026-08-25T23:45:00")).toBeNull();
    expect(parseGoogleCalendarDateTime("2028-02-29")).toEqual({ date: "2028-02-29", time: "00:00" });
    expect(parseGoogleCalendarDateTime("2026-02-30T10:00:00Z")).toBeNull();
    expect(parseGoogleCalendarDateTime("not-a-date")).toBeNull();
  });

  it("resumes a bounded initial sync with identical filters and stores the terminal sync token", async () => {
    const calls: GoogleCalendarListRequest[] = [];
    const listPage = async (request: GoogleCalendarListRequest) => {
      calls.push(request);
      if (!request.pageToken) return { items: [{ id: "a" }], nextPageToken: "page-2" };
      if (request.pageToken === "page-2") return { items: [{ id: "b" }], nextPageToken: "page-3" };
      return { items: [{ id: "c" }], nextSyncToken: "sync-1" };
    };

    const first = await fetchGoogleCalendarSyncBatch({
      priorState: null,
      listPage,
      now: new Date(startedAt),
      maxPages: 2,
    });
    expect(first.events.map((event) => event.id)).toEqual(["a", "b"]);
    expect(first).toMatchObject({ complete: false, pages: 2, resetFromExpiredToken: false });
    expect(first.state).toMatchObject({ mode: "full", pageToken: "page-3", startedAt });
    expect(calls[0]).toMatchObject({ calendarId: "primary", maxResults: 250, singleEvents: true, showDeleted: true, orderBy: "startTime" });
    expect(calls[0].timeMin).toBe(calls[1].timeMin);
    expect(calls[0].syncToken).toBeUndefined();

    const second = await fetchGoogleCalendarSyncBatch({
      priorState: first.state,
      listPage,
      now: new Date("2026-08-26T12:00:00.000Z"),
    });
    expect(second.events.map((event) => event.id)).toEqual(["c"]);
    expect(second.complete).toBe(true);
    expect(second.state).toMatchObject({ mode: "incremental", syncToken: "sync-1" });
    expect(calls[2]).toMatchObject({ pageToken: "page-3", timeMin: first.state.fullSyncTimeMin, orderBy: "startTime" });
  });

  it("paginates incremental changes without forbidden time or order filters", async () => {
    const requests: GoogleCalendarListRequest[] = [];
    const priorState: GoogleCalendarSyncState = { version: 1, calendarId: "primary", mode: "incremental", syncToken: "sync-old", startedAt };
    const result = await fetchGoogleCalendarSyncBatch({
      priorState,
      listPage: async (request) => {
        requests.push(request);
        return request.pageToken
          ? { items: [{ id: "change-2" }], nextSyncToken: "sync-new" }
          : { items: [{ id: "change-1" }], nextPageToken: "changes-page-2" };
      },
    });
    expect(result.events.map((event) => event.id)).toEqual(["change-1", "change-2"]);
    expect(result.state).toMatchObject({ mode: "incremental", syncToken: "sync-new" });
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.syncToken).toBe("sync-old");
      expect(request.timeMin).toBeUndefined();
      expect(request.orderBy).toBeUndefined();
    }
    expect(requests[1].pageToken).toBe("changes-page-2");
  });

  it("discards an invalid incremental page set and restarts once after provider 410", async () => {
    const requests: GoogleCalendarListRequest[] = [];
    const priorState: GoogleCalendarSyncState = { version: 1, calendarId: "primary", mode: "incremental", syncToken: "expired", startedAt };
    const result = await fetchGoogleCalendarSyncBatch({
      priorState,
      now: new Date(startedAt),
      listPage: async (request) => {
        requests.push(request);
        if (request.syncToken && !request.pageToken) return { items: [{ id: "discard-me" }], nextPageToken: "expired-page-2" };
        if (request.syncToken) throw { response: { status: 410 } };
        return { items: [{ id: "full-sync-event" }], nextSyncToken: "fresh" };
      },
    });
    expect(result.events).toEqual([{ id: "full-sync-event" }]);
    expect(result.resetFromExpiredToken).toBe(true);
    expect(result.state).toMatchObject({ mode: "incremental", syncToken: "fresh" });
    expect(requests).toHaveLength(3);
    expect(requests[2].syncToken).toBeUndefined();
    expect(requests[2].timeMin).toEqual(expect.any(String));
  });

  it("self-heals an expired stored full-sync page token", async () => {
    const priorState: GoogleCalendarSyncState = {
      version: 1,
      calendarId: "primary",
      mode: "full",
      fullSyncTimeMin: "2025-08-25T12:00:00.000Z",
      pageToken: "expired-full-page",
      startedAt,
    };
    let calls = 0;
    const result = await fetchGoogleCalendarSyncBatch({
      priorState,
      now: new Date(startedAt),
      listPage: async (request) => {
        calls += 1;
        if (request.pageToken) throw { code: 400 };
        return { items: [{ id: "fresh-full-event" }], nextSyncToken: "fresh-after-page-reset" };
      },
    });
    expect(calls).toBe(2);
    expect(result.events).toEqual([{ id: "fresh-full-event" }]);
    expect(result.resetFromExpiredToken).toBe(true);
    expect(result.state).toMatchObject({ mode: "incremental", syncToken: "fresh-after-page-reset" });
  });

  it("validates stored state and strips opaque provider cursors from account export", () => {
    const state: GoogleCalendarSyncState = { version: 1, calendarId: "primary", mode: "incremental", syncToken: "secret-sync-token", pageToken: "secret-page-token", startedAt };
    const settings = writeGoogleCalendarSyncState({ theme: "dark" }, state);
    expect(readGoogleCalendarSyncState(settings)).toEqual(state);
    expect(readGoogleCalendarSyncState({ googleCalendarSyncV1: { ...state, syncToken: "" } })).toBeNull();
    expect(sanitizeIntegrationSettingsForExport(settings)).toEqual({ theme: "dark" });
  });
});
