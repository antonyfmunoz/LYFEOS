import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { workoutLedgerExportCsv, workoutLedgerExportRows, type WorkoutExportWorkout } from "../server/workout-export";

const workout = (id: number, activityType = "Strength training"): WorkoutExportWorkout => ({
  id,
  occurredAt: new Date(`2026-08-${String(10 + id).padStart(2, "0")}T18:00:00.000Z`),
  activityType,
  durationMinutes: 45,
  perceivedExertion: 7,
  movingTimeSeconds: null,
  elevationGainMeters: null,
  averageHeartRateBpm: null,
  maxHeartRateBpm: null,
  heartRateSource: null,
  source: "manual",
  recordedTimeZone: "America/Los_Angeles",
  recordedUtcOffsetMinutes: -420,
  note: null,
  createdAt: new Date(`2026-08-${String(10 + id).padStart(2, "0")}T18:05:00.000Z`),
});

describe("workout ledger export", () => {
  it("retains workouts, legacy aggregate exercises, and atomic performed/skipped sets", () => {
    const rows = workoutLedgerExportRows(
      [workout(1), workout(2), workout(3)],
      [
        { id: 20, workoutId: 2, name: "Legacy row", sets: 3, reps: 8, loadValue: 50, loadUnit: "kg", distanceMeters: null, durationSeconds: null, sortOrder: 0, note: null },
        { id: 30, workoutId: 3, name: "Squat", sets: 2, reps: null, loadValue: null, loadUnit: null, distanceMeters: null, durationSeconds: null, sortOrder: 0, note: "rack 2" },
      ],
      [
        { id: 300, workoutExerciseId: 30, setOrder: 0, reps: 5, loadValue: 100, loadUnit: "kg", distanceMeters: null, durationSeconds: null, perceivedExertion: 8, repsInReserve: 2, completed: true, note: "controlled" },
        { id: 301, workoutExerciseId: 30, setOrder: 1, reps: null, loadValue: null, loadUnit: null, distanceMeters: null, durationSeconds: null, perceivedExertion: null, repsInReserve: null, completed: false, note: "skipped" },
      ],
      new Map([[1, 1], [2, 2], [3, 4]]),
      "America/Los_Angeles",
      () => "2026-08-13",
    );
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ recordLevel: "workout", workoutId: 1, exerciseId: null, latestRevisionNumber: 1 });
    expect(rows[1]).toMatchObject({ recordLevel: "exercise", workoutId: 2, exerciseId: 20, legacyAggregateSets: 3, legacyAggregateReps: 8, setId: null });
    expect(rows[2]).toMatchObject({ recordLevel: "set", workoutId: 3, exerciseId: 30, setId: 300, setState: "performed", setReps: 5, setLoadValue: 100, setLoadUnit: "kg" });
    expect(rows[3]).toMatchObject({ recordLevel: "set", setId: 301, setState: "skipped", setReps: null });
  });

  it("writes stable snake-case columns and protects spreadsheet formulas", () => {
    const rows = workoutLedgerExportRows([workout(1, "=unsafe")], [], [], new Map(), "UTC", () => "2026-08-11");
    const csv = workoutLedgerExportCsv(rows);
    expect(csv).toContain("record_level,workout_id,workout_occurred_at_utc,export_calendar_date");
    expect(csv).toContain("America/Los_Angeles,-420,manual");
    expect(csv).toContain(",'=unsafe,");
    expect(csv.split("\r\n")).toHaveLength(2);
  });

  it("exposes only an authenticated bounded export and matching user controls", () => {
    const routes = readFileSync(resolve(process.cwd(), "server/routes/workouts.ts"), "utf8");
    const client = readFileSync(resolve(process.cwd(), "client/src/components/health/WorkoutLog.tsx"), "utf8");
    expect(routes).toContain('app.get("/api/workouts/history.csv", isAuthenticated');
    expect(routes).toContain("This export contains more than 10,000 workouts");
    expect(routes).toContain('eq(workouts.userId, userId)');
    expect(routes).toContain('"Cache-Control", "private, no-store"');
    expect(client).toContain("Export ledger CSV");
    expect(client).toContain("timeContextHeaders()");
  });
});
