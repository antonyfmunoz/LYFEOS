import { afterAll, describe, expect, it } from "vitest";

const BASE_URL = process.env.LYFEOS_TEST_API_URL;
const describeApi = BASE_URL && process.env.LYFEOS_TEST_ENV === "isolated" ? describe : describe.skip;

async function request(method: string, path: string, body?: unknown, cookie?: string) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    data: await response.json().catch(() => ({})) as any,
    cookie: response.headers.get("set-cookie") || "",
  };
}

describeApi("Health planning consent lifecycle API", () => {
  const stamp = Date.now();
  const user = { email: `health_planning_${stamp}@example.com`, password: "TestPass123!", displayName: `healthplanner_${stamp}` };
  let cookie = "";
  let draftId = 0;

  afterAll(async () => {
    const login = await request("POST", "/api/auth/login", { identifier: user.displayName, password: user.password });
    if (login.status === 200 && login.cookie) {
      await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, login.cookie);
    }
  });

  it("creates an expiring title-only private handoff", async () => {
    const registration = await request("POST", "/api/auth/complete-registration", { ...user, termsAccepted: true });
    expect(registration.status).toBe(201);
    cookie = registration.cookie;
    const created = await request("POST", "/api/health-insights/planning-drafts", {
      title: "Review my recorded hydration and recovery pattern", category: "personal",
      left: "hydration_ml", right: "recovery_minutes", days: 30, confirmed: true,
    }, cookie);
    expect(created.status).toBe(201);
    draftId = created.data.draft.id;
    const lifetimeMs = new Date(created.data.draft.expiresAt).getTime() - Date.now();
    expect(lifetimeMs).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
    expect(lifetimeMs).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000);
  });

  it("confirms and then explicitly revokes the narrow handoff", async () => {
    const confirmed = await request("POST", `/api/health-insights/planning-drafts/${draftId}/confirm`, undefined, cookie);
    expect(confirmed.status).toBe(201);
    expect(confirmed.data.quest.id).toBeTruthy();
    const revoked = await request("POST", `/api/health-insights/planning-drafts/${draftId}/revoke`, undefined, cookie);
    expect(revoked.status).toBe(200);
    expect(revoked.data.state).toBe("revoked");
    expect(revoked.data.disclosure).toContain("generic mission remains independently user-owned");
  });

  it("returns scope, expiry, and decision receipts without evidence selectors", async () => {
    const history = await request("GET", "/api/health-insights/planning-drafts", undefined, cookie);
    expect(history.status).toBe(200);
    expect(history.data.drafts.find((draft: any) => draft.id === draftId)?.state).toBe("revoked");
    const events = history.data.events.filter((event: any) => event.draftId === draftId);
    expect(events.map((event: any) => event.action)).toEqual(expect.arrayContaining(["created", "confirmed", "revoked"]));
    expect(events.every((event: any) => event.scopeSnapshot === "mission_title_only" && event.expiresAtSnapshot)).toBe(true);
    expect(JSON.stringify(events)).not.toContain("evidenceSeries");
  });

  it("serializes simultaneous confirmations into one mission and safe replays", async () => {
    const created = await request("POST", "/api/health-insights/planning-drafts", {
      title: "Review another private hydration and recovery window", category: "personal",
      left: "hydration_ml", right: "recovery_minutes", days: 30, confirmed: true,
    }, cookie);
    expect(created.status).toBe(201);
    const id = created.data.draft.id;
    const confirmations = await Promise.all([
      request("POST", `/api/health-insights/planning-drafts/${id}/confirm`, undefined, cookie),
      request("POST", `/api/health-insights/planning-drafts/${id}/confirm`, undefined, cookie),
    ]);
    expect(confirmations.map((result) => result.status).sort()).toEqual([200, 201]);
    expect(new Set(confirmations.map((result) => result.data.quest.id)).size).toBe(1);
    expect(confirmations.filter((result) => result.data.replayed === true)).toHaveLength(1);
  });

  it("allows only one simultaneous confirm-or-reject decision to win", async () => {
    const created = await request("POST", "/api/health-insights/planning-drafts", {
      title: "Choose one outcome for this private review draft", category: "personal",
      left: "hydration_ml", right: "recovery_minutes", days: 30, confirmed: true,
    }, cookie);
    expect(created.status).toBe(201);
    const id = created.data.draft.id;
    const decisions = await Promise.all([
      request("POST", `/api/health-insights/planning-drafts/${id}/confirm`, undefined, cookie),
      request("POST", `/api/health-insights/planning-drafts/${id}/reject`, undefined, cookie),
    ]);
    expect(decisions.filter((result) => result.status === 409)).toHaveLength(1);
    expect(decisions.filter((result) => [200, 201].includes(result.status))).toHaveLength(1);
    const history = await request("GET", "/api/health-insights/planning-drafts", undefined, cookie);
    expect(["succeeded", "rejected"]).toContain(history.data.drafts.find((draft: any) => draft.id === id)?.state);
  });
});
