import type { AutomationScheduleTrigger } from "@shared/automations";
import { dateInTimeZone, zonedDateTime } from "./health-fitness";

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function localParts(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, calendar: "gregory", numberingSystem: "latn", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function scheduledOnDate(trigger: AutomationScheduleTrigger, date: string): boolean {
  if (date < trigger.startDate || (trigger.endDate && date > trigger.endDate)) return false;
  if (trigger.cadence === "daily") return true;
  return trigger.weekdays.includes(new Date(`${date}T00:00:00.000Z`).getUTCDay());
}

export function scheduledInstant(trigger: AutomationScheduleTrigger, date: string): Date | null {
  if (!scheduledOnDate(trigger, date)) return null;
  const [hour, minute] = trigger.localTime.split(":").map(Number);
  const instant = zonedDateTime(date, trigger.timeZone, hour, minute);
  return localParts(instant, trigger.timeZone) === `${date}T${trigger.localTime}` ? instant : null;
}

export function nextScheduledOccurrence(trigger: AutomationScheduleTrigger, after: Date): Date | null {
  const afterLocalDate = dateInTimeZone(after, trigger.timeZone);
  let date = trigger.startDate > afterLocalDate ? trigger.startDate : afterLocalDate;
  for (let offset = 0; offset < 3_000; offset += 1) {
    const candidateDate = offset === 0 ? date : shiftDate(date, offset);
    if (trigger.endDate && candidateDate > trigger.endDate) return null;
    const candidate = scheduledInstant(trigger, candidateDate);
    if (candidate && candidate.getTime() > after.getTime()) return candidate;
  }
  return null;
}

export function dueScheduleWindow(input: {
  trigger: AutomationScheduleTrigger;
  firstDue: Date;
  now: Date;
  remainingOccurrences: number;
}): { due: Date[]; next: Date | null; exhausted: boolean } {
  const due: Date[] = [];
  let cursor: Date | null = input.firstDue;
  while (cursor && cursor.getTime() <= input.now.getTime() && due.length < input.remainingOccurrences) {
    due.push(cursor);
    cursor = nextScheduledOccurrence(input.trigger, cursor);
  }
  const exhausted = due.length >= input.remainingOccurrences || cursor === null;
  return { due, next: exhausted ? null : (cursor && cursor.getTime() > input.now.getTime() ? cursor : nextScheduledOccurrence(input.trigger, input.now)), exhausted };
}

export function scheduleOccurrenceContext(trigger: AutomationScheduleTrigger, scheduledFor: Date, now = new Date()) {
  return {
    schemaVersion: "lyfeos.automation.schedule-context.v1",
    scheduledFor: scheduledFor.toISOString(),
    localDate: dateInTimeZone(scheduledFor, trigger.timeZone),
    localTime: trigger.localTime,
    timeZone: trigger.timeZone,
    delayed: now.getTime() > scheduledFor.getTime() + 2 * 60_000,
  } as const;
}
