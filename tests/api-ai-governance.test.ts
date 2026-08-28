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

async function seedPendingAction(input: { userId: number; toolName: string; payload: Record<string, unknown>; expiresAt?: Date }) {
  const [{ db }, schema] = await Promise.all([import("../server/db"), import("../shared/schema")]);
  const [record] = await db.insert(schema.aiActionRecords).values({
    userId: input.userId,
    toolName: input.toolName,
    risk: "medium",
    state: "pending_approval",
    inputSummary: { fields: Object.keys(input.payload).sort() },
    planningContextSnapshot: {},
  }).returning();
  const [pending] = await db.insert(schema.aiPendingActions).values({
    userId: input.userId,
    actionRecordId: record.id,
    toolName: input.toolName,
    payload: input.payload,
    expiresAt: input.expiresAt ?? new Date(Date.now() + 60_000),
  }).returning();
  return { record, pending };
}

describeApi("AI persona and memory governance authenticated journey", () => {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const account = { email: `ai_governance_${stamp}@example.com`, password: "TestPass123!", displayName: `player_${stamp}` };
  let cookie = "";
  let otherCookie = "";
  let revision = 0;
  let userId = 0;

  afterAll(async () => {
    if (otherCookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, otherCookie);
    if (cookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, cookie);
  });

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
    const [{ db }, schema, { eq }] = await Promise.all([import("../server/db"), import("../shared/schema"), import("drizzle-orm")]);
    const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1_000);
    const [conversation] = await db.insert(schema.conversations).values({ userId, title: "Expired chat", createdAt: old }).returning();
    await db.insert(schema.messages).values({ conversationId: conversation.id, role: "user", content: "expired", createdAt: old });
    await db.insert(schema.aiMessages).values({ userId, sender: "user", content: "expired legacy", timestamp: old });
    await db.insert(schema.aiVoiceSessions).values([
      { userId, title: "Expired completed voice", purpose: "meeting", status: "completed", createdAt: old, updatedAt: old },
      { userId, title: "Active voice", purpose: "command", status: "active", createdAt: old, updatedAt: old },
    ]);
    await db.insert(schema.aiContextReceipts).values({ userId, purpose: "retention-test", sources: [], disclosure: "Metadata only.", createdAt: old, expiresAt: old });
    const [terminalAction] = await db.insert(schema.aiActionRecords).values({ userId, toolName: "lookup_knowledge_base", risk: "read", state: "succeeded", createdAt: old, completedAt: old }).returning();
    const [activeAction] = await db.insert(schema.aiActionRecords).values({ userId, toolName: "lookup_knowledge_base", risk: "read", state: "started", createdAt: old }).returning();

    const initialPolicy = await request("GET", "/api/account/ai-memory-policy", undefined, cookie);
    expect(initialPolicy.status).toBe(200);
    const initialRevision = initialPolicy.data.policy.revision;
    const updated = await request("PATCH", "/api/account/ai-memory-policy", { chatHistoryDays: 30, contextReceiptDays: 30, actionReceiptDays: 90, crossProductMemoryEnabled: false, allowedDestinations: [], expectedRevision: initialRevision }, cookie);
    expect(updated.status).toBe(200);
    expect(updated.data.policy).toMatchObject({ chatHistoryDays: 30, contextReceiptDays: 30, actionReceiptDays: 90, crossProductMemoryEnabled: false, revision: initialRevision + 1 });
    expect(updated.data.removed).toEqual({ conversations: 1, legacyMessages: 1, voiceSessions: 1, contextReceipts: 1, actionReceipts: 1 });
    expect((await request("PATCH", "/api/account/ai-memory-policy", { chatHistoryDays: 365, contextReceiptDays: 365, actionReceiptDays: 1095, crossProductMemoryEnabled: false, allowedDestinations: [], expectedRevision: initialRevision }, cookie)).status).toBe(409);
    const memory = await request("GET", "/api/account/ai-memory", undefined, cookie);
    expect(memory.status).toBe(200);
    expect(memory.data).toMatchObject({ conversationCount: 0, legacyMessageCount: 0, voiceSessionCount: 1, contextReceiptCount: 0, actionReceiptCount: 1 });
    expect(memory.data.boundaries).toEqual({ nativeMessagesIncluded: false, externalSendingEnabled: false, crossProductMemoryDefault: "off", contextReceiptsContainRawValues: false });
    expect((await request("DELETE", "/api/account/ai-memory", { scope: "context-sources" }, cookie)).status).toBe(200);
    const activeRetention = await request("DELETE", "/api/account/ai-memory", { scope: "action-history" }, cookie);
    expect(activeRetention.status).toBe(200);
    expect(activeRetention.data.retained.activeActionReceipts).toBe(1);
    await db.update(schema.aiActionRecords).set({ state: "failed", completedAt: new Date() }).where(eq(schema.aiActionRecords.id, activeAction.id));
    const terminalErasure = await request("DELETE", "/api/account/ai-memory", { scope: "action-history" }, cookie);
    expect(terminalErasure.status).toBe(200);
    expect(terminalErasure.data.retained.activeActionReceipts).toBe(0);
    expect((await db.select().from(schema.aiActionRecords).where(eq(schema.aiActionRecords.id, terminalAction.id))).length).toBe(0);

    const [scheduledConversation] = await db.insert(schema.conversations).values({ userId, title: "Scheduled expiry", createdAt: old }).returning();
    await db.insert(schema.messages).values({ conversationId: scheduledConversation.id, role: "assistant", content: "expired", createdAt: old });
    await db.insert(schema.aiMessages).values({ userId, sender: "ai", content: "scheduled legacy expiry", timestamp: old });
    await db.insert(schema.aiVoiceSessions).values({ userId, title: "Scheduled voice expiry", purpose: "meeting", status: "cancelled", createdAt: old, updatedAt: old });
    await db.insert(schema.aiContextReceipts).values({ userId, purpose: "scheduled-retention-test", sources: [], disclosure: "Metadata only.", createdAt: old, expiresAt: old });
    await db.insert(schema.aiActionRecords).values({ userId, toolName: "lookup_knowledge_base", risk: "read", state: "failed", createdAt: old, completedAt: old });
    const { runAIMemoryRetentionSweep } = await import("../server/ai-memory-retention-worker");
    const sweep = await runAIMemoryRetentionSweep();
    expect(sweep).toEqual({ leaseAcquired: true, conversations: 1, legacyMessages: 1, voiceSessions: 1, contextReceipts: 1, actionReceipts: 1 });
    const afterSweep = await request("GET", "/api/account/ai-memory", undefined, cookie);
    expect(afterSweep.data).toMatchObject({ conversationCount: 0, legacyMessageCount: 0, voiceSessionCount: 1, contextReceiptCount: 0, actionReceiptCount: 0 });
  });

  it("resets the named persona and generated profile as one atomic scope", async () => {
    const reset = await request("DELETE", "/api/account/ai-memory", { scope: "assistant-profile" }, cookie);
    expect(reset.status).toBe(200);
    expect(reset.data.removed.personaProfiles).toBe(1);
    const persona = await request("GET", "/api/ai/persona", undefined, cookie);
    expect(persona.status).toBe(200);
    expect(persona.data.persona).toMatchObject({ name: "NOVA", ecosystemSharingEnabled: false, allowedDestinations: [], revision: 1 });
  });

  it("snapshots explicit local, hybrid, or cloud execution policy", async () => {
    expect((await request("GET", "/api/ai/execution")).status).toBe(401);
    const initial = await request("GET", "/api/ai/execution", undefined, cookie);
    expect(initial.status).toBe(200);
    expect(initial.data.preference).toMatchObject({ executionMode: "cloud", preferredProvider: "anthropic", cloudFallbackEnabled: false, revision: 1 });
    expect(initial.data.providers.map((provider: any) => provider.id)).toEqual(["self_hosted", "anthropic"]);
    const changed = await request("PUT", "/api/ai/execution", { executionMode: "hybrid", cloudFallbackEnabled: true, expectedRevision: 1 }, cookie);
    expect(changed.status).toBe(200); expect(changed.data.preference).toMatchObject({ executionMode: "hybrid", preferredProvider: "self_hosted", cloudFallbackEnabled: true, revision: 2 });
    expect((await request("PUT", "/api/ai/execution", { executionMode: "local", cloudFallbackEnabled: true, expectedRevision: 2 }, cookie)).status).toBe(400);
    const draft = await request("POST", "/api/ai/orchestration-runs", { objective: "Check the execution snapshot", agents: ["analysis"], allowedDomains: [] }, cookie);
    expect(draft.status).toBe(201); expect(draft.data.run).toMatchObject({ executionMode: "hybrid", providerPreference: "self_hosted", cloudFallbackEnabled: true, providerResolution: { state: "not_resolved" } });
    const approved = await request("POST", `/api/ai/orchestration-runs/${draft.data.run.id}/approve`, { expectedVersion: 1 }, cookie);
    expect(approved.status).toBe(200);
    const execution = await request("POST", `/api/ai/orchestration-runs/${draft.data.run.id}/execute`, { expectedVersion: 2 }, cookie);
    expect(execution.status).toBe(503); expect(execution.data.resolution).toMatchObject({ requestedMode: "hybrid", selectedProvider: null, usedCloudFallback: false, failureCode: "no_configured_provider" });
  });

  it("executes a human-approved consequential action and repairs its exact prior field", async () => {
    const { record, pending } = await seedPendingAction({ userId, toolName: "update_profile", payload: { primaryCraft: "AI governance qualification" } });
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

  it("atomically records decline and expiry without applying the requested change", async () => {
    const [{ db }, schema, { eq }] = await Promise.all([import("../server/db"), import("../shared/schema"), import("drizzle-orm")]);
    const declined = await seedPendingAction({ userId, toolName: "update_profile", payload: { primaryCraft: "must not be applied" } });
    const declinedResponse = await request("POST", `/api/ai-actions/${declined.pending.id}/reject`, undefined, cookie);
    expect(declinedResponse.status).toBe(200);
    expect(declinedResponse.data.state).toBe("rejected");
    const [declinedPending] = await db.select().from(schema.aiPendingActions).where(eq(schema.aiPendingActions.id, declined.pending.id));
    const [declinedRecord] = await db.select().from(schema.aiActionRecords).where(eq(schema.aiActionRecords.id, declined.record.id));
    expect(declinedPending.state).toBe("rejected");
    expect(declinedRecord).toMatchObject({ state: "rejected", outcomeSummary: "User declined the requested change." });
    expect(declinedRecord.completedAt).toBeInstanceOf(Date);

    const expired = await seedPendingAction({
      userId,
      toolName: "update_profile",
      payload: { primaryCraft: "expired change" },
      expiresAt: new Date(Date.now() - 1_000),
    });
    const expiredResponse = await request("POST", `/api/ai-actions/${expired.pending.id}/approve`, undefined, cookie);
    expect(expiredResponse.status).toBe(409);
    expect(expiredResponse.data).toMatchObject({ state: "expired", error: "This approval expired; no change was made." });
    const [expiredPending] = await db.select().from(schema.aiPendingActions).where(eq(schema.aiPendingActions.id, expired.pending.id));
    const [expiredRecord] = await db.select().from(schema.aiActionRecords).where(eq(schema.aiActionRecords.id, expired.record.id));
    expect(expiredPending.state).toBe("expired");
    expect(expiredRecord).toMatchObject({ state: "expired", outcomeSummary: "Approval window expired; no change was made." });
    expect(expiredRecord.completedAt).toBeInstanceOf(Date);
    expect((await request("GET", "/api/profile", undefined, cookie)).data.primaryCraft ?? null).toBe(null);
  });

  it("does not let another account approve or decline an owner's pending action", async () => {
    const other = await request("POST", "/api/auth/complete-registration", {
      email: `ai_governance_other_${stamp}@example.com`,
      password: account.password,
      displayName: `other_${stamp}`,
      termsAccepted: true,
    });
    expect(other.status).toBe(201);
    otherCookie = other.cookie;
    const ownerAction = await seedPendingAction({ userId, toolName: "update_profile", payload: { primaryCraft: "owner-only change" } });
    const foreignApprove = await request("POST", `/api/ai-actions/${ownerAction.pending.id}/approve`, undefined, otherCookie);
    expect(foreignApprove.status).toBe(409);
    expect(foreignApprove.data.state).toBe("unavailable");
    const foreignReject = await request("POST", `/api/ai-actions/${ownerAction.pending.id}/reject`, undefined, otherCookie);
    expect(foreignReject.status).toBe(409);
    expect(foreignReject.data.state).toBe("unavailable");
    expect((await request("GET", "/api/profile", undefined, cookie)).data.primaryCraft ?? null).toBe(null);
    expect((await request("GET", "/api/profile", undefined, otherCookie)).data.primaryCraft ?? null).toBe(null);
    const ownerReject = await request("POST", `/api/ai-actions/${ownerAction.pending.id}/reject`, undefined, cookie);
    expect(ownerReject.status).toBe(200);
    expect(ownerReject.data.state).toBe("rejected");
  });
});
