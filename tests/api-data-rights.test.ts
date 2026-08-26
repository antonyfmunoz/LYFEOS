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

describeApi("account data-rights journey", () => {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const account = { email: `data_rights_${stamp}@example.com`, password: "TestPass123!", displayName: `rights_${stamp}` };
  let cookie = "";

  afterAll(async () => {
    if (cookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, cookie);
  });

  it("denies anonymous access and returns the complete private contract to its owner", async () => {
    expect((await request("GET", "/api/account/data-rights")).status).toBe(401);
    const registration = await request("POST", "/api/auth/complete-registration", { ...account, termsAccepted: true });
    expect(registration.status).toBe(201);
    cookie = registration.cookie;

    const rights = await request("GET", "/api/account/data-rights", undefined, cookie);
    expect(rights.status).toBe(200);
    expect(rights.cacheControl).toContain("private");
    expect(rights.cacheControl).toContain("no-store");
    expect(rights.data).toMatchObject({ version: "lyfeos.data-rights.v2", legalStatus: "product_contract_not_approved_legal_policy" });
    expect(rights.data.classes.map((entry: any) => entry.id)).toEqual(expect.arrayContaining(["account_identity", "missions_progression", "ai_memory_actions", "relationships_messages", "workspace_content", "health_fitness", "personal_finance", "integrations_federation", "security_operations", "product_analytics", "external_providers"]));
  });

  it("includes the exact rights contract in the portable account export", async () => {
    const exported = await request("GET", "/api/account/export", undefined, cookie);
    expect(exported.status).toBe(200);
    expect(exported.data.dataRights.version).toBe("lyfeos.data-rights.v2");
    expect(exported.data.dataRights.classes).toHaveLength(12);
    expect(exported.data.user.email).toBe(account.email);
    expect(exported.data.user).not.toHaveProperty("password");
    expect(exported.data.user).not.toHaveProperty("passwordResetToken");
  });

  it("erases the local account and invalidates its session", async () => {
    const deleted = await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, cookie);
    expect(deleted.status).toBe(200);
    const after = await request("GET", "/api/account/data-rights", undefined, cookie);
    expect(after.status).toBe(401);
    cookie = "";
  });
});
