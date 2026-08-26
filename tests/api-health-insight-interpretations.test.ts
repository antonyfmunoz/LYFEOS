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

describeApi("Health insight interpretation authenticated journey", () => {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  let ownerCookie = "";
  let outsiderCookie = "";
  let ownerId = 0;
  let interpretationId = 0;
  const mutationId = randomUUID();
  const comparison = { left: "hydration_ml", right: "recovery_minutes", days: 30, lagDays: 0, confirmed: true };

  afterAll(async () => {
    if (ownerCookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, ownerCookie);
    if (outsiderCookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, outsiderCookie);
    await pool.end();
  });

  it("creates isolated owners and calculates an uncertainty-bounded association", async () => {
    expect((await request("GET", "/api/health-insights/interpretations")).status).toBe(401);
    const owner = await request("POST", "/api/auth/complete-registration", { email: `insight_owner_${stamp}@example.com`, password: "TestPass123!", displayName: `insight_owner_${stamp}`, termsAccepted: true });
    const outsider = await request("POST", "/api/auth/complete-registration", { email: `insight_outsider_${stamp}@example.com`, password: "TestPass123!", displayName: `insight_outsider_${stamp}`, termsAccepted: true });
    expect(owner.status).toBe(201);
    expect(outsider.status).toBe(201);
    ownerCookie = owner.cookie;
    outsiderCookie = outsider.cookie;
    ownerId = owner.data.user.id;
    const today = new Date();
    today.setUTCHours(12, 0, 0, 0);
    for (let index = 0; index < 7; index++) {
      const occurredAt = new Date(today);
      occurredAt.setUTCDate(occurredAt.getUTCDate() - (6 - index));
      await pool.query(`INSERT INTO "hydration_entries" ("user_id", "volume_ml", "occurred_at", "source", "recorded_time_zone") VALUES ($1, $2, $3, 'manual', 'UTC')`, [ownerId, 1000 + index * 100, occurredAt]);
      await pool.query(`INSERT INTO "recovery_activities" ("user_id", "activity_type", "duration_minutes", "occurred_at", "source", "recorded_time_zone") VALUES ($1, 'meditation', $2, $3, 'manual', 'UTC')`, [ownerId, 10 + index, occurredAt]);
    }
    const association = await request("POST", "/api/health-insights/associations", comparison, ownerCookie);
    expect(association.status).toBe(200);
    expect(association.data.result).toMatchObject({ status: "available", pairedSamples: 7, coefficient: 1, uncertainty: { method: "fisher_z_approximation", confidenceLevel: 0.95 } });
    expect(association.data.result.uncertainty.disclosure).toContain("does not account for confounding");
  });

  it("saves one metadata-only interpretation and converges exact retries", async () => {
    const body = { ...comparison, interpretation: "needs_more_context", note: "Travel changed during this window, so I want more ordinary weeks before revisiting it.", acknowledgedExploratory: true, clientMutationId: mutationId };
    const created = await request("POST", "/api/health-insights/interpretations", body, ownerCookie);
    expect(created.status).toBe(201);
    expect(created.data.replayed).toBe(false);
    interpretationId = created.data.interpretation.id;
    expect(created.data.interpretation.associationSnapshot).toMatchObject({ rawDailyValuesStored: false, result: { coefficient: 1, uncertainty: { confidenceLevel: 0.95 } } });
    expect(created.data.interpretation.associationSnapshot.result).not.toHaveProperty("aligned");
    const replay = await request("POST", "/api/health-insights/interpretations", body, ownerCookie);
    expect(replay.status).toBe(200);
    expect(replay.data).toMatchObject({ replayed: true, interpretation: { id: interpretationId } });
    const conflict = await request("POST", "/api/health-insights/interpretations", { ...body, interpretation: "worth_revisiting" }, ownerCookie);
    expect(conflict.status).toBe(409);
  });

  it("keeps interpretations owner-private and refuses insufficient snapshots", async () => {
    const ownerList = await request("GET", "/api/health-insights/interpretations", undefined, ownerCookie);
    expect(ownerList.status).toBe(200);
    expect(ownerList.cacheControl).toContain("private");
    expect(ownerList.data.interpretations).toHaveLength(1);
    expect((await request("GET", "/api/health-insights/interpretations", undefined, outsiderCookie)).data.interpretations).toHaveLength(0);
    expect((await request("DELETE", `/api/health-insights/interpretations/${interpretationId}`, undefined, outsiderCookie)).status).toBe(404);
    const sparse = await request("POST", "/api/health-insights/interpretations", { ...comparison, interpretation: "needs_more_context", note: null, acknowledgedExploratory: true, clientMutationId: randomUUID() }, outsiderCookie);
    expect(sparse.status).toBe(409);
    expect(sparse.data.pairedSamples).toBe(0);
    expect((await request("DELETE", `/api/health-insights/interpretations/${interpretationId}`, undefined, ownerCookie)).status).toBe(204);
    expect((await request("GET", "/api/health-insights/interpretations", undefined, ownerCookie)).data.interpretations).toHaveLength(0);
    const recreated = await request("POST", "/api/health-insights/interpretations", { ...comparison, interpretation: "worth_revisiting", note: "Recreated after testing my right to remove the earlier note.", acknowledgedExploratory: true, clientMutationId: randomUUID() }, ownerCookie);
    expect(recreated.status).toBe(201);
    interpretationId = recreated.data.interpretation.id;
  });

  it("exports the interpretation and removes it through exact Health-domain erasure", async () => {
    const exported = await request("GET", "/api/account/export", undefined, ownerCookie);
    expect(exported.status).toBe(200);
    expect(exported.data.data.health_insight_interpretations).toHaveLength(1);
    expect(exported.data.data.health_insight_interpretations[0].association_snapshot.rawDailyValuesStored).toBe(false);
    const deleted = await request("DELETE", "/api/health-data", { confirmation: "DELETE MY HEALTH DATA" }, ownerCookie);
    expect(deleted.status).toBe(200);
    expect(deleted.data.deletedRecordCounts.health_insight_interpretations).toBe(1);
    expect((await request("GET", "/api/health-insights/interpretations", undefined, ownerCookie)).data.interpretations).toHaveLength(0);
    const remaining = await pool.query(`SELECT count(*)::int AS "count" FROM "health_insight_interpretations" WHERE "user_id" = $1`, [ownerId]);
    expect(remaining.rows[0].count).toBe(0);
  });
});
