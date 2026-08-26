import { afterAll, describe, expect, it } from "vitest";

const BASE_URL = process.env.LYFEOS_TEST_API_URL;
const describeApi = BASE_URL && process.env.LYFEOS_TEST_ENV === "isolated" ? describe : describe.skip;

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
  let cookie = "";

  afterAll(async () => {
    if (cookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, cookie);
  });

  it("denies anonymous reads and defaults a new account to no capture", async () => {
    expect((await request("GET", "/api/product-analytics")).status).toBe(401);
    const registration = await request("POST", "/api/auth/complete-registration", {
      email: `analytics_${stamp}@example.com`, password: "TestPass123!", displayName: `analytics_${stamp}`, termsAccepted: true,
    });
    expect(registration.status).toBe(201);
    cookie = registration.cookie;
    const status = await request("GET", "/api/product-analytics", undefined, cookie);
    expect(status.status).toBe(200);
    expect(status.cacheControl).toContain("private");
    expect(status.cacheControl).toContain("no-store");
    expect(status.data).toMatchObject({ policyVersion: "lyfeos.product-analytics.v1", enabled: false, capture: null });
    expect(status.data.collection).toMatchObject({ automaticClicks: false, sessionReplay: false, messageContent: false, healthContent: false });
  });

  it("refuses opt-in when the provider deletion boundary is incomplete", async () => {
    const status = await request("GET", "/api/product-analytics", undefined, cookie);
    if (status.data.configured) return;
    const enabled = await request("PUT", "/api/product-analytics/consent", { enabled: true, policyVersion: "lyfeos.product-analytics.v1" }, cookie);
    expect(enabled.status).toBe(409);
    expect(enabled.data.error).toContain("will not enable capture");
  });

  it("keeps a disabled choice idempotent and erasable with the account", async () => {
    const disabled = await request("PUT", "/api/product-analytics/consent", { enabled: false, policyVersion: "lyfeos.product-analytics.v1" }, cookie);
    expect(disabled.status).toBe(200);
    expect(disabled.data).toMatchObject({ enabled: false, capture: null });
    const deleted = await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, cookie);
    expect(deleted.status).toBe(200);
    expect((await request("GET", "/api/product-analytics", undefined, cookie)).status).toBe(401);
    cookie = "";
  });
});
