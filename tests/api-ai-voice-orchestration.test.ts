import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";

const BASE_URL = process.env.LYFEOS_TEST_API_URL;
const DATABASE_URL = process.env.DATABASE_URL;
const describeApi = BASE_URL && DATABASE_URL && process.env.LYFEOS_TEST_ENV === "isolated" ? describe : describe.skip;

async function request(method: string, path: string, body?: unknown, cookie = "") {
  const response = await fetch(`${BASE_URL}${path}`, { method, headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https", ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json().catch(() => ({})) as any, cookie: (response.headers.get("set-cookie") || "").split(";", 1)[0] };
}

describeApi("AI voice and orchestration authenticated contract", () => {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  let ownerCookie = ""; let otherCookie = ""; let ownerId = 0; let voiceId = ""; let runId = "";

  afterAll(async () => {
    if (otherCookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, otherCookie);
    if (ownerCookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, ownerCookie);
    await pool.end();
  });

  it("creates private idempotent voice records and completes extractive outputs", async () => {
    expect((await request("GET", "/api/ai/voice-sessions")).status).toBe(401);
    const owner = await request("POST", "/api/auth/complete-registration", { email: `voice_${stamp}@example.com`, password: "TestPass123!", displayName: `voice_${stamp}`, termsAccepted: true });
    expect(owner.status).toBe(201); ownerCookie = owner.cookie; ownerId = owner.data.user.id;
    const created = await request("POST", "/api/ai/voice-sessions", { title: "Voice session", purpose: "meeting" }, ownerCookie);
    expect(created.status).toBe(201); voiceId = created.data.session.id;
    const idempotencyKey = crypto.randomUUID();
    const segment = { speaker: "user", transcript: "We need to verify onboarding. I will run the acceptance journey tomorrow.", source: "browser_speech", idempotencyKey, occurredAt: new Date().toISOString() };
    expect((await request("POST", `/api/ai/voice-sessions/${voiceId}/segments`, segment, ownerCookie)).status).toBe(201);
    const replay = await request("POST", `/api/ai/voice-sessions/${voiceId}/segments`, segment, ownerCookie);
    expect(replay.status).toBe(200); expect(replay.data.replayed).toBe(true);
    expect((await request("POST", `/api/ai/voice-sessions/${voiceId}/segments`, { ...segment, transcript: "Changed data" }, ownerCookie)).status).toBe(409);
    const completed = await request("POST", `/api/ai/voice-sessions/${voiceId}/complete`, { expectedVersion: 1 }, ownerCookie);
    expect(completed.status).toBe(200);
    expect(completed.data.session).toMatchObject({ status: "completed", summaryMethod: "extractive_v1", version: 2 });
    expect(completed.data.session.actionItems).toHaveLength(2);
    expect((await request("POST", `/api/ai/voice-sessions/${voiceId}/segments`, { ...segment, idempotencyKey: crypto.randomUUID() }, ownerCookie)).status).toBe(409);
  });

  it("requires owner review and optimistic approval for bounded specialist roles", async () => {
    const draft = await request("POST", "/api/ai/orchestration-runs", { objective: "Evaluate the release and map integration risks", contextText: "Use only this supplied release note.", agents: ["analysis", "integration"], allowedDomains: ["projects", "integrations"] }, ownerCookie);
    expect(draft.status).toBe(201); runId = draft.data.run.id;
    expect(draft.data.run.capabilitySnapshot).toEqual({ externalAccess: false, mutations: false, externalSend: false });
    expect(draft.data.steps.map((step: any) => step.agentKind)).toEqual(["analysis", "integration"]);
    const approved = await request("POST", `/api/ai/orchestration-runs/${runId}/approve`, { expectedVersion: 1 }, ownerCookie);
    expect(approved.status).toBe(200); expect(approved.data.run).toMatchObject({ status: "approved", version: 2 });
    expect((await request("POST", `/api/ai/orchestration-runs/${runId}/approve`, { expectedVersion: 1 }, ownerCookie)).status).toBe(409);
  });

  it("isolates owners and exports and erases both domains", async () => {
    const other = await request("POST", "/api/auth/complete-registration", { email: `voice_other_${stamp}@example.com`, password: "TestPass123!", displayName: `voice_other_${stamp}`, termsAccepted: true });
    expect(other.status).toBe(201); otherCookie = other.cookie;
    expect((await request("GET", `/api/ai/voice-sessions/${voiceId}`, undefined, otherCookie)).status).toBe(404);
    expect((await request("GET", `/api/ai/orchestration-runs/${runId}`, undefined, otherCookie)).status).toBe(404);
    const exported = await request("GET", "/api/account/export", undefined, ownerCookie);
    expect(exported.status).toBe(200);
    for (const table of ["ai_voice_sessions", "ai_voice_session_segments", "ai_orchestration_runs", "ai_orchestration_steps"]) expect(exported.data.data).toHaveProperty(table);
    expect((await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, ownerCookie)).status).toBe(200); ownerCookie = "";
    for (const table of ["ai_voice_sessions", "ai_voice_session_segments", "ai_orchestration_runs", "ai_orchestration_steps"]) {
      const count = await pool.query(`SELECT count(*)::integer AS count FROM ${table} WHERE user_id = $1`, [ownerId]);
      expect(count.rows[0].count).toBe(0);
    }
  });
});
