import { afterAll, describe, expect, it } from "vitest";

const BASE_URL = process.env.LYFEOS_TEST_API_URL;
const describeApi = BASE_URL && process.env.LYFEOS_TEST_ENV === "isolated" ? describe : describe.skip;

async function request(method: string, path: string, body?: unknown, cookie = "", headers: Record<string, string> = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https", ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    data: await response.json().catch(() => ({})) as any,
    cookie: (response.headers.get("set-cookie") || "").split(";", 1)[0],
  };
}

describeApi("Calendar offline mutation convergence", () => {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  let cookie = "";
  let userId = 0;

  afterAll(async () => {
    if (cookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, cookie);
  });

  it("replays exact creates and rejects changed-payload mutation reuse", async () => {
    const registration = await request("POST", "/api/auth/complete-registration", {
      email: `calendar_offline_${stamp}@example.com`, password: "TestPass123!", displayName: `calendar_offline_${stamp}`, termsAccepted: true,
    });
    expect(registration.status).toBe(201);
    cookie = registration.cookie;
    userId = registration.data.user.id;

    const payload = { userId, title: "Offline convergence", description: "Versioned Calendar mission", category: "general", completed: false, startDate: "2026-08-25" };
    const mutationId = `calendar-create-${stamp}`;
    const created = await request("POST", "/api/quests", payload, cookie, { "x-lyfeos-mutation-id": mutationId });
    const replayed = await request("POST", "/api/quests", payload, cookie, { "x-lyfeos-mutation-id": mutationId });
    const changed = await request("POST", "/api/quests", { ...payload, title: "Different mission" }, cookie, { "x-lyfeos-mutation-id": mutationId });
    expect(created.status).toBe(201);
    expect(created.data.quest.revision).toBe(1);
    expect(replayed.status).toBe(200);
    expect(replayed.data).toMatchObject({ replayed: true, quest: { id: created.data.quest.id } });
    expect(changed.status).toBe(409);
  });

  it("accepts one expected version, replays it exactly, and exposes stale conflicts", async () => {
    const listed = await request("GET", `/api/users/${userId}/calendar-missions?from=2026-08-25&to=2026-08-25&tz=UTC`, undefined, cookie);
    const quest = listed.data.quests.find((item: any) => item.title === "Offline convergence");
    expect(quest.revision).toBe(1);
    const mutationId = `calendar-update-${stamp}`;
    const body = { title: "Offline convergence saved", startTime: "09:30", location: "Studio" };
    const saved = await request("PATCH", `/api/quests/${quest.id}`, body, cookie, { "x-lyfeos-mutation-id": mutationId, "x-lyfeos-expected-revision": "1" });
    const replayed = await request("PATCH", `/api/quests/${quest.id}`, body, cookie, { "x-lyfeos-mutation-id": mutationId, "x-lyfeos-expected-revision": "1" });
    const stale = await request("PATCH", `/api/quests/${quest.id}`, { startTime: "10:00" }, cookie, { "x-lyfeos-mutation-id": `calendar-stale-${stamp}`, "x-lyfeos-expected-revision": "1" });
    expect(saved.status).toBe(200);
    expect(saved.data.quest).toMatchObject({ revision: 2, startTime: "09:30", location: "Studio" });
    expect(replayed.status).toBe(200);
    expect(replayed.data.replayed).toBe(true);
    expect(stale.status).toBe(409);
    expect(stale.data.currentQuest).toMatchObject({ id: quest.id, revision: 2, title: "Offline convergence saved" });

    const applied = await request("PATCH", `/api/quests/${quest.id}`, { startTime: "10:00" }, cookie, { "x-lyfeos-mutation-id": `calendar-reapply-${stamp}`, "x-lyfeos-expected-revision": "2" });
    expect(applied.status).toBe(200);
    expect(applied.data.quest).toMatchObject({ revision: 3, startTime: "10:00" });
    const delayedOldConfirmation = await request("PATCH", `/api/quests/${quest.id}`, body, cookie, { "x-lyfeos-mutation-id": mutationId, "x-lyfeos-expected-revision": "1" });
    expect(delayedOldConfirmation.status).toBe(409);
    expect(delayedOldConfirmation.data.currentQuest).toMatchObject({ id: quest.id, revision: 3, startTime: "10:00" });
  });

  it("exports the owner's mutation receipts", async () => {
    const exported = await request("GET", "/api/account/export", undefined, cookie);
    expect(exported.status).toBe(200);
    expect(exported.data.data.mission_mutation_receipts.length).toBeGreaterThanOrEqual(3);
    expect(exported.data.data.mission_mutation_receipts.every((receipt: any) => receipt.user_id === userId)).toBe(true);
  });
});
