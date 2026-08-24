import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { deletionReceiptExpiry, healthMutationId, healthMutationPayloadHash } from "../server/health-mutation-integrity";
import { countHealthMutationQueue, offlineHealthStorageError } from "../client/src/lib/healthOfflineQueue";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("health mutation integrity", () => {
  it("canonicalizes object keys before hashing while preserving factual changes", () => {
    expect(healthMutationPayloadHash({ foodId: 3, details: { grams: 100, meal: "lunch" } }))
      .toBe(healthMutationPayloadHash({ details: { meal: "lunch", grams: 100 }, foodId: 3 }));
    expect(healthMutationPayloadHash({ grams: 100 })).not.toBe(healthMutationPayloadHash({ grams: 101 }));
  });

  it("accepts bounded opaque mutation identities and rejects malformed headers", () => {
    expect(healthMutationId("health_1234567890abcdef")).toBe("health_1234567890abcdef");
    expect(healthMutationId("too-short")).toBeNull();
    expect(healthMutationId("health mutation with spaces")).toBeNull();
    expect(healthMutationId(["health_1234567890abcdef"])).toBeNull();
  });

  it("limits a deletion receipt to ten minutes", () => {
    const now = new Date("2026-08-22T12:00:00.000Z");
    expect(deletionReceiptExpiry(now).toISOString()).toBe("2026-08-22T12:10:00.000Z");
  });

  it("keeps replay protection and undo in the migration, release, ownership, and export paths", () => {
    const migration = source("migrations/0056_health_mutation_integrity.sql");
    const releaseRunner = source("server/release-migrate.ts");
    const nutrition = source("server/routes/nutrition.ts");
    const workouts = source("server/routes/workouts.ts");
    const profile = source("server/routes/profile.ts");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "health_deletion_receipts"');
    expect(migration).toContain('nutrition_diary_entries_user_mutation_unique_idx');
    expect(migration).toContain('workouts_user_mutation_unique_idx');
    expect(releaseRunner).toContain('id: "0056_health_mutation_integrity"');
    for (const routes of [nutrition, workouts]) {
      expect(routes).toContain('req.header("x-lyfeos-mutation-id")');
      expect(routes).toContain("healthMutationId(rawMutationId)");
      expect(routes).toContain("mutationPayloadHash");
      expect(routes).toContain("res.status(409)");
      expect(routes).toContain("eq(healthDeletionReceipts.userId, userId)");
      expect(routes).toContain("isNull(healthDeletionReceipts.restoredAt)");
    }
    expect(profile).toContain('"health_deletion_receipts"');
    expect(source("server/index.ts")).toContain("startHealthDeletionReceiptCleanup();");
    expect(source("server/health-deletion-cleanup.ts")).toContain("lte(healthDeletionReceipts.expiresAt, now)");
  });

  it("stores offline health creates in account-scoped IndexedDB and reuses their identity", () => {
    const queue = source("client/src/lib/healthOfflineQueue.ts");
    const nutrition = source("client/src/components/health/NutritionDiary.tsx");
    const workouts = source("client/src/components/health/WorkoutLog.tsx");
    const sleep = source("client/src/components/health/SleepLog.tsx");
    const recovery = source("client/src/components/health/RecoveryLog.tsx");
    const daily = source("client/src/components/health/DailyHealthLog.tsx");
    const body = source("client/src/components/health/BodyProgress.tsx");
    const observations = source("client/src/components/health/HealthMetricsLedger.tsx");
    const sleepRoutes = source("server/routes/health-fitness.ts");
    const recoveryRoutes = source("server/routes/recovery.ts");
    const migration = source("migrations/0082_health_offline_capture.sql");
    const release = source("server/release-migrate.ts");
    const queueStatus = source("client/src/components/health/OfflineHealthQueueStatus.tsx");
    expect(queue).toContain('indexedDB.open(DATABASE_NAME');
    expect(queue).toContain('store.createIndex("userId", "userId"');
    expect(queue).toContain('"x-lyfeos-mutation-id": record.id');
    expect(queue).not.toContain("localStorage");
    expect(queue).not.toContain("caches.open");
    expect(queue).toContain('typeof indexedDB === "undefined"');
    expect(queue).toContain("QuotaExceededError");
    expect(queue).toContain("listHealthMutationQueue");
    expect(queue).toContain("retryHealthMutationQueueItem");
    expect(queue).toContain("discardHealthMutationQueueItem");
    expect(queueStatus).toContain("Records stored only on this device");
    expect(queueStatus).toContain("Permanently discard this unsynced record from this device?");
    expect(queueStatus).not.toContain("item.body");
    expect(nutrition).toContain("submitHealthMutation({ userId: user.id");
    expect(workouts).toContain("submitHealthMutation({ userId: user.id");
    expect(sleep).toContain('url: "/api/health-fitness/sleep/sessions"');
    expect(recovery).toContain('url: "/api/recovery-activities"');
    expect(daily).toContain('url: "/api/health-fitness/hydration"');
    expect(daily).toContain('url: "/api/health-fitness/supplements"');
    expect(daily).toContain('url: "/api/health-fitness/measurements"');
    expect(body).toContain('url: "/api/health-fitness/measurements"');
    expect(observations).toContain('url: "/api/health-observations"');
    for (const routes of [sleepRoutes, recoveryRoutes]) {
      expect(routes).toContain('req.header("x-lyfeos-mutation-id")');
      expect(routes).toContain("healthMutationPayloadHash(parsed.data)");
      expect(routes).toContain("replayed: true");
    }
    expect(migration).toContain('sleep_sessions_user_mutation_unique_idx');
    expect(migration).toContain('recovery_activities_user_mutation_unique_idx');
    expect(release).toContain('id: "0082_health_offline_capture"');
    expect(source("migrations/0083_health_daily_offline_capture.sql")).toContain('health_observations_user_mutation_unique_idx');
    expect(release).toContain('id: "0083_health_daily_offline_capture"');
  });

  it("fails closed with actionable messages when private offline storage is unavailable or full", async () => {
    expect(offlineHealthStorageError({ name: "QuotaExceededError" })).toMatchObject({ code: "quota" });
    expect(offlineHealthStorageError({ name: "QuotaExceededError" }).message).toContain("record was not saved");
    expect(offlineHealthStorageError({ name: "SecurityError" })).toMatchObject({ code: "unavailable" });
    expect(offlineHealthStorageError({ name: "BlockedError" })).toMatchObject({ code: "blocked" });

    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: undefined });
    try {
      await expect(countHealthMutationQueue(1)).rejects.toMatchObject({ name: "HealthOfflineStorageError", code: "unavailable" });
    } finally {
      if (descriptor) Object.defineProperty(globalThis, "indexedDB", descriptor);
      else delete (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    }
  });
});
