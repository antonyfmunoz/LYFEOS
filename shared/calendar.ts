export type CalendarMissionWindow = { startDate: string; startTime: string; endDate: string; endTime: string; durationMinutes: number };
export type CalendarZoom = "year" | "month" | "week" | "day";
export type CalendarVisibleRange = { from: string; to: string; days: number };

export function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
}

export function shiftCalendarDate(value: string, days: number): string | null {
  if (!isCalendarDate(value) || !Number.isInteger(days)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

export function calendarDateDistance(from: string, to: string): number | null {
  if (!isCalendarDate(from) || !isCalendarDate(to) || from > to) return null;
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = to.split("-").map(Number);
  return Math.round((Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) / 86_400_000) + 1;
}

export function calendarVisibleRange(zoom: CalendarZoom, anchor: string): CalendarVisibleRange | null {
  if (!isCalendarDate(anchor)) return null;
  const [year, month, day] = anchor.split("-").map(Number);
  if (zoom === "year") {
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    return { from, to, days: calendarDateDistance(from, to)! };
  }
  if (zoom === "month") {
    const first = new Date(Date.UTC(year, month - 1, 1));
    const last = new Date(Date.UTC(year, month, 0));
    const from = shiftCalendarDate(anchor.slice(0, 7) + "-01", -first.getUTCDay())!;
    const to = shiftCalendarDate(`${last.getUTCFullYear()}-${String(last.getUTCMonth() + 1).padStart(2, "0")}-${String(last.getUTCDate()).padStart(2, "0")}`, 6 - last.getUTCDay())!;
    return { from, to, days: calendarDateDistance(from, to)! };
  }
  if (zoom === "week") {
    const to = shiftCalendarDate(anchor, 6)!;
    return { from: anchor, to, days: 7 };
  }
  return { from: anchor, to: anchor, days: 1 };
}

export function parseCalendarDurationMinutes(value: unknown): number | null {
  if (typeof value === "number") return Number.isInteger(value) && value >= 1 && value <= 10_080 ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (/^\d+$/.test(normalized)) {
    const minutes = Number(normalized);
    return minutes >= 1 && minutes <= 10_080 ? minutes : null;
  }
  const match = /^(?:(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours))?(?:\s*(\d+)\s*(?:m|min|mins|minute|minutes))?$/.exec(normalized);
  if (!match || (!match[1] && !match[2])) return null;
  const minutes = Math.round(Number(match[1] || 0) * 60 + Number(match[2] || 0));
  return minutes >= 1 && minutes <= 10_080 ? minutes : null;
}

export function buildCalendarMissionWindow(date: string, startTime: string, duration: unknown): CalendarMissionWindow | null {
  if (!isCalendarDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) return null;
  const durationMinutes = parseCalendarDurationMinutes(duration);
  if (!durationMinutes) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = startTime.split(":").map(Number);
  const end = new Date(Date.UTC(year, month - 1, day, hour, minute + durationMinutes));
  return {
    startDate: date,
    startTime,
    endDate: `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, "0")}-${String(end.getUTCDate()).padStart(2, "0")}`,
    endTime: `${String(end.getUTCHours()).padStart(2, "0")}:${String(end.getUTCMinutes()).padStart(2, "0")}`,
    durationMinutes,
  };
}
