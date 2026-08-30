import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

type ApiResult = {
  status: number;
  body: any;
  cookie: string;
  retryAfterSeconds: number | null;
};

type Account = {
  id: number;
  email: string;
  displayName: string;
  cookie: string;
};

type SourceEvidence = {
  source: "ui" | "onboarding" | "todo" | "inbox" | "automation" | "system";
  missionIds: number[];
  exactReceiptCount: number;
  replayConverged: boolean;
  changedPayloadRejected: boolean | null;
};

const BASE_URL = new URL(process.env.LYFEOS_TEST_API_URL || "https://lyfeos.net");
const MODE = process.env.LYFEOS_MISSION_SOURCE_ACCEPTANCE_MODE || "production";
const SOURCE = process.env.LYFEOS_ACCEPTANCE_SOURCE || "";
const HARNESS_SOURCE = process.env.LYFEOS_ACCEPTANCE_HARNESS_SOURCE || process.env.GITHUB_SHA || "";
const OUTPUT_DIR = path.resolve(process.env.LYFEOS_MISSION_SOURCE_OUTPUT_DIR || path.join(os.tmpdir(), "lyfeos-production-mission-sources"));
const OUTPUT_FILE = path.join(OUTPUT_DIR, "mission-source-report.json");
const PASSWORD = "TestPass123!";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/[a-z0-9._%+-]+@example\.com/gi, "[redacted fixture]")
    .replace(/mission_source_[a-z0-9_]+/gi, "[redacted fixture]")
    .slice(0, 1_500);
}

async function request(
  method: string,
  pathname: string,
  body?: unknown,
  cookie = "",
  headers: Record<string, string> = {},
): Promise<ApiResult> {
  const response = await fetch(new URL(pathname, BASE_URL), {
    method,
    signal: AbortSignal.timeout(30_000),
    headers: {
      "Content-Type": "application/json",
      ...(MODE === "isolated" ? { "X-Forwarded-Proto": "https" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  return {
    status: response.status,
    body: await response.json().catch(() => ({})),
    cookie: (response.headers.get("set-cookie") || "").split(";", 1)[0],
    retryAfterSeconds: Number.isFinite(Number(response.headers.get("retry-after"))) ? Number(response.headers.get("retry-after")) : null,
  };
}

async function registerDisposableAccount(account: Account): Promise<void> {
  let result: ApiResult | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    result = await request("POST", "/api/auth/complete-registration", {
      email: account.email,
      password: PASSWORD,
      displayName: account.displayName,
      termsAccepted: true,
    });
    if (result.status === 201) {
      Object.assign(account, { id: Number(result.body.user?.id), cookie: result.cookie });
      assert(account.id > 0 && account.cookie, "Registration did not return a usable account and session.");
      return;
    }
    if (result.status !== 429 || attempt === 1) break;
    const waitSeconds = Math.min(61, Math.max(1, result.retryAfterSeconds || 60));
    await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1_000 + 250));
  }
  throw new Error(`Disposable registration returned ${result?.status || "no response"}.`);
}

async function eraseAccount(account: Account): Promise<boolean> {
  if (!account.cookie) return true;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const deletion = await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, account.cookie).catch(() => null);
    if (deletion && deletion.status >= 200 && deletion.status < 300) break;
    const session = await request("GET", "/api/auth/me", undefined, account.cookie).catch(() => null);
    if (session?.status === 401) break;
  }
  const session = await request("GET", "/api/auth/me", undefined, account.cookie).catch(() => null);
  const email = await request("GET", `/api/auth/check-email?email=${encodeURIComponent(account.email)}`).catch(() => null);
  const displayName = await request("GET", `/api/auth/check-display-name?displayName=${encodeURIComponent(account.displayName)}`).catch(() => null);
  return session?.status === 401 && email?.status === 200 && email.body?.available === true
    && displayName?.status === 200 && displayName.body?.available === true;
}

function questSource(quest: any): string | null {
  return typeof quest?.planning_decision_source === "string"
    ? quest.planning_decision_source
    : typeof quest?.planningDecisionSource === "string"
      ? quest.planningDecisionSource
      : null;
}

function receiptQuestId(event: any): number | null {
  const parsed = Number(event?.metadata?.questId);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function main(): Promise<void> {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const stamp = `${Date.now()}_${randomUUID().slice(0, 8)}`;
  const account: Account = {
    id: 0,
    email: `mission_source_${stamp}@example.com`,
    displayName: `mission_source_${stamp}`.slice(0, 48),
    cookie: "",
  };
  let stage = "register disposable account";
  let failure: string | null = null;
  let cleanup = false;
  let sourceEvidence: SourceEvidence[] = [];
  let exportVerified = false;

  try {
    await registerDisposableAccount(account);

    stage = "qualify keyed Mission UI creation";
    const uiMutationId = `source-ui-${randomUUID()}`;
    const uiPayload = {
      userId: account.id,
      title: `Qualified UI Mission ${stamp}`,
      description: "Disposable provider-independent source qualification",
      category: "general",
      completed: false,
    };
    const uiCreated = await request("POST", "/api/quests", uiPayload, account.cookie, { "x-lyfeos-mutation-id": uiMutationId });
    const uiReplayed = await request("POST", "/api/quests", uiPayload, account.cookie, { "x-lyfeos-mutation-id": uiMutationId });
    const uiChanged = await request("POST", "/api/quests", { ...uiPayload, title: `${uiPayload.title} changed` }, account.cookie, { "x-lyfeos-mutation-id": uiMutationId });
    assert(uiCreated.status === 201, `UI creation returned ${uiCreated.status}.`);
    assert(uiReplayed.status === 200 && uiReplayed.body?.replayed === true, `UI replay returned ${uiReplayed.status} without replay evidence.`);
    assert(uiReplayed.body?.quest?.id === uiCreated.body?.quest?.id, "UI replay did not return the canonical Mission.");
    assert(uiChanged.status === 409, `Changed UI replay returned ${uiChanged.status} instead of 409.`);
    assert(uiCreated.body?.quest?.planningDecisionSource === "ui", "UI creation did not preserve UI provenance.");
    const uiMissionId = Number(uiCreated.body.quest.id);

    stage = "qualify onboarding Mission deduplication";
    const onboardingPayload = {
      userId: account.id,
      title: `Onboarding: Qualified source ${stamp}`,
      description: "Disposable onboarding source qualification",
      category: "onboarding",
      completed: false,
      experienceReward: 10,
    };
    const onboardingCreated = await request("POST", "/api/quests", onboardingPayload, account.cookie);
    const onboardingReplayed = await request("POST", "/api/quests", onboardingPayload, account.cookie);
    assert(onboardingCreated.status === 201, `Onboarding creation returned ${onboardingCreated.status}.`);
    assert(onboardingReplayed.status === 200 && onboardingReplayed.body?.duplicate === true, `Onboarding replay returned ${onboardingReplayed.status} without duplicate evidence.`);
    assert(onboardingReplayed.body?.quest?.id === onboardingCreated.body?.quest?.id, "Onboarding replay did not return the canonical Mission.");
    assert(onboardingCreated.body?.quest?.planningDecisionSource === "onboarding", "Onboarding creation did not preserve onboarding provenance.");
    const onboardingMissionId = Number(onboardingCreated.body.quest.id);

    stage = "qualify automatic To-Do conversion";
    const todoTitle = `Qualified automatic idea ${stamp}`;
    const savedLog = await request("POST", `/api/users/${account.id}/daily-logs`, { date: "2000-01-02", todoIdeas: todoTitle }, account.cookie);
    assert(savedLog.status === 200, `To-Do source log returned ${savedLog.status}.`);
    const todoFirstList = await request("GET", `/api/users/${account.id}/quests?tz=UTC`, undefined, account.cookie);
    const todoSecondList = await request("GET", `/api/users/${account.id}/quests?tz=UTC`, undefined, account.cookie);
    assert(todoFirstList.status === 200 && todoSecondList.status === 200, "To-Do conversion Mission lists did not load.");
    const todoMissions = (todoSecondList.body?.quests || []).filter((quest: any) => quest.title === todoTitle);
    assert(todoMissions.length === 1, `Automatic To-Do conversion produced ${todoMissions.length} matching Missions.`);
    assert(questSource(todoMissions[0]) === "todo" && todoMissions[0].category === "todo", "Automatic To-Do conversion did not preserve To-Do provenance.");
    const todoMissionId = Number(todoMissions[0].id);

    stage = "qualify Inbox replay and collision handling";
    const inboxMutationId = randomUUID();
    const inboxPayload = { text: `Qualified Inbox Mission ${stamp}`, mutationId: inboxMutationId };
    const [inboxCreated, inboxReplayed] = await Promise.all([
      request("POST", "/api/inbox/captures", inboxPayload, account.cookie),
      request("POST", "/api/inbox/captures", inboxPayload, account.cookie),
    ]);
    assert([inboxCreated.status, inboxReplayed.status].sort((left, right) => left - right).join(",") === "200,201", "Inbox concurrent retry did not converge as one create and one replay.");
    assert(inboxCreated.body?.quest?.id === inboxReplayed.body?.quest?.id, "Inbox concurrent retry did not return one canonical Mission.");
    assert([inboxCreated.body?.replayed, inboxReplayed.body?.replayed].filter(Boolean).length === 1, "Inbox retry evidence was not exact.");
    const inboxChanged = await request("POST", "/api/inbox/captures", { text: `${inboxPayload.text} changed`, mutationId: inboxMutationId }, account.cookie);
    assert(inboxChanged.status === 409, `Changed Inbox replay returned ${inboxChanged.status} instead of 409.`);
    const inboxMissionId = Number(inboxCreated.body.quest.id);

    stage = "qualify automation follow-up replay";
    const followUpTitle = `Qualified automation follow-up ${stamp}`;
    const automation = await request("POST", "/api/automations", {
      name: `Qualified source automation ${stamp}`,
      description: "Disposable provider-independent source qualification",
      definition: {
        version: 1,
        trigger: { type: "manual" },
        conditions: {},
        actions: [{
          type: "schedule_follow_up",
          title: followUpTitle,
          description: "Replay-safe production source proof",
          category: "general",
          delayDays: 1,
        }],
        stopOnError: true,
      },
    }, account.cookie);
    assert(automation.status === 201 && Number(automation.body?.automation?.id) > 0, `Automation creation returned ${automation.status}.`);
    const automationId = Number(automation.body.automation.id);
    const enabled = await request("PATCH", `/api/automations/${automationId}`, { enabled: true }, account.cookie);
    assert(enabled.status === 200, `Automation enablement returned ${enabled.status}.`);
    const automationMutationId = randomUUID();
    const [automationCreated, automationReplayed] = await Promise.all([
      request("POST", `/api/automations/${automationId}/run`, { questId: uiMissionId, mutationId: automationMutationId }, account.cookie),
      request("POST", `/api/automations/${automationId}/run`, { questId: uiMissionId, mutationId: automationMutationId }, account.cookie),
    ]);
    assert(automationCreated.status === 200 && automationReplayed.status === 200, "Automation replay did not return two successful responses.");
    assert([automationCreated.body?.result?.duplicate, automationReplayed.body?.result?.duplicate].filter(Boolean).length === 1, "Automation replay did not report exactly one duplicate.");

    stage = "qualify Thread system Mission activation";
    const profile = await request("PATCH", "/api/profile", { completedOnboardingMissions: [0, 1, 2, 3, 4, 5, 6, 7] }, account.cookie);
    assert(profile.status === 200, `Onboarding prerequisite setup returned ${profile.status}.`);
    const initialized = await request("POST", "/api/transformation-thread/initialize", {}, account.cookie);
    assert([200, 201].includes(initialized.status) && Number(initialized.body?.thread?.id) > 0, `Thread initialization returned ${initialized.status}.`);
    const threadId = Number(initialized.body.thread.id);
    const activated = await request("POST", `/api/transformation-thread/${threadId}/activate`, undefined, account.cookie);
    const activationReplay = await request("POST", `/api/transformation-thread/${threadId}/activate`, undefined, account.cookie);
    assert(activated.status === 200 && Number(activated.body?.createdMissions) > 0, `Thread activation returned ${activated.status} without starter Missions.`);
    assert(activationReplay.status === 200 && activationReplay.body?.createdMissions === 0, "Thread activation replay created duplicate starter Missions.");

    stage = "verify exported source truth and creation receipts";
    const exported = await request("GET", "/api/account/export", undefined, account.cookie);
    assert(exported.status === 200, `Account export returned ${exported.status}.`);
    const quests = Array.isArray(exported.body?.data?.quests) ? exported.body.data.quests : [];
    const activity = Array.isArray(exported.body?.data?.user_activity_events) ? exported.body.data.user_activity_events : [];
    const automationMissions = quests.filter((quest: any) => quest.title === followUpTitle && questSource(quest) === "automation");
    assert(automationMissions.length === 1, `Automation replay produced ${automationMissions.length} matching Missions.`);
    const systemMissions = quests.filter((quest: any) => Number(quest.transformation_thread_id ?? quest.transformationThreadId) === threadId && questSource(quest) === "system");
    assert(systemMissions.length === Number(activated.body.createdMissions), "Exported Thread starter Missions did not match the activated set.");
    const expected = [
      { source: "ui" as const, ids: [uiMissionId], replayConverged: true, changedPayloadRejected: true },
      { source: "onboarding" as const, ids: [onboardingMissionId], replayConverged: true, changedPayloadRejected: null },
      { source: "todo" as const, ids: [todoMissionId], replayConverged: true, changedPayloadRejected: null },
      { source: "inbox" as const, ids: [inboxMissionId], replayConverged: true, changedPayloadRejected: true },
      { source: "automation" as const, ids: [Number(automationMissions[0].id)], replayConverged: true, changedPayloadRejected: null },
      { source: "system" as const, ids: systemMissions.map((quest: any) => Number(quest.id)), replayConverged: true, changedPayloadRejected: null },
    ];
    sourceEvidence = expected.map((entry) => {
      const exactReceiptCount = activity.filter((event: any) => event.event_type === "mission_created"
        && event.metadata?.source === entry.source && entry.ids.includes(receiptQuestId(event) || -1)).length;
      assert(entry.ids.every((id) => quests.some((quest: any) => Number(quest.id) === id && questSource(quest) === entry.source)), `${entry.source} Mission provenance was missing from the account export.`);
      assert(exactReceiptCount === entry.ids.length, `${entry.source} emitted ${exactReceiptCount} creation receipts for ${entry.ids.length} Missions.`);
      return {
        source: entry.source,
        missionIds: entry.ids,
        exactReceiptCount,
        replayConverged: entry.replayConverged,
        changedPayloadRejected: entry.changedPayloadRejected,
      };
    });
    exportVerified = true;
  } catch (error) {
    failure = `${stage}: ${safeError(error)}`;
  } finally {
    cleanup = await eraseAccount(account).catch(() => false);
  }

  const report = {
    contract: "lyfeos.production-mission-source-acceptance.v1",
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL.origin,
    mode: MODE,
    source: SOURCE,
    harnessSource: HARNESS_SOURCE,
    passed: failure === null && cleanup,
    localAuthority: {
      sourceEvidence,
      exportVerified,
      allMissionCreationReceiptsExact: sourceEvidence.length === 6 && sourceEvidence.every((entry) => entry.exactReceiptCount === entry.missionIds.length),
    },
    externalBoundaries: [
      { source: "ai", status: "provider-dependent", qualified: false, reason: "A real AI proposal and explicit user approval are required; the production test does not insert a pending action directly into the database." },
      { source: "google", status: "external-provider", qualified: false, reason: "Live Google authorization and provider delivery are outside this provider-independent run." },
      { source: "umh", status: "external-signed-ingress", qualified: false, reason: "A live signed UMH delivery is outside this provider-independent run." },
    ],
    cleanup: {
      accountErased: cleanup,
      sessionInvalidatedAndIdentifiersReleased: cleanup,
    },
    failure,
  };
  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (!report.passed) throw new Error(`Mission-source acceptance failed: ${failure || "cleanup did not prove account erasure"}. Evidence: ${OUTPUT_FILE}`);
  process.stdout.write(`Mission-source acceptance passed. Evidence: ${OUTPUT_FILE}\n`);
}

main().catch((error) => {
  process.stderr.write(`${safeError(error)}\n`);
  process.exitCode = 1;
});
