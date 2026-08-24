function exactCalendarDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

function shiftDate(value: string, days: number): string {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function workoutHistoryPeriod(input: { today: string; days?: unknown; startDate?: unknown; endDate?: unknown }) {
  const today = exactCalendarDate(input.today);
  if (!today) return null;
  const customProvided = input.startDate !== undefined || input.endDate !== undefined;
  if (customProvided) {
    const startDate = exactCalendarDate(input.startDate);
    const endDate = exactCalendarDate(input.endDate);
    if (!startDate || !endDate || startDate > endDate || endDate > today) return null;
    const days = Math.round((new Date(`${endDate}T00:00:00.000Z`).getTime() - new Date(`${startDate}T00:00:00.000Z`).getTime()) / 86_400_000) + 1;
    return days > 3650 ? null : { startDate, endDate, days, custom: true as const };
  }
  const requestedDays = Number(input.days ?? 30);
  const days = Number.isInteger(requestedDays) && requestedDays >= 7 && requestedDays <= 3650 ? requestedDays : 30;
  return { startDate: shiftDate(today, -(days - 1)), endDate: today, days, custom: false as const };
}
