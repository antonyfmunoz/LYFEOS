import { readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

const assetsDirectory = resolve(process.cwd(), "dist/public/assets");
const files = await readdir(assetsDirectory);
const javascript = await Promise.all(files.filter((name) => name.endsWith(".js")).map(async (name) => ({ name, bytes: (await stat(resolve(assetsDirectory, name))).size })));

if (!javascript.length) throw new Error("Bundle budget could not find built JavaScript assets.");

const checks = [
  { label: "largest JavaScript chunk", match: () => true, limit: 420_000 },
  { label: "Health route chunk", match: (name) => /^HealthDetailPage-.*\.js$/.test(name), limit: 100_000 },
  { label: "deferred Health feature chunk", match: (name) => /^(?:DeferredFeature|NutritionDiary|NutritionReportsPanel|NutritionTrendChart|WorkoutLog|BodyProgress|RecoveryLog|RecoveryRoutines|HealthMetricsLedger|IngredientScanner|CapabilityEvidencePanel|SleepLog|HealthTimeline|ExerciseLibrary|TrainingPrograms|WorkoutAnalytics|SupplementSchedules|MealPlanner|HealthTrendWorkbench|HealthConnections|HealthDataRights|HealthProgression)-.*\.js$/.test(name), limit: 50_000 },
];

for (const check of checks) {
  const matches = javascript.filter((file) => check.match(file.name)).sort((left, right) => right.bytes - left.bytes);
  if (!matches.length) throw new Error(`Bundle budget could not find the ${check.label}.`);
  const largest = matches[0];
  if (largest.bytes > check.limit) throw new Error(`${check.label} ${largest.name} is ${largest.bytes} bytes; limit is ${check.limit} bytes.`);
  console.log(`${check.label}: ${largest.name} ${largest.bytes} / ${check.limit} bytes`);
}
