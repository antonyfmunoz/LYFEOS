import { afterAll, describe, expect, it } from "vitest";

const BASE_URL = process.env.LYFEOS_TEST_API_URL;
const describeApi = BASE_URL && process.env.LYFEOS_TEST_ENV === "isolated" ? describe : describe.skip;

async function request(method: string, path: string, body?: unknown, cookie = "") {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json().catch(() => ({})) as any, cookie: (response.headers.get("set-cookie") || "").split(";", 1)[0] };
}

describeApi("AI persona and memory governance authenticated journey", () => {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const account = { email: `ai_governance_${stamp}@example.com`, password: "TestPass123!", displayName: `player_${stamp}` };
  let cookie = "";
  let revision = 0;
  let userId = 0;

  afterAll(async () => { if (cookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, cookie); });

  it("creates a private local persona and rejects anonymous access", async () => {
    expect((await request("GET", "/api/ai/persona")).status).toBe(401);
    const registration = await request("POST", "/api/auth/complete-registration", { ...account, termsAccepted: true });
    expect(registration.status).toBe(201);
    cookie = registration.cookie;
    userId = registration.data.user.id;
    const result = await request("GET", "/api/ai/persona", undefined, cookie);
    expect(result.status).toBe(200);
    expect(result.data.persona.ecosystemSharingEnabled).toBe(false);
    expect(result.data.persona.allowedDestinations).toEqual([]);
    revision = result.data.persona.revision;
  });

  it("requires destination consent before emitting the minimal persona projection", async () => {
    const blocked = await request("GET", "/api/ai/persona/projection?destination=umh", undefined, cookie);
    expect(blocked.status).toBe(403);
    const saved = await request("PUT", "/api/ai/persona", { name: "Atlas", interactionStyle: { tone: "direct", detail: "adaptive" }, ecosystemSharingEnabled: true, allowedDestinations: ["umh"], expectedRevision: revision }, cookie);
    expect(saved.status).toBe(200);
    revision = saved.data.persona.revision;
    const projection = await request("GET", "/api/ai/persona/projection?destination=umh", undefined, cookie);
    expect(projection.status).toBe(200);
    expect(projection.data).toMatchObject({ schema: "umh.ai_persona.v1", source: "lyfeos", destination: "umh", name: "Atlas", revision });
    expect(projection.data).not.toHaveProperty("chatHistory");
    expect(projection.data).not.toHaveProperty("healthData");
    const otherProduct = await request("GET", "/api/ai/persona/projection?destination=creatoros", undefined, cookie);
    expect(otherProduct.status).toBe(403);
  });

  it("enforces optimistic persona revisions", async () => {
    const stale = await request("PUT", "/api/ai/persona", { name: "Old Atlas", interactionStyle: {}, ecosystemSharingEnabled: false, allowedDestinations: [], expectedRevision: revision - 1 }, cookie);
    expect(stale.status).toBe(409);
  });

  it("persists bounded retention and exposes explicit memory boundaries", async () => {
    const updated = await request("PATCH", "/api/account/ai-memory-policy", { chatHistoryDays: 90, contextReceiptDays: 30, actionReceiptDays: 365, crossProductMemoryEnabled: false, allowedDestinations: [] }, cookie);
    expect(updated.status).toBe(200);
    expect(updated.data.policy).toMatchObject({ chatHistoryDays: 90, contextReceiptDays: 30, actionReceiptDays: 365, crossProductMemoryEnabled: false });
    const memory = await request("GET", "/api/account/ai-memory", undefined, cookie);
    expect(memory.status).toBe(200);
    expect(memory.data.boundaries).toEqual({ nativeMessagesIncluded: false, externalSendingEnabled: false, crossProductMemoryDefault: "off", contextReceiptsContainRawValues: false });
    expect((await request("DELETE", "/api/account/ai-memory", { scope: "context-sources" }, cookie)).status).toBe(200);
    expect((await request("DELETE", "/api/account/ai-memory", { scope: "action-history" }, cookie)).status).toBe(200);
  });

  it("executes a human-approved consequential action and repairs its exact prior field", async () => {
    const [{ db }, schema] = await Promise.all([import("../server/db"), import("../shared/schema")]);
    const [record] = await db.insert(schema.aiActionRecords).values({ userId, toolName: "update_profile", risk: "medium", state: "pending_approval", inputSummary: { fields: ["primaryCraft"] }, planningContextSnapshot: {} }).returning();
    const [pending] = await db.insert(schema.aiPendingActions).values({ userId, actionRecordId: record.id, toolName: "update_profile", payload: { primaryCraft: "AI governance qualification" }, expiresAt: new Date(Date.now() + 60_000) }).returning();
    const approved = await request("POST", `/api/ai-actions/${pending.id}/approve`, undefined, cookie);
    expect(approved.status).toBe(200);
    expect(approved.data.state).toBe("succeeded");
    const changed = await request("GET", "/api/profile", undefined, cookie);
    expect(changed.data.primaryCraft).toBe("AI governance qualification");
    const repaired = await request("POST", `/api/ai-actions/${record.id}/repair`, undefined, cookie);
    expect(repaired.status).toBe(200);
    expect(repaired.data.state).toBe("repaired");
    const restored = await request("GET", "/api/profile", undefined, cookie);
    expect(restored.data.primaryCraft ?? null).toBe(null);
  });
});
