import { isCalendarDate } from "@shared/calendar";

const GOOGLE_CALENDAR_SYNC_KEY = "googleCalendarSyncV1";
const GOOGLE_CALENDAR_ID = "primary";
const MAX_PROVIDER_TOKEN_LENGTH = 4096;

export interface GoogleCalendarSyncState {
  version: 1;
  calendarId: "primary";
  mode: "full" | "incremental";
  syncToken?: string;
  pageToken?: string;
  fullSyncTimeMin?: string;
  startedAt: string;
}

export interface GoogleCalendarListRequest {
  calendarId: "primary";
  maxResults: 250;
  singleEvents: true;
  showDeleted: true;
  pageToken?: string;
  syncToken?: string;
  timeMin?: string;
  orderBy?: "startTime";
}

export interface GoogleCalendarListPage<T> {
  items: T[];
  nextPageToken?: string | null;
  nextSyncToken?: string | null;
}

export interface GoogleCalendarSyncBatch<T> {
  events: T[];
  state: GoogleCalendarSyncState;
  complete: boolean;
  pages: number;
  mode: "full" | "incremental";
  resetFromExpiredToken: boolean;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function validToken(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= MAX_PROVIDER_TOKEN_LENGTH;
}

function validIsoDateTime(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64 && Number.isFinite(Date.parse(value));
}

function isTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 1 || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function parseGoogleCalendarDateTime(value: unknown, explicitTimeZone?: unknown): { date: string; time: string } | null {
  if (typeof value !== "string") return null;
  if (isCalendarDate(value)) return { date: value, time: "00:00" };
  const match = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?$/.exec(value);
  if (!match || !isCalendarDate(match[1]) || (!match[4] && !isTimeZone(explicitTimeZone))) return null;
  return { date: match[1], time: `${match[2]}:${match[3]}` };
}

export function readGoogleCalendarSyncState(settings: unknown): GoogleCalendarSyncState | null {
  const candidate = record(settings)[GOOGLE_CALENDAR_SYNC_KEY];
  const value = record(candidate);
  if (value.version !== 1 || value.calendarId !== GOOGLE_CALENDAR_ID || (value.mode !== "full" && value.mode !== "incremental") || !validIsoDateTime(value.startedAt)) return null;
  if (value.mode === "full" && !validIsoDateTime(value.fullSyncTimeMin)) return null;
  if (value.mode === "incremental" && !validToken(value.syncToken)) return null;
  if (value.pageToken !== undefined && !validToken(value.pageToken)) return null;
  return {
    version: 1,
    calendarId: GOOGLE_CALENDAR_ID,
    mode: value.mode,
    ...(value.mode === "full" ? { fullSyncTimeMin: value.fullSyncTimeMin as string } : { syncToken: value.syncToken as string }),
    ...(validToken(value.pageToken) ? { pageToken: value.pageToken } : {}),
    startedAt: value.startedAt,
  };
}

export function writeGoogleCalendarSyncState(settings: unknown, state: GoogleCalendarSyncState | null): Record<string, unknown> {
  const next = { ...record(settings) };
  if (state) next[GOOGLE_CALENDAR_SYNC_KEY] = state;
  else delete next[GOOGLE_CALENDAR_SYNC_KEY];
  return next;
}

export function sanitizeIntegrationSettingsForExport(settings: unknown): Record<string, unknown> {
  return writeGoogleCalendarSyncState(settings, null);
}

function newFullSyncState(now: Date, lookbackDays: number): GoogleCalendarSyncState {
  return {
    version: 1,
    calendarId: GOOGLE_CALENDAR_ID,
    mode: "full",
    fullSyncTimeMin: new Date(now.getTime() - lookbackDays * 86_400_000).toISOString(),
    startedAt: now.toISOString(),
  };
}

function shouldResetContinuation(error: unknown, state: GoogleCalendarSyncState): boolean {
  const value = record(error);
  const response = record(value.response);
  const status = Number(response.status ?? value.code);
  return (state.mode === "incremental" && status === 410) || (Boolean(state.pageToken) && (status === 400 || status === 410));
}

export async function fetchGoogleCalendarSyncBatch<T>(input: {
  priorState: GoogleCalendarSyncState | null;
  listPage: (request: GoogleCalendarListRequest) => Promise<GoogleCalendarListPage<T>>;
  now?: Date;
  lookbackDays?: number;
  maxPages?: number;
}): Promise<GoogleCalendarSyncBatch<T>> {
  const now = input.now ?? new Date();
  const lookbackDays = input.lookbackDays ?? 365;
  const maxPages = input.maxPages ?? 8;
  if (!Number.isInteger(lookbackDays) || lookbackDays < 1 || lookbackDays > 3650) throw new Error("Google Calendar lookback must be between 1 and 3650 days.");
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 50) throw new Error("Google Calendar page budget must be between 1 and 50.");

  let state = input.priorState ?? newFullSyncState(now, lookbackDays);
  let resetFromExpiredToken = false;
  let pages = 0;
  let events: T[] = [];

  while (pages < maxPages) {
    const request: GoogleCalendarListRequest = state.mode === "incremental"
      ? {
          calendarId: GOOGLE_CALENDAR_ID,
          maxResults: 250,
          singleEvents: true,
          showDeleted: true,
          syncToken: state.syncToken!,
          ...(state.pageToken ? { pageToken: state.pageToken } : {}),
        }
      : {
          calendarId: GOOGLE_CALENDAR_ID,
          maxResults: 250,
          singleEvents: true,
          showDeleted: true,
          timeMin: state.fullSyncTimeMin!,
          orderBy: "startTime",
          ...(state.pageToken ? { pageToken: state.pageToken } : {}),
        };

    let page: GoogleCalendarListPage<T>;
    try {
      page = await input.listPage(request);
    } catch (error) {
      if (!resetFromExpiredToken && shouldResetContinuation(error, state)) {
        state = newFullSyncState(now, lookbackDays);
        events = [];
        resetFromExpiredToken = true;
        continue;
      }
      throw error;
    }

    pages += 1;
    events.push(...page.items);
    if (validToken(page.nextPageToken)) {
      state = { ...state, pageToken: page.nextPageToken };
      if (pages === maxPages) {
        return { events, state, complete: false, pages, mode: state.mode, resetFromExpiredToken };
      }
      continue;
    }
    if (!validToken(page.nextSyncToken)) throw new Error("Google Calendar did not return a continuation or sync token.");
    state = {
      version: 1,
      calendarId: GOOGLE_CALENDAR_ID,
      mode: "incremental",
      syncToken: page.nextSyncToken,
      startedAt: now.toISOString(),
    };
    return { events, state, complete: true, pages, mode: "incremental", resetFromExpiredToken };
  }

  return { events, state, complete: false, pages, mode: state.mode, resetFromExpiredToken };
}
