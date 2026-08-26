import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";

const BASE_URL = process.env.LYFEOS_TEST_API_URL;
const DATABASE_URL = process.env.DATABASE_URL;
const describeApi = BASE_URL && DATABASE_URL && process.env.LYFEOS_TEST_ENV === "isolated" ? describe : describe.skip;

async function request(method: string, path: string, body?: unknown, cookie = "") {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    signal: AbortSignal.timeout(15_000),
    headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    data: await response.json().catch(() => ({})) as any,
    cookie: (response.headers.get("set-cookie") || "").split(";", 1)[0],
  };
}

describeApi("Mission planning context amendment journey", () => {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  let ownerCookie = "";
  let outsiderCookie = "";
  let ownerId = 0;
  let questId = 0;
  let originalSnapshot: any;

  afterAll(async () => {
    if (ownerCookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, ownerCookie);
    if (outsiderCookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, outsiderCookie);
    await pool.end();
  });

  it("creates one owner-private immutable creation snapshot with source drill-down", async () => {
    const owner = await request("POST", "/api/auth/complete-registration", { email: `context_owner_${stamp}@example.com`, password: "TestPass123!", displayName: `context_owner_${stamp}`, termsAccepted: true });
    const outsider = await request("POST", "/api/auth/complete-registration", { email: `context_outsider_${stamp}@example.com`, password: "TestPass123!", displayName: `context_outsider_${stamp}`, termsAccepted: true });
    expect(owner.status).toBe(201);
    expect(outsider.status).toBe(201);
    ownerCookie = owner.cookie;
    outsiderCookie = outsider.cookie;
    ownerId = owner.data.user.id;
    const mission = await request("POST", "/api/quests", { userId: ownerId, title: "Correct my planning context", description: "Keep original decision evidence while current context changes.", category: "personal", experienceReward: 10, completed: false }, ownerCookie);
    expect(mission.status).toBe(201);
    questId = mission.data.quest.id;
    const bundle = await request("GET", `/api/quests/${questId}/contract`, undefined, ownerCookie);
    expect(bundle.status).toBe(200);
    expect(bundle.data.planningDecision).toMatchObject({ contextRevision: 0, source: "ui" });
    expect(bundle.data.planningDecision.sources.focus.href).toBe("/profile");
    originalSnapshot = bundle.data.planningDecision.context;
    expect(originalSnapshot.capturedAt).toBeTruthy();
    expect((await request("POST", `/api/quests/${questId}/planning-context/amendments`, { expectedRevision: 0, focus: "Foreign edit", declaredWeeklyHours: 2, constraints: [], reason: "Unauthorized correction" }, outsiderCookie)).status).toBe(404);
  });

  it("appends a correction without changing the creation snapshot and rejects stale writers", async () => {
    const first = await request("POST", `/api/quests/${questId}/planning-context/amendments`, {
      expectedRevision: 0,
      focus: "Ship the bounded LyfeOS release",
      declaredWeeklyHours: 6.5,
      constraints: ["Protect recovery time", "Keep the scope bounded"],
      reason: "My available time and immediate objective changed.",
    }, ownerCookie);
    expect(first.status).toBe(201);
    expect(first.data.planningDecision.context).toEqual(originalSnapshot);
    expect(first.data.planningDecision).toMatchObject({ contextRevision: 1 });
    expect(first.data.planningDecision.currentContext).toMatchObject({ focus: "Ship the bounded LyfeOS release", declaredWeeklyHours: 6.5, constraints: ["Protect recovery time", "Keep the scope bounded"] });
    const stale = await request("POST", `/api/quests/${questId}/planning-context/amendments`, { expectedRevision: 0, focus: null, declaredWeeklyHours: null, constraints: [], reason: "Stale overwrite attempt" }, ownerCookie);
    expect(stale.status).toBe(409);
    expect(stale.data.currentRevision).toBe(1);
  });

  it("preserves a complete revision chain and cascades it on account deletion", async () => {
    const second = await request("POST", `/api/quests/${questId}/planning-context/amendments`, {
      expectedRevision: 1,
      focus: "Qualify the deployed LyfeOS release",
      declaredWeeklyHours: 5,
      constraints: ["Use only verified evidence"],
      reason: "Implementation finished and the focus moved to qualification.",
    }, ownerCookie);
    expect(second.status).toBe(201);
    expect(second.data.planningDecision.contextRevision).toBe(2);
    expect(second.data.planningDecision.amendments.map((item: any) => item.revision)).toEqual([2, 1]);
    const rows = await pool.query(`SELECT "revision", "previous_snapshot", "snapshot" FROM "mission_planning_context_amendments" WHERE "quest_id" = $1 ORDER BY "revision"`, [questId]);
    expect(rows.rowCount).toBe(2);
    expect(rows.rows[0].previous_snapshot).toEqual(originalSnapshot);
    expect(rows.rows[1].previous_snapshot).toEqual(rows.rows[0].snapshot);
    expect((await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, ownerCookie)).status).toBe(200);
    ownerCookie = "";
    expect((await pool.query(`SELECT count(*)::int AS count FROM "mission_planning_context_amendments" WHERE "quest_id" = $1`, [questId])).rows[0].count).toBe(0);
  });
});
