import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";

const BASE_URL = process.env.LYFEOS_TEST_API_URL;
const DATABASE_URL = process.env.DATABASE_URL;
const describeApi = BASE_URL && DATABASE_URL && process.env.LYFEOS_TEST_ENV === "isolated" ? describe : describe.skip;

async function request(method: string, path: string, body?: unknown, cookie = "") {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    signal: AbortSignal.timeout(15_000),
    headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https", "X-LyfeOS-Time-Zone": "UTC", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json().catch(() => ({})) as any, cookie: (response.headers.get("set-cookie") || "").split(";", 1)[0], cacheControl: response.headers.get("cache-control") };
}

describeApi("Cross-domain hypothesis authenticated journey", () => {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  let ownerCookie = "";
  let outsiderCookie = "";
  let ownerId = 0;
  let hypothesisId = 0;
  let snapshotId = 0;
  const mutationId = randomUUID();

  afterAll(async () => {
    if (ownerCookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, ownerCookie);
    if (outsiderCookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, outsiderCookie);
    await pool.end();
  });

  it("defaults every domain off and refuses unconsented analysis", async () => {
    expect((await request("GET", "/api/hypotheses")).status).toBe(401);
    const owner = await request("POST", "/api/auth/complete-registration", { email: `hypothesis_owner_${stamp}@example.com`, password: "TestPass123!", displayName: `hypothesis_owner_${stamp}`, termsAccepted: true });
    const outsider = await request("POST", "/api/auth/complete-registration", { email: `hypothesis_outsider_${stamp}@example.com`, password: "TestPass123!", displayName: `hypothesis_outsider_${stamp}`, termsAccepted: true });
    expect(owner.status).toBe(201); expect(outsider.status).toBe(201);
    ownerCookie = owner.cookie; outsiderCookie = outsider.cookie; ownerId = owner.data.user.id;
    const dictionary = await request("GET", "/api/hypotheses/signals", undefined, ownerCookie);
    expect(dictionary.status).toBe(200);
    expect(dictionary.cacheControl).toContain("private");
    expect(dictionary.data.consents).toEqual({ missions: "revoked", daily_state: "revoked", health: "revoked" });
    const denied = await request("POST", "/api/hypotheses", { title: "Hydration and completed Missions", leftSignalId: "health.hydration_ml", rightSignalId: "missions.completed_count", periodDays: 30, lagDays: 0, timeZone: "UTC", acknowledgedExploratory: true }, ownerCookie);
    expect(denied.status).toBe(409);
  });

  it("calculates one explicitly consented, sample-gated, metadata-only snapshot", async () => {
    for (const domain of ["missions", "health"]) expect((await request("PATCH", "/api/hypotheses/consents", { domain, state: "enabled", acknowledgedPrivateAnalysis: true }, ownerCookie)).status).toBe(200);
    const today = new Date(); today.setUTCHours(12, 0, 0, 0);
    for (let index = 0; index < 7; index++) {
      const occurredAt = new Date(today); occurredAt.setUTCDate(occurredAt.getUTCDate() - (6 - index));
      await pool.query(`INSERT INTO "hydration_entries" ("user_id", "volume_ml", "occurred_at", "source", "recorded_time_zone") VALUES ($1, $2, $3, 'manual', 'UTC')`, [ownerId, 1000 + index * 100, occurredAt]);
      for (let mission = 0; mission <= index; mission++) await pool.query(`INSERT INTO "quests" ("user_id", "title", "description", "completed", "completed_at", "created_at") VALUES ($1, $2, '', true, $3, $3)`, [ownerId, `Evidence ${index}-${mission}`, occurredAt]);
    }
    const created = await request("POST", "/api/hypotheses", { title: "Hydration and completed Missions", leftSignalId: "health.hydration_ml", rightSignalId: "missions.completed_count", periodDays: 30, lagDays: 0, timeZone: "UTC", acknowledgedExploratory: true }, ownerCookie);
    expect(created.status).toBe(201);
    hypothesisId = created.data.hypothesis.id;
    snapshotId = created.data.hypothesis.latestSnapshot.id;
    expect(created.data.hypothesis.latestSnapshot.result).toMatchObject({ status: "available", pairedSamples: 7, coefficient: 1, automaticActionTaken: false, progressionAwarded: false });
    expect(created.data.hypothesis.latestSnapshot.result).not.toHaveProperty("aligned");
    expect(created.data.hypothesis.latestSnapshot.leftQuality).toMatchObject({ recordedDays: 7, missingDays: 23, zeroSemantics: "unknown_when_absent" });
    expect(created.data.hypothesis.latestSnapshot.rightQuality).toMatchObject({ recordedDays: 30, missingDays: 0, zeroSemantics: "recorded_zero" });
    expect((await request("GET", "/api/hypotheses", undefined, outsiderCookie)).data.hypotheses).toHaveLength(0);
  });

  it("saves an owner-private interpretation with replay protection and no progression", async () => {
    const body = { snapshotId, interpretation: "needs_more_context", note: "I want another ordinary month before treating this as useful context.", acknowledgedExploratory: true, clientMutationId: mutationId };
    const created = await request("POST", `/api/hypotheses/${hypothesisId}/interpretations`, body, ownerCookie);
    expect(created.status).toBe(201);
    expect((await request("POST", `/api/hypotheses/${hypothesisId}/interpretations`, body, ownerCookie)).data.replayed).toBe(true);
    expect((await request("POST", `/api/hypotheses/${hypothesisId}/interpretations`, { ...body, interpretation: "worth_revisiting" }, ownerCookie)).status).toBe(409);
    expect((await request("POST", `/api/hypotheses/${hypothesisId}/interpretations`, { ...body, clientMutationId: randomUUID() }, outsiderCookie)).status).toBe(404);
    const progression = await pool.query(`SELECT (SELECT count(*) FROM "activity_progression_events" WHERE "user_id" = $1) + (SELECT count(*) FROM "health_progression_events" WHERE "user_id" = $1) AS "count"`, [ownerId]);
    expect(Number(progression.rows[0].count)).toBe(0);
  });

  it("exports private records, revokes Health, and erases Health-derived snapshots", async () => {
    const exported = await request("GET", "/api/account/export", undefined, ownerCookie);
    expect(exported.status).toBe(200);
    expect(exported.data.data.cross_domain_hypotheses).toHaveLength(1);
    expect(exported.data.data.cross_domain_hypothesis_snapshots[0].result).not.toHaveProperty("aligned");
    const healthExport = await request("GET", "/api/health-data/export", undefined, ownerCookie);
    expect(healthExport.status).toBe(200);
    expect(healthExport.data.tables.cross_domain_hypotheses).toHaveLength(1);
    const deleted = await request("DELETE", "/api/health-data", { confirmation: "DELETE MY HEALTH DATA" }, ownerCookie);
    expect(deleted.status).toBe(200);
    expect(deleted.data.deletedRecordCounts.cross_domain_hypotheses).toBe(1);
    expect((await request("GET", "/api/hypotheses", undefined, ownerCookie)).data.hypotheses).toHaveLength(0);
    expect((await request("GET", "/api/hypotheses/signals", undefined, ownerCookie)).data.consents.health).toBe("revoked");
    expect((await pool.query(`SELECT count(*)::int AS count FROM "cross_domain_hypothesis_snapshots" WHERE "user_id" = $1`, [ownerId])).rows[0].count).toBe(0);
  });
});
