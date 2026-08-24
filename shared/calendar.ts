export type CalendarMissionWindow = { startDate: string; startTime: string; endDate: string; endTime: string; durationMinutes: number };

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
