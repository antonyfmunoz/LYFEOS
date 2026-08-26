import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createHealthIntegritySingleFlight,
  type HealthIntegrityCounts,
  healthIntegrityDurationSummary,
  healthIntegrityReport,
  healthMonitorTokenMatches,
} from "../server/health-integrity";
import { sendSentryProbe, sentryProbeMessage } from "../server/sentry-probe";

const root = path.resolve(import.meta.dirname, "..");
const zeroCounts = (): HealthIntegrityCounts => ({
  completedSessionsMissingEvidenceReceipt: 0,
  nonCompletedSessionsWithEvidenceLink: 0,
  workoutEvidenceOwnerMismatches: 0,
  completedSessionsWithDeletedEvidenceReceipt: 0,
  staleExecutingPlanningDrafts: 0,
  nonSucceededDraftsWithMissionLink: 0,
  succeededDraftsWithoutCurrentMission: 0,
  sourceRecordOwnerMismatches: 0,
  importRunOwnerMismatches: 0,
  importFailureOwnerMismatches: 0,
  syncCursorOwnerMismatches: 0,
  staleImportRuns: 0,
  staleSyncCursors: 0,
  overdueRetryFailures: 0,
  overdueRetryCursors: 0,
  abandonedImportFailures: 0,
  repeatedlyFailingSyncCursors: 0,
  activeConnectionsWithSyncError: 0,
});

describe("value-free health integrity telemetry", () => {
  it("fails the monitor token boundary closed and compares valid tokens safely", () => {
    const token = "a-secure-monitor-token-that-is-over-32-characters";
    expect(healthMonitorTokenMatches(undefined, token)).toBe(false);
    expect(healthMonitorTokenMatches("too-short", "too-short")).toBe(false);
    expect(healthMonitorTokenMatches(token, `${token}-different`)).toBe(false);
    expect(healthMonitorTokenMatches(token, token)).toBe(true);
  });

  it("separates critical integrity defects, operational warnings, and informational deletion state", () => {
    const healthy = zeroCounts();
    healthy.completedSessionsWithDeletedEvidenceReceipt = 2;
    healthy.succeededDraftsWithoutCurrentMission = 1;
    expect(healthIntegrityReport(healthy).status).toBe("healthy");

    const degraded = zeroCounts();
    degraded.staleImportRuns = 1;
    expect(healthIntegrityReport(degraded)).toMatchObject({ status: "degraded", incidents: { critical: 0, warning: 1 } });

    const critical = zeroCounts();
    critical.workoutEvidenceOwnerMismatches = 1;
    expect(healthIntegrityReport(critical)).toMatchObject({ status: "critical", incidents: { critical: 1, warning: 0 } });
  });

  it("coalesces concurrent snapshots and reports deterministic drill timing", async () => {
    const singleFlight = createHealthIntegritySingleFlight<number>();
    let executions = 0;
    let release: ((value: number) => void) | undefined;
    const first = singleFlight(() => {
      executions += 1;
      return new Promise<number>((resolve) => { release = resolve; });
    });
    const second = singleFlight(async () => {
      executions += 1;
      return 2;
    });
    expect(first).toBe(second);
    expect(executions).toBe(1);
    release?.(1);
    await expect(second).resolves.toBe(1);
    await expect(singleFlight(async () => 3)).resolves.toBe(3);
    expect(healthIntegrityDurationSummary([12, 3, 8, 5])).toEqual({ iterations: 4, minimumMs: 3, p95Ms: 12, maximumMs: 12 });
    expect(() => healthIntegrityDurationSummary([])).toThrow();
  });

  it("exposes only protected aggregate classifications and wires them into the production monitor", () => {
    const route = fs.readFileSync(path.join(root, "server/routes/operations.ts"), "utf8");
    const insightRoutes = fs.readFileSync(path.join(root, "server/routes/health-insights.ts"), "utf8");
    const workflow = fs.readFileSync(path.join(root, ".github/workflows/production-monitor.yml"), "utf8");
    expect(route).toContain('app.get("/api/operations/health-integrity"');
    expect(route).toContain('req.header("x-lyfeos-monitor-token")');
    expect(route).toContain('res.status(404).json({ error: "Not found" })');
    expect(route).not.toMatch(/source_payload|evidence_series|credential_ref|cursor_value|\bnote\b/i);
    expect(workflow).toContain("secrets.LYFEOS_MONITOR_TOKEN");
    expect(workflow).toContain("/api/operations/health-integrity");
    expect(insightRoutes).toContain("health-planning-draft:${id}");
    expect(insightRoutes).toContain("The draft remains pending so a confirmed retry is safe.");
  });

  it("sends a fixed, content-free, manually tagged Sentry probe and waits for transport flush", async () => {
    const captures: Array<{ exception: Error; context: unknown }> = [];
    const result = await sendSentryProbe({
      captureException(exception, context) {
        captures.push({ exception, context });
        return "0123456789abcdef0123456789abcdef";
      },
      async flush(timeout) {
        expect(timeout).toBe(2_000);
        return true;
      },
    });

    expect(result).toEqual({ status: "sent", eventId: "0123456789abcdef0123456789abcdef" });
    expect(captures).toHaveLength(1);
    expect(captures[0]?.exception).toMatchObject({ name: "LyfeOSObservabilityProbe", message: sentryProbeMessage });
    expect(captures[0]?.context).toEqual({
      level: "error",
      tags: { subsystem: "operations", probe: "manual", contains_user_data: "false" },
    });
  });

  it("keeps the Sentry probe protected, distributed-rate-limited, and manual-only", () => {
    const route = fs.readFileSync(path.join(root, "server/routes/operations.ts"), "utf8");
    const workflow = fs.readFileSync(path.join(root, ".github/workflows/production-monitor.yml"), "utf8");
    expect(route).toContain('app.post("/api/operations/sentry-probe"');
    expect(route).toContain('healthMonitorTokenMatches(configuredToken, req.header("x-lyfeos-monitor-token"))');
    expect(route).toContain('consumeDistributedRateLimit(pool, [bucket], 1, 60 * 60 * 1_000)');
    expect(route).toContain('rateLimitBucketHash(configuredToken!, "operations:sentry-probe"');
    expect(route).not.toMatch(/userId|email|username|source_payload|credential_ref/i);
    expect(workflow).toContain("sentry_probe:");
    expect(workflow).toContain("if: inputs.sentry_probe");
    expect(workflow).toContain("--request POST");
    expect(workflow).not.toContain("SENTRY_DSN: ${{ secrets.SENTRY_DSN }}");
  });

  it("keeps recurring aggregate checks on an explicit release-migrated index path", () => {
    const migration = fs.readFileSync(path.join(root, "migrations/0073_health_integrity_monitor_indexes.sql"), "utf8");
    const release = fs.readFileSync(path.join(root, "server/release-migrate.ts"), "utf8");
    const schema = fs.readFileSync(path.join(root, "shared/schema.ts"), "utf8");
    const indexes = [
      "workout_program_sessions_status_completion_idx",
      "workout_program_sessions_completed_workout_idx",
      "health_planning_drafts_state_decided_idx",
      "health_source_records_connection_user_idx",
      "health_import_runs_status_started_idx",
      "health_import_failures_status_retry_idx",
      "health_sync_cursors_status_attempt_idx",
      "health_connections_status_error_idx",
    ];
    for (const indexName of indexes) {
      expect(migration).toContain(`\"${indexName}\"`);
      expect(release).toContain(`\"${indexName}\"`);
      expect(schema).toContain(`\"${indexName}\"`);
    }
    expect(release).toContain('id: "0073_health_integrity_monitor_indexes"');
  });

  it("bounds the database work and provides a sanitized read-only staging drill", () => {
    const database = fs.readFileSync(path.join(root, "server/health-integrity-db.ts"), "utf8");
    const drill = fs.readFileSync(path.join(root, "scripts/health-integrity-drill.ts"), "utf8");
    const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");
    expect(database).toContain("SET LOCAL transaction_read_only = on");
    expect(database).toContain("SET LOCAL statement_timeout");
    expect(drill).toContain("HEALTH_INTEGRITY_DRILL_ITERATIONS");
    expect(drill).toContain('readOnly: true');
    expect(drill).not.toMatch(/source_payload|evidence_series|credential_ref|cursor_value|\bnote\b/i);
    expect(packageJson).toContain('"ops:health-integrity": "tsx scripts/health-integrity-drill.ts"');
  });
});
