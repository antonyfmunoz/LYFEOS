import crypto from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL && process.env.LYFEOS_TEST_ENV === "isolated" ? describe : describe.skip;

describeDb("database-backed cross-product consent lifecycle", () => {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const stamp = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const previousEnv = new Map<string, string | undefined>();
  let userId = 0;
  let updateCrossProductSharing: typeof import("../server/cross-product").updateCrossProductSharing;
  let reconcilePendingCrossProductConsentEvents: typeof import("../server/cross-product").reconcilePendingCrossProductConsentEvents;
  let CrossProductSharingConflictError: typeof import("../server/cross-product").CrossProductSharingConflictError;

  beforeAll(async () => {
    const database = await pool.query<{ current_database: string }>("SELECT current_database()");
    expect(database.rows[0].current_database).toMatch(/ci|test/i);
    for (const [key, value] of Object.entries({
      UMH_FEDERATION_INSTALLATION_ID: `installation-${stamp}`,
      UMH_FEDERATION_TENANT_ID: `tenant-${stamp}`,
      UMH_FEDERATION_KEY_ID: `key-${stamp}`,
      UMH_FEDERATION_SHARED_SECRET: `secret-${stamp}-minimum-length-for-hmac`,
      UMH_CONTROL_PLANE_URL: "https://umh.test",
    })) {
      previousEnv.set(key, process.env[key]);
      process.env[key] = value;
    }
    ({ updateCrossProductSharing, reconcilePendingCrossProductConsentEvents, CrossProductSharingConflictError } = await import("../server/cross-product"));
    const created = await pool.query<{ id: number }>(
      `INSERT INTO "users" ("email", "display_name", "terms_accepted", "email_verified") VALUES ($1, $2, true, true) RETURNING "id"`,
      [`consent_${stamp}@example.com`, `consent_${stamp}`],
    );
    userId = created.rows[0].id;
  });

  afterAll(async () => {
    if (userId) {
      await pool.query(`DELETE FROM "umh_outbox_events" WHERE "event_id" IN (SELECT "event_id" FROM "cross_product_sharing_revisions" WHERE "user_id" = $1 AND "event_id" IS NOT NULL)`, [userId]);
      await pool.query(`DELETE FROM "umh_audit_records" WHERE "local_user_id" = $1`, [userId]);
      await pool.query(`DELETE FROM "users" WHERE "id" = $1`, [userId]);
    }
    for (const [key, value] of previousEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await pool.end();
  });

  it("records full-state revisions, converges exact replay, and serializes competing writers", async () => {
    const enabled = await updateCrossProductSharing({
      userId,
      enabled: true,
      destinations: ["entrepreneuros"],
      purposes: ["coordination"],
      expectedRevision: 0,
    });
    expect(enabled).toEqual({ revision: 1, replayed: false, eventQueued: true });

    const replay = await updateCrossProductSharing({
      userId,
      enabled: true,
      destinations: ["entrepreneuros"],
      purposes: ["coordination"],
      expectedRevision: 1,
    });
    expect(replay).toEqual({ revision: 1, replayed: true, eventQueued: false });

    const competitors = await Promise.allSettled([
      updateCrossProductSharing({ userId, enabled: true, destinations: ["entrepreneuros", "creativesos"], purposes: ["coordination"], expectedRevision: 1 }),
      updateCrossProductSharing({ userId, enabled: true, destinations: ["creativesos"], purposes: ["correlation"], expectedRevision: 1 }),
    ]);
    expect(competitors.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = competitors.find((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(CrossProductSharingConflictError);
    expect(rejected?.reason).toMatchObject({ currentRevision: 2 });

    const disabled = await updateCrossProductSharing({
      userId,
      enabled: false,
      destinations: ["entrepreneuros", "creativesos"],
      purposes: ["coordination", "correlation"],
      expectedRevision: 2,
    });
    expect(disabled).toEqual({ revision: 3, replayed: false, eventQueued: true });

    const reenabled = await updateCrossProductSharing({
      userId,
      enabled: true,
      destinations: ["creativesos"],
      purposes: ["correlation"],
      expectedRevision: 3,
    });
    expect(reenabled).toEqual({ revision: 4, replayed: false, eventQueued: true });

    process.env.UMH_FEDERATION_SHARED_SECRET = `rotated-${stamp}-minimum-length-for-hmac`;
    delete process.env.UMH_CONTROL_PLANE_URL;
    const localOnlyRevocation = await updateCrossProductSharing({
      userId,
      enabled: false,
      destinations: ["creativesos"],
      purposes: ["correlation"],
      expectedRevision: 4,
    });
    expect(localOnlyRevocation).toEqual({ revision: 5, replayed: false, eventQueued: false });
    const beforeReconcile = await pool.query(`SELECT "event_id", "delivery_state" FROM "cross_product_sharing_revisions" WHERE "user_id" = $1 AND "revision" = 5`, [userId]);
    expect(beforeReconcile.rows[0]).toEqual({ event_id: null, delivery_state: "not_configured" });
    process.env.UMH_CONTROL_PLANE_URL = "https://umh.test";
    expect(await reconcilePendingCrossProductConsentEvents()).toBe(1);
    expect(await reconcilePendingCrossProductConsentEvents()).toBe(0);

    const preference = await pool.query(`SELECT "federation_subject_id", "ecosystem_sharing_enabled", "allowed_destinations", "allowed_purposes", "revision" FROM "cross_product_sharing_preferences" WHERE "user_id" = $1`, [userId]);
    expect(preference.rows[0]).toMatchObject({ ecosystem_sharing_enabled: false, allowed_destinations: [], allowed_purposes: [], revision: 5 });
    expect(preference.rows[0].federation_subject_id).toMatch(/^[0-9a-f-]{36}$/);

    const revisions = await pool.query(`SELECT "revision", "state", "allowed_destinations", "allowed_purposes", "affected_destinations", "policy_version", "delivery_state", "event_id" FROM "cross_product_sharing_revisions" WHERE "user_id" = $1 ORDER BY "revision"`, [userId]);
    expect(revisions.rows).toHaveLength(5);
    expect(revisions.rows.map((row) => row.revision)).toEqual([1, 2, 3, 4, 5]);
    expect(revisions.rows[4]).toMatchObject({ state: "disabled", allowed_destinations: [], allowed_purposes: [], policy_version: "lyfeos.cross-product-sharing.v1", delivery_state: "queued" });
    expect(revisions.rows[4].affected_destinations).toEqual(["creativesos"]);

    const events = await pool.query(`SELECT "event_id", "payload" FROM "umh_outbox_events" WHERE "event_id" = ANY($1::text[]) ORDER BY "created_at", "id"`, [revisions.rows.map((row) => row.event_id)]);
    expect(events.rows).toHaveLength(5);
    const serialized = JSON.stringify(events.rows);
    expect(serialized).not.toContain(`consent_${stamp}@example.com`);
    expect(serialized).not.toContain(`consent_${stamp}`);
    expect(events.rows.every((row) => row.payload.actorId === `lyfeos:${preference.rows[0].federation_subject_id}`)).toBe(true);
    expect(events.rows[4].payload).toMatchObject({
      eventType: "lyfeos.federation-consent.updated.v1",
      aggregateType: "federation_consent",
      payload: { state: "disabled", revision: 5, allowedDestinations: [], allowedPurposes: [], affectedDestinations: ["creativesos"] },
    });
    expect(new Set(events.rows.map((row) => row.payload.actorId)).size).toBe(1);
  });
});
