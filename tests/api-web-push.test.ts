import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";

const BASE_URL = process.env.LYFEOS_TEST_API_URL;
const DATABASE_URL = process.env.DATABASE_URL;
const describeApi = BASE_URL && DATABASE_URL && process.env.LYFEOS_TEST_ENV === "isolated" ? describe : describe.skip;
async function request(method: string, path: string, body?: unknown, cookie = "") {
  const response = await fetch(`${BASE_URL}${path}`, { method, headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https", ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json().catch(() => ({})) as any, cookie: (response.headers.get("set-cookie") || "").split(";", 1)[0] };
}

describeApi("Web Push authenticated device contract", () => {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const endpoint = `https://push.example.test/${crypto.randomUUID()}`;
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  let ownerCookie = ""; let otherCookie = ""; let ownerId = 0;
  afterAll(async () => {
    if (otherCookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, otherCookie);
    if (ownerCookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, ownerCookie);
    await pool.end();
  });

  it("is private, fails closed without VAPID, and isolates device records", async () => {
    expect((await request("GET", "/api/push/config")).status).toBe(401);
    const owner = await request("POST", "/api/auth/complete-registration", { email: `push_${stamp}@example.com`, password: "TestPass123!", displayName: `push_${stamp}`, termsAccepted: true });
    expect(owner.status).toBe(201); ownerCookie = owner.cookie; ownerId = owner.data.user.id;
    const config = await request("GET", "/api/push/config", undefined, ownerCookie);
    expect(config.status).toBe(200); expect(config.data).toMatchObject({ configured: false, supported: true, publicKey: null });
    expect((await request("POST", "/api/push/subscriptions", { endpoint, keys: { p256dh: "p".repeat(30), auth: "a".repeat(12) } }, ownerCookie)).status).toBe(503);
    await pool.query(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, status) VALUES ($1,$2,$3,$4,'active')`, [ownerId, endpoint, "p".repeat(30), "a".repeat(12)]);
    const listed = await request("GET", "/api/push/subscriptions", undefined, ownerCookie);
    expect(listed.status).toBe(200); expect(listed.data.subscriptions).toHaveLength(1);
    const other = await request("POST", "/api/auth/complete-registration", { email: `push_other_${stamp}@example.com`, password: "TestPass123!", displayName: `push_other_${stamp}`, termsAccepted: true });
    expect(other.status).toBe(201); otherCookie = other.cookie;
    expect((await request("GET", "/api/push/subscriptions", undefined, otherCookie)).data.subscriptions).toEqual([]);
    expect((await request("DELETE", "/api/push/subscriptions", { endpoint }, otherCookie)).status).toBe(404);
    expect((await request("DELETE", "/api/push/subscriptions", { endpoint }, ownerCookie)).status).toBe(200);
  });

  it("exports then exactly erases revoked device records", async () => {
    const exported = await request("GET", "/api/account/export", undefined, ownerCookie);
    expect(exported.status).toBe(200); expect(exported.data.data.push_subscriptions).toHaveLength(1);
    expect(exported.data.data.push_subscriptions[0]).not.toHaveProperty("endpoint");
    expect(exported.data.data.push_subscriptions[0]).not.toHaveProperty("p256dh");
    expect(exported.data.data.push_subscriptions[0]).not.toHaveProperty("auth");
    expect(exported.data.data.push_subscriptions[0]).not.toHaveProperty("fcm_token");
    expect((await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, ownerCookie)).status).toBe(200); ownerCookie = "";
    const count = await pool.query("SELECT count(*)::integer AS count FROM push_subscriptions WHERE user_id = $1", [ownerId]);
    expect(count.rows[0].count).toBe(0);
  });
});
