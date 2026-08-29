import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";

const BASE_URL = process.env.LYFEOS_TEST_API_URL;
const DATABASE_URL = process.env.DATABASE_URL;
const describeApi = BASE_URL && DATABASE_URL && process.env.LYFEOS_TEST_ENV === "isolated" ? describe : describe.skip;

async function request(method: string, path: string, body?: unknown, cookie = "", headers: Record<string, string> = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    signal: AbortSignal.timeout(15_000),
    headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https", ...(cookie ? { Cookie: cookie } : {}), ...headers },
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
  let uiMissionId = 0;

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

  it("keeps UI, onboarding, and automatic To-Do origins distinct while sharing canonical receipts", async () => {
    const uiMutationId = `source-ui-${stamp}`;
    const uiPayload = { userId, title: "Create from the Mission UI", description: "Source convergence proof", category: "general", completed: false };
    const uiCreated = await request("POST", "/api/quests", uiPayload, cookie, { "x-lyfeos-mutation-id": uiMutationId });
    const uiReplayed = await request("POST", "/api/quests", uiPayload, cookie, { "x-lyfeos-mutation-id": uiMutationId });
    expect(uiCreated.status).toBe(201);
    expect(uiReplayed.status).toBe(200);
    expect(uiReplayed.data).toMatchObject({ replayed: true, quest: { id: uiCreated.data.quest.id } });
    expect(uiCreated.data.quest.planningDecisionSource).toBe("ui");
    uiMissionId = uiCreated.data.quest.id;

    const onboardingPayload = {
      userId,
      title: "Onboarding: Source convergence",
      description: "One bounded synthetic onboarding Mission",
      category: "onboarding",
      completed: false,
      experienceReward: 10,
    };
    const onboardingCreated = await request("POST", "/api/quests", onboardingPayload, cookie);
    const onboardingDuplicate = await request("POST", "/api/quests", onboardingPayload, cookie);
    expect(onboardingCreated.status).toBe(201);
    expect(onboardingDuplicate.status).toBe(200);
    expect(onboardingDuplicate.data).toMatchObject({ duplicate: true, quest: { id: onboardingCreated.data.quest.id } });
    expect(onboardingCreated.data.quest.planningDecisionSource).toBe("onboarding");

    const todoTitle = `Automatic captured idea ${stamp}`;
    const oldDate = "2000-01-02";
    const savedLog = await request("POST", `/api/users/${userId}/daily-logs`, { date: oldDate, todoIdeas: todoTitle }, cookie);
    expect(savedLog.status).toBe(200);
    const firstList = await request("GET", `/api/users/${userId}/quests?tz=UTC`, undefined, cookie);
    const secondList = await request("GET", `/api/users/${userId}/quests?tz=UTC`, undefined, cookie);
    expect(firstList.status).toBe(200);
    expect(secondList.status).toBe(200);
    const todoMissions = secondList.data.quests.filter((quest: any) => quest.title === todoTitle);
    expect(todoMissions).toHaveLength(1);
    expect(todoMissions[0]).toMatchObject({ category: "todo", planningDecisionSource: "todo", completed: false });

    const expected = [
      { id: uiCreated.data.quest.id, source: "ui" },
      { id: onboardingCreated.data.quest.id, source: "onboarding" },
      { id: todoMissions[0].id, source: "todo" },
    ];
    const receipts = await pool.query(
      `SELECT ("metadata"->>'questId')::int AS "quest_id", "metadata"->>'source' AS "source"
       FROM "user_activity_events"
       WHERE "user_id" = $1 AND "event_type" = 'mission_created' AND ("metadata"->>'questId')::int = ANY($2::int[])
       ORDER BY ("metadata"->>'questId')::int`,
      [userId, expected.map((entry) => entry.id)],
    );
    expect(receipts.rows).toEqual(expected
      .map((entry) => ({ quest_id: entry.id, source: entry.source }))
      .sort((left, right) => left.quest_id - right.quest_id));
  });

  it("converges concurrent canonical Mission-page creation without surfacing a unique collision", async () => {
    const payload = {
      userId,
      questId: uiMissionId,
      eventId: null,
      title: `Mission page ${stamp}`,
      slug: `mission-page-${stamp.replaceAll("_", "-")}`,
      content: "# Source convergence proof",
      completed: false,
      xpValue: 5,
      tags: ["mission"],
      date: "2026-08-28",
    };
    const [first, second] = await Promise.all([
      request("POST", "/api/mission-pages", payload, cookie),
      request("POST", "/api/mission-pages", payload, cookie),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 201]);
    expect(first.data.page.id).toBe(second.data.page.id);
    expect(first.data.page.questId).toBe(uiMissionId);
    const rows = await pool.query(`SELECT "id", "quest_id", "slug" FROM "mission_pages" WHERE "quest_id" = $1`, [uiMissionId]);
    expect(rows.rows).toEqual([{ id: first.data.page.id, quest_id: uiMissionId, slug: payload.slug }]);
  });

  it("routes an approved AI Mission and a replayed automation follow-up through the same authority", async () => {
    const [{ db }, schema] = await Promise.all([import("../server/db"), import("../shared/schema")]);
    const [actionRecord] = await db.insert(schema.aiActionRecords).values({
      userId,
      toolName: "create_mission",
      risk: "medium",
      state: "pending_approval",
      inputSummary: { fields: ["category", "description", "title"] },
      planningContextSnapshot: {},
    }).returning();
    const aiTitle = `Approved AI Mission ${stamp}`;
    const [pending] = await db.insert(schema.aiPendingActions).values({
      userId,
      actionRecordId: actionRecord.id,
      toolName: "create_mission",
      payload: { title: aiTitle, description: "Explicitly approved source convergence proof", category: "general" },
      expiresAt: new Date(Date.now() + 60_000),
    }).returning();
    const approved = await request("POST", `/api/ai-actions/${pending.id}/approve`, undefined, cookie);
    const duplicateApproval = await request("POST", `/api/ai-actions/${pending.id}/approve`, undefined, cookie);
    expect(approved.status).toBe(200);
    expect(approved.data.state).toBe("succeeded");
    expect(duplicateApproval.status).toBe(409);
    expect(duplicateApproval.data.state).toBe("unavailable");

    const aiMission = await pool.query(
      `SELECT "id", "planning_decision_source" FROM "quests" WHERE "user_id" = $1 AND "lifecycle_key" = $2`,
      [userId, `ai-action:${actionRecord.id}:create-mission`],
    );
    expect(aiMission.rows).toHaveLength(1);
    expect(aiMission.rows[0].planning_decision_source).toBe("ai");

    const followUpTitle = `Automation follow-up ${stamp}`;
    const definition = {
      version: 1,
      trigger: { type: "manual" },
      conditions: {},
      actions: [{ type: "schedule_follow_up", title: followUpTitle, description: "Replay-safe source convergence proof", category: "general", delayDays: 1 }],
      stopOnError: true,
    };
    const automation = await request("POST", "/api/automations", { name: `Source convergence ${stamp}`, description: "Provider-independent qualification", definition }, cookie);
    expect(automation.status).toBe(201);
    const automationId = automation.data.automation.id;
    expect((await request("PATCH", `/api/automations/${automationId}`, { enabled: true }, cookie)).status).toBe(200);
    const mutationId = crypto.randomUUID();
    const [firstRun, replayedRun] = await Promise.all([
      request("POST", `/api/automations/${automationId}/run`, { questId: uiMissionId, mutationId }, cookie),
      request("POST", `/api/automations/${automationId}/run`, { questId: uiMissionId, mutationId }, cookie),
    ]);
    expect(firstRun.status).toBe(200);
    expect(replayedRun.status).toBe(200);
    expect([firstRun.data.result.duplicate, replayedRun.data.result.duplicate].filter(Boolean)).toHaveLength(1);
    const automationMissions = await pool.query(
      `SELECT "id", "planning_decision_source" FROM "quests" WHERE "user_id" = $1 AND "title" = $2`,
      [userId, followUpTitle],
    );
    expect(automationMissions.rows).toHaveLength(1);
    expect(automationMissions.rows[0].planning_decision_source).toBe("automation");

    const sourceReceipts = await pool.query(
      `SELECT "metadata"->>'source' AS "source", count(*)::int AS "count"
       FROM "user_activity_events"
       WHERE "user_id" = $1 AND "event_type" = 'mission_created'
         AND ("metadata"->>'questId')::int = ANY($2::int[])
       GROUP BY "metadata"->>'source' ORDER BY "source"`,
      [userId, [aiMission.rows[0].id, automationMissions.rows[0].id]],
    );
    expect(sourceReceipts.rows).toEqual([{ source: "ai", count: 1 }, { source: "automation", count: 1 }]);
  });

  it("creates one transaction-bound Thread starter set with explicit system provenance", async () => {
    const profile = await request("PATCH", "/api/profile", { completedOnboardingMissions: [0, 1, 2, 3, 4, 5, 6, 7] }, cookie);
    expect(profile.status).toBe(200);
    const initialized = await request("POST", "/api/transformation-thread/initialize", {}, cookie);
    expect([200, 201]).toContain(initialized.status);
    const threadId = initialized.data.thread.id;
    const activated = await request("POST", `/api/transformation-thread/${threadId}/activate`, undefined, cookie);
    const replayedActivation = await request("POST", `/api/transformation-thread/${threadId}/activate`, undefined, cookie);
    expect(activated.status).toBe(200);
    expect(activated.data.createdMissions).toBeGreaterThan(0);
    expect(replayedActivation.status).toBe(200);
    expect(replayedActivation.data.createdMissions).toBe(0);

    const starters = await pool.query(
      `SELECT "id", "planning_decision_source" FROM "quests" WHERE "user_id" = $1 AND "transformation_thread_id" = $2 ORDER BY "id"`,
      [userId, threadId],
    );
    expect(starters.rows).toHaveLength(activated.data.createdMissions);
    expect(starters.rows.every((row) => row.planning_decision_source === "system")).toBe(true);
    const receipts = await pool.query(
      `SELECT count(*)::int AS "count" FROM "user_activity_events"
       WHERE "user_id" = $1 AND "event_type" = 'mission_created' AND "metadata"->>'source' = 'system'
         AND ("metadata"->>'questId')::int = ANY($2::int[])`,
      [userId, starters.rows.map((row) => row.id)],
    );
    expect(receipts.rows[0].count).toBe(starters.rows.length);
  });

  it("exports the source receipts and erases every locally owned record", async () => {
    const exported = await request("GET", "/api/account/export", undefined, cookie);
    expect(exported.status).toBe(200);
    const sourceMissions = exported.data.data.quests.filter((quest: any) => quest.planning_decision_source === "inbox");
    const sourceReceipts = exported.data.data.user_activity_events.filter((event: any) => event.event_type === "mission_created" && event.metadata?.source === "inbox");
    expect(sourceMissions).toHaveLength(3);
    expect(sourceReceipts).toHaveLength(3);
    expect(exported.data.data.quests.some((quest: any) => quest.planning_decision_source === "ui")).toBe(true);
    expect(exported.data.data.quests.some((quest: any) => quest.planning_decision_source === "onboarding")).toBe(true);
    expect(exported.data.data.quests.some((quest: any) => quest.planning_decision_source === "todo")).toBe(true);
    expect(exported.data.data.quests.some((quest: any) => quest.planning_decision_source === "ai")).toBe(true);
    expect(exported.data.data.quests.some((quest: any) => quest.planning_decision_source === "automation")).toBe(true);
    expect(exported.data.data.quests.some((quest: any) => quest.planning_decision_source === "system")).toBe(true);

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
