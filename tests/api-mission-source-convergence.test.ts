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

describeApi("canonical Mission source convergence", () => {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  let cookie = "";
  let userId = 0;

  afterAll(async () => {
    if (cookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, cookie);
    await pool.end();
  });

  it("converges concurrent Inbox retries into one Mission and one creation receipt", async () => {
    expect((await request("POST", "/api/inbox/captures", { text: "Private thought" })).status).toBe(401);
    const registration = await request("POST", "/api/auth/complete-registration", {
      email: `mission_source_${stamp}@example.com`, password: "TestPass123!", displayName: `mission_source_${stamp}`, termsAccepted: true,
    });
    expect(registration.status).toBe(201);
    cookie = registration.cookie;
    userId = registration.data.user.id;

    const mutationId = crypto.randomUUID();
    const body = { text: "Prepare the launch narrative", mutationId };
    const [first, second] = await Promise.all([
      request("POST", "/api/inbox/captures", body, cookie),
      request("POST", "/api/inbox/captures", body, cookie),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 201]);
    expect(first.data.quest.id).toBe(second.data.quest.id);
    expect([first.data.replayed, second.data.replayed].filter(Boolean)).toHaveLength(1);
    expect(first.data.quest).not.toHaveProperty("lifecycleKey");
    expect(first.data.quest).not.toHaveProperty("lifecyclePayloadHash");

    const changed = await request("POST", "/api/inbox/captures", { text: "Changed capture", mutationId }, cookie);
    expect(changed.status).toBe(409);

    const missionRows = await pool.query(
      `SELECT "id", "planning_decision_source" FROM "quests" WHERE "user_id" = $1 AND "lifecycle_key" = $2`,
      [userId, `inbox:${mutationId}`],
    );
    expect(missionRows.rows).toEqual([{ id: first.data.quest.id, planning_decision_source: "inbox" }]);
    const receiptRows = await pool.query(
      `SELECT "metadata" FROM "user_activity_events" WHERE "user_id" = $1 AND "event_type" = 'mission_created' AND "metadata"->>'questId' = $2`,
      [userId, String(first.data.quest.id)],
    );
    expect(receiptRows.rows).toHaveLength(1);
    expect(receiptRows.rows[0].metadata).toMatchObject({ source: "inbox", lifecycleKey: `inbox:${mutationId}` });
  });

  it("replays an ordered batch without duplicating Missions or receipts", async () => {
    const mutationId = crypto.randomUUID();
    const body = { text: "Draft the announcement\nSchedule the review", sourceDate: "2026-08-25", mutationId };
    const created = await request("POST", "/api/inbox/captures/batch", body, cookie);
    const replayed = await request("POST", "/api/inbox/captures/batch", body, cookie);
    expect(created.status).toBe(201);
    expect(replayed.status).toBe(200);
    expect(created.data.created.map((quest: any) => quest.id)).toEqual(replayed.data.created.map((quest: any) => quest.id));
    expect(replayed.data.replayed).toBe(2);
    expect(created.data.created.every((quest: any) => !("lifecycleKey" in quest) && !("lifecyclePayloadHash" in quest))).toBe(true);

    const missionRows = await pool.query(
      `SELECT "id" FROM "quests" WHERE "user_id" = $1 AND "lifecycle_key" LIKE $2 ORDER BY "lifecycle_key"`,
      [userId, `inbox-batch:${mutationId}:%`],
    );
    expect(missionRows.rows.map((row) => row.id)).toEqual(created.data.created.map((quest: any) => quest.id));
    const receipts = await pool.query(
      `SELECT "metadata" FROM "user_activity_events" WHERE "user_id" = $1 AND "event_type" = 'mission_created' AND "metadata"->>'lifecycleKey' LIKE $2`,
      [userId, `inbox-batch:${mutationId}:%`],
    );
    expect(receipts.rows).toHaveLength(2);
    expect(receipts.rows.every((row) => row.metadata.source === "inbox")).toBe(true);
  });

  it("exports the source receipts and erases every locally owned record", async () => {
    const exported = await request("GET", "/api/account/export", undefined, cookie);
    expect(exported.status).toBe(200);
    const sourceMissions = exported.data.data.quests.filter((quest: any) => quest.planning_decision_source === "inbox");
    const sourceReceipts = exported.data.data.user_activity_events.filter((event: any) => event.event_type === "mission_created" && event.metadata?.source === "inbox");
    expect(sourceMissions).toHaveLength(3);
    expect(sourceReceipts).toHaveLength(3);

    const deleted = await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, cookie);
    expect(deleted.status).toBe(200);
    cookie = "";
    const remaining = await pool.query(
      `SELECT
        (SELECT count(*)::int FROM "users" WHERE "id" = $1) AS users,
        (SELECT count(*)::int FROM "quests" WHERE "user_id" = $1) AS quests,
        (SELECT count(*)::int FROM "user_activity_events" WHERE "user_id" = $1) AS activity`,
      [userId],
    );
    expect(remaining.rows[0]).toEqual({ users: 0, quests: 0, activity: 0 });
  });
});
