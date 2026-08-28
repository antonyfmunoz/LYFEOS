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

describeApi("Thread capability focus authenticated journey", () => {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  let ownerCookie = "";
  let outsiderCookie = "";
  let ownerId = 0;
  let outsiderId = 0;
  let firstThreadId = 0;
  let secondThreadId = 0;
  let capabilityId = 0;
  let firstSkillId = 0;
  let connectedCapabilityId = 0;
  let connectedSkillId = 0;

  afterAll(async () => {
    if (outsiderCookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, outsiderCookie);
    if (ownerCookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, ownerCookie);
    await pool.end();
  });

  it("creates two isolated capability maps from completed onboarding", async () => {
    const owner = await request("POST", "/api/auth/complete-registration", {
      email: `focus_owner_${stamp}@example.com`, password: "TestPass123!", displayName: `focus_owner_${stamp}`, termsAccepted: true,
    });
    const outsider = await request("POST", "/api/auth/complete-registration", {
      email: `focus_outsider_${stamp}@example.com`, password: "TestPass123!", displayName: `focus_outsider_${stamp}`, termsAccepted: true,
    });
    expect(owner.status).toBe(201);
    expect(outsider.status).toBe(201);
    ownerCookie = owner.cookie;
    outsiderCookie = outsider.cookie;
    ownerId = owner.data.user.id;
    outsiderId = outsider.data.user.id;
    for (const [cookie, craft] of [[ownerCookie, "Discovery conversations"], [outsiderCookie, "Illustration"]]) {
      expect((await request("PATCH", "/api/profile", {
        completedOnboardingMissions: [0, 1, 2, 3, 4, 5, 6, 7], primaryCraft: craft, desiredTrait: "Deliberate practice",
      }, cookie)).status).toBe(200);
      expect((await request("POST", "/api/transformation-thread/initialize", {}, cookie)).status).toBe(201);
    }
    const ownerThread = await request("GET", "/api/transformation-thread", undefined, ownerCookie);
    const outsiderThread = await request("GET", "/api/transformation-thread", undefined, outsiderCookie);
    firstThreadId = ownerThread.data.thread.id;
    capabilityId = ownerThread.data.thread.primaryCapabilityId;
    firstSkillId = ownerThread.data.thread.skills.find((skill: any) => skill.key === "primary").id;
    const connectedSkill = ownerThread.data.thread.skills.find((skill: any) => skill.key === "capacity");
    connectedCapabilityId = connectedSkill.capabilityId;
    connectedSkillId = connectedSkill.id;
    expect(capabilityId).toBeGreaterThan(0);
    expect(connectedCapabilityId).toBeGreaterThan(0);
    expect(connectedCapabilityId).not.toBe(capabilityId);
    expect(outsiderThread.data.thread.primaryCapabilityId).not.toBe(capabilityId);
    const denied = await request("POST", "/api/transformation-thread/initialize", { primaryCapabilityId: capabilityId }, outsiderCookie);
    expect(denied.status).toBe(404);
  });

  it("counts a connected Thread skill as a durable capability focus", async () => {
    const capabilities = await request("GET", "/api/capabilities", undefined, ownerCookie);
    const connected = capabilities.data.capabilities.find((item: any) => item.id === connectedCapabilityId);
    expect(connected).toMatchObject({ focusCount: 1, latestFocus: { threadId: firstThreadId, status: "active" } });

    const history = await request("GET", `/api/capabilities/${connectedCapabilityId}/history`, undefined, ownerCookie);
    expect(history.status).toBe(200);
    expect(history.data.focuses).toHaveLength(1);
    expect(history.data.focuses[0]).toMatchObject({ threadId: firstThreadId, skillNodeId: connectedSkillId, threadExperience: 0 });
  });

  it("preserves append-only earning and reversal history on the durable capability", async () => {
    const earned = await pool.query(
      `INSERT INTO "skill_progression_events" ("user_id", "skill_node_id", "transformation_thread_id", "source_type", "progression_revision", "experience_delta", "evidence_summary") VALUES ($1, $2, $3, 'mission_evidence_review', 1, 140, 'Reviewed first-focus practice') RETURNING "id"`,
      [ownerId, firstSkillId, firstThreadId],
    );
    await pool.query(
      `INSERT INTO "skill_progression_events" ("user_id", "skill_node_id", "transformation_thread_id", "source_type", "progression_revision", "reversal_of_id", "experience_delta", "evidence_summary") VALUES ($1, $2, $3, 'mission_evidence_reversal', 2, $4, -20, 'Reopened unsupported portion')`,
      [ownerId, firstSkillId, firstThreadId, earned.rows[0].id],
    );
    await pool.query(`UPDATE "personal_capabilities" SET "experience" = 120, "level" = 2 WHERE "id" = $1 AND "user_id" = $2`, [capabilityId, ownerId]);
    await pool.query(`UPDATE "skill_nodes" SET "experience" = 120, "level" = 2 WHERE "id" = $1 AND "user_id" = $2`, [firstSkillId, ownerId]);
    const history = await request("GET", `/api/capabilities/${capabilityId}/history`, undefined, ownerCookie);
    expect(history.status).toBe(200);
    expect(history.data.capability).toMatchObject({ id: capabilityId, experience: 120, level: 2 });
    expect(history.data.events.map((event: any) => event.experienceDelta)).toEqual([-20, 140]);
    expect(history.data.events[0]).toMatchObject({ sourceType: "mission_evidence_reversal", reversalOfId: earned.rows[0].id });
    expect((await request("GET", `/api/capabilities/${capabilityId}/history`, undefined, outsiderCookie)).status).toBe(404);
  });

  it("converges concurrent next-focus initialization on the same capability", async () => {
    await pool.query(`UPDATE "transformation_threads" SET "status" = 'completed', "completed_at" = now(), "updated_at" = now() WHERE "id" = $1 AND "user_id" = $2`, [firstThreadId, ownerId]);
    const [first, second] = await Promise.all([
      request("POST", "/api/transformation-thread/initialize", { primaryCapabilityId: capabilityId }, ownerCookie),
      request("POST", "/api/transformation-thread/initialize", { primaryCapabilityId: capabilityId }, ownerCookie),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 201]);
    expect(first.data.thread.id).toBe(second.data.thread.id);
    secondThreadId = first.data.thread.id;
    const currentRows = await pool.query(`SELECT "id" FROM "transformation_threads" WHERE "user_id" = $1 AND "status" IN ('draft', 'active', 'paused')`, [ownerId]);
    expect(currentRows.rows).toEqual([{ id: secondThreadId }]);

    const thread = await request("GET", "/api/transformation-thread", undefined, ownerCookie);
    const primary = thread.data.thread.skills.find((skill: any) => skill.key === "primary");
    const graphPrimary = thread.data.thread.skillGraph.nodes.find((skill: any) => skill.key === "primary");
    expect(thread.data.thread).toMatchObject({ id: secondThreadId, primaryCapabilityId: capabilityId, status: "draft" });
    expect(primary).toMatchObject({ capabilityId, experience: 0 });
    expect(graphPrimary).toMatchObject({ experience: 120, level: 2, threadExperience: 0 });
    const linkedNodes = await pool.query(`SELECT "transformation_thread_id", "experience" FROM "skill_nodes" WHERE "user_id" = $1 AND "capability_id" = $2 AND "kind" = 'primary' ORDER BY "transformation_thread_id"`, [ownerId, capabilityId]);
    expect(linkedNodes.rows).toEqual([
      { transformation_thread_id: firstThreadId, experience: 120 },
      { transformation_thread_id: secondThreadId, experience: 0 },
    ]);
  });

  it("shows two distinct focus periods over one durable capability", async () => {
    const capabilities = await request("GET", "/api/capabilities", undefined, ownerCookie);
    const capability = capabilities.data.capabilities.find((item: any) => item.id === capabilityId);
    expect(capability).toMatchObject({ experience: 120, level: 2, focusCount: 2, latestFocus: { threadId: secondThreadId, status: "draft" } });
    const history = await request("GET", `/api/capabilities/${capabilityId}/history`, undefined, ownerCookie);
    expect(history.data.focuses.map((focus: any) => focus.threadId)).toEqual([secondThreadId, firstThreadId]);
    expect(history.data.focuses[0]).toMatchObject({ threadExperience: 0, status: "draft" });
    expect(history.data.focuses[1]).toMatchObject({ threadExperience: 120, status: "completed" });
    expect(history.data.disclosure).toContain("not certification");

    const exported = await request("GET", "/api/account/export", undefined, ownerCookie);
    expect(exported.status).toBe(200);
    expect(exported.data.data.transformation_threads.filter((thread: any) => thread.primary_capability_id === capabilityId)).toHaveLength(2);
    expect(exported.data.data.skill_progression_events.filter((event: any) => event.user_id === ownerId)).toHaveLength(2);
  });

  it("erases both focus-local and durable history without affecting another owner", async () => {
    expect((await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, ownerCookie)).status).toBe(200);
    ownerCookie = "";
    const remaining = await pool.query(
      `SELECT (SELECT count(*)::int FROM "users" WHERE "id" = $1) AS owner, (SELECT count(*)::int FROM "transformation_threads" WHERE "user_id" = $1) AS threads, (SELECT count(*)::int FROM "personal_capabilities" WHERE "user_id" = $1) AS capabilities, (SELECT count(*)::int FROM "skill_progression_events" WHERE "user_id" = $1) AS events, (SELECT count(*)::int FROM "users" WHERE "id" = $2) AS outsider`,
      [ownerId, outsiderId],
    );
    expect(remaining.rows[0]).toEqual({ owner: 0, threads: 0, capabilities: 0, events: 0, outsider: 1 });
  });
});
