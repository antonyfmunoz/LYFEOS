import crypto from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { umhCommandEnvelopeSchema, type UMHCommandEnvelope } from "../shared/umh";

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL && process.env.LYFEOS_TEST_ENV === "isolated" ? describe : describe.skip;

describeDb("UMH database-backed federation conformance", () => {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const stamp = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const clerkId = `user_umh_${stamp}`;
  const installationId = `installation-${stamp}`;
  const tenantId = `tenant-${stamp}`;
  let userId = 0;
  let missionId = 0;
  const testEventIds: string[] = [];
  let claimUMHOutboxEvents: typeof import("../server/umh/outbox").claimUMHOutboxEvents;
  let settleUMHOutboxEvent: typeof import("../server/umh/outbox").settleUMHOutboxEvent;
  let executeMissionCreateCommand: typeof import("../server/umh/service").executeMissionCreateCommand;

  const config = {
    installationId,
    tenantId,
    keyId: "qualification-key",
    sharedSecret: `qualification-secret-${stamp}`,
  };

  function command(overrides: Partial<UMHCommandEnvelope> = {}): UMHCommandEnvelope {
    const now = Date.now();
    return umhCommandEnvelopeSchema.parse({
      protocolVersion: "umh.federation.v1",
      kind: "command",
      id: `command-${stamp}`,
      capability: "lyfeos.mission.create.v1",
      installationId,
      tenantId,
      subject: { localUserId: userId, clerkUserId: clerkId },
      correlationId: `correlation-${stamp}`,
      idempotencyKey: `mission-create-${stamp}`,
      issuedAt: new Date(now - 1_000).toISOString(),
      expiresAt: new Date(now + 5 * 60_000).toISOString(),
      payload: { title: "Create one replay-safe UMH mission", category: "general" },
      ...overrides,
    });
  }

  beforeAll(async () => {
    ({ claimUMHOutboxEvents, settleUMHOutboxEvent } = await import("../server/umh/outbox"));
    ({ executeMissionCreateCommand } = await import("../server/umh/service"));
    const database = await pool.query<{ current_database: string }>("SELECT current_database()");
    expect(database.rows[0].current_database).toMatch(/ci|test/i);
    const created = await pool.query<{ id: number }>(
      `INSERT INTO "users" ("email", "display_name", "clerk_id", "terms_accepted", "email_verified") VALUES ($1, $2, $3, true, true) RETURNING "id"`,
      [`umh_${stamp}@example.com`, `umh_${stamp}`, clerkId],
    );
    userId = created.rows[0].id;
  });

  afterAll(async () => {
    if (testEventIds.length) await pool.query(`DELETE FROM "umh_outbox_events" WHERE "event_id" = ANY($1::text[])`, [testEventIds]);
    if (userId) {
      await pool.query(`DELETE FROM "umh_outbox_events" WHERE "aggregate_type" = 'mission' AND "aggregate_id" IN (SELECT "id"::text FROM "quests" WHERE "user_id" = $1)`, [userId]);
      await pool.query(`DELETE FROM "umh_audit_records" WHERE "local_user_id" = $1`, [userId]);
      await pool.query(`DELETE FROM "umh_approval_requests" WHERE "command_id" IN (SELECT "command_id" FROM "umh_inbound_commands" WHERE "local_user_id" = $1)`, [userId]);
      await pool.query(`DELETE FROM "umh_inbound_commands" WHERE "local_user_id" = $1`, [userId]);
      await pool.query(`DELETE FROM "user_activity_events" WHERE "user_id" = $1`, [userId]);
      await pool.query(`DELETE FROM "quests" WHERE "user_id" = $1`, [userId]);
      await pool.query(`DELETE FROM "users" WHERE "id" = $1`, [userId]);
    }
    await pool.end();
  });

  it("converges concurrent commands and rejects changed idempotency reuse", async () => {
    const envelope = command();
    const [first, second] = await Promise.all([
      executeMissionCreateCommand(envelope, `nonce-a-${stamp}`, config),
      executeMissionCreateCommand(envelope, `nonce-b-${stamp}`, config),
    ]);
    expect(first.missionId).toBe(second.missionId);
    expect(first.eventId).toBe(second.eventId);
    expect([first.replayed, second.replayed].sort()).toEqual([false, true]);
    missionId = first.missionId;
    testEventIds.push(first.eventId);

    const changed = command({
      id: `command-changed-${stamp}`,
      payload: { ...envelope.payload, title: "A conflicting UMH mission" },
    });
    await expect(executeMissionCreateCommand(changed, `nonce-c-${stamp}`, config)).rejects.toMatchObject({ status: 409 });

    const counts = await pool.query(
      `SELECT
        (SELECT count(*)::int FROM "quests" WHERE "user_id" = $1) AS missions,
        (SELECT count(*)::int FROM "umh_inbound_commands" WHERE "local_user_id" = $1) AS commands,
        (SELECT count(*)::int FROM "umh_approval_requests" WHERE "command_id" = $2) AS approvals,
        (SELECT count(*)::int FROM "umh_audit_records" WHERE "local_user_id" = $1) AS audits,
        (SELECT count(*)::int FROM "umh_outbox_events" WHERE "event_id" = $3) AS events`,
      [userId, envelope.id, first.eventId],
    );
    expect(counts.rows[0]).toEqual({ missions: 1, commands: 1, approvals: 1, audits: 1, events: 1 });
  });

  it("leases disjoint batches, rejects stale settlement, and recovers expired work", async () => {
    const existing = await pool.query<{ payload: unknown }>(`SELECT "payload" FROM "umh_outbox_events" WHERE "event_id" = $1`, [testEventIds[0]]);
    for (let index = 0; index < 4; index += 1) {
      const eventId = crypto.randomUUID();
      testEventIds.push(eventId);
      const payload = { ...(existing.rows[0].payload as Record<string, unknown>), eventId };
      await pool.query(
        `INSERT INTO "umh_outbox_events" ("event_id", "event_type", "aggregate_type", "aggregate_id", "payload") VALUES ($1, 'lyfeos.mission.created.v1', 'mission', $2, $3::jsonb)`,
        [eventId, String(missionId), JSON.stringify(payload)],
      );
    }

    // Move beyond any database/client clock granularity at insertion time.
    const now = new Date(Date.now() + 1_000);
    const beforeClaim = await pool.query(`SELECT "event_id", "status", "next_attempt_at", "next_attempt_at" <= $2 AS "due" FROM "umh_outbox_events" WHERE "event_id" = ANY($1::text[])`, [testEventIds, now]);
    expect(beforeClaim.rows).toHaveLength(5);
    expect(beforeClaim.rows.every((row) => row.status === "pending")).toBe(true);
    expect(beforeClaim.rows.map((row) => ({ eventId: row.event_id, due: row.due, nextAttemptAt: row.next_attempt_at }))).toEqual(
      beforeClaim.rows.map((row) => ({ eventId: row.event_id, due: true, nextAttemptAt: row.next_attempt_at })),
    );
    const batches = await Promise.all(["worker-a", "worker-b", "worker-c", "worker-d"].map((leaseToken) =>
      claimUMHOutboxEvents({ leaseToken: `${leaseToken}-${stamp}`, now, leaseMs: 30_000, limit: 2 })));
    const afterClaim = await pool.query(`SELECT "event_id", "status", "lease_token" FROM "umh_outbox_events" WHERE "event_id" = ANY($1::text[]) ORDER BY "event_id"`, [testEventIds]);
    expect(afterClaim.rows.map((row) => row.status)).toEqual(["processing", "processing", "processing", "processing", "processing"]);
    expect(batches.flat()).toHaveLength(5);
    const ours = batches.flat().filter((entry) => testEventIds.includes(entry.eventId));
    expect(ours).toHaveLength(5);
    expect(new Set(ours.map((entry) => entry.id)).size).toBe(5);
    expect(ours.every((entry) => entry.attempts === 1)).toBe(true);

    expect(await settleUMHOutboxEvent({ ...ours[0], leaseToken: "stale-worker", outcome: "delivered", now })).toBe(false);
    expect(await settleUMHOutboxEvent({ ...ours[0], outcome: "delivered", now })).toBe(true);
    expect(await settleUMHOutboxEvent({ ...ours[1], outcome: "retry", errorCode: "HTTP_503", now })).toBe(true);
    expect(await settleUMHOutboxEvent({ ...ours[2], outcome: "failed", errorCode: "HTTP_400", now })).toBe(true);

    const recoveryNow = new Date(now.getTime() + 1_000);
    await pool.query(`UPDATE "umh_outbox_events" SET "leased_until" = $2 WHERE "id" = $1`, [ours[3].id, new Date(now.getTime() - 1)]);
    const recovered = await claimUMHOutboxEvents({ leaseToken: `recovery-${stamp}`, now: recoveryNow, leaseMs: 30_000, limit: 10 });
    expect(recovered.map((entry) => entry.id)).toContain(ours[3].id);
    expect(recovered.find((entry) => entry.id === ours[3].id)?.attempts).toBe(2);
    expect(await settleUMHOutboxEvent({ ...(recovered.find((entry) => entry.id === ours[3].id)!), outcome: "delivered", now: recoveryNow })).toBe(true);

    const states = await pool.query(
      `SELECT "event_id", "status", "attempts", "lease_token", "leased_until", "last_error" FROM "umh_outbox_events" WHERE "event_id" = ANY($1::text[]) ORDER BY "event_id"`,
      [testEventIds],
    );
    expect(states.rows.filter((row) => row.status === "delivered")).toHaveLength(2);
    expect(states.rows.filter((row) => row.status === "retry")).toHaveLength(1);
    expect(states.rows.filter((row) => row.status === "failed")).toHaveLength(1);
    expect(states.rows.filter((row) => row.status === "processing")).toHaveLength(1);
    expect(states.rows.find((row) => row.status === "retry")?.last_error).toBe("HTTP_503");
    expect(states.rows.find((row) => row.status === "failed")?.last_error).toBe("HTTP_400");
    expect(states.rows.filter((row) => row.status !== "processing").every((row) => row.lease_token === null && row.leased_until === null)).toBe(true);
  });
});
