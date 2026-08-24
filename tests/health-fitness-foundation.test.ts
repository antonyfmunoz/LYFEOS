import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { dayBounds, fastingTimingSummary, healthDaySummary, isClockTime, localDate, sleepDurationMinutes, utcOffsetMinutesAt, zonedDateTime } from "../server/health-fitness";
import { nutrientDefinitions, nutritionContributions, nutritionDailyReport, nutritionDailyReportCsv, nutritionGramsFromInput, nutritionPeriodComparison, nutritionTotals, nutritionTrend } from "../server/nutrition";
import { epleyEstimatedOneRepMax, summarizeCardioSessions, summarizeExerciseProgress, summarizeExerciseRecords, workoutCalculationRegistry } from "../server/workout-analysis";
import { normalizeIngredientKey, parseIngredientLabel } from "../server/ingredient-scanner";

describe("health and fitness foundation", () => {
  it("uses an explicit UTC day window without leaking records into the next day", () => {
    const { start, end } = dayBounds("2026-08-15");
    expect(start.toISOString()).toBe("2026-08-15T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-08-16T00:00:00.000Z");
  });

  it("uses daylight-saving-aware local day bounds and event-time offsets", () => {
    const spring = dayBounds("2026-03-08", "America/Los_Angeles");
    expect(spring.start.toISOString()).toBe("2026-03-08T08:00:00.000Z");
    expect(spring.end.toISOString()).toBe("2026-03-09T07:00:00.000Z");
    const fall = dayBounds("2026-11-01", "America/Los_Angeles");
    expect(fall.start.toISOString()).toBe("2026-11-01T07:00:00.000Z");
    expect(fall.end.toISOString()).toBe("2026-11-02T08:00:00.000Z");
    const summerNoon = zonedDateTime("2026-08-15", "America/Los_Angeles", 12);
    expect(summerNoon.toISOString()).toBe("2026-08-15T19:00:00.000Z");
    expect(utcOffsetMinutesAt(summerNoon, "America/Los_Angeles")).toBe(-420);
  });

  it("falls back to UTC for invalid timezone input", () => {
    expect(dayBounds("2026-08-15", "not/a-zone").start.toISOString()).toBe("2026-08-15T00:00:00.000Z");
    expect(utcOffsetMinutesAt(new Date("2026-08-15T12:00:00.000Z"), "not/a-zone")).toBe(0);
  });

  it("only accepts a calendar-day selector", () => {
    expect(localDate("2026-08-15")).toBe("2026-08-15");
    expect(localDate("2026-8-15")).toBeUndefined();
    expect(localDate("2026-08-15T12:00:00Z")).toBeUndefined();
    expect(localDate("2026-02-30")).toBeUndefined();
  });

  it("uses the user's local calendar day for native Health capture", () => {
    for (const component of ["DailyHealthLog.tsx", "BodyProgress.tsx", "NutritionDiary.tsx", "WorkoutLog.tsx", "RecoveryLog.tsx", "SleepLog.tsx"]) {
      expect(readFileSync(resolve(process.cwd(), "client/src/components/health", component), "utf8")).toContain("getLocalDateString");
    }
    expect(readFileSync(resolve(process.cwd(), "client/src/components/health/RecoveryLog.tsx"), "utf8")).toContain("occurredAt: localNoonIso(date)");
  });

  it("caps the displayed hydration completion without changing the factual intake", () => {
    const summary = healthDaySummary({ date: "2026-08-15", hydrationMl: 3600, hydrationTargetMl: 3000, latestWeight: null });
    expect(summary.hydration).toEqual({ consumedMl: 3600, targetMl: 3000, percent: 100 });
    expect(summary.disclosure).toContain("not medical advice");
  });

  it("derives sleep duration only from valid, plausible recorded clock times", () => {
    expect(isClockTime("22:30")).toBe(true);
    expect(isClockTime("24:00")).toBe(false);
    expect(sleepDurationMinutes("22:30", "06:15")).toBe(465);
    expect(sleepDurationMinutes("01:00", "21:30")).toBeNull();
    expect(sleepDurationMinutes("08:00", "08:00")).toBeNull();
    expect(sleepDurationMinutes("not-a-time", "08:00")).toBeNull();
  });

  it("unifies the Health sleep view with private daily logs instead of a competing sleep table", () => {
    const routes = readFileSync(resolve(process.cwd(), "server/routes/health-fitness.ts"), "utf8");
    const profileRoutes = readFileSync(resolve(process.cwd(), "server/routes/profile.ts"), "utf8");
    const healthPage = readFileSync(resolve(process.cwd(), "client/src/pages/HealthDetailPage.tsx"), "utf8");
    const migration = readFileSync(resolve(process.cwd(), "migrations/0045_sleep_reflection.sql"), "utf8");
    const releaseRunner = readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8");
    expect(routes).toContain('app.get("/api/health-fitness/sleep", isAuthenticated');
    expect(routes).toContain('app.put("/api/health-fitness/sleep", isAuthenticated');
    expect(routes).toContain('target: [userDailyLogs.userId, userDailyLogs.date]');
    expect(routes).toContain('eq(userDailyLogs.userId, req.session.userId!)');
    expect(routes).toContain("sleepQuality: userDailyLogs.sleepQuality");
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "sleep_quality"');
    expect(releaseRunner).toContain('id: "0045_sleep_reflection"');
    expect(readFileSync(resolve(process.cwd(), "migrations/0046_sleep_naps.sql"), "utf8")).toContain('CREATE TABLE IF NOT EXISTS "sleep_naps"');
    expect(releaseRunner).toContain('id: "0046_sleep_naps"');
    expect(routes).toContain('app.post("/api/health-fitness/sleep/naps", isAuthenticated');
    expect(routes).toContain('app.patch("/api/health-fitness/sleep/naps/:id", isAuthenticated');
    expect(routes).toContain('eq(sleepNaps.userId, req.session.userId!)');
    expect(profileRoutes).toContain('"sleep_naps"');
    expect(profileRoutes).toContain("sleepDurationMinutes(log.sleepTime, log.wakeTime)");
    expect(healthPage).toContain("<SleepLog />");
  });

  it("assembles an owner-scoped factual health timeline without causal or readiness claims", () => {
    const routes = readFileSync(resolve(process.cwd(), "server/routes/health-fitness.ts"), "utf8");
    const client = readFileSync(resolve(process.cwd(), "client/src/components/health/HealthTimeline.tsx"), "utf8");
    const healthPage = readFileSync(resolve(process.cwd(), "client/src/pages/HealthDetailPage.tsx"), "utf8");
    expect(routes).toContain('app.get("/api/health-fitness/timeline", isAuthenticated');
    expect(routes).toContain("eq(nutritionDiaryEntries.userId, userId)");
    expect(routes).toContain('status: matching.length ? "recorded" as const : "not_recorded_in_period" as const');
    expect(routes).toContain("events: events.slice(0, 250), coverage");
    expect(routes).toContain("does not infer causes, health status, treatment effects, readiness, or medical conclusions");
    expect(client).toContain("Automatically assembled from records you already added in Health");
    expect(client).toContain("It does not mean the activity did not happen and is not a health judgment");
    expect(client).toContain('href={`#${destinations[event.type]}`}');
    expect(healthPage).toContain("<HealthTimeline />");
    expect(healthPage).toContain('targetId="health-section-nutrition"');
    expect(healthPage).toContain('targetId="health-section-training"');
  });

  it("keeps health records in the migration, release runner, export, and deletion paths", () => {
    const migration = readFileSync(resolve(process.cwd(), "migrations/0029_health_fitness_foundation.sql"), "utf8");
    const releaseRunner = readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8");
    const profileRoutes = readFileSync(resolve(process.cwd(), "server/routes/profile.ts"), "utf8");
    for (const table of ["health_profiles", "health_targets", "body_measurements", "hydration_entries"]) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS \"${table}\"`);
      expect(profileRoutes).toContain(`\"${table}\"`);
    }
    expect(releaseRunner).toContain('id: "0029_health_fitness_foundation"');
  });

  it("exposes authenticated, user-owned health-fitness operations rather than a public health-data route", () => {
    const routes = readFileSync(resolve(process.cwd(), "server/routes/health-fitness.ts"), "utf8");
    expect(routes).toContain('app.get("/api/health-fitness/summary", isAuthenticated');
    expect(routes).toContain('eq(hydrationEntries.userId, userId)');
    expect(routes).toContain('eq(bodyMeasurements.userId, req.session.userId!)');
    expect(routes).toContain('app.patch("/api/health-fitness/measurements/:id", isAuthenticated');
    expect(routes).toContain('app.patch("/api/health-fitness/targets/:id", isAuthenticated');
    expect(readFileSync(resolve(process.cwd(), "server/health-fitness.ts"), "utf8")).toContain('Health records are private by default');
  });

  it("represents separate physical evidence domains without inventing a competence or health score", () => {
    const routes = readFileSync(resolve(process.cwd(), "server/routes/health-fitness.ts"), "utf8");
    expect(routes).toContain('app.get("/api/health-fitness/capability-coverage", isAuthenticated');
    expect(routes).toContain('eq(workouts.userId, userId)');
    expect(routes).toContain('No universal longevity metric is defined or inferred');
    expect(routes).toContain('does not measure competence, health, readiness, longevity, or causal effects');
    expect(routes).toContain('period: { startDate, endDate, timeZone }');
    expect(routes).toContain("Capability evidence periods must be between 7 and 365 whole days.");
    expect(routes).toContain('Record presence does not establish maximal strength');
    expect(routes).toContain("assessEvidenceDocumentation(days, evidenceRecords)");
    expect(routes).toContain("Record-documentation confidence weights date coverage, source provenance, and applicable method metadata");
    const client = readFileSync(resolve(process.cwd(), "client/src/components/health/CapabilityEvidencePanel.tsx"), "utf8");
    expect(client).toContain("Evidence window:");
    expect(client).toContain('aria-label="Physical capability evidence period"');
    expect(client).toContain("placeholderData: (previous) => previous");
    expect(client).toContain("Inputs:");
    expect(client).toContain("Method:");
    expect(client).toContain("Limit:");
    expect(client).toContain("Documentation formula:");
  });

  it("calculates nutrition totals from recorded serving sizes, never from a health score", () => {
    const totals = nutritionTotals([
      { nutrientKey: "energy_kcal", amountPer100g: 120, unit: "kcal", servingGrams: 150 },
      { nutrientKey: "protein_g", amountPer100g: 20, unit: "g", servingGrams: 150 },
      { nutrientKey: "energy_kcal", amountPer100g: 50, unit: "kcal", servingGrams: 200 },
    ]);
    expect(totals.energy_kcal).toEqual({ amount: 280, unit: "kcal" });
    expect(totals.protein_g).toEqual({ amount: 30, unit: "g" });
  });

  it("keeps missing nutrition history distinct from a factual zero", () => {
    expect(nutritionTrend([
      { entryId: 1, occurredAt: new Date("2026-08-14T12:00:00.000Z"), servingGrams: 100, nutrientKey: "energy_kcal", amountPer100g: 200, unit: "kcal" },
      { entryId: 1, occurredAt: new Date("2026-08-14T12:00:00.000Z"), servingGrams: 100, nutrientKey: "protein_g", amountPer100g: 20, unit: "g" },
      { entryId: 2, occurredAt: new Date("2026-08-15T12:00:00.000Z"), servingGrams: 50, nutrientKey: "energy_kcal", amountPer100g: 0, unit: "kcal" },
    ], "2026-08-14", 3)).toEqual([
      { date: "2026-08-14", entries: 1, energyKcal: 200, proteinGrams: 20, carbohydrateGrams: null, fatGrams: null },
      { date: "2026-08-15", entries: 1, energyKcal: 0, proteinGrams: null, carbohydrateGrams: null, fatGrams: null },
      { date: "2026-08-16", entries: 0, energyKcal: null, proteinGrams: null, carbohydrateGrams: null, fatGrams: null },
    ]);
  });

  it("compares adjacent nutrition periods without treating missing days as zero", () => {
    const current = nutritionTrend([
      { entryId: 1, occurredAt: new Date("2026-08-14T12:00:00.000Z"), servingGrams: 100, nutrientKey: "energy_kcal", amountPer100g: 0, unit: "kcal" },
      { entryId: 2, occurredAt: new Date("2026-08-15T12:00:00.000Z"), servingGrams: 100, nutrientKey: "energy_kcal", amountPer100g: 200, unit: "kcal" },
    ], "2026-08-14", 3);
    const previous = nutritionTrend([], "2026-08-11", 3);
    expect(nutritionPeriodComparison(current, previous)).toMatchObject({
      current: { days: 3, diaryDays: 2, diaryEntries: 2, energyKcal: { recordedDays: 2, totalRecorded: 200, averagePerRecordedDay: 100 } },
      previous: { days: 3, diaryDays: 0, diaryEntries: 0, energyKcal: { recordedDays: 0, totalRecorded: null, averagePerRecordedDay: null } },
    });
    const client = readFileSync(resolve(process.cwd(), "client/src/components/health/NutritionDiary.tsx"), "utf8");
    expect(client).toContain("Compare with the immediately preceding period");
    expect(client).toContain("never by missing days");
  });

  it("exports a reconcilable nutrition ledger without collapsing unknown values into zero", () => {
    const report = nutritionDailyReport([
      { entryId: 1, occurredAt: new Date("2026-08-14T12:00:00.000Z"), servingGrams: 50, nutrients: [{ nutrientKey: "energy_kcal", amountPer100g: 0, unit: "kcal" }] },
    ], "2026-08-14", 2);
    expect(report.find((row) => row.date === "2026-08-14" && row.nutrientKey === "energy_kcal")).toMatchObject({ value: 0, valueState: "recorded", recordedEntries: 1, totalEntries: 1 });
    expect(report.find((row) => row.date === "2026-08-14" && row.nutrientKey === "protein_g")).toMatchObject({ value: null, valueState: "unknown", recordedEntries: 0, totalEntries: 1 });
    expect(report.find((row) => row.date === "2026-08-15" && row.nutrientKey === "energy_kcal")).toMatchObject({ value: null, valueState: "not_recorded", recordedEntries: 0, totalEntries: 0 });
    const csv = nutritionDailyReportCsv(report);
    expect(csv).toContain("date,nutrient_key,nutrient_label,unit,value,value_state,recorded_entries,total_entries");
    expect(csv).toContain("2026-08-14,energy_kcal,Energy,kcal,0,recorded,1,1");
    expect(csv).toContain("2026-08-14,protein_g,Protein,g,,unknown,0,1");
    expect(csv).toContain("2026-08-15,energy_kcal,Energy,kcal,,not_recorded,0,0");
    const routes = readFileSync(resolve(process.cwd(), "server/routes/nutrition.ts"), "utf8");
    const client = readFileSync(resolve(process.cwd(), "client/src/components/health/NutritionDiary.tsx"), "utf8");
    expect(routes).toContain('app.get("/api/nutrition/reports/daily.csv", isAuthenticated');
    expect(routes).toContain('eq(nutritionDiaryEntries.userId, req.session.userId!)');
    expect(routes).toContain('"Cache-Control", "private, no-store"');
    expect(client).toContain("View accessible nutrition history table");
    expect(client).toContain("Could not download the nutrition report.");
  });

  it("converts only an explicit product serving or grams and preserves the source-unit path", () => {
    expect(nutritionGramsFromInput(1.5, "serving", 42)).toBe(63);
    expect(nutritionGramsFromInput(63, "g", 42)).toBe(63);
    expect(nutritionGramsFromInput(250, "ml", 100, 1.03)).toBe(257.5);
    expect(nutritionGramsFromInput(2, "portion", 100, 85)).toBe(170);
    expect(() => nutritionGramsFromInput(1, "ml", 100)).toThrow("explicit density or portion conversion");
    expect(() => nutritionGramsFromInput(0, "g", 42)).toThrow("positive quantities");
    const migration = readFileSync(resolve(process.cwd(), "migrations/0041_nutrition_input_units.sql"), "utf8");
    const releaseRunner = readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8");
    const routes = readFileSync(resolve(process.cwd(), "server/routes/nutrition.ts"), "utf8");
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "input_unit"');
    expect(releaseRunner).toContain('id: "0041_nutrition_input_units"');
    expect(routes).toContain("nutritionGramsFromInput(parsed.data.quantity");
  });

  it("snapshots food-specific serving, density, and household-portion conversions", () => {
    const migration = readFileSync(resolve(process.cwd(), "migrations/0053_nutrition_portions.sql"), "utf8");
    const releaseRunner = readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8");
    const routes = readFileSync(resolve(process.cwd(), "server/routes/nutrition.ts"), "utf8");
    const client = readFileSync(resolve(process.cwd(), "client/src/components/health/NutritionDiary.tsx"), "utf8");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "nutrition_food_portions"');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "input_grams_per_unit"');
    expect(releaseRunner).toContain('id: "0053_nutrition_portions"');
    expect(routes).toContain('app.post("/api/nutrition/foods/:foodId/portions", isAuthenticated');
    expect(routes).toContain("inputUnitLabel: conversion.label");
    expect(routes).toContain("inputGramsPerUnit: conversion.gramsPerUnit");
    expect(client).toContain("LyfeOS never assumes a universal cup or spoon conversion");
  });

  it("governs nutrition targets with date, weekday, rationale, method, and overlap semantics", () => {
    const migration = readFileSync(resolve(process.cwd(), "migrations/0054_health_target_schedules.sql"), "utf8");
    const releaseRunner = readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8");
    const routes = readFileSync(resolve(process.cwd(), "server/routes/health-fitness.ts"), "utf8");
    const client = readFileSync(resolve(process.cwd(), "client/src/components/health/NutritionDiary.tsx"), "utf8");
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "weekdays"');
    expect(releaseRunner).toContain('id: "0054_health_target_schedules"');
    expect(routes).toContain("targetSchedulesOverlap");
    expect(routes).toContain("Calculated targets require a method identifier and version");
    expect(routes).toContain("overlaps another target of the same kind");
    expect(client).toContain('aria-label="Target weekdays"');
    expect(client).toContain('aria-label="Target rationale"');
  });

  it("keeps the nutrition diary in the migration, release runner, authenticated route, and account export paths", () => {
    const migration = readFileSync(resolve(process.cwd(), "migrations/0030_nutrition_diary.sql"), "utf8");
    const releaseRunner = readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8");
    const routes = readFileSync(resolve(process.cwd(), "server/routes/nutrition.ts"), "utf8");
    const profileRoutes = readFileSync(resolve(process.cwd(), "server/routes/profile.ts"), "utf8");
    for (const table of ["nutrition_foods", "nutrition_food_nutrients", "nutrition_diary_entries"]) expect(migration).toContain(`CREATE TABLE IF NOT EXISTS \"${table}\"`);
    expect(releaseRunner).toContain('id: "0030_nutrition_diary"');
    expect(routes).toContain('app.post("/api/nutrition/diary", isAuthenticated');
    expect(routes).toContain('eq(nutritionFoods.userId, userId)');
    expect(profileRoutes).toContain("selectNutritionNutrientRows");
  });

  it("snapshots nutrients when a diary entry is created so later food edits cannot rewrite history", () => {
    const migration = readFileSync(resolve(process.cwd(), "migrations/0043_nutrition_diary_snapshots.sql"), "utf8");
    const releaseRunner = readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8");
    const routes = readFileSync(resolve(process.cwd(), "server/routes/nutrition.ts"), "utf8");
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "nutrient_snapshot"');
    expect(migration).toContain("jsonb_agg(jsonb_build_object");
    expect(releaseRunner).toContain('id: "0043_nutrition_diary_snapshots"');
    expect(routes).toContain("nutrientSnapshot: snapshot");
    expect(routes).toContain("nutrientSnapshot: entry.nutrientSnapshot");
    expect(routes).toContain("snapshot.length ? snapshot");
    expect(routes).toContain('app.patch("/api/nutrition/diary/:id", isAuthenticated');
    expect(routes).toContain('eq(nutritionDiaryEntries.userId, req.session.userId!)');
  });

  it("lets users correct and favorite saved foods without rewriting diary snapshots", () => {
    const migration = readFileSync(resolve(process.cwd(), "migrations/0044_nutrition_food_favorites.sql"), "utf8");
    const releaseRunner = readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8");
    const routes = readFileSync(resolve(process.cwd(), "server/routes/nutrition.ts"), "utf8");
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "favorite"');
    expect(releaseRunner).toContain('id: "0044_nutrition_food_favorites"');
    expect(routes).toContain('app.patch("/api/nutrition/foods/:id", isAuthenticated');
    expect(routes).toContain('app.patch("/api/nutrition/foods/:id/favorite", isAuthenticated');
    expect(routes).toContain("tx.delete(nutritionFoodNutrients)");
    expect(routes).toContain("desc(nutritionFoods.favorite)");
    expect(routes).toContain("recentUseCount");
    expect(routes).toContain("lastLoggedAt");
  });

  it("offers a privacy-preserving camera barcode path with an explicit manual fallback", () => {
    const scanner = readFileSync(resolve(process.cwd(), "client/src/components/health/IngredientScanner.tsx"), "utf8");
    expect(scanner).toContain('capture="environment"');
    expect(scanner).toContain("BarcodeDetectorApi");
    expect(scanner).toContain("processed on-device and is not uploaded");
    expect(scanner).toContain("product-catalog lookup are not connected");
  });

  it("keeps structured workouts and exercise details in the release and private-account paths", () => {
    const migration = readFileSync(resolve(process.cwd(), "migrations/0031_workout_ledger.sql"), "utf8");
    const releaseRunner = readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8");
    const routes = readFileSync(resolve(process.cwd(), "server/routes/workouts.ts"), "utf8");
    const client = readFileSync(resolve(process.cwd(), "client/src/components/health/WorkoutLog.tsx"), "utf8");
    const profileRoutes = readFileSync(resolve(process.cwd(), "server/routes/profile.ts"), "utf8");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "workouts"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "workout_exercises"');
    expect(releaseRunner).toContain('id: "0031_workout_ledger"');
    expect(routes).toContain('app.post("/api/workouts", isAuthenticated');
    expect(routes).toContain('eq(workouts.userId, req.session.userId!)');
    expect(client).toContain('aria-label="Workout rest timer"');
    expect(client).toContain('aria-label="Default workout load unit"');
    expect(client).toContain('loadUnit: set.load ? set.loadUnit : null');
    expect(profileRoutes).toContain("selectWorkoutExerciseRows");
  });

  it("copies a food diary day only into an empty day to prevent accidental duplicate intake records", () => {
    const routes = readFileSync(resolve(process.cwd(), "server/routes/nutrition.ts"), "utf8");
    expect(routes).toContain('app.post("/api/nutrition/diary/copy-day", isAuthenticated');
    expect(routes).toContain("Copying is intentionally blocked to prevent duplicates");
    expect(routes).toContain("copyToDate(entry.occurredAt, parsed.data.targetDate, timeContext.timeZone)");
  });

  it("offers nutrition history only from user-owned diary records and preserves missing-data disclosure", () => {
    const routes = readFileSync(resolve(process.cwd(), "server/routes/nutrition.ts"), "utf8");
    expect(routes).toContain('app.get("/api/nutrition/trends", isAuthenticated');
    expect(routes).toContain("A missing value means no recorded value, not zero intake");
    expect(routes).toContain("eq(nutritionDiaryEntries.userId, req.session.userId!)");
    expect(readFileSync(resolve(process.cwd(), "client/src/components/health/NutritionDiary.tsx"), "utf8")).toContain("Nutrition history period");
  });

  it("records newly logged workouts at the individual-set level without losing legacy exercise compatibility", () => {
    const migration = readFileSync(resolve(process.cwd(), "migrations/0037_workout_sets.sql"), "utf8");
    const releaseRunner = readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8");
    const routes = readFileSync(resolve(process.cwd(), "server/routes/workouts.ts"), "utf8");
    const profileRoutes = readFileSync(resolve(process.cwd(), "server/routes/profile.ts"), "utf8");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "workout_sets"');
    expect(migration).toContain('"reps_in_reserve" integer');
    expect(releaseRunner).toContain('id: "0037_workout_sets"');
    expect(routes).toContain("setRecords: z.array(setRecordSchema)");
    expect(routes).toContain("A set needs a performed value, note, or an explicit skipped state");
    expect(routes).toContain("legacySetRecords(exercise)");
    expect(routes).toContain("workoutExerciseId: createdExercise.id");
    expect(profileRoutes).toContain("selectWorkoutSetRows");
    expect(readFileSync(resolve(process.cwd(), "client/src/components/health/WorkoutLog.tsx"), "utf8")).toContain(">Repeat</Button>");
    expect(routes).toContain('app.put("/api/workouts/:id", isAuthenticated');
    expect(routes).toContain('eq(workouts.userId, req.session.userId!)');
    expect(routes).toContain('tx.delete(workoutExercises)');
  });

  it("summarizes recorded training only within valid, named formula boundaries", () => {
    expect(epleyEstimatedOneRepMax(100, 5)).toBe(116.67);
    expect(epleyEstimatedOneRepMax(100, 11)).toBeNull();
    expect(epleyEstimatedOneRepMax(null, 5)).toBeNull();
    expect(summarizeExerciseProgress([
      { occurredAt: new Date("2026-08-01T12:00:00.000Z"), exerciseName: "Squat", reps: 5, loadValue: 100, loadUnit: "kg", completed: true },
      { occurredAt: new Date("2026-08-02T12:00:00.000Z"), exerciseName: "Squat", reps: 3, loadValue: 110, loadUnit: "kg", completed: true },
      { occurredAt: new Date("2026-08-03T12:00:00.000Z"), exerciseName: "Squat", reps: 5, loadValue: 225, loadUnit: "lb", completed: true },
      { occurredAt: new Date("2026-08-04T12:00:00.000Z"), exerciseName: "Squat", reps: 5, loadValue: 120, loadUnit: "kg", completed: false },
    ])).toEqual([
      { exerciseName: "Squat", loadUnit: "lb", totalVolume: 1125, estimatedOneRepMax: 262.5, bestObservedLoad: 225, performedSets: 1, lastPerformedAt: "2026-08-03T12:00:00.000Z" },
      { exerciseName: "Squat", loadUnit: "kg", totalVolume: 830, estimatedOneRepMax: 121, bestObservedLoad: 110, performedSets: 2, lastPerformedAt: "2026-08-02T12:00:00.000Z" },
    ]);
  });

  it("derives all-time records from traceable completed sets without turning them into rank", () => {
    expect(summarizeExerciseRecords([
      { workoutId: 10, setId: 100, occurredAt: new Date("2026-08-01T12:00:00.000Z"), exerciseName: "Squat", reps: 5, loadValue: 100, loadUnit: "kg", completed: true },
      { workoutId: 11, setId: 101, occurredAt: new Date("2026-08-02T12:00:00.000Z"), exerciseName: "squat", reps: 3, loadValue: 110, loadUnit: "kg", completed: true },
      { workoutId: 12, setId: 102, occurredAt: new Date("2026-08-03T12:00:00.000Z"), exerciseName: "Squat", reps: 1, loadValue: 120, loadUnit: "kg", completed: false },
    ])).toEqual([{
      exerciseName: "Squat", loadUnit: "kg", bestObservedLoad: 110, observedLoadAt: "2026-08-02T12:00:00.000Z", observedLoadWorkoutId: 11, observedLoadSetId: 101,
      bestEstimatedOneRepMax: 121, estimatedOneRepMaxAt: "2026-08-02T12:00:00.000Z", estimatedWorkoutId: 11, estimatedSetId: 101,
    }]);
    expect(workoutCalculationRegistry.estimatedOneRepMax.id).toBe("epley-1rm-v1");
    const routes = readFileSync(resolve(process.cwd(), "server/routes/workouts.ts"), "utf8");
    expect(routes).toContain('app.get("/api/workouts/records", isAuthenticated');
    expect(routes).toContain("do not establish general strength, rank, health, or competence");
  });

  it("offers a bounded, user-owned cross-date workout history without presenting a fitness score", () => {
    const routes = readFileSync(resolve(process.cwd(), "server/routes/workouts.ts"), "utf8");
    const client = readFileSync(resolve(process.cwd(), "client/src/components/health/WorkoutLog.tsx"), "utf8");
    expect(routes).toContain('app.get("/api/workouts/history", isAuthenticated');
    expect(routes).toContain('app.get("/api/workouts/:id", isAuthenticated');
    expect(routes).toContain("ilike(workouts.activityType");
    expect(routes).toContain(".offset(page * limit)");
    expect(routes).toContain('eq(workouts.userId, req.session.userId!)');
    expect(routes).toContain("not an adherence, readiness, or fitness score");
    expect(client).toContain("loadHistoricalWorkout");
    expect(client).toContain("window.sessionStorage.setItem(workoutDraftKey");
    expect(client).toContain("Draft saved in this account session");
  });

  it("calculates cardio pace from recorded moving time while preserving sourced session observations", () => {
    expect(summarizeCardioSessions([
      { workoutId: 1, occurredAt: new Date("2026-08-02T12:00:00.000Z"), distanceMeters: 5000, durationSeconds: 1800, completed: true, movingTimeSeconds: 1500, elevationGainMeters: 80, averageHeartRateBpm: 145, maxHeartRateBpm: 170, heartRateSource: "device" },
      { workoutId: 2, occurredAt: new Date("2026-08-01T12:00:00.000Z"), distanceMeters: 1000, durationSeconds: null, completed: true },
    ])).toEqual([
      { workoutId: 1, occurredAt: "2026-08-02T12:00:00.000Z", distanceMeters: 5000, durationSeconds: 1800, recordedSets: 1, movingTimeSeconds: 1500, elevationGainMeters: 80, averageHeartRateBpm: 145, maxHeartRateBpm: 170, heartRateSource: "device", paceSecondsPerKilometer: 300, speedKilometersPerHour: 12 },
      { workoutId: 2, occurredAt: "2026-08-01T12:00:00.000Z", distanceMeters: 1000, durationSeconds: 0, recordedSets: 1, movingTimeSeconds: null, elevationGainMeters: null, averageHeartRateBpm: null, maxHeartRateBpm: null, heartRateSource: null, paceSecondsPerKilometer: null, speedKilometersPerHour: null },
    ]);
    const migration = readFileSync(resolve(process.cwd(), "migrations/0050_workout_cardio_details.sql"), "utf8");
    const releaseRunner = readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8");
    const routes = readFileSync(resolve(process.cwd(), "server/routes/workouts.ts"), "utf8");
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "moving_time_seconds"');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "heart_rate_source"');
    expect(routes).toContain('period: { startDate, endDate, timeZone }');
    expect(routes).toContain("derives pace and speed from recorded distance and moving time");
    expect(releaseRunner).toContain('id: "0050_workout_cardio_details"');
    expect(routes).toContain("Heart-rate source is required when heart rate is recorded");
    expect(routes).toContain("does not establish cardiovascular health, zones, readiness, or a clinical conclusion");
  });

  it("keeps planned workout templates private and distinct from completed workout evidence", () => {
    const migration = readFileSync(resolve(process.cwd(), "migrations/0038_workout_templates.sql"), "utf8");
    const releaseRunner = readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8");
    const routes = readFileSync(resolve(process.cwd(), "server/routes/workouts.ts"), "utf8");
    const profileRoutes = readFileSync(resolve(process.cwd(), "server/routes/profile.ts"), "utf8");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "workout_templates"');
    expect(releaseRunner).toContain('id: "0038_workout_templates"');
    expect(routes).toContain('app.post("/api/workout-templates", isAuthenticated');
    expect(routes).toContain('app.patch("/api/workout-templates/:id", isAuthenticated');
    expect(routes).toContain('eq(workoutTemplates.userId, req.session.userId!)');
    expect(profileRoutes).toContain('"workout_templates"');
  });

  it("provides a source-aware private exercise library with owner-scoped correction and archive behavior", () => {
    const migration = readFileSync(resolve(process.cwd(), "migrations/0048_exercise_definitions.sql"), "utf8");
    const releaseRunner = readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8");
    const routes = readFileSync(resolve(process.cwd(), "server/routes/exercises.ts"), "utf8");
    const routeRegistry = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
    const workoutClient = readFileSync(resolve(process.cwd(), "client/src/components/health/WorkoutLog.tsx"), "utf8");
    const profileRoutes = readFileSync(resolve(process.cwd(), "server/routes/profile.ts"), "utf8");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "exercise_definitions"');
    expect(releaseRunner).toContain('id: "0048_exercise_definitions"');
    expect(routes).toContain('app.get("/api/exercises", isAuthenticated');
    expect(routes).toContain('app.patch("/api/exercises/:id/archive", isAuthenticated');
    expect(routes).toContain('eq(exerciseDefinitions.userId, req.session.userId!)');
    expect(routes).toContain('source: "user_custom"');
    expect(routeRegistry).toContain("registerExerciseRoutes(app)");
    expect(workoutClient).toContain('list="lyfeos-exercise-library"');
    expect(profileRoutes).toContain('"exercise_definitions"');
  });

  it("keeps scheduled training plans distinct from submitted workout evidence", () => {
    const migration = readFileSync(resolve(process.cwd(), "migrations/0049_workout_programs.sql"), "utf8");
    const releaseRunner = readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8");
    const routes = readFileSync(resolve(process.cwd(), "server/routes/training-programs.ts"), "utf8");
    const client = readFileSync(resolve(process.cwd(), "client/src/components/health/TrainingPrograms.tsx"), "utf8");
    const profileRoutes = readFileSync(resolve(process.cwd(), "server/routes/profile.ts"), "utf8");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "workout_programs"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "workout_program_sessions"');
    expect(migration).toContain('"status" <> \'completed\' OR "completed_workout_id" IS NOT NULL');
    expect(releaseRunner).toContain('id: "0049_workout_programs"');
    expect(routes).toContain('app.post("/api/workout-programs/:programId/sessions", isAuthenticated');
    expect(routes).toContain('app.patch("/api/workout-program-sessions/:id/complete", isAuthenticated');
    expect(routes).toContain('eq(workouts.userId, userId)');
    expect(client).toContain("Completion requires a linked submitted workout");
    expect(profileRoutes).toContain('"workout_program_sessions"');
  });

  it("keeps repeatable recipes source-owned and logs their ingredients as factual diary entries", () => {
    const migration = readFileSync(resolve(process.cwd(), "migrations/0032_nutrition_recipes.sql"), "utf8");
    const releaseRunner = readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8");
    const routes = readFileSync(resolve(process.cwd(), "server/routes/nutrition.ts"), "utf8");
    const profileRoutes = readFileSync(resolve(process.cwd(), "server/routes/profile.ts"), "utf8");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "nutrition_recipes"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "nutrition_recipe_ingredients"');
    expect(releaseRunner).toContain('id: "0032_nutrition_recipes"');
    expect(routes).toContain('app.post("/api/nutrition/recipes/:id/log", isAuthenticated');
    expect(routes).toContain("ingredient.grams * (parsed.data.servings / recipe.servings)");
    expect(routes).toContain('app.patch("/api/nutrition/recipes/:id", isAuthenticated');
    expect(routes).toContain('app.delete("/api/nutrition/recipes/:id", isAuthenticated');
    expect(routes).toContain("tx.delete(nutritionRecipeIngredients)");
    expect(profileRoutes).toContain("selectNutritionRecipeIngredientRows");
  });

  it("preserves immutable recipe composition revisions and user-owned meal folders", () => {
    const migration = readFileSync(resolve(process.cwd(), "migrations/0055_nutrition_recipe_revisions.sql"), "utf8");
    const releaseRunner = readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8");
    const routes = readFileSync(resolve(process.cwd(), "server/routes/nutrition.ts"), "utf8");
    const client = readFileSync(resolve(process.cwd(), "client/src/components/health/NutritionDiary.tsx"), "utf8");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "nutrition_recipe_revisions"');
    expect(releaseRunner).toContain('id: "0055_nutrition_recipe_revisions"');
    expect(routes).toContain("ingredientsSnapshot:");
    expect(routes).toContain('app.get("/api/nutrition/recipes/:id/revisions", isAuthenticated');
    expect(routes).toContain('app.post("/api/nutrition/recipes/:id/revisions/:revisionNumber/restore", isAuthenticated');
    expect(routes).toContain("Factual diary entries separately retain the nutrient snapshots");
    expect(routes).toContain("The selected composition was restored as a new version");
    expect(client).toContain('aria-label="Recipe folder"');
    expect(client).toContain("recipe.revisionCount");
    expect(client).toContain("Restore as new version");
  });

  it("reports food nutrient contributions from immutable diary evidence without treating missing values as zero", () => {
    const report = nutritionContributions([
      { entryId: 1, foodId: 10, foodName: "Oats", servingGrams: 50, nutrients: [{ nutrientKey: "energy_kcal", amountPer100g: 380, unit: "kcal" }, { nutrientKey: "fiber_g", amountPer100g: 10, unit: "g" }] },
      { entryId: 2, foodId: 11, foodName: "Water", servingGrams: 250, nutrients: [{ nutrientKey: "energy_kcal", amountPer100g: 0, unit: "kcal" }] },
    ]);
    expect(report.find((item) => item.nutrientKey === "energy_kcal")).toMatchObject({ total: 190, recordedEntries: 2, totalEntries: 2 });
    expect(report.find((item) => item.nutrientKey === "fiber_g")).toMatchObject({ total: 5, recordedEntries: 1, totalEntries: 2 });
    expect(report.find((item) => item.nutrientKey === "sodium_mg")).toMatchObject({ total: null, recordedEntries: 0, totalEntries: 2 });
    const routes = readFileSync(resolve(process.cwd(), "server/routes/nutrition.ts"), "utf8");
    const client = readFileSync(resolve(process.cwd(), "client/src/components/health/NutritionDiary.tsx"), "utf8");
    expect(routes).toContain('app.get("/api/nutrition/contributions", isAuthenticated');
    expect(routes).toContain("Missing coverage means unknown data");
    expect(client).toContain("Coverage: {selectedContribution.recordedEntries} of {selectedContribution.totalEntries} diary entries");
  });

  it("exposes a broad unit-safe nutrient registry while leaving omitted values unknown", () => {
    expect(Object.keys(nutrientDefinitions).length).toBeGreaterThanOrEqual(40);
    expect(nutrientDefinitions.vitamin_a_rae_ug.unit).toBe("µg RAE");
    expect(nutrientDefinitions.folate_dfe_ug.unit).toBe("µg DFE");
    const routes = readFileSync(resolve(process.cwd(), "server/routes/nutrition.ts"), "utf8");
    const client = readFileSync(resolve(process.cwd(), "client/src/components/health/NutritionDiary.tsx"), "utf8");
    expect(routes).toContain('app.get("/api/nutrition/nutrients", isAuthenticated');
    expect(routes).toContain("omitted nutrients remain unknown");
    expect(client).toContain("Blank stays unknown; a recorded 0 remains zero");
  });

  it("supports factual cross-date nutrition review and meal-level summaries without planning future intake", () => {
    const client = readFileSync(resolve(process.cwd(), "client/src/components/health/NutritionDiary.tsx"), "utf8");
    expect(client).toContain("const [date, setDate] = useState(today)");
    expect(client).toContain('aria-label="Diary date"');
    expect(client).toContain("disabled={date >= today()}");
    expect(client).toContain('aria-label="Meal summaries"');
    expect(client).toContain("energy unknown");
  });

  it("previews recipe nutrition per serving and logs only the servings the user confirms", () => {
    const client = readFileSync(resolve(process.cwd(), "client/src/components/health/NutritionDiary.tsx"), "utf8");
    const routes = readFileSync(resolve(process.cwd(), "server/routes/nutrition.ts"), "utf8");
    expect(client).toContain('aria-label="Recipe nutrition per serving"');
    expect(client).toContain('aria-label="Consumed recipe servings"');
    expect(client).toContain("servings: Number(recipeLogServings)");
    expect(routes).toContain("ingredient.grams * (parsed.data.servings / recipe.servings)");
  });

  it("copies a selected meal without rewriting snapshots or duplicating a non-empty target", () => {
    const routes = readFileSync(resolve(process.cwd(), "server/routes/nutrition.ts"), "utf8");
    const client = readFileSync(resolve(process.cwd(), "client/src/components/health/NutritionDiary.tsx"), "utf8");
    expect(routes).toContain('app.post("/api/nutrition/diary/copy-meal", isAuthenticated');
    expect(routes).toContain("nutrientSnapshot: entry.nutrientSnapshot");
    expect(routes).toContain("The target meal already has entries. Copying is blocked to prevent duplicates.");
    expect(routes).toContain("eq(nutritionDiaryEntries.mealSlot, parsed.data.targetMealSlot)");
    expect(client).toContain("Copy previous {mealSlot}");
  });

  it("keeps meal plans separate from factual diary evidence until an explicit, duplicate-safe conversion", () => {
    const migration = readFileSync(resolve(process.cwd(), "migrations/0052_nutrition_meal_plans.sql"), "utf8");
    const releaseRunner = readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8");
    const routes = readFileSync(resolve(process.cwd(), "server/routes/meal-plans.ts"), "utf8");
    const client = readFileSync(resolve(process.cwd(), "client/src/components/health/MealPlanner.tsx"), "utf8");
    const profileRoutes = readFileSync(resolve(process.cwd(), "server/routes/profile.ts"), "utf8");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "nutrition_meal_plans"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "nutrition_meal_plan_entries"');
    expect(releaseRunner).toContain('id: "0052_nutrition_meal_plans"');
    expect(routes).toContain('app.post("/api/nutrition/meal-plan-entries/:id/log", isAuthenticated');
    expect(routes).toContain('app.post("/api/nutrition/meal-plans/:id/duplicate", isAuthenticated');
    expect(routes).toContain('status: "planned", loggedDiaryEntryIds: []');
    expect(routes).toContain('eq(nutritionMealPlanEntries.status, "planned")');
    expect(routes).toContain("nutrientSnapshot:");
    expect(routes).toContain("It is not purchase, intake, or nutrition evidence");
    expect(client).toContain("then explicitly confirm anything you actually ate");
    expect(client).toContain("Logged as diary evidence");
    expect(client).toContain("This summarizes your plan decisions, not nutrition adherence");
    expect(client).toContain("Export CSV");
    expect(client).toContain("Duplicate next");
    expect(profileRoutes).toContain('"nutrition_meal_plan_entries"');
  });

  it("keeps supplement records private, user-owned, and explicitly non-medical", () => {
    const migration = readFileSync(resolve(process.cwd(), "migrations/0033_supplement_entries.sql"), "utf8");
    const releaseRunner = readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8");
    const routes = readFileSync(resolve(process.cwd(), "server/routes/health-fitness.ts"), "utf8");
    const profileRoutes = readFileSync(resolve(process.cwd(), "server/routes/profile.ts"), "utf8");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "supplement_entries"');
    expect(releaseRunner).toContain('id: "0033_supplement_entries"');
    expect(routes).toContain('app.post("/api/health-fitness/supplements", isAuthenticated');
    expect(routes).toContain("not medical advice or a medication record");
    expect(routes).toContain('app.patch("/api/health-fitness/supplements/:id", isAuthenticated');
    expect(routes).toContain('app.patch("/api/health-fitness/hydration/:id", isAuthenticated');
    expect(profileRoutes).toContain('"supplement_entries"');
  });

  it("links user-authored supplement schedule state to reversible factual ledger entries", () => {
    const migration = readFileSync(resolve(process.cwd(), "migrations/0051_supplement_schedules.sql"), "utf8");
    const releaseRunner = readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8");
    const routes = readFileSync(resolve(process.cwd(), "server/routes/supplement-schedules.ts"), "utf8");
    const registry = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
    const client = readFileSync(resolve(process.cwd(), "client/src/components/health/SupplementSchedules.tsx"), "utf8");
    const profileRoutes = readFileSync(resolve(process.cwd(), "server/routes/profile.ts"), "utf8");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "supplement_schedules"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "supplement_schedule_events"');
    expect(releaseRunner).toContain('id: "0051_supplement_schedules"');
    expect(routes).toContain('app.put("/api/supplement-schedules/:id/event", isAuthenticated');
    expect(routes).toContain("tx.insert(supplementEntries)");
    expect(routes).toContain("tx.delete(supplementEntries)");
    expect(routes).toContain("does not recommend products, doses, timing, treatment, or efficacy");
    expect(registry).toContain("registerSupplementScheduleRoutes(app)");
    expect(client).toContain("This is not product, dose, timing, or treatment advice");
    expect(profileRoutes).toContain('"supplement_schedule_events"');
  });

  it("keeps fasting as a private timing window with one active window per user", () => {
    const migration = readFileSync(resolve(process.cwd(), "migrations/0034_fasting_windows.sql"), "utf8");
    const releaseRunner = readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8");
    const routes = readFileSync(resolve(process.cwd(), "server/routes/health-fitness.ts"), "utf8");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "fasting_windows"');
    expect(releaseRunner).toContain('id: "0034_fasting_windows"');
    expect(routes).toContain('app.post("/api/health-fitness/fasting/start", isAuthenticated');
    expect(routes).toContain('A fasting window is already active');
    expect(routes).toContain('does not provide fasting recommendations');
    expect(routes).toContain('app.delete("/api/health-fitness/fasting/:id", isAuthenticated');
    expect(routes).toContain('app.patch("/api/health-fitness/fasting/:id", isAuthenticated');
    expect(routes).toContain("A fasting window must end after it starts");
    expect(routes).toContain('eq(fastingWindows.userId, req.session.userId!)');
  });

  it("aggregates only recorded fasting-window timing and discloses overlapping records", () => {
    expect(fastingTimingSummary([
      { startedAt: new Date("2026-08-20T00:00:00.000Z"), endedAt: new Date("2026-08-20T08:00:00.000Z") },
      { startedAt: new Date("2026-08-20T04:00:00.000Z"), endedAt: new Date("2026-08-20T06:00:00.000Z") },
      { startedAt: new Date("2026-08-21T00:00:00.000Z"), endedAt: null },
      { startedAt: new Date("2026-08-22T08:00:00.000Z"), endedAt: new Date("2026-08-22T07:00:00.000Z") },
    ])).toEqual({
      recordedWindows: 4,
      completedWindows: 2,
      inProgressWindows: 1,
      invalidCompletedWindows: 1,
      completedMinutes: 600,
      averageCompletedMinutes: 300,
      shortestCompletedMinutes: 120,
      longestCompletedMinutes: 480,
      overlappingCompletedWindows: 1,
    });
    const routes = readFileSync(resolve(process.cwd(), "server/routes/health-fitness.ts"), "utf8");
    const client = readFileSync(resolve(process.cwd(), "client/src/components/health/DailyHealthLog.tsx"), "utf8");
    expect(routes).toContain("aggregationBasis: \"windows_started_in_selected_period\"");
    expect(routes).toContain("overlapping windows are disclosed and not deduplicated");
    expect(routes).toContain("adherence scores");
    expect(client).toContain("Recorded completed time");
    expect(client).toContain("Summary of self-reported windows started during the selected period.");
  });

  it("keeps recovery activities and voluntary body context private and non-clinical", () => {
    const migration = readFileSync(resolve(process.cwd(), "migrations/0035_body_context_and_recovery.sql"), "utf8");
    const releaseRunner = readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8");
    const recoveryRoutes = readFileSync(resolve(process.cwd(), "server/routes/recovery.ts"), "utf8");
    const healthRoutes = readFileSync(resolve(process.cwd(), "server/routes/health-fitness.ts"), "utf8");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "recovery_activities"');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "body_type"');
    expect(releaseRunner).toContain('id: "0035_body_context_and_recovery"');
    expect(recoveryRoutes).toContain('app.post("/api/recovery-activities", isAuthenticated');
    expect(recoveryRoutes).toContain('does not infer treatment, readiness, or health outcomes');
    expect(healthRoutes).toContain('bodyType: z.enum');
  });

  it("supports custom recovery practices and intensity without assigning efficacy", () => {
    const migration = readFileSync(resolve(process.cwd(), "migrations/0042_recovery_activity_details.sql"), "utf8");
    const releaseRunner = readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8");
    const routes = readFileSync(resolve(process.cwd(), "server/routes/recovery.ts"), "utf8");
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "custom_label"');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "intensity"');
    expect(releaseRunner).toContain('id: "0042_recovery_activity_details"');
    expect(routes).toContain('input.activityType !== "other" || !!input.customLabel');
    expect(routes).toContain('intensity: z.number().int().min(1).max(10)');
    expect(routes).toContain('app.patch("/api/recovery-activities/:id", isAuthenticated');
    expect(routes).toContain("tags: parsed.data.tags");
    expect(readFileSync(resolve(process.cwd(), "migrations/0047_recovery_activity_tags.sql"), "utf8")).toContain('ADD COLUMN IF NOT EXISTS "tags"');
    expect(releaseRunner).toContain('id: "0047_recovery_activity_tags"');
    expect(routes).toContain('eq(recoveryActivities.userId, req.session.userId!)');
  });

  it("offers recovery trends as a transparent summary of logged activity, not a readiness claim", () => {
    const routes = readFileSync(resolve(process.cwd(), "server/routes/recovery.ts"), "utf8");
    expect(routes).toContain('app.get("/api/recovery-activities/trends", isAuthenticated');
    expect(routes).toContain("does not infer readiness, treatment, or outcomes");
    expect(routes).toContain("minutes: current.minutes + (activity.durationMinutes || 0)");
  });

  it("preserves performance and lab observations with provenance instead of clinical interpretation", () => {
    const migration = readFileSync(resolve(process.cwd(), "migrations/0036_health_observations.sql"), "utf8");
    const releaseRunner = readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8");
    const routes = readFileSync(resolve(process.cwd(), "server/routes/health-observations.ts"), "utf8");
    const profileRoutes = readFileSync(resolve(process.cwd(), "server/routes/profile.ts"), "utf8");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "health_observations"');
    expect(migration).toContain('"reference_low" real');
    expect(releaseRunner).toContain('id: "0036_health_observations"');
    expect(routes).toContain('app.post("/api/health-observations", isAuthenticated');
    expect(routes).toContain('app.patch("/api/health-observations/:id", isAuthenticated');
    expect(routes).toContain('const userId = req.session.userId!');
    expect(routes).toContain('eq(healthObservations.userId, userId)');
    expect(routes).toContain('does not diagnose or interpret clinical results');
    expect(profileRoutes).toContain('"health_observations"');
  });
  it("preserves ingredient labels and parses only top-level label items without a universal harmfulness claim", () => {
    const migration = readFileSync(resolve(process.cwd(), "migrations/0039_ingredient_scanner_foundation.sql"), "utf8");
    const releaseRunner = readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8");
    const routes = readFileSync(resolve(process.cwd(), "server/routes/ingredient-scanner.ts"), "utf8");
    const profileRoutes = readFileSync(resolve(process.cwd(), "server/routes/profile.ts"), "utf8");
    expect(parseIngredientLabel("Ingredients: water, natural flavor (vanilla extract, salt); cane sugar")).toEqual([
      { rawName: "water", normalizedKey: "water", sourceOrder: 0 },
      { rawName: "natural flavor (vanilla extract, salt)", normalizedKey: "natural_flavor_vanilla_extract_salt", sourceOrder: 1 },
      { rawName: "cane sugar", normalizedKey: "cane_sugar", sourceOrder: 2 },
    ]);
    expect(normalizeIngredientKey("Citric-Acid / E330")).toBe("citric_acid_e330");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "ingredient_scans"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "ingredient_scan_items"');
    expect(releaseRunner).toContain('id: "0039_ingredient_scanner_foundation"');
    expect(releaseRunner).toContain('id: "0040_ingredient_preference_rules"');
    expect(routes).toContain('app.post("/api/ingredient-scans", isAuthenticated');
    expect(routes).toContain('app.post("/api/ingredient-preferences", isAuthenticated');
    expect(routes).toContain("does not make a universal harmfulness");
    expect(profileRoutes).toContain('"ingredient_scan_items"');
    expect(profileRoutes).toContain('"ingredient_preference_rules"');
  });
});
