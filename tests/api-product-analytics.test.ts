import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";

const BASE_URL = process.env.LYFEOS_TEST_API_URL;
const DATABASE_URL = process.env.DATABASE_URL;
const describeApi = BASE_URL && DATABASE_URL && process.env.LYFEOS_TEST_ENV === "isolated" ? describe : describe.skip;

async function request(method: string, path: string, body?: unknown, cookie = "") {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    data: await response.json().catch(() => ({})) as any,
    cookie: (response.headers.get("set-cookie") || "").split(";", 1)[0],
    cacheControl: response.headers.get("cache-control"),
  };
}

describeApi("product analytics consent boundary", () => {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const deletionSubject = randomUUID();
  let userId = 0;
  let cookie = "";

  afterAll(async () => {
    if (cookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, cookie);
    await pool.query(`DELETE FROM "product_analytics_deletion_queue" WHERE "subject_id" = $1`, [deletionSubject]);
    await pool.end();
  });

  it("denies anonymous reads and defaults a new account to no capture", async () => {
    expect((await request("GET", "/api/product-analytics")).status).toBe(401);
    const registration = await request("POST", "/api/auth/complete-registration", {
      email: `analytics_${stamp}@example.com`, password: "TestPass123!", displayName: `analytics_${stamp}`, termsAccepted: true,
    });
    expect(registration.status).toBe(201);
    userId = Number(registration.data.user?.id);
    expect(Number.isInteger(userId)).toBe(true);
    cookie = registration.cookie;
    const status = await request("GET", "/api/product-analytics", undefined, cookie);
    expect(status.status).toBe(200);
    expect(status.cacheControl).toContain("private");
    expect(status.cacheControl).toContain("no-store");
    expect(status.data).toMatchObject({ policyVersion: "lyfeos.product-analytics.v1", enabled: false, capture: null, deletion: { receipt: null } });
    expect(status.data.collection).toMatchObject({ automaticClicks: false, sessionReplay: false, messageContent: false, healthContent: false });
  });

  it("refuses opt-in when the provider deletion boundary is incomplete", async () => {
    const status = await request("GET", "/api/product-analytics", undefined, cookie);
    if (status.data.configured) return;
    const enabled = await request("PUT", "/api/product-analytics/consent", { enabled: true, policyVersion: "lyfeos.product-analytics.v1" }, cookie);
    expect(enabled.status).toBe(409);
    expect(enabled.data.error).toContain("will not enable capture");
  });

  it("shows only the owner's content-free queued, retrying, and reconciled provider receipt", async () => {
    await pool.query(`
      INSERT INTO "product_analytics_consents" ("user_id", "subject_id", "state", "policy_version", "source")
      VALUES ($1, $2, 'enabled', 'lyfeos.product-analytics.v1', 'profile_settings'),
             ($1, $2, 'revoked', 'lyfeos.product-analytics.v1', 'profile_settings')
    `, [userId, deletionSubject]);
    await pool.query(`
      INSERT INTO "product_analytics_deletion_queue" ("subject_id", "requested_at")
      VALUES ($1, now() - interval '20 minutes')
    `, [deletionSubject]);

    const queued = await request("GET", "/api/product-analytics", undefined, cookie);
    expect(queued.status).toBe(200);
    expect(queued.data).toMatchObject({ enabled: false, deletion: { receipt: { state: "queued", attempts: 0 } } });
    expect(JSON.stringify(queued.data)).not.toContain(deletionSubject);

    await pool.query(`
      UPDATE "product_analytics_deletion_queue"
      SET "attempts" = 2, "last_attempt_at" = now(), "last_error" = 'sensitive provider detail'
      WHERE "subject_id" = $1
    `, [deletionSubject]);
    const retrying = await request("GET", "/api/product-analytics", undefined, cookie);
    expect(retrying.data).toMatchObject({ deletion: { receipt: { state: "retrying", attempts: 2 } } });
    expect(JSON.stringify(retrying.data)).not.toContain("sensitive provider detail");

    await pool.query(`
      UPDATE "product_analytics_deletion_queue"
      SET "attempts" = 3, "last_attempt_at" = now(), "last_error" = NULL, "completed_at" = now()
      WHERE "subject_id" = $1
    `, [deletionSubject]);
    const reconciled = await request("GET", "/api/product-analytics", undefined, cookie);
    expect(reconciled.data).toMatchObject({ deletion: { receipt: { state: "provider_reconciled", attempts: 3 } } });
    expect(reconciled.data.deletion.receipt.reconciledAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("keeps a disabled choice idempotent and erasable with the account", async () => {
    const disabled = await request("PUT", "/api/product-analytics/consent", { enabled: false, policyVersion: "lyfeos.product-analytics.v1" }, cookie);
    expect(disabled.status).toBe(200);
    expect(disabled.data).toMatchObject({ enabled: false, capture: null, deletion: { receipt: { state: "provider_reconciled" } } });
    const deleted = await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, cookie);
    expect(deleted.status).toBe(200);
    expect((await request("GET", "/api/product-analytics", undefined, cookie)).status).toBe(401);
    expect(Number((await pool.query(`SELECT count(*)::int AS count FROM "product_analytics_consents" WHERE "user_id" = $1`, [userId])).rows[0].count)).toBe(0);
    expect(Number((await pool.query(`SELECT count(*)::int AS count FROM "product_analytics_deletion_queue" WHERE "subject_id" = $1`, [deletionSubject])).rows[0].count)).toBe(1);
    cookie = "";
  });
});
