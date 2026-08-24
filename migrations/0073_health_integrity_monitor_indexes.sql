CREATE INDEX IF NOT EXISTS "workout_program_sessions_status_completion_idx"
  ON "workout_program_sessions" ("status", "completed_workout_id", "completion_link_lost_at");

CREATE INDEX IF NOT EXISTS "workout_program_sessions_completed_workout_idx"
  ON "workout_program_sessions" ("completed_workout_id");

CREATE INDEX IF NOT EXISTS "health_planning_drafts_state_decided_idx"
  ON "health_planning_drafts" ("state", "decided_at");

CREATE INDEX IF NOT EXISTS "health_source_records_connection_user_idx"
  ON "health_source_records" ("connection_id", "user_id");

CREATE INDEX IF NOT EXISTS "health_import_runs_status_started_idx"
  ON "health_import_runs" ("status", "started_at");

CREATE INDEX IF NOT EXISTS "health_import_failures_status_retry_idx"
  ON "health_import_failures" ("status", "next_retry_at", "resolved_at");

CREATE INDEX IF NOT EXISTS "health_sync_cursors_status_attempt_idx"
  ON "health_sync_cursors" ("status", "last_attempt_at", "next_retry_at", "consecutive_failures");

CREATE INDEX IF NOT EXISTS "health_connections_status_error_idx"
  ON "health_connections" ("status", "last_error_code");
