import { afterAll, describe, expect, it } from "vitest";

const BASE_URL = process.env.LYFEOS_TEST_API_URL;
const describeApi = BASE_URL && process.env.LYFEOS_TEST_ENV === "isolated" ? describe : describe.skip;

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
    cacheControl: response.headers.get("cache-control"),
  };
}

describeApi("unified gamification authenticated journey", () => {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const account = { email: `gamification_${stamp}@example.com`, password: "TestPass123!", displayName: `player_${stamp}` };
  let cookie = "";
  let userId = 0;
  let questId = 0;

  afterAll(async () => {
    if (cookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, cookie);
  });

  it("starts with explicit, separate zero-state tracks", async () => {
    const registration = await request("POST", "/api/auth/complete-registration", { ...account, termsAccepted: true });
    expect(registration.status).toBe(201);
    cookie = registration.cookie;
    userId = registration.data.user.id;
    const result = await request("GET", "/api/progression", undefined, cookie);
    expect(result.status).toBe(200);
    expect(result.cacheControl).toContain("private");
    expect(result.cacheControl).toContain("no-store");
    expect(result.data.progression.version).toBe("lyfeos-gamification.v1");
    expect(result.data.progression.tracks.activity.totalExperience).toBe(0);
    expect(result.data.progression.tracks.capability.totalVerifiedExperience).toBe(0);
    expect(result.data.progression.tracks.authority).toMatchObject({ certifications: [], entrustedRoles: [] });
  });

  it("awards exact difficulty-adjusted activity XP and a supported badge", async () => {
    const created = await request("POST", "/api/quests", {
      userId,
      title: "Ship one verified player-progress slice",
      description: "Complete and inspect the bounded outcome.",
      category: "learning",
      difficulty: "S",
      experienceReward: 200,
      completed: false,
    }, cookie);
    expect(created.status).toBe(201);
    questId = created.data.quest.id;

    const completed = await request("POST", `/api/quests/${questId}/toggle`, undefined, cookie);
    expect(completed.status).toBe(200);
    expect(completed.data.xpAwarded).toBe(1000);
    expect(completed.data.progression.transition.activityExperienceDelta).toBe(1000);
    expect(completed.data.progression.newlyAwardedBadges).toEqual(expect.arrayContaining([expect.objectContaining({ key: "first-real-action" })]));

    const result = await request("GET", "/api/progression", undefined, cookie);
    expect(result.data.progression.tracks.activity).toMatchObject({ totalExperience: 1000, level: 2 });
    expect(result.data.progression.tracks.consistency).toMatchObject({ current: 1, activeDays: 1 });
    expect(result.data.progression.tracks.capability.totalVerifiedExperience).toBe(0);
    expect(result.data.progression.tracks.authority.certifications).toEqual([]);
    expect(result.data.progression.badges).toEqual(expect.arrayContaining([expect.objectContaining({ key: "first-real-action" })]));
    expect(result.data.progression.tracks.activity.recentEvents[0]).toMatchObject({ action: "earned", experienceDelta: 1000 });
  });

  it("rejects client-forged XP, levels, streaks, and efficiency", async () => {
    const forged = await request("PATCH", `/api/users/${userId}/stats`, {
      experience: { current: 999999, max: 1, level: 100, totalXP: 999999 },
      streakDays: 365,
      efficiencyScore: 100,
    }, cookie);
    expect(forged.status).toBe(200);
    const stats = await request("GET", `/api/users/${userId}/stats`, undefined, cookie);
    expect(stats.status).toBe(200);
    expect(stats.data.stats.experience.totalXP).toBe(1000);
    expect(stats.data.stats.experience.level).toBe(2);
    expect(stats.data.stats.streakDays).toBe(1);
    expect(stats.data.stats.efficiencyScore).not.toBe(100);
  });

  it("reverses unsupported XP and badges, then re-earns them exactly once", async () => {
    const reopened = await request("POST", `/api/quests/${questId}/toggle`, undefined, cookie);
    expect(reopened.status).toBe(200);
    expect(reopened.data.progression.transition.activityExperienceDelta).toBe(-1000);
    expect(reopened.data.progression.reversedBadges).toEqual(expect.arrayContaining([expect.objectContaining({ key: "first-real-action" })]));
    let result = await request("GET", "/api/progression", undefined, cookie);
    expect(result.data.progression.tracks.activity.totalExperience).toBe(0);
    expect(result.data.progression.tracks.consistency.current).toBe(0);
    expect(result.data.progression.badges.find((badge: any) => badge.key === "first-real-action")).toBeUndefined();

    const recompleted = await request("POST", `/api/quests/${questId}/toggle`, undefined, cookie);
    expect(recompleted.status).toBe(200);
    expect(recompleted.data.progression.transition.activityExperienceDelta).toBe(1000);
    expect(recompleted.data.progression.newlyAwardedBadges).toEqual(expect.arrayContaining([expect.objectContaining({ key: "first-real-action" })]));
    result = await request("GET", "/api/progression", undefined, cookie);
    expect(result.data.progression.tracks.activity.totalExperience).toBe(1000);
    expect(result.data.progression.recentBadgeEvents.slice(0, 3).map((event: any) => event.action)).toEqual(["awarded", "reversed", "awarded"]);
    expect(result.data.progression.tracks.activity.recentEvents.slice(0, 3).map((event: any) => event.experienceDelta)).toEqual([1000, -1000, 1000]);
  });
});
