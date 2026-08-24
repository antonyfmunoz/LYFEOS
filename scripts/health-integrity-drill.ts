import "dotenv/config";
import { pool } from "../server/db";
import { collectHealthIntegrityCounts } from "../server/health-integrity-db";
import {
  healthIntegrityDurationSummary,
  healthIntegrityQueryTimeoutMs,
  healthIntegrityReport,
} from "../server/health-integrity";

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`Expected an integer from ${minimum} through ${maximum}`);
  }
  return parsed;
}

async function run(): Promise<void> {
  const iterations = boundedInteger(process.env.HEALTH_INTEGRITY_DRILL_ITERATIONS, 3, 1, 20);
  const durations: number[] = [];
  let latestReport: ReturnType<typeof healthIntegrityReport> | null = null;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const startedAt = performance.now();
    const now = new Date();
    latestReport = healthIntegrityReport(await collectHealthIntegrityCounts(now), now);
    durations.push(Math.round(performance.now() - startedAt));
  }
  const timing = healthIntegrityDurationSummary(durations);
  const receipt = {
    status: latestReport?.status ?? "unavailable",
    policyVersion: latestReport?.policyVersion,
    incidents: latestReport?.incidents,
    timing,
    databaseStatementTimeoutMs: healthIntegrityQueryTimeoutMs,
    readOnly: true,
  };
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  if (latestReport?.status !== "healthy" || timing.maximumMs >= healthIntegrityQueryTimeoutMs) process.exitCode = 1;
}

run()
  .catch(() => {
    process.stderr.write("Health integrity drill failed without exposing database or health details.\n");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
