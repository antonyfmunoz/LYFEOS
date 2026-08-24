import { and, eq, sql } from "drizzle-orm";
import { healthConnections, healthObservations, healthSourceRecords, healthSourceSuppressions } from "@shared/schema";
import { db } from "./db";
import { healthSourceRecordKeyHash, prepareProviderHealthImport, providerHealthEnvelopeSchema, providerImportLockKey } from "./health-import";
import { healthConnectionLockKey, type HealthProviderId } from "./health-connections";
import { HealthProviderScopeError } from "./health-provider-metrics";
import type { z } from "zod";

export class HealthImportAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HealthImportAuthorizationError";
  }
}

/**
 * Internal adapter boundary. It is deliberately not registered as an HTTP route.
 * A provider adapter may call it only after external authorization has stored an
 * opaque credential reference and activated the owning connection.
 */
export async function ingestProviderHealthEnvelope(input: {
  userId: number;
  connectionId: number;
  provider: HealthProviderId;
  envelope: z.input<typeof providerHealthEnvelopeSchema>;
  receivedAt?: Date;
}) {
  const prepared = prepareProviderHealthImport(input.provider, input.envelope, input.receivedAt);
  const lockKey = providerImportLockKey(input.userId, input.provider, prepared.sourceRecord.sourceRecordId);

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${healthConnectionLockKey(input.connectionId)}))`);
    // Serialize every version of one provider record so concurrent retries and
    // corrections cannot create two current normalized observations.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);

    const [connection] = await tx.select({
      id: healthConnections.id,
      provider: healthConnections.provider,
      status: healthConnections.status,
      credentialRef: healthConnections.credentialRef,
      scopes: healthConnections.scopes,
    }).from(healthConnections).where(and(
      eq(healthConnections.id, input.connectionId),
      eq(healthConnections.userId, input.userId),
    )).limit(1);

    if (!connection || connection.provider !== input.provider) {
      throw new HealthImportAuthorizationError("The provider connection does not belong to this import.");
    }
    if (connection.status !== "active" || !connection.credentialRef) {
      throw new HealthImportAuthorizationError("The provider connection is not actively authorized.");
    }
    const grantedScopes = Array.isArray(connection.scopes) ? connection.scopes.filter((scope): scope is string => typeof scope === "string") : [];
    if (!grantedScopes.includes(prepared.requiredScope)) throw new HealthProviderScopeError();

    const [suppression] = await tx.select({ id: healthSourceSuppressions.id }).from(healthSourceSuppressions).where(and(
      eq(healthSourceSuppressions.userId, input.userId),
      eq(healthSourceSuppressions.provider, input.provider),
      eq(healthSourceSuppressions.sourceRecordKeyHash, healthSourceRecordKeyHash(input.provider, prepared.sourceRecord.sourceRecordId)),
    )).limit(1);
    if (suppression) return { replayed: true as const, suppressed: true as const, corrected: false, sourceRecord: null, observation: null };

    const [replayed] = await tx.select({
      id: healthSourceRecords.id,
      state: healthSourceRecords.state,
    }).from(healthSourceRecords).where(and(
      eq(healthSourceRecords.userId, input.userId),
      eq(healthSourceRecords.provider, input.provider),
      eq(healthSourceRecords.sourceRecordId, prepared.sourceRecord.sourceRecordId),
      eq(healthSourceRecords.payloadFingerprint, prepared.sourceRecord.payloadFingerprint),
    )).limit(1);

    if (replayed) {
      const [observation] = await tx.select().from(healthObservations).where(and(
        eq(healthObservations.userId, input.userId),
        eq(healthObservations.source, input.provider),
        eq(healthObservations.sourceRecordId, prepared.sourceRecord.sourceRecordId),
      )).limit(1);
      return { replayed: true as const, suppressed: false as const, corrected: replayed.state === "superseded", sourceRecord: replayed, observation: observation || null };
    }

    const superseded = await tx.update(healthSourceRecords).set({ state: "superseded" }).where(and(
      eq(healthSourceRecords.userId, input.userId),
      eq(healthSourceRecords.provider, input.provider),
      eq(healthSourceRecords.sourceRecordId, prepared.sourceRecord.sourceRecordId),
      eq(healthSourceRecords.state, "active"),
    )).returning({ id: healthSourceRecords.id });

    const [sourceRecord] = await tx.insert(healthSourceRecords).values({
      userId: input.userId,
      connectionId: input.connectionId,
      ...prepared.sourceRecord,
    }).returning();

    const observationValues = {
      category: prepared.observation.category,
      metricKey: prepared.observation.metricKey,
      displayName: prepared.observation.displayName,
      value: prepared.observation.value,
      unit: prepared.observation.unit,
      method: prepared.observation.method,
      methodVersion: prepared.observation.methodVersion,
      source: input.provider,
      sourceRecordId: prepared.observation.sourceRecordId,
      deviceName: prepared.observation.deviceName,
      importedAt: prepared.observation.importedAt,
      observedAt: prepared.observation.observedAt,
      temporalType: prepared.observation.temporalType,
      intervalStartAt: prepared.observation.intervalStartAt,
      intervalEndAt: prepared.observation.intervalEndAt,
      aggregationKind: prepared.observation.aggregationKind,
    };
    const [current] = await tx.select({ id: healthObservations.id }).from(healthObservations).where(and(
      eq(healthObservations.userId, input.userId),
      eq(healthObservations.source, input.provider),
      eq(healthObservations.sourceRecordId, prepared.observation.sourceRecordId),
    )).limit(1);
    const [observation] = current
      ? await tx.update(healthObservations).set(observationValues).where(and(eq(healthObservations.id, current.id), eq(healthObservations.userId, input.userId))).returning()
      : await tx.insert(healthObservations).values({ userId: input.userId, ...observationValues }).returning();

    await tx.update(healthConnections).set({ lastSyncAt: prepared.sourceRecord.receivedAt, lastErrorCode: null, updatedAt: prepared.sourceRecord.receivedAt }).where(and(
      eq(healthConnections.id, input.connectionId),
      eq(healthConnections.userId, input.userId),
    ));

    return { replayed: false as const, suppressed: false as const, corrected: superseded.length > 0, sourceRecord, observation };
  });
}
