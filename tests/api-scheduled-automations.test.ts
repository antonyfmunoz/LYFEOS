import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const BASE_URL = process.env.LYFEOS_TEST_API_URL;
const DATABASE_URL = process.env.DATABASE_URL;
const describeApi = BASE_URL && DATABASE_URL && process.env.LYFEOS_TEST_ENV === "isolated" ? describe : describe.skip;
let processScheduledAutomation: typeof import("../server/scheduled-automation-worker")["processScheduledAutomation"];

async function request(method: string, path: string, body?: unknown, cookie = "") {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    signal: AbortSignal.timeout(15_000),
    headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json().catch(() => ({})) as any, cookie: (response.headers.get("set-cookie") || "").split(";", 1)[0] };
}

function dateKey(value: Date): string { return value.toISOString().slice(0, 10); }
function shift(value: Date, days: number): Date { const result = new Date(value); result.setUTCDate(result.getUTCDate() + days); return result; }
describeApi("Scheduled automation authenticated journey", () => {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  let cookie = "";
  let userId = 0;
  let anchorId = 0;
  let runOnceId = 0;
  let skipId = 0;

  beforeAll(async () => {
    ({ processScheduledAutomation } = await import("../server/scheduled-automation-worker"));
  });

  afterAll(async () => {
    if (cookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, cookie);
    await pool.end();
  });

  it("creates disabled, owner-scoped schedules and refuses a foreign anchor", async () => {
    expect((await request("GET", "/api/automations")).status).toBe(401);
    const owner = await request("POST", "/api/auth/complete-registration", { email: `schedule_${stamp}@example.com`, password: "TestPass123!", displayName: `schedule_${stamp}`, termsAccepted: true });
    expect(owner.status).toBe(201); cookie = owner.cookie; userId = owner.data.user.id;
    const anchor = await request("POST", "/api/quests", { userId, title: "Weekly operating review", description: "Stable anchor", category: "operations", experienceReward: 10, completed: false }, cookie);
    expect(anchor.status).toBe(201); anchorId = anchor.data.quest.id;
    const now = new Date();
    const definition = { version: 2, trigger: { type: "schedule", questId: anchorId, timeZone: "UTC", localTime: "00:00", cadence: "daily", weekdays: [], startDate: dateKey(shift(now, -2)), endDate: null, maxOccurrences: 3, missedRunPolicy: "run_once" }, conditions: { category: "operations" }, actions: [{ type: "schedule_follow_up", title: "Prepare the next review", description: "Created from a bounded schedule.", category: "operations", delayDays: 2 }], stopOnError: true };
    const created = await request("POST", "/api/automations", { name: "Run operating review", description: "One bounded daily test", definition }, cookie);
    expect(created.status).toBe(201); runOnceId = created.data.automation.id;
    expect(created.data.automation).toMatchObject({ enabled: false, scheduleOccurrencesRun: 0 });
    expect(created.data.automation.scheduleNextRunAt).toBeTruthy();
    const foreign = await request("POST", "/api/automations", { name: "Foreign", description: "", definition: { ...definition, trigger: { ...definition.trigger, questId: anchorId + 999999 } } }, cookie);
    expect(foreign.status).toBe(400);
    expect((await request("PATCH", `/api/automations/${runOnceId}`, { enabled: true }, cookie)).status).toBe(200);
  });

  it("consolidates missed run-once occurrences, claims concurrently, and creates one keyed follow-up", async () => {
    const now = new Date(); now.setUTCSeconds(30, 0);
    const firstDue = new Date(`${dateKey(shift(now, -2))}T00:00:00.000Z`);
    await pool.query(`UPDATE "workflow_automations" SET "schedule_next_run_at" = $2, "schedule_claimed_at" = NULL WHERE "id" = $1`, [runOnceId, firstDue]);
    const results = await Promise.all([processScheduledAutomation(runOnceId, now), processScheduledAutomation(runOnceId, now)]);
    expect(results.sort()).toEqual(["busy", "completed"]);
    const automation = (await pool.query(`SELECT * FROM "workflow_automations" WHERE "id" = $1`, [runOnceId])).rows[0];
    expect(automation.schedule_occurrences_run).toBeGreaterThanOrEqual(3);
    expect(automation.enabled).toBe(false);
    expect(automation.pause_reason).toBe("SCHEDULE_COMPLETE");
    const runs = await pool.query(`SELECT * FROM "workflow_automation_runs" WHERE "automation_id" = $1`, [runOnceId]);
    expect(runs.rowCount).toBe(1);
    expect(runs.rows[0]).toMatchObject({ trigger_type: "schedule", status: "succeeded" });
    expect(runs.rows[0].trigger_context).toMatchObject({ consolidatedOccurrences: 3, missedRunPolicy: "run_once", timeZone: "UTC", delayed: true });
    const followUps = await pool.query(`SELECT * FROM "quests" WHERE "user_id" = $1 AND "lifecycle_key" LIKE 'automation:%'`, [userId]);
    expect(followUps.rowCount).toBe(1);
    expect(followUps.rows[0].due_date).toBe(dateKey(shift(now, 2)));
  });

  it("records a skip policy without mutating Missions and advances to the next future occurrence", async () => {
    const now = new Date(); now.setUTCSeconds(30, 0);
    const definition = { version: 2, trigger: { type: "schedule", questId: anchorId, timeZone: "UTC", localTime: "00:00", cadence: "daily", weekdays: [], startDate: dateKey(shift(now, -2)), endDate: null, maxOccurrences: 5, missedRunPolicy: "skip" }, conditions: {}, actions: [{ type: "schedule_follow_up", title: "Should not be created", description: "", category: "operations", delayDays: 1 }], stopOnError: true };
    const created = await request("POST", "/api/automations", { name: "Skip missed reviews", description: "", definition }, cookie);
    expect(created.status).toBe(201); skipId = created.data.automation.id;
    expect((await request("PATCH", `/api/automations/${skipId}`, { enabled: true }, cookie)).status).toBe(200);
    const firstDue = new Date(`${dateKey(shift(now, -2))}T00:00:00.000Z`);
    await pool.query(`UPDATE "workflow_automations" SET "schedule_next_run_at" = $2 WHERE "id" = $1`, [skipId, firstDue]);
    expect(await processScheduledAutomation(skipId, now)).toBe("skipped");
    const automation = (await pool.query(`SELECT * FROM "workflow_automations" WHERE "id" = $1`, [skipId])).rows[0];
    expect(automation.schedule_occurrences_run).toBe(3);
    expect(automation.enabled).toBe(true);
    expect(new Date(automation.schedule_next_run_at).getTime()).toBeGreaterThan(now.getTime());
    const run = (await pool.query(`SELECT * FROM "workflow_automation_runs" WHERE "automation_id" = $1`, [skipId])).rows[0];
    expect(run).toMatchObject({ status: "skipped", error_code: "MISSED_RUN_SKIPPED" });
    expect(run.trigger_context.missedOccurrences).toBe(automation.schedule_occurrences_run);
    expect(run.trigger_context).toMatchObject({ missedRunPolicy: "skip" });
    expect((await pool.query(`SELECT count(*)::int AS count FROM "quests" WHERE "user_id" = $1 AND "title" = 'Should not be created'`, [userId])).rows[0].count).toBe(0);
  });

  it("exports schedule context and erases every schedule and receipt with the account", async () => {
    const detail = await request("GET", `/api/automations/${runOnceId}`, undefined, cookie);
    expect(detail.status).toBe(200);
    expect(detail.data.runs[0].triggerContext).toMatchObject({ missedRunPolicy: "run_once", consolidatedOccurrences: 3 });
    const exported = await request("GET", "/api/account/export", undefined, cookie);
    expect(exported.status).toBe(200);
    expect(exported.data.data.workflow_automations).toHaveLength(2);
    expect(exported.data.data.workflow_automation_runs).toHaveLength(2);
    expect((await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, cookie)).status).toBe(200);
    cookie = "";
    expect((await pool.query(`SELECT count(*)::int AS count FROM "workflow_automations" WHERE "user_id" = $1`, [userId])).rows[0].count).toBe(0);
    expect((await pool.query(`SELECT count(*)::int AS count FROM "workflow_automation_runs" WHERE "user_id" = $1`, [userId])).rows[0].count).toBe(0);
  });
});
