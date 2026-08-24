import { sql } from "drizzle-orm";
import { db } from "./db";
import { healthSyncLeaseMs } from "./health-sync";
import {
  healthIntegrityConsecutiveFailureAlert,
  type HealthIntegrityCounts,
  healthIntegrityPlanningExecutionMs,
  healthIntegrityQueryTimeoutMs,
} from "./health-integrity";

function countValue(row: Record<string, unknown>, key: string): number {
  const value = Number(row[key]);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid aggregate count for ${key}`);
  return value;
}

/** Runs one value-free fleet integrity snapshot in a bounded read-only transaction. */
export async function collectHealthIntegrityCounts(now: Date): Promise<HealthIntegrityCounts> {
  const staleSyncBefore = new Date(now.getTime() - healthSyncLeaseMs);
  const stalePlanningBefore = new Date(now.getTime() - healthIntegrityPlanningExecutionMs);
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL transaction_read_only = on`);
    await tx.execute(sql.raw(`SET LOCAL statement_timeout = '${healthIntegrityQueryTimeoutMs}ms'`));
    const result = await tx.execute(sql`
      SELECT
        (SELECT count(*)::int FROM workout_program_sessions
          WHERE status = 'completed' AND completed_workout_id IS NULL AND completion_link_lost_at IS NULL)
          AS "completedSessionsMissingEvidenceReceipt",
        (SELECT count(*)::int FROM workout_program_sessions
          WHERE status <> 'completed' AND completed_workout_id IS NOT NULL)
          AS "nonCompletedSessionsWithEvidenceLink",
        (SELECT count(*)::int FROM workout_program_sessions session
          JOIN workouts workout ON workout.id = session.completed_workout_id
          WHERE workout.user_id <> session.user_id)
          AS "workoutEvidenceOwnerMismatches",
        (SELECT count(*)::int FROM workout_program_sessions
          WHERE status = 'completed' AND completed_workout_id IS NULL AND completion_link_lost_at IS NOT NULL)
          AS "completedSessionsWithDeletedEvidenceReceipt",
        (SELECT count(*)::int FROM health_planning_drafts
          WHERE state = 'executing' AND decided_at IS NOT NULL AND decided_at <= ${stalePlanningBefore})
          AS "staleExecutingPlanningDrafts",
        (SELECT count(*)::int FROM health_planning_drafts
          WHERE state <> 'succeeded' AND quest_id IS NOT NULL)
          AS "nonSucceededDraftsWithMissionLink",
        (SELECT count(*)::int FROM health_planning_drafts
          WHERE state = 'succeeded' AND quest_id IS NULL)
          AS "succeededDraftsWithoutCurrentMission",
        (SELECT count(*)::int FROM health_source_records record
          JOIN health_connections connection ON connection.id = record.connection_id
          WHERE record.user_id <> connection.user_id)
          AS "sourceRecordOwnerMismatches",
        (SELECT count(*)::int FROM health_import_runs run
          JOIN health_connections connection ON connection.id = run.connection_id
          WHERE run.user_id <> connection.user_id)
          AS "importRunOwnerMismatches",
        (SELECT count(*)::int FROM health_import_failures failure
          JOIN health_connections connection ON connection.id = failure.connection_id
          JOIN health_import_runs run ON run.id = failure.run_id
          WHERE failure.user_id <> connection.user_id OR failure.user_id <> run.user_id OR failure.connection_id <> run.connection_id)
          AS "importFailureOwnerMismatches",
        (SELECT count(*)::int FROM health_sync_cursors cursor
          JOIN health_connections connection ON connection.id = cursor.connection_id
          WHERE cursor.user_id <> connection.user_id)
          AS "syncCursorOwnerMismatches",
        (SELECT count(*)::int FROM health_import_runs
          WHERE status = 'running' AND started_at <= ${staleSyncBefore})
          AS "staleImportRuns",
        (SELECT count(*)::int FROM health_sync_cursors
          WHERE status = 'syncing' AND (last_attempt_at IS NULL OR last_attempt_at <= ${staleSyncBefore}))
          AS "staleSyncCursors",
        (SELECT count(*)::int FROM health_import_failures
          WHERE status = 'retry_wait' AND resolved_at IS NULL AND next_retry_at IS NOT NULL AND next_retry_at <= ${now})
          AS "overdueRetryFailures",
        (SELECT count(*)::int FROM health_sync_cursors
          WHERE status = 'retry_wait' AND next_retry_at IS NOT NULL AND next_retry_at <= ${now})
          AS "overdueRetryCursors",
        (SELECT count(*)::int FROM health_import_failures
          WHERE status = 'abandoned' AND resolved_at IS NULL)
          AS "abandonedImportFailures",
        (SELECT count(*)::int FROM health_sync_cursors
          WHERE consecutive_failures >= ${healthIntegrityConsecutiveFailureAlert})
          AS "repeatedlyFailingSyncCursors",
        (SELECT count(*)::int FROM health_connections
          WHERE status = 'active' AND last_error_code IS NOT NULL)
          AS "activeConnectionsWithSyncError"
    `);
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) throw new Error("Health integrity aggregate query returned no row");
    return {
      completedSessionsMissingEvidenceReceipt: countValue(row, "completedSessionsMissingEvidenceReceipt"),
      nonCompletedSessionsWithEvidenceLink: countValue(row, "nonCompletedSessionsWithEvidenceLink"),
      workoutEvidenceOwnerMismatches: countValue(row, "workoutEvidenceOwnerMismatches"),
      completedSessionsWithDeletedEvidenceReceipt: countValue(row, "completedSessionsWithDeletedEvidenceReceipt"),
      staleExecutingPlanningDrafts: countValue(row, "staleExecutingPlanningDrafts"),
      nonSucceededDraftsWithMissionLink: countValue(row, "nonSucceededDraftsWithMissionLink"),
      succeededDraftsWithoutCurrentMission: countValue(row, "succeededDraftsWithoutCurrentMission"),
      sourceRecordOwnerMismatches: countValue(row, "sourceRecordOwnerMismatches"),
      importRunOwnerMismatches: countValue(row, "importRunOwnerMismatches"),
      importFailureOwnerMismatches: countValue(row, "importFailureOwnerMismatches"),
      syncCursorOwnerMismatches: countValue(row, "syncCursorOwnerMismatches"),
      staleImportRuns: countValue(row, "staleImportRuns"),
      staleSyncCursors: countValue(row, "staleSyncCursors"),
      overdueRetryFailures: countValue(row, "overdueRetryFailures"),
      overdueRetryCursors: countValue(row, "overdueRetryCursors"),
      abandonedImportFailures: countValue(row, "abandonedImportFailures"),
      repeatedlyFailingSyncCursors: countValue(row, "repeatedlyFailingSyncCursors"),
      activeConnectionsWithSyncError: countValue(row, "activeConnectionsWithSyncError"),
    };
  });
}
