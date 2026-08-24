import crypto from "node:crypto";

export const healthIntegrityPolicyVersion = "health-integrity-v1";
export const healthIntegrityPlanningExecutionMs = 15 * 60 * 1000;
export const healthIntegrityConsecutiveFailureAlert = 3;
export const healthIntegrityQueryTimeoutMs = 3_000;

export interface HealthIntegrityCounts {
  completedSessionsMissingEvidenceReceipt: number;
  nonCompletedSessionsWithEvidenceLink: number;
  workoutEvidenceOwnerMismatches: number;
  completedSessionsWithDeletedEvidenceReceipt: number;
  staleExecutingPlanningDrafts: number;
  nonSucceededDraftsWithMissionLink: number;
  succeededDraftsWithoutCurrentMission: number;
  sourceRecordOwnerMismatches: number;
  importRunOwnerMismatches: number;
  importFailureOwnerMismatches: number;
  syncCursorOwnerMismatches: number;
  staleImportRuns: number;
  staleSyncCursors: number;
  overdueRetryFailures: number;
  overdueRetryCursors: number;
  abandonedImportFailures: number;
  repeatedlyFailingSyncCursors: number;
  activeConnectionsWithSyncError: number;
}

const criticalKeys: (keyof HealthIntegrityCounts)[] = [
  "completedSessionsMissingEvidenceReceipt",
  "nonCompletedSessionsWithEvidenceLink",
  "workoutEvidenceOwnerMismatches",
  "nonSucceededDraftsWithMissionLink",
  "sourceRecordOwnerMismatches",
  "importRunOwnerMismatches",
  "importFailureOwnerMismatches",
  "syncCursorOwnerMismatches",
];

const warningKeys: (keyof HealthIntegrityCounts)[] = [
  "staleExecutingPlanningDrafts",
  "staleImportRuns",
  "staleSyncCursors",
  "overdueRetryFailures",
  "overdueRetryCursors",
  "abandonedImportFailures",
  "repeatedlyFailingSyncCursors",
  "activeConnectionsWithSyncError",
];

export function healthMonitorTokenMatches(expected: string | undefined, supplied: string | undefined): boolean {
  if (!expected || expected.length < 32 || !supplied) return false;
  const expectedDigest = crypto.createHash("sha256").update(expected, "utf8").digest();
  const suppliedDigest = crypto.createHash("sha256").update(supplied, "utf8").digest();
  return crypto.timingSafeEqual(suppliedDigest, expectedDigest);
}

export function healthIntegrityReport(counts: HealthIntegrityCounts, checkedAt = new Date()) {
  const criticalCount = criticalKeys.reduce((sum, key) => sum + counts[key], 0);
  const warningCount = warningKeys.reduce((sum, key) => sum + counts[key], 0);
  const status = criticalCount > 0 ? "critical" : warningCount > 0 ? "degraded" : "healthy";
  return {
    status,
    checkedAt: checkedAt.toISOString(),
    policyVersion: healthIntegrityPolicyVersion,
    incidents: { critical: criticalCount, warning: warningCount },
    counts,
  } as const;
}

export function createHealthIntegritySingleFlight<T>() {
  let active: Promise<T> | null = null;
  return (run: () => Promise<T>): Promise<T> => {
    if (active) return active;
    active = run().finally(() => {
      active = null;
    });
    return active;
  };
}

export function healthIntegrityDurationSummary(durationsMs: number[]) {
  if (!durationsMs.length || durationsMs.some((duration) => !Number.isFinite(duration) || duration < 0)) {
    throw new Error("At least one valid duration is required");
  }
  const sorted = [...durationsMs].sort((a, b) => a - b);
  const percentileIndex = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  return {
    iterations: sorted.length,
    minimumMs: sorted[0],
    p95Ms: sorted[percentileIndex],
    maximumMs: sorted[sorted.length - 1],
  };
}
