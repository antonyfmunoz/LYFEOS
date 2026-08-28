import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";

const BASE_URL = process.env.LYFEOS_TEST_API_URL;
const DATABASE_URL = process.env.DATABASE_URL;
const describeApi = BASE_URL && DATABASE_URL && process.env.LYFEOS_TEST_ENV === "isolated" ? describe : describe.skip;

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
  };
}

describeApi("workflow automation execution recovery", () => {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  let cookie = "";
  let otherCookie = "";
  let userId = 0;
  let questId = 0;
  let automationId = 0;
  let successfulRunId = 0;

  const definition = {
    version: 1,
    trigger: { type: "manual" },
    conditions: {},
    actions: [
      { type: "set_mission_category", category: "growth" },
      { type: "schedule_follow_up", title: "Review the recovered rule", description: "", category: "general", delayDays: 1 },
    ],
    stopOnError: true,
  };

  afterAll(async () => {
    if (otherCookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, otherCookie);
    if (cookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, cookie);
    await pool.end();
  });

  it("creates an owner-scoped enabled rule and executes one run for concurrent duplicate requests", async () => {
    const registration = await request("POST", "/api/auth/complete-registration", {
      email: `automation_${stamp}@example.com`, password: "TestPass123!", displayName: `automation_${stamp}`, termsAccepted: true,
    });
    expect(registration.status).toBe(201);
    cookie = registration.cookie;
    userId = registration.data.user.id;

    const mission = await request("POST", "/api/quests", {
      userId, title: "Automation trigger", description: "Recovery qualification", category: "general", completed: false,
    }, cookie);
    expect(mission.status).toBe(201);
    questId = mission.data.quest.id;

    const created = await request("POST", "/api/automations", { name: "Recovery rule", description: "Qualified locally", definition }, cookie);
    expect(created.status).toBe(201);
    automationId = created.data.automation.id;
    const enabled = await request("PATCH", `/api/automations/${automationId}`, { enabled: true }, cookie);
    expect(enabled.status).toBe(200);

    const mutationId = crypto.randomUUID();
    const [first, duplicate] = await Promise.all([
      request("POST", `/api/automations/${automationId}/run`, { questId, mutationId }, cookie),
      request("POST", `/api/automations/${automationId}/run`, { questId, mutationId }, cookie),
    ]);
    expect([first.status, duplicate.status]).toEqual([200, 200]);
    expect([first.data.result.duplicate, duplicate.data.result.duplicate].filter(Boolean)).toHaveLength(1);

    const detail = await request("GET", `/api/automations/${automationId}`, undefined, cookie);
    expect(detail.status).toBe(200);
    expect(detail.data.runs).toHaveLength(1);
    expect(detail.data.runs[0]).not.toHaveProperty("definitionSnapshot");
    expect(detail.data.runs[0]).not.toHaveProperty("idempotencyKey");
    expect(detail.data.runs[0]).toMatchObject({ status: "succeeded" });
    expect(detail.data.runs[0].actionResults).toHaveLength(2);
    expect(detail.data.runs[0].actionResults).toEqual(expect.arrayContaining([
      expect.objectContaining({ actionIndex: 0, type: "set_mission_category", status: "succeeded", targetQuestId: questId, attemptCount: 1 }),
      expect.objectContaining({ actionIndex: 1, type: "schedule_follow_up", status: "succeeded", attemptCount: 1 }),
    ]));
    for (const action of detail.data.runs[0].actionResults) {
      expect(Object.keys(action).sort()).toEqual(["actionIndex", "attemptCount", "status", "targetQuestId", "type"]);
      expect(action).not.toHaveProperty("expectedQuestRevision");
      expect(action).not.toHaveProperty("lastErrorCode");
      expect(action).not.toHaveProperty("claimedAt");
    }
    successfulRunId = detail.data.runs[0].id;

    const missions = await request("GET", "/api/automations/missions", undefined, cookie);
    expect(missions.data.missions.filter((row: any) => row.title === "Review the recovered rule")).toHaveLength(1);
  });

  it("repairs only the failed action and converges on the keyed follow-up mission", async () => {
    await pool.query(`UPDATE workflow_automation_action_receipts SET status = 'failed', last_error_code = 'ACTION_FAILED', completed_at = now(), updated_at = now() WHERE run_id = $1 AND action_index = 1`, [successfulRunId]);
    await pool.query(`UPDATE workflow_automation_runs SET status = 'partial', error_code = 'ACTION_FAILED', completed_at = now() WHERE id = $1`, [successfulRunId]);

    const repaired = await request("POST", `/api/automations/${automationId}/runs/${successfulRunId}/repair`, undefined, cookie);
    expect(repaired.status).toBe(200);
    expect(repaired.data.result.status).toBe("succeeded");
    expect(repaired.data.result.actionResults).toEqual(expect.arrayContaining([
      expect.objectContaining({ actionIndex: 0, status: "succeeded", attemptCount: 1 }),
      expect.objectContaining({ actionIndex: 1, status: "succeeded", attemptCount: 2 }),
    ]));
    expect(repaired.data.result.actionResults.every((action: any) => !action.errorCode)).toBe(true);
    const missions = await request("GET", "/api/automations/missions", undefined, cookie);
    expect(missions.data.missions.filter((row: any) => row.title === "Review the recovered rule")).toHaveLength(1);
  });

  it("does not let another account read or repair the owner's receipts", async () => {
    const registration = await request("POST", "/api/auth/complete-registration", {
      email: `automation_other_${stamp}@example.com`, password: "TestPass123!", displayName: `automation_other_${stamp}`, termsAccepted: true,
    });
    expect(registration.status).toBe(201);
    otherCookie = registration.cookie;
    expect((await request("GET", `/api/automations/${automationId}`, undefined, otherCookie)).status).toBe(404);
    expect((await request("POST", `/api/automations/${automationId}/runs/${successfulRunId}/repair`, undefined, otherCookie)).status).toBe(404);
  });

  it("refuses ambiguous stale category recovery and pauses after three consecutive failed runs", async () => {
    await request("PATCH", `/api/quests/${questId}`, { category: "user-decision" }, cookie);
    for (let index = 0; index < 3; index += 1) {
      const inserted = await pool.query<{ id: number }>(`
        INSERT INTO workflow_automation_runs
          (user_id, automation_id, automation_name, trigger_type, trigger_quest_id, idempotency_key, definition_snapshot, status, action_results, created_at)
        VALUES ($1, $2, 'Recovery rule', 'manual', $3, $4, $5::jsonb, 'running', '[]'::jsonb, now() - interval '10 minutes')
        RETURNING id
      `, [userId, automationId, questId, `forced-stale-${stamp}-${index}`, JSON.stringify(definition)]);
      const runId = inserted.rows[0].id;
      await pool.query(`
        INSERT INTO workflow_automation_action_receipts
          (user_id, run_id, action_index, action_type, status, expected_quest_revision, attempt_count, claimed_at, updated_at)
        VALUES ($1, $2, 0, 'set_mission_category', 'running', 1, 1, now() - interval '10 minutes', now() - interval '10 minutes')
      `, [userId, runId]);
      const repaired = await request("POST", `/api/automations/${automationId}/runs/${runId}/repair`, undefined, cookie);
      expect(repaired.status).toBe(200);
      expect(repaired.data.result.status).toBe("failed");
    }

    const detail = await request("GET", `/api/automations/${automationId}`, undefined, cookie);
    expect(detail.data.automation).toMatchObject({ enabled: false, consecutiveFailures: 3, pauseReason: "REPEATED_ACTION_FAILURE" });
    expect(detail.data.runs.filter((run: any) => run.status === "failed")).toHaveLength(3);
    expect(detail.data.runs.filter((run: any) => run.status === "failed").every((run: any) =>
      run.actionResults[0]?.errorCode === "ACTION_FAILED"
      && !Object.hasOwn(run.actionResults[0], "lastErrorCode")
    )).toBe(true);
    const mission = (await request("GET", "/api/automations/missions", undefined, cookie)).data.missions.find((row: any) => row.id === questId);
    expect(mission.category).toBe("user-decision");
  });

  it("exports per-action receipts and erases them with the account", async () => {
    const exported = await request("GET", "/api/account/export", undefined, cookie);
    expect(exported.status).toBe(200);
    expect(exported.data.data.workflow_automation_action_receipts.length).toBeGreaterThanOrEqual(2);
    expect(exported.data.data.workflow_automation_action_receipts.every((row: any) => row.user_id === userId)).toBe(true);
  });
});
