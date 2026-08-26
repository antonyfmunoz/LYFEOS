import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { healthSyncRunCountsSchema } from "../server/health-sync";

const root = path.resolve(import.meta.dirname, "..");

describe("provider import run receipts", () => {
  it("validates bounded, internally consistent counters", () => {
    expect(healthSyncRunCountsSchema.safeParse({ fetchedCount: 4, importedCount: 1, replayedCount: 1, correctedCount: 1, suppressedCount: 1, failedCount: 1 }).success).toBe(true);
    expect(healthSyncRunCountsSchema.safeParse({ fetchedCount: 1, importedCount: 1, replayedCount: 1, correctedCount: 0, suppressedCount: 0, failedCount: 0 }).success).toBe(false);
    expect(healthSyncRunCountsSchema.safeParse({ fetchedCount: 1, importedCount: 0, replayedCount: 0, correctedCount: 1, suppressedCount: 0, failedCount: 0 }).success).toBe(false);
    expect(healthSyncRunCountsSchema.safeParse({ fetchedCount: 0, importedCount: 0, replayedCount: 0, correctedCount: 0, suppressedCount: 0, failedCount: 1 }).success).toBe(true);
    expect(healthSyncRunCountsSchema.safeParse({ fetchedCount: 0, importedCount: 0, replayedCount: 0, correctedCount: 0, suppressedCount: 0, failedCount: 2 }).success).toBe(false);
  });

  it("stores sanitized run and failure receipts without payloads, cursors, or vendor messages", () => {
    const migration = fs.readFileSync(path.join(root, "migrations/0066_health_connection_foundation.sql"), "utf8");
    const schema = fs.readFileSync(path.join(root, "shared/schema.ts"), "utf8");
    for (const table of ["health_import_runs", "health_import_failures"]) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS "${table}"`);
      expect(schema).toContain(`pgTable("${table}"`);
    }
    const runSql = migration.slice(migration.indexOf('CREATE TABLE IF NOT EXISTS "health_import_runs"'), migration.indexOf('CREATE TABLE IF NOT EXISTS "health_source_records"'));
    expect(runSql).not.toContain("cursor_value");
    expect(runSql).not.toContain("source_payload");
    expect(runSql).not.toContain("error_message");
  });

  it("orchestrates durable records before cursor completion and records normalized failure codes", () => {
    const page = fs.readFileSync(path.join(root, "server/health-import-page-service.ts"), "utf8");
    expect(page.indexOf("ingestProviderHealthEnvelope")).toBeLessThan(page.indexOf("completeHealthSync"));
    expect(page).toContain("healthImportFailureCode(error, input.failureCode)");
    expect(page).toContain("retryable: healthImportFailureIsRetryable(error)");
    expect(page).toContain("counts.suppressedCount += 1");
    expect(page).toContain("counts.replayedCount += 1");
    expect(page).not.toContain("error.message");
  });
});
