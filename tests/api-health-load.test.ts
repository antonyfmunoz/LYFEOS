import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  healthObservations, hydrationEntries, nutritionDiaryEntries, nutritionFoods,
  recoveryActivities, users, workoutExercises, workoutPrograms, workoutProgramSessions, workoutSets, workouts,
} from "../shared/schema";

const BASE_URL = process.env.LYFEOS_TEST_API_URL;
const describeApi = BASE_URL && process.env.LYFEOS_TEST_ENV === "isolated" && process.env.DATABASE_URL ? describe : describe.skip;

async function request(method: string, path: string, body?: unknown, cookie?: string, headers: Record<string, string> = {}) {
  const startedAt = performance.now();
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    data: await response.json().catch(() => ({})) as any,
    cookie: response.headers.get("set-cookie") || "",
    elapsedMs: performance.now() - startedAt,
  };
}

async function insertInChunks(db: any, table: any, rows: unknown[], chunkSize = 500) {
  for (let index = 0; index < rows.length; index += chunkSize) {
    await db.insert(table).values(rows.slice(index, index + chunkSize));
  }
}

async function insertReturningInChunks(db: any, table: any, rows: unknown[], chunkSize = 500) {
  const inserted = [];
  for (let index = 0; index < rows.length; index += chunkSize) {
    inserted.push(...await db.insert(table).values(rows.slice(index, index + chunkSize)).returning());
  }
  return inserted;
}

describeApi("Authenticated Health report and write load", () => {
  const stamp = Date.now();
  const user = { email: `health_load_${stamp}@example.com`, password: "TestPass123!", displayName: `healthload_${stamp}` };
  let cookie = "";
  let db: any;
  let pool: any;
  let userId = 0;

  afterAll(async () => {
    const login = await request("POST", "/api/auth/login", { identifier: user.displayName, password: user.password });
    if (login.status === 200 && login.cookie) {
      await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, login.cookie);
    }
    if (pool) await pool.end();
  });

  it("serves concurrent owner-scoped reports across 12,500 factual and 2,500 planned records", async () => {
    const registration = await request("POST", "/api/auth/complete-registration", { ...user, termsAccepted: true });
    expect(registration.status).toBe(201);
    cookie = registration.cookie;
    ({ db, pool } = await import("../server/db"));
    const [account] = await db.select({ id: users.id }).from(users).where(eq(users.displayName, user.displayName)).limit(1);
    userId = account.id;

    const now = Date.now();
    const fixtureSize = 2500;
    const occurredAt = (index: number) => new Date(now - (index % 730) * 86_400_000 - (index % 20) * 60_000);
    await insertInChunks(db, hydrationEntries, Array.from({ length: fixtureSize }, (_, index) => ({
      userId, volumeMl: 200 + (index % 5) * 50, occurredAt: occurredAt(index), source: "manual", recordedTimeZone: "UTC",
    })));
    await insertInChunks(db, recoveryActivities, Array.from({ length: fixtureSize }, (_, index) => ({
      userId, activityType: index % 2 ? "meditation" : "mobility", durationMinutes: 10 + (index % 30), occurredAt: occurredAt(index), source: "manual", recordedTimeZone: "UTC", tags: [],
    })));
    const insertedWorkouts = await insertReturningInChunks(db, workouts, Array.from({ length: fixtureSize }, (_, index) => ({
      userId, activityType: index % 2 ? "Run" : "Walk", durationMinutes: 20 + (index % 60),
      movingTimeSeconds: 900 + (index % 1200), elevationGainMeters: index % 150,
      averageHeartRateBpm: 100 + (index % 60), maxHeartRateBpm: 130 + (index % 60), heartRateSource: index % 2 ? "device" : "manual",
      occurredAt: occurredAt(index), source: "manual", recordedTimeZone: "America/Los_Angeles",
    })));
    const insertedExercises = await insertReturningInChunks(db, workoutExercises, insertedWorkouts.map((workout: any, index: number) => ({
      workoutId: workout.id, name: index % 2 ? "Run" : "Walk", sortOrder: 0,
    })));
    await insertInChunks(db, workoutSets, insertedExercises.map((exercise: any, index: number) => ({
      workoutExerciseId: exercise.id, setOrder: 0, distanceMeters: 1000 + (index % 9000), durationSeconds: 900 + (index % 1200), completed: true,
    })));
    await insertInChunks(db, healthObservations, Array.from({ length: fixtureSize }, (_, index) => ({
      userId, category: "activity", metricKey: "steps", displayName: "Steps", value: 4000 + (index % 6000), unit: "count",
      source: "manual", observedAt: occurredAt(index), recordedTimeZone: "UTC", temporalType: "instant", aggregationKind: "latest",
    })));
    const [food] = await db.insert(nutritionFoods).values({ userId, name: "Load fixture food", source: "manual", servingSizeGrams: 100 }).returning({ id: nutritionFoods.id });
    await insertInChunks(db, nutritionDiaryEntries, Array.from({ length: fixtureSize }, (_, index) => ({
      userId, foodId: food.id, servingGrams: 80 + (index % 40), mealSlot: index % 2 ? "breakfast" : "dinner", occurredAt: occurredAt(index), recordedTimeZone: "UTC",
      nutrientSnapshot: [
        { nutrientKey: "energy_kcal", amountPer100g: 200, unit: "kcal" },
        { nutrientKey: "protein_g", amountPer100g: 12, unit: "g" },
      ],
    })));
    const [program] = await db.insert(workoutPrograms).values({ userId, name: "Large program fixture" }).returning({ id: workoutPrograms.id });
    const endDate = new Date(now).toISOString().slice(0, 10);
    const reportStart = new Date(now - 3650 * 86_400_000).toISOString().slice(0, 10);
    await insertInChunks(db, workoutProgramSessions, Array.from({ length: fixtureSize }, (_, index) => ({
      userId, programId: program.id, title: `Planned session ${index + 1}`,
      scheduledDate: new Date(now - (index % 3650) * 86_400_000).toISOString().slice(0, 10),
      status: index % 7 === 0 ? "skipped" : "planned",
    })));

    const paths = [
      "/api/health-fitness/timeline?days=90",
      "/api/health-fitness/hydration/trends?days=3650",
      "/api/health-insights/trends?left=hydration_ml&right=recovery_minutes&days=3650",
      "/api/workouts/history?days=3650&limit=100",
      "/api/workouts/history.csv?days=3650",
      "/api/workouts/cardio?days=3650",
      "/api/nutrition/trends?days=365",
      "/api/nutrition/reports/daily.csv?days=365",
      `/api/workout-programs/${program.id}/report?start=${reportStart}&end=${endDate}`,
    ];
    const baselineReports = [];
    for (const path of paths) baselineReports.push(await request("GET", path, undefined, cookie));
    expect(baselineReports.every((report) => report.status === 200)).toBe(true);
    expect(Math.max(...baselineReports.map((report) => report.elapsedMs))).toBeLessThan(5_000);

    const startedAt = performance.now();
    const reports = await Promise.all(Array.from({ length: 2 }, () => paths.map((path) => request("GET", path, undefined, cookie))).flat());
    const elapsedMs = performance.now() - startedAt;
    expect(reports).toHaveLength(18);
    expect(reports.every((report) => report.status === 200)).toBe(true);
    expect(elapsedMs).toBeLessThan(18_000);
    expect(reports.find((report) => Array.isArray(report.data.trend))?.data.trend).toHaveLength(3650);
    const cardio = baselineReports.find((report) => Array.isArray(report.data.sessions));
    expect(cardio?.data.period).toMatchObject({ timeZone: "UTC" });
    expect(cardio?.data.sessions).toHaveLength(fixtureSize);
  }, 45_000);

  it("accepts concurrent unique writes and replays each mutation exactly once", async () => {
    const writeCount = 24;
    const writeBase = Date.now();
    const payloads = Array.from({ length: writeCount }, (_, index) => ({
      volumeMl: 250 + index,
      occurredAt: new Date(writeBase - index * 1000).toISOString(),
      note: "Authenticated load fixture",
    }));
    const writes = await Promise.all(Array.from({ length: writeCount }, (_, index) => request(
      "POST",
      "/api/health-fitness/hydration",
      payloads[index],
      cookie,
      { "x-lyfeos-mutation-id": `health-load-${stamp}-${index}` },
    )));
    expect(writes.every((result) => result.status === 201 && result.data.replayed === false)).toBe(true);

    const replays = await Promise.all(Array.from({ length: writeCount }, (_, index) => request(
      "POST",
      "/api/health-fitness/hydration",
      payloads[index],
      cookie,
      { "x-lyfeos-mutation-id": `health-load-${stamp}-${index}` },
    )));
    expect(replays.every((result) => result.status === 200 && result.data.replayed === true)).toBe(true);
    const conflict = await request("POST", "/api/health-fitness/hydration", { ...payloads[0], volumeMl: 999 }, cookie, { "x-lyfeos-mutation-id": `health-load-${stamp}-0` });
    expect(conflict.status).toBe(409);
  });

  it("keeps repeated atomic-set corrections revision-complete within a bounded local workload", async () => {
    const base = {
      activityType: "Strength training", durationMinutes: 35, occurredAt: new Date().toISOString(), note: "Atomic correction fixture",
      exercises: [{ name: "Goblet squat", setRecords: [{ reps: 8, loadValue: 20, loadUnit: "kg", completed: true }] }],
    };
    const created = await request("POST", "/api/workouts", base, cookie, { "x-lyfeos-mutation-id": `health-load-workout-${stamp}` });
    expect(created.status).toBe(201);
    const workoutId = created.data.workout.id;
    const correctionCount = 18;
    const startedAt = performance.now();
    for (let index = 0; index < correctionCount; index += 1) {
      const corrected = await request("PUT", `/api/workouts/${workoutId}`, {
        ...base,
        note: `Atomic correction ${index + 1}`,
        exercises: [{ name: "Goblet squat", setRecords: [{ reps: 8 + (index % 4), loadValue: 20 + index, loadUnit: "kg", completed: true }] }],
      }, cookie, { "x-lyfeos-expected-revision": String(index + 1) });
      expect(corrected.status).toBe(200);
      expect(corrected.data.workout.currentRevision).toBe(index + 2);
    }
    expect(performance.now() - startedAt).toBeLessThan(5_000);
    const revisions = await request("GET", `/api/workouts/${workoutId}/revisions`, undefined, cookie);
    expect(revisions.status).toBe(200);
    expect(revisions.data.revisions).toHaveLength(correctionCount + 1);
    expect(revisions.data.revisions[0].revisionNumber).toBe(correctionCount + 1);
  }, 15_000);
});
