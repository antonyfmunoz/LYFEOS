import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

type ApiResult = { status: number; body: any; cookie: string };

const BASE_URL = new URL(process.env.LYFEOS_ACCEPTANCE_BASE_URL || "https://lyfeos.net");
const SESSION_FILE = process.env.LYFEOS_ACCEPTANCE_SESSION_FILE || "";
const COMPLETE_ONBOARDING_LEDGER = process.env.LYFEOS_ACCEPTANCE_COMPLETE_ONBOARDING_LEDGER === "true";
const PASSWORD = "TestPass123!";

const ONBOARDING_MISSIONS = [
  { id: 0, title: "Access & Quickstart", xp: 100 },
  { id: 1, title: "Archetype Calibration", xp: 150 },
  { id: 2, title: "Identity & Direction", xp: 75 },
  { id: 3, title: "Craft & Mastery", xp: 60 },
  { id: 4, title: "Capacity & Constraints", xp: 55 },
  { id: 5, title: "Baselines & States", xp: 70 },
  { id: 6, title: "History & Roots", xp: 50 },
  { id: 7, title: "Systems & Rituals", xp: 65 },
] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function request(method: string, pathname: string, body?: unknown, cookie = ""): Promise<ApiResult> {
  const response = await fetch(new URL(pathname, BASE_URL), {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => ({})), cookie: (response.headers.get("set-cookie") || "").split(";", 1)[0] };
}

async function main(): Promise<void> {
  assert(BASE_URL.origin === "https://lyfeos.net", "Disposable browser acceptance setup may target only https://lyfeos.net.");
  assert(SESSION_FILE, "LYFEOS_ACCEPTANCE_SESSION_FILE is required for disposable browser acceptance setup.");
  const stamp = randomUUID().replace(/-/g, "");
  const email = `browser_acceptance_${stamp}@example.com`;
  const displayName = `browseracceptance_${stamp.slice(0, 16)}`;
  const registered = await request("POST", "/api/auth/complete-registration", { email, password: PASSWORD, displayName, termsAccepted: true });
  assert(registered.status === 201 && registered.cookie, `Disposable browser registration returned ${registered.status}.`);
  const onboarding = await request("PATCH", "/api/profile", { onboardingCompleted: true }, registered.cookie);
  assert(onboarding.status === 200, `Disposable browser onboarding setup returned ${onboarding.status}.`);
  if (COMPLETE_ONBOARDING_LEDGER) {
    try {
      const session = await request("GET", "/api/auth/me", undefined, registered.cookie);
      const userId = Number(session.body?.user?.id);
      assert(session.status === 200 && Number.isInteger(userId), "Disposable browser onboarding ledger setup could not resolve its owned account.");
      const now = new Date();
      const date = now.toISOString().slice(0, 10);
      const time = now.toTimeString().slice(0, 5);
      for (const mission of ONBOARDING_MISSIONS) {
        const created = await request("POST", "/api/quests", {
          userId,
          title: `Onboarding: ${mission.title}`,
          description: `Completed onboarding mission \"${mission.title}\"`,
          category: "onboarding",
          completed: false,
          experienceReward: mission.xp,
          startDate: date,
          startTime: time,
          dueDate: date,
          endDate: date,
          endTime: time,
        }, registered.cookie);
        const questId = Number(created.body?.quest?.id);
        assert(created.status === 201 && Number.isInteger(questId), `Disposable onboarding Mission ${mission.id} creation returned ${created.status}.`);
        const completed = await request("POST", `/api/quests/${questId}/toggle`, undefined, registered.cookie);
        assert(completed.status === 200 && completed.body?.quest?.completed === true, `Disposable onboarding Mission ${mission.id} completion returned ${completed.status}.`);
      }
      const completedMissionIds = ONBOARDING_MISSIONS.map((mission) => mission.id);
      const profile = await request("PATCH", "/api/profile", { completedOnboardingMissions: completedMissionIds }, registered.cookie);
      const completedIds = profile.body?.completedOnboardingMissions;
      assert(profile.status === 200 && Array.isArray(completedIds) && ONBOARDING_MISSIONS.every((mission) => completedIds.includes(mission.id)), "Disposable browser onboarding ledger setup did not persist every required onboarding Mission.");
    } catch (error) {
      await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, registered.cookie).catch(() => undefined);
      throw error;
    }
  }
  await fs.mkdir(path.dirname(SESSION_FILE), { recursive: true });
  await fs.writeFile(SESSION_FILE, `${JSON.stringify({ email, displayName, cookie: registered.cookie })}\n`, "utf8");
  console.log(JSON.stringify({ contract: "lyfeos.production-browser-disposable-session.v1", created: true }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
