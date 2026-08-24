import { nutrientKeys } from "./nutrition";

// Legacy short names remain readable while every governed nutrient key is now
// available for explicit user-authored targets.
export const healthTargetKinds = ["weight", "hydration", "energy", "protein", "carbohydrate", "fat", "fiber", "sugar", "sodium", ...nutrientKeys] as const;
export const bodyMeasurementMetrics = ["weight", "body_fat_percent", "waist", "chest", "hips", "custom"] as const;
export const healthSources = ["manual", "professional", "calculated", "provider"] as const;
export const hydrationUnits = { ml: 1, l: 1000, fl_oz: 29.5735, cup: 236.588 } as const;
export type HydrationUnit = keyof typeof hydrationUnits;

export function hydrationToMl(quantity: number, unit: HydrationUnit) {
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Hydration quantity must be positive.");
  const mlPerUnit = hydrationUnits[unit];
  return { volumeMl: Math.round(quantity * mlPerUnit), inputQuantity: quantity, inputUnit: unit, inputMlPerUnit: mlPerUnit };
}

export type FastingTimingWindow = { startedAt: Date; endedAt: Date | null };

/**
 * Summarizes self-reported window timing only. Completed durations are added
 * per record; overlaps remain visible and are never silently deduplicated.
 */
export function fastingTimingSummary(windows: FastingTimingWindow[]) {
  const validCompleted = windows.flatMap((window) => {
    if (!window.endedAt) return [];
    const minutes = Math.round((window.endedAt.getTime() - window.startedAt.getTime()) / 60_000);
    return Number.isFinite(minutes) && minutes >= 0 ? [{ ...window, endedAt: window.endedAt, minutes }] : [];
  }).sort((left, right) => left.startedAt.getTime() - right.startedAt.getTime());
  let overlappingCompletedWindows = 0;
  let latestEnd = Number.NEGATIVE_INFINITY;
  for (const window of validCompleted) {
    if (window.startedAt.getTime() < latestEnd) overlappingCompletedWindows += 1;
    latestEnd = Math.max(latestEnd, window.endedAt.getTime());
  }
  const completedMinutes = validCompleted.reduce((total, window) => total + window.minutes, 0);
  return {
    recordedWindows: windows.length,
    completedWindows: validCompleted.length,
    inProgressWindows: windows.filter((window) => window.endedAt === null).length,
    invalidCompletedWindows: windows.filter((window) => window.endedAt !== null).length - validCompleted.length,
    completedMinutes,
    averageCompletedMinutes: validCompleted.length ? Math.round(completedMinutes / validCompleted.length) : null,
    shortestCompletedMinutes: validCompleted.length ? Math.min(...validCompleted.map((window) => window.minutes)) : null,
    longestCompletedMinutes: validCompleted.length ? Math.max(...validCompleted.map((window) => window.minutes)) : null,
    overlappingCompletedWindows,
  };
}

const clockTimePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function isClockTime(value: unknown): value is string {
  return typeof value === "string" && clockTimePattern.test(value);
}

/**
 * Derives elapsed minutes from a user-entered sleep time to the following wake
 * time. Raw times remain authoritative; ambiguous or unusually long intervals
 * are left uncalculated instead of being presented as observed sleep.
 */
export function sleepDurationMinutes(sleepTime: unknown, wakeTime: unknown): number | null {
  if (!isClockTime(sleepTime) || !isClockTime(wakeTime) || sleepTime === wakeTime) return null;
  const [sleepHour, sleepMinute] = sleepTime.split(":").map(Number);
  const [wakeHour, wakeMinute] = wakeTime.split(":").map(Number);
  let duration = (wakeHour * 60 + wakeMinute) - (sleepHour * 60 + sleepMinute);
  if (duration < 0) duration += 24 * 60;
  return duration > 0 && duration <= 20 * 60 ? duration : null;
}

export function localDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : undefined;
}

export function validTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 1 || value.length > 100) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return true; } catch { return false; }
}

function zonedParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, calendar: "gregory", numberingSystem: "latn", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

export function zonedDateTime(value: string, timeZone: string, hour = 0, minute = 0, second = 0): Date {
  const [year, month, day] = value.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute, second);
  let instant = new Date(target);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = zonedParts(instant, timeZone);
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    instant = new Date(instant.getTime() - (represented - target));
  }
  return instant;
}

export function dateInTimeZone(value: Date, timeZone = "UTC"): string {
  const safeZone = validTimeZone(timeZone) ? timeZone : "UTC";
  const parts = zonedParts(value, safeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function dayBounds(value: string, timeZone = "UTC"): { start: Date; end: Date } {
  const safeZone = validTimeZone(timeZone) ? timeZone : "UTC";
  const start = zonedDateTime(value, safeZone);
  const following = new Date(`${value}T00:00:00.000Z`);
  following.setUTCDate(following.getUTCDate() + 1);
  const end = zonedDateTime(following.toISOString().slice(0, 10), safeZone);
  return { start, end };
}

export function utcOffsetMinutesAt(value: Date, timeZone = "UTC"): number | null {
  if (Number.isNaN(value.getTime())) return null;
  const safeZone = validTimeZone(timeZone) ? timeZone : "UTC";
  const parts = zonedParts(value, safeZone);
  const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((represented - Math.floor(value.getTime() / 1000) * 1000) / 60_000);
}

export function requestTimeContext(request: { header(name: string): string | undefined }, instant = new Date()) {
  const requestedZone = request.header("x-lyfeos-time-zone");
  const timeZone = validTimeZone(requestedZone) ? requestedZone : "UTC";
  const requestedOffset = Number(request.header("x-lyfeos-utc-offset-minutes"));
  const derivedOffset = utcOffsetMinutesAt(instant, timeZone);
  const utcOffsetMinutes = derivedOffset ?? (Number.isInteger(requestedOffset) && requestedOffset >= -840 && requestedOffset <= 840 ? requestedOffset : null);
  return { timeZone, utcOffsetMinutes };
}

export type RecoveryRoutineCadence = "daily" | "specific_days" | "as_needed";

/**
 * Returns whether a saved recovery routine is scheduled on a calendar day.
 * As-needed routines remain available to log but are never presented as due.
 */
export function recoveryRoutineDueOnDate(
  cadence: RecoveryRoutineCadence,
  weekdays: readonly number[],
  date: string,
): boolean {
  if (!localDate(date) || cadence === "as_needed") return false;
  if (cadence === "daily") return true;
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return weekdays.includes(weekday);
}

export function healthDaySummary(input: {
  date: string;
  hydrationMl: number;
  hydrationTargetMl: number | null;
  latestWeight: { value: number; unit: string; observedAt: string } | null;
}) {
  const hydrationPercent = input.hydrationTargetMl && input.hydrationTargetMl > 0
    ? Math.min(100, Math.round((input.hydrationMl / input.hydrationTargetMl) * 100))
    : null;
  return {
    date: input.date,
    hydration: { consumedMl: input.hydrationMl, targetMl: input.hydrationTargetMl, percent: hydrationPercent },
    latestWeight: input.latestWeight,
    disclosure: "Health records are private by default. Logged values and targets are not medical advice or a diagnosis.",
  };
}
