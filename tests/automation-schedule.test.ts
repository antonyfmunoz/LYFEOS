import { describe, expect, it } from "vitest";
import { automationDefinitionSchema, automationScheduleTriggerSchema } from "../shared/automations";
import { dueScheduleWindow, nextScheduledOccurrence, scheduledInstant } from "../server/automation-schedule";

const daily = automationScheduleTriggerSchema.parse({
  type: "schedule",
  questId: 1,
  timeZone: "America/Los_Angeles",
  localTime: "09:30",
  cadence: "daily",
  weekdays: [],
  startDate: "2026-03-01",
  endDate: "2026-03-20",
  maxOccurrences: 20,
  missedRunPolicy: "run_once",
});

describe("Scheduled workflow automations", () => {
  it("resolves local wall time across DST without shifting the user's schedule", () => {
    expect(scheduledInstant(daily, "2026-03-07")?.toISOString()).toBe("2026-03-07T17:30:00.000Z");
    expect(scheduledInstant(daily, "2026-03-09")?.toISOString()).toBe("2026-03-09T16:30:00.000Z");
    expect(nextScheduledOccurrence(daily, new Date("2026-03-08T18:00:00.000Z"))?.toISOString()).toBe("2026-03-09T16:30:00.000Z");
  });

  it("skips a nonexistent spring-forward wall time instead of silently moving it", () => {
    const nonexistent = { ...daily, localTime: "02:30" };
    expect(scheduledInstant(nonexistent, "2026-03-08")).toBeNull();
    expect(nextScheduledOccurrence(nonexistent, new Date("2026-03-08T00:00:00.000Z"))?.toISOString()).toBe("2026-03-09T09:30:00.000Z");
  });

  it("enumerates a bounded missed window and a deterministic next occurrence", () => {
    const utc = { ...daily, timeZone: "UTC", localTime: "12:00", startDate: "2026-08-20", endDate: null, maxOccurrences: 10 };
    const window = dueScheduleWindow({ trigger: utc, firstDue: new Date("2026-08-23T12:00:00.000Z"), now: new Date("2026-08-25T12:05:00.000Z"), remainingOccurrences: 5 });
    expect(window.due.map((date) => date.toISOString())).toEqual(["2026-08-23T12:00:00.000Z", "2026-08-24T12:00:00.000Z", "2026-08-25T12:00:00.000Z"]);
    expect(window.next?.toISOString()).toBe("2026-08-26T12:00:00.000Z");
    expect(window.exhausted).toBe(false);
  });

  it("requires version two, bounded recurrence, valid weekdays, and ordered dates", () => {
    expect(() => automationDefinitionSchema.parse({ version: 1, trigger: daily, conditions: {}, actions: [{ type: "set_mission_category", category: "focus" }], stopOnError: true })).toThrow("Scheduled automations require definition version 2");
    expect(() => automationScheduleTriggerSchema.parse({ ...daily, cadence: "weekly", weekdays: [] })).toThrow("Choose at least one weekday");
    expect(() => automationScheduleTriggerSchema.parse({ ...daily, maxOccurrences: 366 })).toThrow();
    expect(() => automationScheduleTriggerSchema.parse({ ...daily, startDate: "2026-03-20", endDate: "2026-03-01" })).toThrow("cannot be before");
  });
});
