import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";

const BASE_URL = process.env.LYFEOS_TEST_API_URL;
const DATABASE_URL = process.env.DATABASE_URL;
const describeApi = BASE_URL && DATABASE_URL && process.env.LYFEOS_TEST_ENV === "isolated" ? describe : describe.skip;

async function request(method: string, path: string, body?: unknown, cookie = "", extraHeaders: Record<string, string> = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    signal: AbortSignal.timeout(15_000),
    headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https", ...(cookie ? { Cookie: cookie } : {}), ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    data: await response.json().catch(() => ({})) as any,
    cookie: (response.headers.get("set-cookie") || "").split(";", 1)[0],
  };
}

describeApi("Mission provider evidence authenticated journey", () => {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  let ownerCookie = "";
  let reviewerCookie = "";
  let ownerId = 0;
  let reviewerId = 0;
  let ownerRecordId = 0;
  let reviewerRecordId = 0;
  let questId = 0;

  afterAll(async () => {
    if (reviewerCookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, reviewerCookie);
    if (ownerCookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, ownerCookie);
    await pool.end();
  });

  it("creates isolated imported records for two users", async () => {
    const owner = await request("POST", "/api/auth/complete-registration", {
      email: `provider_owner_${stamp}@example.com`, password: "TestPass123!", displayName: `provider_owner_${stamp}`, termsAccepted: true,
    });
    const reviewer = await request("POST", "/api/auth/complete-registration", {
      email: `provider_reviewer_${stamp}@example.com`, password: "TestPass123!", displayName: `provider_reviewer_${stamp}`, termsAccepted: true,
    });
    expect(owner.status).toBe(201);
    expect(reviewer.status).toBe(201);
    ownerCookie = owner.cookie;
    reviewerCookie = reviewer.cookie;
    ownerId = owner.data.user.id;
    reviewerId = reviewer.data.user.id;

    const ownerConnection = await pool.query(
      `INSERT INTO "health_connections" ("user_id", "provider", "provider_name", "status", "scopes", "consent_version", "credential_ref") VALUES ($1, 'test_health', 'Qualification Health', 'active', '["activity:read"]', 'test-v1', 'secret://qualification/owner') RETURNING "id"`,
      [ownerId],
    );
    const reviewerConnection = await pool.query(
      `INSERT INTO "health_connections" ("user_id", "provider", "provider_name", "status", "scopes", "consent_version", "credential_ref") VALUES ($1, 'test_health', 'Qualification Health', 'active', '["activity:read"]', 'test-v1', 'secret://qualification/reviewer') RETURNING "id"`,
      [reviewerId],
    );
    const ownerRecord = await pool.query(
      `INSERT INTO "health_source_records" ("user_id", "connection_id", "provider", "source_record_id", "record_type", "observed_at", "payload_fingerprint", "transform_version", "source_payload", "source_metadata") VALUES ($1, $2, 'test_health', 'owner-workout-1', 'workout', now() - interval '1 day', 'sha256:owner-fixture', 'health-import.v1', '{"sensitive":"owner-private"}', '{"qualification":true}') RETURNING "id"`,
      [ownerId, ownerConnection.rows[0].id],
    );
    const reviewerRecord = await pool.query(
      `INSERT INTO "health_source_records" ("user_id", "connection_id", "provider", "source_record_id", "record_type", "observed_at", "payload_fingerprint", "transform_version", "source_payload", "source_metadata") VALUES ($1, $2, 'test_health', 'reviewer-workout-1', 'workout', now() - interval '2 days', 'sha256:reviewer-fixture', 'health-import.v1', '{"sensitive":"reviewer-private"}', '{"qualification":true}') RETURNING "id"`,
      [reviewerId, reviewerConnection.rows[0].id],
    );
    ownerRecordId = ownerRecord.rows[0].id;
    reviewerRecordId = reviewerRecord.rows[0].id;

    const ownerOptions = await request("GET", "/api/mission-evidence/provider-records", undefined, ownerCookie);
    const reviewerOptions = await request("GET", "/api/mission-evidence/provider-records", undefined, reviewerCookie);
    expect(ownerOptions.status).toBe(200);
    expect(ownerOptions.data.records.map((record: any) => record.id)).toEqual([ownerRecordId]);
    expect(reviewerOptions.data.records.map((record: any) => record.id)).toEqual([reviewerRecordId]);
    expect(JSON.stringify(ownerOptions.data)).not.toContain("owner-private");
    expect(JSON.stringify(ownerOptions.data)).not.toContain("sourceRecordId");
  });

  it("rejects client claims and cross-owner attachment, then creates a safe receipt", async () => {
    const mission = await request("POST", "/api/quests", {
      userId: ownerId, title: "Complete provider-backed training", description: "Attach the imported workout receipt.", category: "fitness", completed: false,
    }, ownerCookie);
    expect(mission.status).toBe(201);
    questId = mission.data.quest.id;
    const contract = await request("PUT", `/api/quests/${questId}/contract`, {
      purpose: "Practice a planned training session.", expectedOutput: "A completed session with a concise reflection.", requiredEvidence: ["Imported workout receipt"], reviewMode: "human", riskLevel: "low", state: "accepted",
    }, ownerCookie);
    expect(contract.status).toBe(200);

    const forged = await request("POST", `/api/quests/${questId}/evidence`, {
      sourceType: "provider", providerSourceRecordId: ownerRecordId, sourceReference: "https://forged.example", summary: "Client-forged provider claim", confidence: "high",
    }, ownerCookie);
    expect(forged.status).toBe(400);
    const crossed = await request("POST", `/api/quests/${questId}/evidence`, {
      sourceType: "provider", providerSourceRecordId: reviewerRecordId, summary: "Attempt to attach another user's record",
    }, ownerCookie);
    expect(crossed.status).toBe(404);

    const attached = await request("POST", `/api/quests/${questId}/evidence`, {
      sourceType: "provider", providerSourceRecordId: ownerRecordId, summary: "Completed the planned strength session",
    }, ownerCookie);
    expect(attached.status).toBe(201);
    expect(attached.data.evidence).toMatchObject({ sourceType: "provider", sourceReference: null, confidence: "provider_record", provenance: { provider: "test_health", recordType: "workout", status: "active" } });
    const serialized = JSON.stringify(attached.data);
    expect(serialized).not.toContain("owner-private");
    expect(serialized).not.toContain("owner-workout-1");
    expect(serialized).not.toContain("sha256:owner-fixture");
  });

  it("reveals only safe provenance after an authorized reviewer accepts", async () => {
    const invitation = await request("POST", `/api/quests/${questId}/review-invitations`, { expiresInDays: 7 }, ownerCookie);
    expect(invitation.status).toBe(201);
    const token = String(invitation.data.reviewPath).split("#token=")[1];
    expect(token.length).toBeGreaterThan(31);
    const headers = { "x-lyfeos-review-token": token };
    const hidden = await request("GET", "/api/mission-review-invitations/resolve", undefined, reviewerCookie, headers);
    expect(hidden.status).toBe(200);
    expect(hidden.data.evidence).toEqual([]);
    expect((await request("POST", "/api/mission-review-invitations/accept", undefined, reviewerCookie, headers)).status).toBe(200);
    const visible = await request("GET", "/api/mission-review-invitations/resolve", undefined, reviewerCookie, headers);
    expect(visible.data.evidence[0].provenance).toMatchObject({ provider: "test_health", recordType: "workout", status: "active" });
    const serialized = JSON.stringify(visible.data);
    expect(serialized).not.toContain("owner-private");
    expect(serialized).not.toContain("owner-workout-1");
    expect(serialized).not.toContain("sha256:owner-fixture");
  });

  it("preserves truthful superseded and deleted-source lifecycle states", async () => {
    await pool.query(`UPDATE "health_source_records" SET "state" = 'superseded' WHERE "id" = $1`, [ownerRecordId]);
    let bundle = await request("GET", `/api/quests/${questId}/contract`, undefined, ownerCookie);
    expect(bundle.data.evidence[0].provenance.status).toBe("superseded");
    expect((await request("GET", "/api/mission-evidence/provider-records", undefined, ownerCookie)).data.records).toEqual([]);

    await pool.query(`DELETE FROM "health_source_records" WHERE "id" = $1`, [ownerRecordId]);
    bundle = await request("GET", `/api/quests/${questId}/contract`, undefined, ownerCookie);
    expect(bundle.data.evidence[0].provenance.status).toBe("source_deleted");
    expect(bundle.data.evidence[0].provenance.disclosure).toContain("deleted the imported provider record");

    const exported = await request("GET", "/api/account/export", undefined, ownerCookie);
    expect(exported.status).toBe(200);
    expect(exported.data.data.mission_evidence_provider_bindings[0]).toMatchObject({ provider: "test_health", record_type: "workout", payload_fingerprint: "sha256:owner-fixture", provider_source_record_id: null });
    expect(JSON.stringify(exported.data.data.mission_evidence_provider_bindings)).not.toContain("owner-private");
  });

  it("erases receipts with the account and leaves no cross-tenant residue", async () => {
    expect((await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, reviewerCookie)).status).toBe(200);
    reviewerCookie = "";
    expect((await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, ownerCookie)).status).toBe(200);
    ownerCookie = "";
    const remaining = await pool.query(
      `SELECT (SELECT count(*)::int FROM "mission_evidence_provider_bindings" WHERE "user_id" = $1) AS bindings, (SELECT count(*)::int FROM "mission_evidence" WHERE "user_id" = $1) AS evidence, (SELECT count(*)::int FROM "health_source_records" WHERE "user_id" IN ($1, $2)) AS sources`,
      [ownerId, reviewerId],
    );
    expect(remaining.rows[0]).toEqual({ bindings: 0, evidence: 0, sources: 0 });
  });
});
