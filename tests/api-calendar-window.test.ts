import { afterAll, describe, expect, it } from "vitest";

const BASE_URL = process.env.LYFEOS_TEST_API_URL;
const describeApi = BASE_URL && process.env.LYFEOS_TEST_ENV === "isolated" ? describe : describe.skip;

async function request(method: string, path: string, body?: unknown, cookie = "") {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-Proto": "https",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    data: await response.json().catch(() => ({})) as any,
    cookie: (response.headers.get("set-cookie") || "").split(";", 1)[0],
    cacheControl: response.headers.get("cache-control"),
  };
}

describeApi("bounded canonical mission Calendar window", () => {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  let ownerCookie = "";
  let otherCookie = "";
  let ownerId = 0;
  let otherId = 0;

  afterAll(async () => {
    if (ownerCookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, ownerCookie);
    if (otherCookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, otherCookie);
  });

  it("requires authentication and refuses a different account", async () => {
    const owner = await request("POST", "/api/auth/complete-registration", {
      email: `calendar_owner_${stamp}@example.com`, password: "TestPass123!", displayName: `calendar_owner_${stamp}`, termsAccepted: true,
    });
    const other = await request("POST", "/api/auth/complete-registration", {
      email: `calendar_other_${stamp}@example.com`, password: "TestPass123!", displayName: `calendar_other_${stamp}`, termsAccepted: true,
    });
    expect([owner.status, other.status]).toEqual([201, 201]);
    ownerCookie = owner.cookie;
    otherCookie = other.cookie;
    ownerId = owner.data.user.id;
    otherId = other.data.user.id;

    expect((await request("GET", `/api/users/${ownerId}/calendar-missions?from=2026-08-01&to=2026-08-31`)).status).toBe(401);
    expect((await request("GET", `/api/users/${ownerId}/calendar-missions?from=2026-08-01&to=2026-08-31`, undefined, otherCookie)).status).toBe(403);
  });

  it("returns only scheduled, non-deleted owner missions in stable cursor order", async () => {
    const create = (userId: number, cookie: string, title: string, startDate?: string) => request("POST", "/api/quests", {
      userId, title, description: "Calendar qualification", category: "general", completed: false, ...(startDate ? { startDate } : {}),
    }, cookie);
    const created = [];
    created.push(await create(ownerId, ownerCookie, "Window one", "2026-08-02"));
    created.push(await create(ownerId, ownerCookie, "Window two", "2026-08-02"));
    created.push(await create(ownerId, ownerCookie, "Window three", "2026-08-18"));
    const deleted = await create(ownerId, ownerCookie, "Archived in window", "2026-08-12");
    await create(ownerId, ownerCookie, "Outside window", "2026-09-01");
    await create(ownerId, ownerCookie, "Unscheduled");
    await create(otherId, otherCookie, "Other owner's mission", "2026-08-04");
    expect(created.map((result) => result.status)).toEqual([201, 201, 201]);
    expect(deleted.status).toBe(201);
    expect((await request("DELETE", `/api/quests/${deleted.data.quest.id}`, undefined, ownerCookie)).status).toBe(200);

    const first = await request("GET", `/api/users/${ownerId}/calendar-missions?from=2026-08-01&to=2026-08-31&limit=2&tz=UTC`, undefined, ownerCookie);
    expect(first.status).toBe(200);
    expect(first.cacheControl).toContain("private");
    expect(first.cacheControl).toContain("no-store");
    expect(first.data.range).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(first.data.quests.map((quest: any) => quest.title)).toEqual(["Window one", "Window two"]);
    expect(first.data.nextCursor).toEqual(expect.any(String));

    const second = await request("GET", `/api/users/${ownerId}/calendar-missions?from=2026-08-01&to=2026-08-31&limit=2&tz=UTC&cursor=${encodeURIComponent(first.data.nextCursor)}`, undefined, ownerCookie);
    expect(second.status).toBe(200);
    expect(second.data.quests.map((quest: any) => quest.title)).toEqual(["Window three"]);
    expect(second.data.nextCursor).toBeNull();
  });

  it("rejects invalid ranges and cursors", async () => {
    const tooLong = await request("GET", `/api/users/${ownerId}/calendar-missions?from=2026-01-01&to=2027-01-07`, undefined, ownerCookie);
    const reversed = await request("GET", `/api/users/${ownerId}/calendar-missions?from=2026-08-31&to=2026-08-01`, undefined, ownerCookie);
    const malformed = await request("GET", `/api/users/${ownerId}/calendar-missions?from=2026-08-01&to=2026-08-31&cursor=not-a-cursor`, undefined, ownerCookie);
    const outsideCursor = Buffer.from(JSON.stringify({ startDate: "2026-09-01", id: 1 }), "utf8").toString("base64url");
    const outside = await request("GET", `/api/users/${ownerId}/calendar-missions?from=2026-08-01&to=2026-08-31&cursor=${encodeURIComponent(outsideCursor)}`, undefined, ownerCookie);
    expect([tooLong.status, reversed.status, malformed.status, outside.status]).toEqual([400, 400, 400, 400]);
  });
});
