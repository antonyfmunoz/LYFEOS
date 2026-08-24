import { and, eq, sql } from "drizzle-orm";
import { healthConnections, healthImportFailures, healthImportRuns, healthSyncCursors } from "@shared/schema";
import { db } from "./db";
import { HealthImportAuthorizationError } from "./health-import-service";
import { healthConnectionLockKey } from "./health-connections";
import { healthSyncCursorValueSchema, healthSyncErrorCodeSchema, healthSyncLeaseExpired, healthSyncLockKey, healthSyncResourceTypeSchema, healthSyncRunCountsSchema, nextHealthSyncRetryAt } from "./health-sync";

async function authorizedConnection(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], userId: number, connectionId: number) {
  const [connection] = await tx.select({ id: healthConnections.id, provider: healthConnections.provider, status: healthConnections.status, credentialRef: healthConnections.credentialRef }).from(healthConnections).where(and(
    eq(healthConnections.id, connectionId), eq(healthConnections.userId, userId),
  )).limit(1);
  if (!connection || connection.status !== "active" || !connection.credentialRef) throw new HealthImportAuthorizationError("The provider connection is not actively authorized.");
  return connection;
}

async function lockSync(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], connectionId: number, resourceType: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${healthConnectionLockKey(connectionId)}))`);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${healthSyncLockKey(connectionId, resourceType)}))`);
}

/** Starts one provider page. It never advances the stored opaque cursor. */
export async function beginHealthSync(input: { userId: number; connectionId: number; resourceType: string; attemptedAt?: Date }) {
  const resourceType = healthSyncResourceTypeSchema.parse(input.resourceType);
  const attemptedAt = input.attemptedAt || new Date();
  return db.transaction(async (tx) => {
    await lockSync(tx, input.connectionId, resourceType);
    const connection = await authorizedConnection(tx, input.userId, input.connectionId);
    const [existing] = await tx.select().from(healthSyncCursors).where(and(eq(healthSyncCursors.connectionId, input.connectionId), eq(healthSyncCursors.resourceType, resourceType))).limit(1);
    if (existing?.status === "syncing" && !healthSyncLeaseExpired(existing.lastAttemptAt, attemptedAt)) throw new Error("A sync is already active for this provider resource.");
    if (existing?.status === "retry_wait" && existing.nextRetryAt && existing.nextRetryAt > attemptedAt) throw new Error("This provider resource is waiting for its bounded retry time.");
    if (existing?.status === "syncing") {
      const staleRuns = await tx.select().from(healthImportRuns).where(and(
        eq(healthImportRuns.userId, input.userId), eq(healthImportRuns.connectionId, input.connectionId),
        eq(healthImportRuns.resourceType, resourceType), eq(healthImportRuns.status, "running"),
      ));
      for (const staleRun of staleRuns) {
        await tx.update(healthImportRuns).set({ status: "failed", failedCount: 1, errorCode: "SYNC.LEASE_EXPIRED", finishedAt: attemptedAt }).where(and(eq(healthImportRuns.id, staleRun.id), eq(healthImportRuns.status, "running")));
        await tx.insert(healthImportFailures).values({
          userId: input.userId, connectionId: input.connectionId, runId: staleRun.id, provider: staleRun.provider, resourceType,
          errorCode: "SYNC.LEASE_EXPIRED", retryable: true, status: "retry_wait", nextRetryAt: attemptedAt, createdAt: attemptedAt,
        });
      }
      await tx.update(healthSyncCursors).set({ consecutiveFailures: existing.consecutiveFailures + 1, updatedAt: attemptedAt }).where(eq(healthSyncCursors.id, existing.id));
    }
    const [cursor] = await tx.insert(healthSyncCursors).values({
      userId: input.userId, connectionId: input.connectionId, resourceType, status: "syncing", lastAttemptAt: attemptedAt, nextRetryAt: null, updatedAt: attemptedAt,
    }).onConflictDoUpdate({
      target: [healthSyncCursors.connectionId, healthSyncCursors.resourceType],
      set: { status: "syncing", lastAttemptAt: attemptedAt, nextRetryAt: null, updatedAt: attemptedAt },
    }).returning();
    const [run] = await tx.insert(healthImportRuns).values({ userId: input.userId, connectionId: input.connectionId, provider: connection.provider, resourceType, status: "running", startedAt: attemptedAt }).returning();
    return { cursor, run };
  });
}

/** Call only after every record in the fetched page is durable. */
export async function completeHealthSync(input: { userId: number; connectionId: number; runId: number; resourceType: string; nextCursor: string; counts: unknown; completedAt?: Date }) {
  const resourceType = healthSyncResourceTypeSchema.parse(input.resourceType);
  const nextCursor = healthSyncCursorValueSchema.parse(input.nextCursor);
  const counts = healthSyncRunCountsSchema.parse(input.counts);
  if (counts.failedCount !== 0) throw new Error("A successful sync run cannot include failed records.");
  const completedAt = input.completedAt || new Date();
  return db.transaction(async (tx) => {
    await lockSync(tx, input.connectionId, resourceType);
    await authorizedConnection(tx, input.userId, input.connectionId);
    const [currentRun] = await tx.select().from(healthImportRuns).where(and(
      eq(healthImportRuns.id, input.runId), eq(healthImportRuns.userId, input.userId), eq(healthImportRuns.connectionId, input.connectionId),
      eq(healthImportRuns.resourceType, resourceType), eq(healthImportRuns.status, "running"),
    )).limit(1);
    if (!currentRun) throw new Error("The import run is not active and cannot succeed.");
    const [cursor] = await tx.update(healthSyncCursors).set({
      cursorValue: nextCursor, status: "idle", consecutiveFailures: 0, lastSuccessAt: completedAt, nextRetryAt: null, updatedAt: completedAt,
    }).where(and(
      eq(healthSyncCursors.userId, input.userId), eq(healthSyncCursors.connectionId, input.connectionId),
      eq(healthSyncCursors.resourceType, resourceType), eq(healthSyncCursors.status, "syncing"),
    )).returning();
    if (!cursor) throw new Error("The sync cursor is not in progress and was not advanced.");
    const [run] = await tx.update(healthImportRuns).set({ ...counts, status: "succeeded", errorCode: null, finishedAt: completedAt }).where(and(eq(healthImportRuns.id, currentRun.id), eq(healthImportRuns.status, "running"))).returning();
    if (!run) throw new Error("The import run changed before completion was recorded.");
    await tx.update(healthImportFailures).set({ status: "resolved", resolvedAt: completedAt }).where(and(
      eq(healthImportFailures.userId, input.userId), eq(healthImportFailures.connectionId, input.connectionId),
      eq(healthImportFailures.resourceType, resourceType), eq(healthImportFailures.status, "retry_wait"),
    ));
    await tx.update(healthConnections).set({ lastSyncAt: completedAt, lastErrorCode: null, updatedAt: completedAt }).where(and(eq(healthConnections.id, input.connectionId), eq(healthConnections.userId, input.userId)));
    return { cursor, run };
  });
}

/** Records a retryable page failure without changing the last successful cursor. */
export async function failHealthSync(input: { userId: number; connectionId: number; runId: number; resourceType: string; errorCode: string; counts: unknown; retryable?: boolean; attemptedAt?: Date }) {
  const resourceType = healthSyncResourceTypeSchema.parse(input.resourceType);
  const errorCode = healthSyncErrorCodeSchema.parse(input.errorCode);
  const counts = healthSyncRunCountsSchema.parse(input.counts);
  if (counts.failedCount < 1) throw new Error("A failed sync run must include at least one failed record.");
  const attemptedAt = input.attemptedAt || new Date();
  return db.transaction(async (tx) => {
    await lockSync(tx, input.connectionId, resourceType);
    const [connection] = await tx.select({ id: healthConnections.id, status: healthConnections.status }).from(healthConnections).where(and(eq(healthConnections.id, input.connectionId), eq(healthConnections.userId, input.userId))).limit(1);
    if (!connection) throw new HealthImportAuthorizationError("The provider connection does not belong to this sync.");
    const [run] = await tx.update(healthImportRuns).set({ ...counts, status: "failed", errorCode, finishedAt: attemptedAt }).where(and(
      eq(healthImportRuns.id, input.runId), eq(healthImportRuns.userId, input.userId), eq(healthImportRuns.connectionId, input.connectionId),
      eq(healthImportRuns.resourceType, resourceType), eq(healthImportRuns.status, "running"),
    )).returning();
    if (!run) throw new Error("The import run is not active and cannot fail.");
    const [current] = await tx.select().from(healthSyncCursors).where(and(
      eq(healthSyncCursors.userId, input.userId), eq(healthSyncCursors.connectionId, input.connectionId), eq(healthSyncCursors.resourceType, resourceType),
    )).limit(1);
    const canRetry = input.retryable !== false && connection.status === "active" && current?.status === "syncing";
    if (!current) throw new Error("The sync cursor does not exist and cannot record a failure.");
    const consecutiveFailures = current.consecutiveFailures + 1;
    const nextRetryAt = canRetry ? nextHealthSyncRetryAt(consecutiveFailures, attemptedAt) : null;
    const cursor = canRetry ? (await tx.update(healthSyncCursors).set({
      status: "retry_wait", consecutiveFailures, lastAttemptAt: attemptedAt, nextRetryAt, updatedAt: attemptedAt,
    }).where(and(eq(healthSyncCursors.id, current.id), eq(healthSyncCursors.status, "syncing"))).returning())[0] : current;
    if (!cursor) throw new Error("The sync cursor changed before the failure was recorded.");
    const [failure] = await tx.insert(healthImportFailures).values({
      userId: input.userId, connectionId: input.connectionId, runId: run.id, provider: run.provider, resourceType,
      errorCode, retryable: canRetry, status: canRetry ? "retry_wait" : "abandoned", nextRetryAt, createdAt: attemptedAt,
    }).returning();
    await tx.update(healthConnections).set({ lastErrorCode: errorCode, updatedAt: attemptedAt }).where(and(eq(healthConnections.id, input.connectionId), eq(healthConnections.userId, input.userId)));
    return { cursor, run, failure };
  });
}
