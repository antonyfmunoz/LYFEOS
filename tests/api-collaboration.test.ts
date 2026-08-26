import pg from "pg";
import { request as httpRequest } from "node:http";
import { afterAll, describe, expect, it } from "vitest";

const BASE_URL = process.env.LYFEOS_TEST_API_URL;
const DATABASE_URL = process.env.DATABASE_URL;
const describeApi = BASE_URL && DATABASE_URL && process.env.LYFEOS_TEST_ENV === "isolated" ? describe : describe.skip;
async function request(method: string, path: string, body?: unknown, cookie = "") {
  return new Promise<any>((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body); const target = new URL(`${BASE_URL}${path}`);
    const req = httpRequest({ hostname: target.hostname, port: target.port, path: `${target.pathname}${target.search}`, method, headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https", Host: "lyfeos.net", ...(cookie ? { Cookie: cookie } : {}), ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}) } }, (response) => { const chunks: Buffer[] = []; response.on("data", (chunk) => chunks.push(Buffer.from(chunk))); response.on("end", () => { const text = Buffer.concat(chunks).toString("utf8"); let data: any = {}; try { data = JSON.parse(text); } catch {} const setCookie = Array.isArray(response.headers["set-cookie"]) ? response.headers["set-cookie"][0] : response.headers["set-cookie"] || ""; resolve({ status: response.statusCode || 0, data, cookie: setCookie.split(";", 1)[0], cache: response.headers["cache-control"] || "" }); }); });
    req.on("error", reject); if (payload) req.write(payload); req.end();
  });
}

describeApi("consent-bound team and coach collaboration", () => {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; const pool = new pg.Pool({ connectionString: DATABASE_URL });
  let ownerCookie = ""; let coachCookie = ""; let strangerCookie = ""; let ownerId = 0; let coachId = 0; let missionId = 0; let workspaceId = ""; let membershipId = 0; let grantId = "";
  afterAll(async () => { for (const cookie of [ownerCookie, coachCookie, strangerCookie]) if (cookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, cookie); await pool.end(); });

  it("creates isolated accounts, a workspace, and a membership-only invitation", async () => {
    const register = async (label: string) => request("POST", "/api/auth/complete-registration", { email: `${label}_${stamp}@example.com`, password: "TestPass123!", displayName: `${label}_${stamp}`, termsAccepted: true });
    const owner = await register("collab_owner"); const coach = await register("collab_coach"); const stranger = await register("collab_stranger");
    expect([owner.status, coach.status, stranger.status]).toEqual([201, 201, 201]); ownerCookie = owner.cookie; coachCookie = coach.cookie; strangerCookie = stranger.cookie; ownerId = owner.data.user.id; coachId = coach.data.user.id;
    const mission = await pool.query(`INSERT INTO quests (user_id,title,description,completed,due_date,mission_status) VALUES ($1,$2,$3,false,'2026-09-30','confirmed') RETURNING id`, [ownerId, "Shared mission title", "PRIVATE DESCRIPTION MUST NOT LEAVE OWNER"]); missionId = mission.rows[0].id;
    expect((await request("GET", "/api/collaboration")).status).toBe(401);
    const workspace = await request("POST", "/api/collaboration/workspaces", { name: "Accountability circle", purpose: "Review bounded progress together" }, ownerCookie);
    expect(workspace.status).toBe(201); workspaceId = workspace.data.workspace.id;
    const invitation = await request("POST", `/api/collaboration/workspaces/${workspaceId}/invitations`, { userId: coachId, role: "coach", purpose: "Review this month's selected commitments" }, ownerCookie);
    expect(invitation.status).toBe(201); membershipId = invitation.data.membership.id; expect(invitation.data.disclosure).toContain("does not expose personal records");
    const coachState = await request("GET", "/api/collaboration", undefined, coachCookie);
    expect(coachState.status).toBe(200); expect(coachState.cache).toContain("private"); expect(coachState.data.authorityBoundary).toBe("membership_grants_no_personal_record_access"); expect(coachState.data.workspaces[0].myMembership.status).toBe("invited");
    expect((await request("GET", "/api/collaboration/shared-with-me", undefined, coachCookie)).data.items).toEqual([]);
  });

  it("requires acceptance and owner-controlled, expiring subject consent", async () => {
    expect((await request("POST", `/api/collaboration/workspaces/${workspaceId}/grants`, { granteeUserId: coachId, subjectType: "mission", subjectId: missionId, scopes: ["summary", "status"], purpose: "Weekly accountability", expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() }, ownerCookie)).status).toBe(400);
    const accepted = await request("POST", `/api/collaboration/memberships/${membershipId}/decision`, { decision: "accept" }, coachCookie); expect(accepted.status).toBe(200); expect(accepted.data.authorityBoundary).toContain("no_personal_record_access");
    const forged = await request("POST", `/api/collaboration/workspaces/${workspaceId}/grants`, { granteeUserId: ownerId, subjectType: "mission", subjectId: missionId, scopes: ["summary"], purpose: "Forged", expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() }, coachCookie); expect(forged.status).toBe(404);
    const created = await request("POST", `/api/collaboration/workspaces/${workspaceId}/grants`, { granteeUserId: coachId, subjectType: "mission", subjectId: missionId, scopes: ["summary", "status"], purpose: "Weekly accountability", expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() }, ownerCookie);
    expect(created.status).toBe(201); grantId = created.data.grant.id; expect(created.data.disclosure).toContain("Source records");
    expect((await request("POST", `/api/collaboration/workspaces/${workspaceId}/grants`, { granteeUserId: coachId, subjectType: "mission", subjectId: missionId, scopes: ["summary"], purpose: "Duplicate", expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() }, ownerCookie)).status).toBe(409);
  });

  it("returns a minimal projection, isolates outsiders, and supports immediate revocation", async () => {
    const received = await request("GET", "/api/collaboration/shared-with-me", undefined, coachCookie); expect(received.status).toBe(200); expect(received.data.items).toHaveLength(1);
    expect(received.data.items[0].projection).toMatchObject({ id: missionId, title: "Shared mission title", completed: false, dueDate: "2026-09-30", missionStatus: "confirmed" });
    expect(JSON.stringify(received.data)).not.toContain("PRIVATE DESCRIPTION"); expect(received.data.items[0]).not.toHaveProperty("source");
    expect((await request("GET", "/api/collaboration/shared-with-me", undefined, strangerCookie)).data.items).toEqual([]);
    const exported = await request("GET", "/api/account/export", undefined, ownerCookie); expect(exported.status).toBe(200); expect(exported.data.dataRights.version).toBe("lyfeos.data-rights.v3"); expect(exported.data.data.collaboration_visibility_grants.some((row: any) => row.id === grantId)).toBe(true);
    expect((await request("DELETE", `/api/collaboration/grants/${grantId}`, undefined, strangerCookie)).status).toBe(404);
    expect((await request("DELETE", `/api/collaboration/grants/${grantId}`, undefined, ownerCookie)).status).toBe(200);
    expect((await request("GET", "/api/collaboration/shared-with-me", undefined, coachCookie)).data.items).toEqual([]);
  });

  it("revokes every active grant when membership ends and erases account-scoped rows", async () => {
    const renewed = await request("POST", `/api/collaboration/workspaces/${workspaceId}/grants`, { granteeUserId: coachId, subjectType: "mission", subjectId: missionId, scopes: ["status"], purpose: "Status only", expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() }, ownerCookie); expect(renewed.status).toBe(201);
    const second = await pool.query(`INSERT INTO quests (user_id,title,description) VALUES ($1,'Concurrent mission','PRIVATE CONCURRENT DESCRIPTION') RETURNING id`, [ownerId]);
    const [racedGrant, revoked] = await Promise.all([
      request("POST", `/api/collaboration/workspaces/${workspaceId}/grants`, { granteeUserId: coachId, subjectType: "mission", subjectId: second.rows[0].id, scopes: ["status"], purpose: "Concurrent status", expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() }, ownerCookie),
      request("DELETE", `/api/collaboration/memberships/${membershipId}`, undefined, ownerCookie),
    ]);
    expect([201, 400]).toContain(racedGrant.status); expect(revoked.status).toBe(200); expect(revoked.data.grantsRevoked).toBe(true);
    expect((await request("GET", "/api/collaboration/shared-with-me", undefined, coachCookie)).data.items).toEqual([]);
    const activeAfterRace = await pool.query(`SELECT count(*)::int AS count FROM collaboration_visibility_grants WHERE workspace_id=$1 AND grantee_user_id=$2 AND status='active'`, [workspaceId, coachId]); expect(activeAfterRace.rows[0].count).toBe(0);
    expect((await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, ownerCookie)).status).toBe(200); ownerCookie = "";
    const residue = await pool.query(`SELECT (SELECT count(*) FROM collaboration_workspaces WHERE owner_user_id=$1)::int AS workspaces, (SELECT count(*) FROM collaboration_visibility_grants WHERE owner_user_id=$1)::int AS grants`, [ownerId]); expect(residue.rows[0]).toEqual({ workspaces: 0, grants: 0 });
  });
});
