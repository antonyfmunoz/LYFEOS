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

describeApi("Project lifecycle recovery", () => {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  let cookie = "";
  let otherCookie = "";
  let userId = 0;
  let projectId = 0;
  let secondProjectId = 0;
  let missionId = 0;

  afterAll(async () => {
    if (otherCookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, otherCookie);
    if (cookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, cookie);
    await pool.end();
  });

  it("atomically converges concurrent links and refuses silent cross-Project moves", async () => {
    const registration = await request("POST", "/api/auth/complete-registration", {
      email: `projects_${stamp}@example.com`, password: "TestPass123!", displayName: `projects_${stamp}`, termsAccepted: true,
    });
    expect(registration.status).toBe(201);
    cookie = registration.cookie;
    userId = registration.data.user.id;

    const project = await request("POST", "/api/projects", { title: "Launch", outcome: "Public release", description: null, startDate: null, dueDate: null }, cookie);
    expect(project.status).toBe(201);
    projectId = project.data.project.id;
    const mission = await request("POST", "/api/quests", { userId, title: "Prepare release", description: "", category: "general", completed: false }, cookie);
    expect(mission.status).toBe(201);
    missionId = mission.data.quest.id;

    const linkBody = { missionId, expectedRevision: 1, expectedMissionRevision: mission.data.quest.revision };
    const [first, duplicate] = await Promise.all([
      request("POST", `/api/projects/${projectId}/missions`, linkBody, cookie),
      request("POST", `/api/projects/${projectId}/missions`, linkBody, cookie),
    ]);
    expect([first.status, duplicate.status]).toEqual([200, 200]);
    expect([first.data.replayed, duplicate.data.replayed].filter(Boolean)).toHaveLength(1);
    const detail = await request("GET", `/api/projects/${projectId}`, undefined, cookie);
    expect(detail.data.project.revision).toBe(2);
    expect(detail.data.missions).toHaveLength(1);
    expect(detail.data.missions[0]).not.toHaveProperty("lifecycleKey");
    expect(detail.data.history.filter((event: any) => event.eventType === "ProjectTaskLinked.v1")).toHaveLength(1);

    const second = await request("POST", "/api/projects", { title: "Second", outcome: "Another outcome", description: null, startDate: null, dueDate: null }, cookie);
    secondProjectId = second.data.project.id;
    const move = await request("POST", `/api/projects/${secondProjectId}/missions`, {
      missionId, expectedRevision: 1, expectedMissionRevision: detail.data.missions[0].revision,
    }, cookie);
    expect(move.status).toBe(409);
    expect(move.data.error).toContain("already belongs");
  });

  it("creates one canonical Mission for exact Project retries and rejects changed identity reuse", async () => {
    const mutationId = crypto.randomUUID();
    const body = { title: "Second Project Mission", description: "", dueDate: null, expectedRevision: 1, mutationId };
    const created = await request("POST", `/api/projects/${secondProjectId}/missions/new`, body, cookie);
    const replayed = await request("POST", `/api/projects/${secondProjectId}/missions/new`, body, cookie);
    const changed = await request("POST", `/api/projects/${secondProjectId}/missions/new`, { ...body, title: "Changed title" }, cookie);
    expect(created.status, JSON.stringify(created.data)).toBe(201);
    expect(replayed.status).toBe(200);
    expect(replayed.data).toMatchObject({ replayed: true, mission: { id: created.data.mission.id } });
    expect(changed.status).toBe(409);
    const missions = await request("GET", "/api/automations/missions", undefined, cookie);
    expect(missions.data.missions.filter((row: any) => row.title === body.title)).toHaveLength(1);
  });

  it("commits a Project edit or its new Mission atomically without leaving an orphan", async () => {
    const project = await request("POST", "/api/projects", { title: "Atomic", outcome: "One aggregate result", description: null, startDate: null, dueDate: null }, cookie);
    expect(project.status).toBe(201);
    const atomicProjectId = project.data.project.id;
    const missionTitle = `Atomic race mission ${stamp}`;
    const [missionResult, editResult] = await Promise.all([
      request("POST", `/api/projects/${atomicProjectId}/missions/new`, {
        title: missionTitle,
        description: "",
        dueDate: null,
        expectedRevision: 1,
        mutationId: crypto.randomUUID(),
      }, cookie),
      request("PATCH", `/api/projects/${atomicProjectId}`, {
        description: "Competing project edit",
        expectedRevision: 1,
      }, cookie),
    ]);
    expect([missionResult.status, editResult.status].filter((status) => status === 409)).toHaveLength(1);
    expect([missionResult.status, editResult.status].filter((status) => status === 200 || status === 201)).toHaveLength(1);

    const detail = await request("GET", `/api/projects/${atomicProjectId}`, undefined, cookie);
    expect(detail.status).toBe(200);
    expect(detail.data.project.revision).toBe(2);
    const linked = detail.data.missions.filter((row: any) => row.title === missionTitle);
    const allMissions = await request("GET", "/api/automations/missions", undefined, cookie);
    const anywhere = allMissions.data.missions.filter((row: any) => row.title === missionTitle);
    if (missionResult.status === 201) {
      expect(linked).toHaveLength(1);
      expect(anywhere).toHaveLength(1);
    } else {
      expect(linked).toHaveLength(0);
      expect(anywhere).toHaveLength(0);
    }
  });

  it("serializes completion against a new open Mission link", async () => {
    const project = await request("POST", "/api/projects", { title: "Race", outcome: "No invalid completed state", description: null, startDate: null, dueDate: null }, cookie);
    const projectId = project.data.project.id;
    const activated = await request("POST", `/api/projects/${projectId}/state`, { state: "active", expectedRevision: 1 }, cookie);
    expect(activated.status).toBe(200);
    const mission = await request("POST", "/api/quests", { userId, title: "Race mission", description: "", category: "general", completed: false }, cookie);
    const [completion, link] = await Promise.all([
      request("POST", `/api/projects/${projectId}/state`, { state: "completed", expectedRevision: 2 }, cookie),
      request("POST", `/api/projects/${projectId}/missions`, { missionId: mission.data.quest.id, expectedRevision: 2, expectedMissionRevision: mission.data.quest.revision }, cookie),
    ]);
    expect([completion.status, link.status].sort()).toEqual([200, 409]);
    const detail = await request("GET", `/api/projects/${projectId}`, undefined, cookie);
    expect(detail.data.project.state === "completed" ? detail.data.missions.length === 0 : detail.data.missions.length === 1).toBe(true);
  });

  it("makes preserved Kanban provenance explicit and records one reconciliation", async () => {
    const inserted = await pool.query<{ id: number }>(`
      INSERT INTO kanban_boards (user_id, title, description, outcome, state, revision, origin, is_default)
      VALUES ($1, 'Preserved board', 'Legacy context', 'Review imported work', 'planned', 1, 'legacy_kanban', false)
      RETURNING id
    `, [userId]);
    const legacyId = inserted.rows[0].id;
    await pool.query(`INSERT INTO project_events (user_id, project_id, event_type, to_state, aggregate_revision, actor_source) VALUES ($1, $2, 'ProjectImportedFromLegacyKanban.v1', 'planned', 1, 'migration')`, [userId, legacyId]);

    const detail = await request("GET", `/api/projects/${legacyId}`, undefined, cookie);
    expect(detail.data.project).toMatchObject({ origin: "legacy_kanban", legacyReconciledAt: null });
    const reconciled = await request("POST", `/api/projects/${legacyId}/reconcile-legacy`, { expectedRevision: 1 }, cookie);
    expect(reconciled.status).toBe(200);
    expect(reconciled.data.project).toMatchObject({ revision: 2, origin: "legacy_kanban" });
    expect(reconciled.data.project.legacyReconciledAt).toBeTruthy();
    const events = await pool.query(`SELECT event_type FROM project_events WHERE project_id = $1 AND event_type = 'LegacyProjectReconciled.v1'`, [legacyId]);
    expect(events.rowCount).toBe(1);
  });

  it("requires archive, exact title, and no links before recoverable removal", async () => {
    let detail = await request("GET", `/api/projects/${projectId}`, undefined, cookie);
    const mission = detail.data.missions[0];
    const unlinked = await request("DELETE", `/api/projects/${projectId}/missions/${mission.id}`, {
      missionId: mission.id, expectedRevision: detail.data.project.revision, expectedMissionRevision: mission.revision,
    }, cookie);
    expect(unlinked.status).toBe(200);
    const archived = await request("POST", `/api/projects/${projectId}/state`, { state: "archived", expectedRevision: unlinked.data.project.revision }, cookie);
    expect(archived.status).toBe(200);
    expect((await request("POST", `/api/projects/${projectId}/remove`, { expectedRevision: archived.data.project.revision, confirmationTitle: "Wrong" }, cookie)).status).toBe(409);
    const removed = await request("POST", `/api/projects/${projectId}/remove`, { expectedRevision: archived.data.project.revision, confirmationTitle: "Launch" }, cookie);
    expect(removed.status).toBe(200);
    expect((await request("GET", `/api/projects/${projectId}`, undefined, cookie)).status).toBe(404);
    const listed = await request("GET", "/api/projects", undefined, cookie);
    expect(listed.data.removedProjects.map((row: any) => row.id)).toContain(projectId);
    const restored = await request("POST", `/api/projects/${projectId}/restore`, { expectedRevision: removed.data.project.revision }, cookie);
    expect(restored.status).toBe(200);
    expect(restored.data.project).toMatchObject({ state: "archived", deletedAt: null });
    detail = await request("GET", `/api/projects/${projectId}`, undefined, cookie);
    expect(detail.data.history.map((event: any) => event.eventType)).toEqual(expect.arrayContaining(["ProjectRemoved.v1", "ProjectRestored.v1"]));
  });

  it("keeps Project records and repair routes owner-scoped and account-portable", async () => {
    const registration = await request("POST", "/api/auth/complete-registration", {
      email: `projects_other_${stamp}@example.com`, password: "TestPass123!", displayName: `projects_other_${stamp}`, termsAccepted: true,
    });
    expect(registration.status).toBe(201);
    otherCookie = registration.cookie;
    expect((await request("GET", `/api/projects/${projectId}`, undefined, otherCookie)).status).toBe(404);
    expect((await request("POST", `/api/projects/${projectId}/restore`, { expectedRevision: 1 }, otherCookie)).status).toBe(404);
    const exported = await request("GET", "/api/account/export", undefined, cookie);
    expect(exported.status).toBe(200);
    expect(exported.data.data.project_events.length).toBeGreaterThanOrEqual(1);
    expect(exported.data.data.kanban_boards.every((row: any) => row.user_id === userId)).toBe(true);
  });
});
