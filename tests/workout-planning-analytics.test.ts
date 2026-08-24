import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { calendarDayDelta, recurringSeriesShiftPlan, recurringWeeklyDates, shiftCalendarDate, trainingProgramReport } from "../server/training-planning";
import { classifyHeartRateAverage, summarizeWorkoutTimeline } from "../server/workout-analysis";
import { workoutHistoryPeriod } from "../server/workout-history";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("workout planning and long-range analytics", () => {
  it("builds deterministic weekly recurrence dates across month boundaries", () => {
    expect(recurringWeeklyDates("2026-08-29", 1, 4)).toEqual(["2026-08-29", "2026-09-05", "2026-09-12", "2026-09-19"]);
    expect(recurringWeeklyDates("2026-08-29", 2, 3)).toEqual(["2026-08-29", "2026-09-12", "2026-09-26"]);
  });

  it("shifts recurring calendar dates by the anchor delta without timezone drift", () => {
    expect(calendarDayDelta("2026-10-31", "2026-11-02")).toBe(2);
    expect(shiftCalendarDate("2026-11-07", 2)).toBe("2026-11-09");
    expect(calendarDayDelta("2026-03-10", "2026-03-03")).toBe(-7);
    expect(shiftCalendarDate("2026-03-24", -7)).toBe("2026-03-17");
    expect(calendarDayDelta("2026-02-30", "2026-03-02")).toBeNull();
    expect(shiftCalendarDate("not-a-date", 1)).toBeNull();
  });

  it("plans series shifts only for unfinished occurrences and identifies preserved completion evidence", () => {
    expect(recurringSeriesShiftPlan([
      { id: 10, scheduledDate: "2026-10-31", status: "planned" },
      { id: 11, scheduledDate: "2026-11-07", status: "completed" },
      { id: 12, scheduledDate: "2026-11-14", status: "skipped" },
    ], 2)).toEqual({
      updates: [{ id: 10, scheduledDate: "2026-11-02" }, { id: 12, scheduledDate: "2026-11-16" }],
      preservedCompletedSessionIds: [11],
    });
  });

  it("builds bounded inclusive workout-history periods without accepting future or partial custom ranges", () => {
    expect(workoutHistoryPeriod({ today: "2026-03-01", days: 30 })).toEqual({ startDate: "2026-01-31", endDate: "2026-03-01", days: 30, custom: false });
    expect(workoutHistoryPeriod({ today: "2026-03-01", startDate: "2024-02-29", endDate: "2024-03-02" })).toEqual({ startDate: "2024-02-29", endDate: "2024-03-02", days: 3, custom: true });
    expect(workoutHistoryPeriod({ today: "2026-03-01", startDate: "2026-02-01" })).toBeNull();
    expect(workoutHistoryPeriod({ today: "2026-03-01", startDate: "2026-02-01", endDate: "2026-03-02" })).toBeNull();
    expect(workoutHistoryPeriod({ today: "2026-03-01", startDate: "2026-02-30", endDate: "2026-03-01" })).toBeNull();
  });

  it("summarizes factual workouts once per month and keeps load units separate", () => {
    const summary = summarizeWorkoutTimeline([
      { id: 1, occurredAt: new Date("2026-07-10T12:00:00Z"), activityType: "Strength", durationMinutes: 45 },
      { id: 2, occurredAt: new Date("2026-07-12T12:00:00Z"), activityType: "Run", durationMinutes: null },
      { id: 3, occurredAt: new Date("2026-08-01T12:00:00Z"), activityType: "Strength", durationMinutes: 30 },
    ], [
      { workoutId: 1, completed: true, reps: 5, loadValue: 100, loadUnit: "lb", distanceMeters: null, durationSeconds: null },
      { workoutId: 1, completed: true, reps: 5, loadValue: 50, loadUnit: "kg", distanceMeters: null, durationSeconds: null },
      { workoutId: 2, completed: true, reps: null, loadValue: null, loadUnit: null, distanceMeters: 5000, durationSeconds: 1500 },
      { workoutId: 3, completed: false, reps: 5, loadValue: 100, loadUnit: "lb", distanceMeters: null, durationSeconds: null },
    ]);
    expect(summary.months[0]).toMatchObject({ month: "2026-07", workouts: 2, durationMinutes: 45, performedSets: 3, distanceMeters: 5000, volumeByUnit: { lb: 500, kg: 250 } });
    expect(summary.months[1]).toMatchObject({ month: "2026-08", workouts: 1, performedSets: 0 });
  });

  it("classifies only a recorded average against explicit ranges", () => {
    const zones = [{ name: "Easy", lowerBpm: 100, upperBpm: 120 }, { name: "Steady", lowerBpm: 121, upperBpm: 145 }];
    expect(classifyHeartRateAverage(130, zones)).toBe("Steady");
    expect(classifyHeartRateAverage(90, zones)).toBeNull();
    expect(classifyHeartRateAverage(null, zones)).toBeNull();
  });

  it("compares program plans with retained workout evidence without calculating adherence", () => {
    const report = trainingProgramReport([
      { id: 1, scheduledDate: "2026-08-01", title: "A", status: "planned", templateId: 10, originalTemplateId: 10, substitutionReason: null, completedWorkoutId: null, completionLinkLostAt: null },
      { id: 2, scheduledDate: "2026-08-02", title: "B", status: "skipped", templateId: null, originalTemplateId: null, substitutionReason: null, completedWorkoutId: null, completionLinkLostAt: null },
      { id: 3, scheduledDate: "2026-08-03", title: "C", status: "completed", templateId: 11, originalTemplateId: 10, substitutionReason: "Equipment unavailable", completedWorkoutId: 30, completionLinkLostAt: null },
      { id: 4, scheduledDate: "2026-08-04", title: "D", status: "completed", templateId: 10, originalTemplateId: 10, substitutionReason: null, completedWorkoutId: null, completionLinkLostAt: new Date("2026-08-05T00:00:00.000Z") },
    ], [{ id: 30, occurredAt: new Date("2026-08-03T18:00:00.000Z"), activityType: "Strength" }]);
    expect(report.summary).toEqual({ scheduledSessions: 4, plannedSessions: 1, skippedSessions: 1, linkedCompletedSessions: 1, missingCompletionEvidence: 1, unexpectedLinks: 0, substitutedSessions: 1 });
    expect(report.rows[2]).toMatchObject({ completionEvidenceState: "linked_workout", completedWorkoutId: 30, workoutActivityType: "Strength", substituted: true });
    expect(report.rows[3]).toMatchObject({ completionEvidenceState: "link_lost", completedWorkoutId: null, completionLinkLostAt: "2026-08-05T00:00:00.000Z" });
  });

  it("keeps planning lineage, zone profiles, revision history and release parity", () => {
    const migration = source("migrations/0057_workout_planning_analytics.sql");
    const releaseRunner = source("server/release-migrate.ts");
    const routes = source("server/routes/training-programs.ts");
    const workoutRoutes = source("server/routes/workouts.ts");
    const completionMigration = source("migrations/0070_workout_program_completion_evidence.sql");
    const missionReferenceMigration = source("migrations/0071_workout_program_mission_reference.sql");
    const historyFilterMigration = source("migrations/0072_workout_history_exercise_index.sql");
    const client = source("client/src/components/health/TrainingPrograms.tsx");
    const profile = source("server/routes/profile.ts");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "workout_template_revisions"');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "original_template_id"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "heart_rate_zone_profiles"');
    expect(releaseRunner).toContain('id: "0057_workout_planning_analytics"');
    expect(routes).toContain('/sessions/recurring');
    expect(routes).toContain("Record why the planned template changed.");
    expect(routes).toContain('/api/workout-programs/:id/report');
    expect(routes).toContain('/api/workout-program-sessions/:id/series');
    expect(routes).toContain("Only this and later unfinished occurrences were updated");
    expect(routes).toContain("recurringSeriesShiftPlan(futureSessions, dayDelta)");
    expect(routes).toContain("It is not an adherence, fitness, readiness, or health score");
    expect(workoutRoutes).toContain('/api/workouts/analytics');
    expect(workoutRoutes).toContain("exerciseMatch");
    expect(workoutRoutes).toContain("if (setRecord.completed)");
    expect(workoutRoutes).toContain("recordedSets:");
    expect(workoutRoutes).toContain("workoutHistoryPeriod({");
    expect(workoutRoutes).toContain("does not end in the future");
    expect(workoutRoutes).toContain("linkedProgramSessionIds");
    expect(workoutRoutes).toContain("does not calculate a safe training zone");
    expect(completionMigration).toContain('"completion_link_lost_at" timestamp');
    expect(completionMigration).toContain('BEFORE DELETE ON "workouts"');
    expect(releaseRunner).toContain('id: "0070_workout_program_completion_evidence"');
    expect(missionReferenceMigration).toContain('"mission_id" integer REFERENCES "quests"("id") ON DELETE SET NULL');
    expect(releaseRunner).toContain('id: "0071_workout_program_mission_reference"');
    expect(historyFilterMigration).toContain('"workout_exercises_workout_idx"');
    expect(releaseRunner).toContain('id: "0072_workout_history_exercise_index"');
    expect(routes).toContain("validOwnedMission(parsed.data.missionId, userId)");
    expect(routes).toContain("never completes or changes the mission");
    expect(client).toContain("Plan versus submitted evidence");
    expect(client).toContain("no adherence percentage or score is calculated");
    expect(client).toContain("Reference only; scheduling or completing this session does not change the mission.");
    const workoutClient = source("client/src/components/health/WorkoutLog.tsx");
    expect(workoutClient).toContain('aria-label="Filter workout history by exercise"');
    expect(workoutClient).toContain('aria-label="Workout history start date"');
    expect(workoutClient).toContain('aria-label="Workout history end date"');
    for (const table of ["workout_template_revisions", "heart_rate_zone_profiles"]) expect(profile).toContain(`"${table}"`);
  });
});
