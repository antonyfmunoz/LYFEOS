import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  healthBadgeEvents, healthConnections, healthObservations, healthProgressionEvents,
  healthSourceRecords, hydrationEntries, users,
} from "../shared/schema";

const describeDb = process.env.LYFEOS_TEST_ENV === "isolated" && process.env.DATABASE_URL ? describe : describe.skip;

describeDb("Health database concurrency", () => {
  let db: any;
  let pool: any;
  let userId = 0;
  let connectionId = 0;
  let ingestProviderHealthEnvelope: typeof import("../server/health-import-service").ingestProviderHealthEnvelope;
  let reconcileHealthProgression: typeof import("../server/health-progression").reconcileHealthProgression;

  beforeAll(async () => {
    ({ db, pool } = await import("../server/db"));
    ({ ingestProviderHealthEnvelope } = await import("../server/health-import-service"));
    ({ reconcileHealthProgression } = await import("../server/health-progression"));
    const stamp = Date.now();
    const [user] = await db.insert(users).values({
      displayName: `dbhealth_${stamp}`,
      email: `dbhealth_${stamp}@example.com`,
      termsAccepted: true,
    }).returning({ id: users.id });
    userId = user.id;
    const [connection] = await db.insert(healthConnections).values({
      userId,
      provider: "health_connect",
      providerName: "Health Connect",
      status: "active",
      scopes: ["activity"],
      consentVersion: "test-consent-v2",
      credentialRef: "vault://isolated-test/opaque-reference",
    }).returning({ id: healthConnections.id });
    connectionId = connection.id;
  });

  afterAll(async () => {
    if (db && userId) await db.delete(users).where(eq(users.id, userId));
    if (pool) await pool.end();
  });

  it("serializes identical provider retries into one immutable source record and observation", async () => {
    const envelope = {
      sourceRecordId: "concurrent-steps-1",
      sourceMetricId: "StepsRecord.count",
      observedAt: "2026-08-22T10:00:00.000Z",
      intervalStartAt: "2026-08-22T09:45:00.000Z",
      intervalEndAt: "2026-08-22T10:00:00.000Z",
      metricKey: "steps",
      value: 4200,
      unit: "count",
      sourceVersion: "provider-v2",
      method: "device",
      deviceName: "Isolated fixture",
      sourceMetadata: { recordingMethod: "automatic" },
    } as const;
    const outcomes = await Promise.all(Array.from({ length: 8 }, () => ingestProviderHealthEnvelope({
      userId, connectionId, provider: "health_connect", envelope,
    })));
    expect(outcomes.filter((outcome) => outcome.replayed === false)).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.replayed === true)).toHaveLength(7);

    const [sourceRows, observationRows] = await Promise.all([
      db.select().from(healthSourceRecords).where(and(eq(healthSourceRecords.userId, userId), eq(healthSourceRecords.sourceRecordId, envelope.sourceRecordId))),
      db.select().from(healthObservations).where(and(eq(healthObservations.userId, userId), eq(healthObservations.sourceRecordId, envelope.sourceRecordId))),
    ]);
    expect(sourceRows).toHaveLength(1);
    expect(sourceRows[0].state).toBe("active");
    expect(observationRows).toHaveLength(1);
    expect(observationRows[0].value).toBe(4200);
  });

  it("serializes a provider correction and its retries without two current observations", async () => {
    const correctedEnvelope = {
      sourceRecordId: "concurrent-steps-1",
      sourceMetricId: "StepsRecord.count",
      observedAt: "2026-08-22T10:00:00.000Z",
      intervalStartAt: "2026-08-22T09:45:00.000Z",
      intervalEndAt: "2026-08-22T10:00:00.000Z",
      metricKey: "steps",
      value: 4201,
      unit: "count",
      sourceVersion: "provider-v2",
      method: "device",
      deviceName: "Isolated fixture",
      sourceMetadata: { recordingMethod: "automatic", corrected: true },
    } as const;
    const outcomes = await Promise.all(Array.from({ length: 8 }, () => ingestProviderHealthEnvelope({
      userId, connectionId, provider: "health_connect", envelope: correctedEnvelope,
    })));
    expect(outcomes.filter((outcome) => outcome.replayed === false && outcome.corrected === true)).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.replayed === true)).toHaveLength(7);

    const [sourceRows, observationRows] = await Promise.all([
      db.select().from(healthSourceRecords).where(and(eq(healthSourceRecords.userId, userId), eq(healthSourceRecords.sourceRecordId, correctedEnvelope.sourceRecordId))),
      db.select().from(healthObservations).where(and(eq(healthObservations.userId, userId), eq(healthObservations.sourceRecordId, correctedEnvelope.sourceRecordId))),
    ]);
    expect(sourceRows).toHaveLength(2);
    expect(sourceRows.filter((row: any) => row.state === "active")).toHaveLength(1);
    expect(sourceRows.filter((row: any) => row.state === "superseded")).toHaveLength(1);
    expect(observationRows).toHaveLength(1);
    expect(observationRows[0].value).toBe(4201);
  });

  it("awards and reverses one progression event under concurrent reconciles", async () => {
    // Keep this race scoped to one factual rule; the preceding import tests
    // deliberately created a separate metric-observation candidate.
    await db.delete(healthObservations).where(eq(healthObservations.userId, userId));
    await db.delete(healthConnections).where(eq(healthConnections.id, connectionId));
    const [hydration] = await db.insert(hydrationEntries).values({
      userId,
      volumeMl: 500,
      occurredAt: new Date("2026-08-22T12:00:00.000Z"),
      recordedTimeZone: "UTC",
    }).returning({ id: hydrationEntries.id });

    const earned = await Promise.all(Array.from({ length: 10 }, () => reconcileHealthProgression(userId)));
    expect(new Set(earned.map((summary) => summary.practiceXp)).size).toBe(1);
    const earnedEvents = await db.select().from(healthProgressionEvents).where(eq(healthProgressionEvents.userId, userId));
    expect(earnedEvents).toHaveLength(1);
    expect(earnedEvents[0]).toMatchObject({ action: "earned", ruleKey: "hydration_day", evidenceDate: "2026-08-22" });
    expect(earnedEvents[0].xpDelta).toBeGreaterThan(0);

    await db.delete(hydrationEntries).where(eq(hydrationEntries.id, hydration.id));
    const reversed = await Promise.all(Array.from({ length: 10 }, () => reconcileHealthProgression(userId)));
    expect(reversed.every((summary) => summary.practiceXp === 0)).toBe(true);
    const allEvents = await db.select().from(healthProgressionEvents).where(eq(healthProgressionEvents.userId, userId));
    expect(allEvents).toHaveLength(2);
    expect(allEvents.filter((event: any) => event.action === "reversed")).toHaveLength(1);
    expect(allEvents.reduce((sum: number, event: any) => sum + event.xpDelta, 0)).toBe(0);
    const badgeEvents = await db.select().from(healthBadgeEvents).where(eq(healthBadgeEvents.userId, userId));
    expect(badgeEvents.map((event: any) => event.action)).toEqual(["awarded", "reversed"]);
  });
});
