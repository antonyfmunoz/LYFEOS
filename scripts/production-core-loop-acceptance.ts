import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { access } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import puppeteer, { type Page } from "puppeteer-core";

type ProgressionSnapshot = {
  activityExperience: number;
  capabilityExperience: number;
  activeBadges: string[];
  certifications: string[];
  entrustedRoles: string[];
};

type ViewEvidence = {
  viewport: string;
  titleVisible: boolean;
  proofPlanVisible: boolean;
  evidenceVisible: boolean;
  mainCount: number;
  headingCount: number;
  unlabeledControls: string[];
  horizontalOverflowPx: number;
};

type StepEvidence = {
  name: string;
  status: "passed" | "failed";
  detail: string;
};

type ThreadContinuityEvidence = {
  phase: "reviewed" | "reversed";
  threadId: number;
  threadStatus: string;
  currentPath: {
    skillNodeId: number;
    skillName: string;
    missionId: number | null;
    title: string;
    objective: string;
  };
  capability: {
    id: number;
    name: string;
    reviewedExperience: number;
    focusCount: number;
    eventId: number;
    eventType: string;
    eventDelta: number;
    reversesEventId: number | null;
  };
  rendered: {
    constellationNodeCount: number;
    currentPathText: string;
    capabilityHistoryText: string;
  };
};

type AutomationControlEvidence = {
  automationId: number;
  missionId: number;
  matched: boolean;
  actionTypes: string[];
  disclosure: string;
  renderedText: string;
  runCount: number;
  followUpCreated: boolean;
  progressionUnchanged: boolean;
  enabledThenPaused: boolean;
  runNowEnabledWhileRuleEnabled: boolean;
  scheduleSavedAndRevised: boolean;
  scheduleRunNowDisabled: boolean;
  scheduleNextRunAt: string;
  scheduleTrigger: {
    questId: number;
    timeZone: string;
    localTime: string;
    cadence: "weekly";
    weekdays: number[];
    startDate: string;
    endDate: string | null;
    maxOccurrences: number;
    missedRunPolicy: "run_once";
  };
};

type BrowserApiResponse = {
  status: number;
  remaining: number | null;
  resetSeconds: number | null;
  body: unknown;
};

const BASE_URL = new URL(process.env.LYFEOS_ACCEPTANCE_BASE_URL || "https://lyfeos.net");
const EMAIL = process.env.LYFEOS_ACCEPTANCE_EMAIL?.trim() || "";
const PASSWORD = process.env.LYFEOS_ACCEPTANCE_PASSWORD || "";
const SOURCE = process.env.LYFEOS_ACCEPTANCE_SOURCE?.trim() || "";
const HARNESS_SOURCE = process.env.LYFEOS_ACCEPTANCE_HARNESS_SOURCE?.trim() || "";
const OUTPUT_DIR = path.resolve(process.env.LYFEOS_ACCEPTANCE_OUTPUT_DIR || path.join(os.tmpdir(), "lyfeos-browser-acceptance"));
const OUTPUT_FILE = path.join(OUTPUT_DIR, "core-loop-report.json");
const RUN_ID = randomUUID();
const MISSION_TITLE = `[AUTOMATED ACCEPTANCE] Truthful evidence ${RUN_ID.slice(0, 8)}`;
const PURPOSE = "Verify that Mission activity and reviewed capability progression remain separate, evidence-backed, and reversible.";
const EXPECTED_OUTPUT = "A synthetic proof-plan receipt, reviewed evidence record, and exact progression rollback.";
const REQUIRED_EVIDENCE = "A bounded browser acceptance receipt for this synthetic Mission.";
const EVIDENCE_SUMMARY = `Synthetic browser receipt ${RUN_ID.slice(0, 8)}; no competence or authority claim.`;
const REVIEW_SUMMARY = `Self-review ${RUN_ID.slice(0, 8)} confirms only the declared synthetic receipt and one bounded practice contribution.`;
const SYNTHETIC_MISSION_PREFIX = "[AUTOMATED ACCEPTANCE]";
const AUTOMATION_NAME = `[AUTOMATED ACCEPTANCE] Controls ${RUN_ID.slice(0, 8)}`;
const AUTOMATION_DESCRIPTION = "Verify that saved preview and explicit enable/pause controls remain inspectable without creating a Mission or execution receipt.";
const AUTOMATION_FOLLOW_UP_TITLE = `[AUTOMATED ACCEPTANCE] Must not exist ${RUN_ID.slice(0, 8)}`;

const steps: StepEvidence[] = [];
let missionId: number | null = null;
let progressionBefore: ProgressionSnapshot | null = null;
let progressionAfterEvidence: ProgressionSnapshot | null = null;
let progressionAfterCompletion: ProgressionSnapshot | null = null;
let progressionAfterReview: ProgressionSnapshot | null = null;
let progressionAfterReopen: ProgressionSnapshot | null = null;
let progressionAfterCleanup: ProgressionSnapshot | null = null;
let expectedActivityExperience = 0;
let reviewedSkillExperience = 0;
let reviewedSkillNodeId: number | null = null;
let reviewedThreadContinuity: ThreadContinuityEvidence | null = null;
let reversedThreadContinuity: ThreadContinuityEvidence | null = null;
let automationId: number | null = null;
let automationControlEvidence: AutomationControlEvidence | null = null;
let automationCleanupAttempted = false;
let automationDeleted = false;
let cleanupAttempted = false;
let cleanupArchived = false;
let failureMessage: string | null = null;
const views: ViewEvidence[] = [];

function sanitizedMessage(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error);
  if (EMAIL) message = message.replaceAll(EMAIL, "[redacted acceptance account]");
  if (PASSWORD) message = message.replaceAll(PASSWORD, "[redacted acceptance credential]");
  return message.slice(0, 1_000);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function waitForRateLimitReset(response: BrowserApiResponse, label: string): Promise<void> {
  assert(response.resetSeconds !== null && Number.isFinite(response.resetSeconds), `${label} did not expose an actionable rate-limit reset.`);
  const waitMs = Math.min(65_000, Math.max(1_000, (response.resetSeconds + 1) * 1_000));
  await new Promise((resolve) => setTimeout(resolve, waitMs));
}

async function browserApiRequest(page: Page, pathname: string, method = "GET", requestBody?: unknown): Promise<BrowserApiResponse> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await page.evaluate(async ({ requestPath, requestMethod, body }) => {
      const response = await fetch(requestPath, {
        method: requestMethod,
        credentials: "include",
        cache: "no-store",
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const remainingHeader = response.headers.get("ratelimit-remaining");
      const resetHeader = response.headers.get("ratelimit-reset") || response.headers.get("retry-after");
      let responseBody: unknown = null;
      try {
        responseBody = await response.json();
      } catch {
        // Status and headers remain authoritative for responses without JSON.
      }
      return {
        status: response.status,
        remaining: remainingHeader === null ? null : Number(remainingHeader),
        resetSeconds: resetHeader === null ? null : Number(resetHeader),
        body: responseBody,
      };
    }, { requestPath: pathname, requestMethod: method, body: requestBody });
    if (result.status !== 429) return result;
    if (attempt === 2) return result;
    await waitForRateLimitReset(result, `${method} ${pathname}`);
  }
  throw new Error(`Unreachable API retry state for ${method} ${pathname}.`);
}

async function ensureAcceptanceThread(page: Page): Promise<{ state: "existing" | "activated"; fixturePrepared: boolean }> {
  const current = await browserApiRequest(page, "/api/transformation-thread");
  assert(current.status === 200, `Transformation Thread preflight returned ${current.status}.`);
  let thread = (current.body as { thread?: { id?: unknown; status?: unknown } } | null)?.thread;
  let fixturePrepared = false;
  if (!thread) {
    let initialized = await browserApiRequest(page, "/api/transformation-thread/initialize", "POST", {});
    if (initialized.status === 409) {
      const missing = (initialized.body as { missing?: unknown } | null)?.missing;
      assert(Array.isArray(missing) && missing.length > 0 && missing.every((id) => Number.isInteger(id) && Number(id) >= 0 && Number(id) <= 7), "Thread initialization was refused for a reason other than missing acceptance-fixture onboarding Missions.");
      const profileResponse = await browserApiRequest(page, "/api/profile");
      const profile = profileResponse.body as { onboardingCompleted?: unknown; completedOnboardingMissions?: unknown } | null;
      assert(profileResponse.status === 200 && profile?.onboardingCompleted === true, "Acceptance fixture provisioning is limited to the dedicated completed-onboarding account.");
      const completed = Array.isArray(profile.completedOnboardingMissions)
        ? profile.completedOnboardingMissions.filter((id): id is number => Number.isInteger(id) && id >= 0 && id <= 7)
        : [];
      const completedOnboardingMissions = Array.from(new Set([...completed, ...missing.map(Number)])).sort((left, right) => left - right);
      const provisioned = await browserApiRequest(page, "/api/profile", "PATCH", { completedOnboardingMissions });
      assert(provisioned.status === 200, `Acceptance onboarding prerequisite provisioning returned ${provisioned.status}.`);
      fixturePrepared = true;
      initialized = await browserApiRequest(page, "/api/transformation-thread/initialize", "POST", {});
    }
    assert([200, 201].includes(initialized.status), `Onboarding-derived Thread initialization returned ${initialized.status}.`);
    thread = (initialized.body as { thread?: { id?: unknown; status?: unknown } } | null)?.thread;
  }
  const threadId = Number(thread?.id);
  const status = String(thread?.status || "");
  assert(Number.isInteger(threadId), "Transformation Thread preflight did not return an owned Thread identifier.");
  if (status === "active") return { state: "existing", fixturePrepared };
  assert(status === "draft", `Acceptance will not override a Transformation Thread in ${status || "unknown"} state.`);
  const activated = await browserApiRequest(page, `/api/transformation-thread/${threadId}/activate`, "POST");
  assert(activated.status === 200, `Onboarding-derived Thread activation returned ${activated.status}.`);
  assert((activated.body as { thread?: { status?: unknown } } | null)?.thread?.status === "active", "Transformation Thread activation did not produce an active Thread.");
  return { state: "activated", fixturePrepared };
}

async function waitForApiBudget(page: Page, floor: number): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const state = await browserApiRequest(page, "/api/auth/me");
    assert(state.status === 200, `API budget probe returned ${state.status}.`);
    if (state.remaining === null || state.remaining > floor) return;
    await waitForRateLimitReset(state, "API budget probe");
  }
  throw new Error(`API rate-limit budget did not recover above ${floor}.`);
}

async function archiveStrandedSyntheticMissions(page: Page): Promise<number> {
  const session = await browserApiRequest(page, "/api/auth/me");
  const userId = Number((session.body as { user?: { id?: unknown } } | null)?.user?.id);
  assert(session.status === 200 && Number.isInteger(userId), "Could not resolve the dedicated acceptance account for synthetic cleanup.");
  const missionsResponse = await browserApiRequest(page, `/api/users/${userId}/quests`);
  const missions = (missionsResponse.body as { quests?: Array<{ id?: unknown; title?: unknown; completed?: unknown }> } | null)?.quests || [];
  assert(missionsResponse.status === 200, `Synthetic Mission preflight returned ${missionsResponse.status}.`);
  const strandedMissions = missions
    .filter((mission) => typeof mission.title === "string" && mission.title.startsWith(SYNTHETIC_MISSION_PREFIX))
    .map((mission) => ({ id: Number(mission.id), completed: mission.completed === true }))
    .filter((mission) => Number.isInteger(mission.id));
  for (const mission of strandedMissions) {
    const id = mission.id;
    if (mission.completed) {
      const reopened = await browserApiRequest(page, `/api/quests/${id}/toggle`, "POST");
      assert(reopened.status === 200 && (reopened.body as { quest?: { completed?: unknown } } | null)?.quest?.completed === false, `Stranded synthetic Mission ${id} could not be reopened before cleanup.`);
    }
    const archived = await browserApiRequest(page, `/api/quests/${id}`, "DELETE");
    assert(archived.status === 200, `Stranded synthetic Mission ${id} cleanup returned ${archived.status}.`);
  }
  return strandedMissions.length;
}

async function deleteStrandedSyntheticAutomations(page: Page): Promise<number> {
  const response = await browserApiRequest(page, "/api/automations");
  const automations = (response.body as { automations?: Array<{ id?: unknown; name?: unknown }> } | null)?.automations || [];
  assert(response.status === 200, `Synthetic automation preflight returned ${response.status}.`);
  const strandedIds = automations
    .filter((automation) => typeof automation.name === "string" && automation.name.startsWith(SYNTHETIC_MISSION_PREFIX))
    .map((automation) => Number(automation.id))
    .filter((id) => Number.isInteger(id) && id > 0);
  for (const id of strandedIds) {
    const deleted = await browserApiRequest(page, `/api/automations/${id}`, "DELETE");
    assert(deleted.status === 204, `Stranded synthetic automation ${id} cleanup returned ${deleted.status}.`);
  }
  return strandedIds.length;
}

async function findChromium(): Promise<string> {
  const configured = process.env.LYFEOS_CHROMIUM_PATH || process.env.CHROME_PATH || process.env.CHROMIUM_PATH;
  const candidates = [
    configured,
    process.platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : undefined,
    process.platform === "win32" ? "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe" : undefined,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue through the explicit bounded locations.
    }
  }
  throw new Error("No Chromium executable found. Set LYFEOS_CHROMIUM_PATH for core-loop qualification.");
}

async function login(page: Page): Promise<void> {
  await page.goto(new URL("/login", BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector("#identifier", { visible: true, timeout: 30_000 });
  await page.type("#identifier", EMAIL);
  await page.type("#password", PASSWORD);
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForFunction(
      () => !window.location.pathname.startsWith("/login") && !document.body.innerText.includes("Logging in..."),
      { timeout: 60_000 },
    ),
  ]);
  const state = await page.evaluate(async () => {
    const [sessionResponse, profileResponse] = await Promise.all([
      fetch("/api/auth/me", { credentials: "include", cache: "no-store" }),
      fetch("/api/profile", { credentials: "include", cache: "no-store" }),
    ]);
    const profile = profileResponse.ok ? await profileResponse.json() as { onboardingCompleted?: boolean } : null;
    return {
      sessionStatus: sessionResponse.status,
      profileStatus: profileResponse.status,
      onboardingCompleted: profile?.onboardingCompleted === true,
    };
  });
  assert(state.sessionStatus === 200, `Core-loop login did not establish a session (${state.sessionStatus}).`);
  assert(state.profileStatus === 200 && state.onboardingCompleted, "Core-loop account must be a dedicated completed-onboarding account.");
}

async function readProgression(page: Page): Promise<ProgressionSnapshot> {
  const result = await page.evaluate(async () => {
    const response = await fetch("/api/progression", { credentials: "include", cache: "no-store" });
    if (!response.ok) return { error: `status ${response.status}` };
    const body = await response.json() as {
      progression?: {
        tracks?: {
          activity?: { totalExperience?: number };
          capability?: { totalVerifiedExperience?: number };
          authority?: { certifications?: unknown[]; entrustedRoles?: unknown[] };
        };
        badges?: Array<{ key?: string }>;
      };
    };
    return {
      activityExperience: body.progression?.tracks?.activity?.totalExperience,
      capabilityExperience: body.progression?.tracks?.capability?.totalVerifiedExperience,
      activeBadges: (body.progression?.badges || []).map((badge) => badge.key).filter((key): key is string => Boolean(key)).sort(),
      certifications: (body.progression?.tracks?.authority?.certifications || []).map(String).sort(),
      entrustedRoles: (body.progression?.tracks?.authority?.entrustedRoles || []).map(String).sort(),
    };
  });
  assert(!("error" in result), `Could not read progression: ${"error" in result ? result.error : "unknown response"}.`);
  assert(Number.isFinite(result.activityExperience), "Progression response omitted activity experience.");
  assert(Number.isFinite(result.capabilityExperience), "Progression response omitted capability experience.");
  return result as ProgressionSnapshot;
}

function progressionMatches(left: ProgressionSnapshot, right: ProgressionSnapshot): boolean {
  return left.activityExperience === right.activityExperience
    && left.capabilityExperience === right.capabilityExperience
    && JSON.stringify(left.activeBadges) === JSON.stringify(right.activeBadges)
    && JSON.stringify(left.certifications) === JSON.stringify(right.certifications)
    && JSON.stringify(left.entrustedRoles) === JSON.stringify(right.entrustedRoles);
}

async function readStableProgression(page: Page): Promise<ProgressionSnapshot> {
  let previous = await readProgression(page);
  let consecutiveMatches = 0;
  for (let attempt = 0; attempt < 10; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const current = await readProgression(page);
    if (progressionMatches(previous, current)) {
      consecutiveMatches += 1;
      if (consecutiveMatches >= 3) return current;
    } else {
      consecutiveMatches = 0;
    }
    previous = current;
  }
  throw new Error("Progression did not settle after onboarding-derived fixture reconciliation.");
}

async function fill(page: Page, selector: string, value: string): Promise<void> {
  await page.waitForSelector(selector, { visible: true, timeout: 30_000 });
  await page.focus(selector);
  const modifier = process.platform === "darwin" ? "Meta" : "Control";
  await page.keyboard.down(modifier);
  await page.keyboard.press("A");
  await page.keyboard.up(modifier);
  await page.keyboard.press("Backspace");
  await page.type(selector, value, { delay: 15 });
  await page.waitForFunction(({ inputSelector, expectedValue }) => {
    const control = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(inputSelector);
    return control?.value === expectedValue;
  }, { timeout: 10_000 }, { inputSelector: selector, expectedValue: value });
}

type RenderedFieldExpectation = { selector: string; value: string };

async function readRenderedFields(page: Page, fields: RenderedFieldExpectation[]): Promise<Record<string, string | null>> {
  return page.evaluate((expectations) => Object.fromEntries(expectations.map(({ selector }) => {
    const control = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
    return [selector, control?.value ?? null];
  })), fields);
}

async function stabilizeRenderedFields(page: Page, fields: RenderedFieldExpectation[]): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const actual = await readRenderedFields(page, fields);
    const mismatches = fields.filter(({ selector, value }) => actual[selector] !== value);
    if (mismatches.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const confirmation = await readRenderedFields(page, fields);
      if (fields.every(({ selector, value }) => confirmation[selector] === value)) return;
    }
    for (const field of mismatches) await fill(page, field.selector, field.value);
  }
  const actual = await readRenderedFields(page, fields);
  throw new Error(`Rendered automation fields did not settle: ${JSON.stringify(actual)}`);
}

async function exerciseNonMutatingAutomationControls(page: Page): Promise<AutomationControlEvidence> {
  assert(missionId !== null, "Cannot qualify automation preview without the synthetic Mission.");
  assert(progressionBefore !== null, "Cannot qualify automation preview without a settled progression baseline.");
  let stage = "open the Automations page";
  try {
    await waitForApiBudget(page, 55);
    await page.goto(new URL("/automations", BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector('[data-testid="automations-page"]', { visible: true, timeout: 30_000 });
    await page.waitForFunction(() => {
      const control = document.querySelector<HTMLButtonElement>('[data-testid="automation-create"]');
      const loading = document.querySelector('[data-testid="automation-list-loading"]');
      return Boolean(control && !control.disabled && !loading);
    }, { timeout: 30_000 });

    stage = "activate the rendered New automation control";
    const createResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.origin === BASE_URL.origin && url.pathname === "/api/automations" && response.request().method() === "POST";
    }, { timeout: 30_000 });
    await activateRenderedControl(page, '[data-testid="automation-create"]');
    const createResponse = await createResponsePromise;
    const createBody = await createResponse.json() as { automation?: { id?: number; enabled?: boolean }; error?: unknown };
    assert(createResponse.ok() && Number.isInteger(createBody.automation?.id), `Rendered automation creation failed (${createResponse.status()}).`);
    automationId = createBody.automation!.id!;
    assert(createBody.automation?.enabled === false, "A newly created automation was not disabled by default.");
    await page.waitForSelector(`[data-testid="automation-editor-${automationId}"]`, { visible: true, timeout: 30_000 });
    await page.waitForFunction(() => {
      const nameInput = document.querySelector<HTMLInputElement>('[data-testid="automation-name"]');
      return nameInput?.value === "New automation";
    }, { timeout: 30_000 });

    stage = "fill the disabled automation name";
    await fill(page, '[data-testid="automation-name"]', AUTOMATION_NAME);
    stage = "fill the disabled automation description";
    await fill(page, '[data-testid="automation-description"]', AUTOMATION_DESCRIPTION);
    stage = "fill the bounded automation condition";
    await fill(page, '[data-testid="automation-condition-title"]', SYNTHETIC_MISSION_PREFIX);
    stage = "fill the bounded follow-up action";
    await fill(page, '[data-testid="automation-action-title-0"]', AUTOMATION_FOLLOW_UP_TITLE);
    stage = "stabilize the complete rendered automation draft";
    await stabilizeRenderedFields(page, [
      { selector: '[data-testid="automation-name"]', value: AUTOMATION_NAME },
      { selector: '[data-testid="automation-description"]', value: AUTOMATION_DESCRIPTION },
      { selector: '[data-testid="automation-condition-title"]', value: SYNTHETIC_MISSION_PREFIX },
      { selector: '[data-testid="automation-action-title-0"]', value: AUTOMATION_FOLLOW_UP_TITLE },
    ]);
    stage = "save the disabled bounded automation draft";
    const saveResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.origin === BASE_URL.origin && url.pathname === `/api/automations/${automationId}` && response.request().method() === "PATCH";
  }, { timeout: 30_000 });
    await activateRenderedControl(page, '[data-testid="automation-save"]');
    const saveResponse = await saveResponsePromise;
    const saveBody = await saveResponse.json() as {
    automation?: {
      enabled?: boolean;
      name?: string;
      definition?: { conditions?: { titleContains?: string | null }; actions?: Array<{ type?: string; title?: string }> };
    };
  };
    assert(saveResponse.ok(), `Rendered automation save failed (${saveResponse.status()}).`);
    assert(
      saveBody.automation?.enabled === false && saveBody.automation?.name === AUTOMATION_NAME,
      `Saved automation did not remain a disabled named draft (enabled=${String(saveBody.automation?.enabled)}, name=${JSON.stringify(saveBody.automation?.name || null)}).`,
    );
    assert(saveBody.automation?.definition?.conditions?.titleContains === SYNTHETIC_MISSION_PREFIX, "Saved automation omitted its bounded Mission-title condition.");
    assert(saveBody.automation?.definition?.actions?.[0]?.type === "schedule_follow_up" && saveBody.automation?.definition?.actions?.[0]?.title === AUTOMATION_FOLLOW_UP_TITLE, "Saved automation omitted its declared follow-up preview action.");

    stage = "preview the saved rule against the synthetic Mission";
    await page.waitForFunction((id) => Array.from(document.querySelectorAll<HTMLSelectElement>('[data-testid="automation-preview-mission"] option')).some((option) => option.value === String(id)), { timeout: 30_000 }, missionId);
    await page.select('[data-testid="automation-preview-mission"]', String(missionId));
    const previewResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.origin === BASE_URL.origin && url.pathname === `/api/automations/${automationId}/preview` && response.request().method() === "POST";
  }, { timeout: 30_000 });
    await activateRenderedControl(page, '[data-testid="automation-preview"]');
    const previewResponse = await previewResponsePromise;
    const previewBody = await previewResponse.json() as { preview?: { matched?: boolean; disclosure?: string; actions?: Array<{ type?: string; description?: string }> } };
  assert(previewResponse.ok(), `Rendered automation preview failed (${previewResponse.status()}).`);
  assert(previewBody.preview?.matched === true, "Saved automation did not match its synthetic Mission during preview.");
  assert(previewBody.preview?.disclosure === "Preview only. No mission was changed and no follow-up was created.", "Automation preview omitted its exact non-mutation disclosure.");
  assert(previewBody.preview?.actions?.length === 1 && previewBody.preview.actions[0]?.type === "schedule_follow_up", "Automation preview did not expose exactly its declared bounded action.");
  await page.waitForSelector('[data-testid="automation-preview-result"]', { visible: true, timeout: 30_000 });
  await page.waitForSelector('[data-testid="automation-run-history-empty"]', { visible: true, timeout: 30_000 });
  const rendered = await page.$eval('[data-testid="automation-preview-result"]', (element) => element.textContent?.replace(/\s+/g, " ").trim() || "");
  assert(rendered.includes(previewBody.preview.disclosure) && rendered.includes(AUTOMATION_FOLLOW_UP_TITLE), "Rendered automation preview did not match its authenticated response.");
  const runDisabled = await page.$eval('[data-testid="automation-run-now"]', (element) => (element as HTMLButtonElement).disabled);
  assert(runDisabled, "Disabled automation draft exposed an executable Run now control.");

  const detailResponse = await browserApiRequest(page, `/api/automations/${automationId}`);
  const runs = (detailResponse.body as { runs?: unknown[] } | null)?.runs || [];
  assert(detailResponse.status === 200 && runs.length === 0, "Automation preview created an execution receipt.");
  const session = await browserApiRequest(page, "/api/auth/me");
  const userId = Number((session.body as { user?: { id?: unknown } } | null)?.user?.id);
  assert(session.status === 200 && Number.isInteger(userId), "Automation preview could not resolve the dedicated acceptance account.");
  const missionsResponse = await browserApiRequest(page, `/api/users/${userId}/quests`);
  const missions = (missionsResponse.body as { quests?: Array<{ title?: unknown }> } | null)?.quests || [];
  const followUpCreated = missions.some((mission) => mission.title === AUTOMATION_FOLLOW_UP_TITLE);
  assert(missionsResponse.status === 200 && !followUpCreated, "Automation preview created the declared follow-up Mission.");
  const progressionAfterPreview = await readProgression(page);
  assert(progressionMatches(progressionBefore, progressionAfterPreview), "Automation preview changed activity XP, capability XP, badges, or authority.");

    stage = "refill the API budget before the explicit enable and pause cycle";
    await waitForApiBudget(page, 35);
    stage = "enable the saved manual rule through the rendered control";
    const enableResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.origin === BASE_URL.origin && url.pathname === `/api/automations/${automationId}` && response.request().method() === "PATCH";
    }, { timeout: 30_000 });
    await activateRenderedControl(page, '[data-testid="automation-toggle"]');
    const enableResponse = await enableResponsePromise;
    const enableBody = await enableResponse.json() as { automation?: { enabled?: boolean; definition?: { trigger?: { type?: string } } } };
    assert(enableResponse.ok() && enableBody.automation?.enabled === true, `Rendered automation enable failed (${enableResponse.status()}).`);
    assert(enableBody.automation?.definition?.trigger?.type === "manual", "Rendered automation enable changed the saved manual trigger.");
    await page.waitForFunction(() => {
      const toggle = document.querySelector<HTMLButtonElement>('[data-testid="automation-toggle"]');
      const run = document.querySelector<HTMLButtonElement>('[data-testid="automation-run-now"]');
      return toggle?.textContent?.includes("Save & pause") === true && run?.disabled === false;
    }, { timeout: 30_000 });
    const runNowEnabledWhileRuleEnabled = await page.$eval('[data-testid="automation-run-now"]', (element) => !(element as HTMLButtonElement).disabled);
    assert(runNowEnabledWhileRuleEnabled, "Enabled saved manual automation did not expose its controlled Run now action.");
    const detailAfterEnable = await browserApiRequest(page, `/api/automations/${automationId}`);
    const runsAfterEnable = (detailAfterEnable.body as { runs?: unknown[] } | null)?.runs || [];
    assert(detailAfterEnable.status === 200 && runsAfterEnable.length === 0, "Enabling the saved manual automation created an execution receipt.");

    stage = "pause the enabled rule through the rendered control";
    const pauseResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.origin === BASE_URL.origin && url.pathname === `/api/automations/${automationId}` && response.request().method() === "PATCH";
    }, { timeout: 30_000 });
    await activateRenderedControl(page, '[data-testid="automation-toggle"]');
    const pauseResponse = await pauseResponsePromise;
    const pauseBody = await pauseResponse.json() as { automation?: { enabled?: boolean } };
    assert(pauseResponse.ok() && pauseBody.automation?.enabled === false, `Rendered automation pause failed (${pauseResponse.status()}).`);
    await page.waitForFunction(() => {
      const toggle = document.querySelector<HTMLButtonElement>('[data-testid="automation-toggle"]');
      const run = document.querySelector<HTMLButtonElement>('[data-testid="automation-run-now"]');
      return toggle?.textContent?.includes("Save & enable") === true && run?.disabled === true;
    }, { timeout: 30_000 });
    const detailAfterPause = await browserApiRequest(page, `/api/automations/${automationId}`);
    const runsAfterPause = (detailAfterPause.body as { runs?: unknown[] } | null)?.runs || [];
    assert(detailAfterPause.status === 200 && runsAfterPause.length === 0, "Pausing the saved manual automation created an execution receipt.");
    const missionsAfterControlsResponse = await browserApiRequest(page, `/api/users/${userId}/quests`);
    const missionsAfterControls = (missionsAfterControlsResponse.body as { quests?: Array<{ title?: unknown }> } | null)?.quests || [];
    const followUpCreatedAfterControls = missionsAfterControls.some((mission) => mission.title === AUTOMATION_FOLLOW_UP_TITLE);
    assert(missionsAfterControlsResponse.status === 200 && !followUpCreatedAfterControls, "Automation enable/pause controls created the declared follow-up Mission.");
    const progressionAfterControls = await readProgression(page);
    const progressionUnchanged = progressionMatches(progressionBefore, progressionAfterControls);
    assert(progressionUnchanged, "Automation enable/pause controls changed activity XP, capability XP, badges, or authority.");

    stage = "refill the API budget before the disabled schedule authoring cycle";
    await waitForApiBudget(page, 45);
    stage = "open the rendered bounded schedule editor";
    await page.select('[data-testid="automation-trigger"]', "schedule");
    await page.waitForSelector('[data-testid="automation-schedule-editor"]', { visible: true, timeout: 30_000 });
    await page.waitForFunction((id) => Array.from(document.querySelectorAll<HTMLSelectElement>('[data-testid="automation-schedule-anchor"] option')).some((option) => option.value === String(id)), { timeout: 30_000 }, missionId);
    await page.select('[data-testid="automation-schedule-anchor"]', String(missionId));
    await page.select('[data-testid="automation-schedule-missed-run-policy"]', "skip");
    await fill(page, '[data-testid="automation-schedule-max-occurrences"]', "2");
    await page.waitForFunction((id) => {
      const value = (selector: string) => document.querySelector<HTMLInputElement | HTMLSelectElement>(selector)?.value || "";
      return value('[data-testid="automation-schedule-anchor"]') === String(id)
        && value('[data-testid="automation-schedule-time-zone"]').length > 0
        && value('[data-testid="automation-schedule-local-time"]').length > 0
        && value('[data-testid="automation-schedule-cadence"]') === "daily"
        && value('[data-testid="automation-schedule-start-date"]').length === 10
        && value('[data-testid="automation-schedule-max-occurrences"]') === "2"
        && value('[data-testid="automation-schedule-missed-run-policy"]') === "skip";
    }, { timeout: 30_000 }, missionId);

    stage = "save the disabled daily schedule through the rendered control";
    const dailyScheduleResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.origin === BASE_URL.origin && url.pathname === `/api/automations/${automationId}` && response.request().method() === "PATCH";
    }, { timeout: 30_000 });
    await activateRenderedControl(page, '[data-testid="automation-save"]');
    const dailyScheduleResponse = await dailyScheduleResponsePromise;
    const dailyScheduleBody = await dailyScheduleResponse.json() as {
      automation?: {
        enabled?: boolean;
        scheduleNextRunAt?: string | null;
        definition?: {
          version?: number;
          trigger?: {
            type?: string;
            questId?: number;
            timeZone?: string;
            localTime?: string;
            cadence?: string;
            weekdays?: number[];
            startDate?: string;
            endDate?: string | null;
            maxOccurrences?: number;
            missedRunPolicy?: string;
          };
        };
      };
    };
    const dailyTrigger = dailyScheduleBody.automation?.definition?.trigger;
    const dailyNextRunAt = String(dailyScheduleBody.automation?.scheduleNextRunAt || "");
    assert(dailyScheduleResponse.ok(), `Rendered daily schedule save failed (${dailyScheduleResponse.status()}).`);
    assert(dailyScheduleBody.automation?.enabled === false, "Saving a bounded schedule unexpectedly enabled the rule.");
    assert(dailyScheduleBody.automation?.definition?.version === 2 && dailyTrigger?.type === "schedule", "Saved bounded schedule omitted its version-two schedule trigger.");
    assert(dailyTrigger?.questId === missionId && dailyTrigger.cadence === "daily" && dailyTrigger.weekdays?.length === 0, "Saved daily schedule omitted its owner Mission anchor or cadence.");
    assert(dailyTrigger?.maxOccurrences === 2 && dailyTrigger.missedRunPolicy === "skip", "Saved daily schedule omitted its bounded occurrence or missed-run policy.");
    assert(dailyNextRunAt.length > 0 && Number.isFinite(new Date(dailyNextRunAt).getTime()) && new Date(dailyNextRunAt).getTime() > Date.now(), "Saved daily schedule did not retain a future next occurrence.");
    await page.waitForFunction((timeZone) => {
      const status = document.querySelector('[data-testid="automation-schedule-status"]')?.textContent || "";
      return status.includes("Consumed 0 occurrences") && status.includes("next") && status.includes(`(${timeZone})`);
    }, { timeout: 30_000 }, dailyTrigger?.timeZone || "");
    const scheduleRunNowDisabled = await page.$eval('[data-testid="automation-run-now"]', (element) => (element as HTMLButtonElement).disabled);
    assert(scheduleRunNowDisabled, "A disabled scheduled automation exposed the manual Run now action.");

    stage = "revise the disabled schedule to selected weekdays";
    const startWeekday = new Date(`${dailyTrigger?.startDate || ""}T00:00:00.000Z`).getUTCDay();
    assert(Number.isInteger(startWeekday) && startWeekday >= 0 && startWeekday <= 6, "Saved daily schedule returned an invalid start date.");
    const addedWeekday = (startWeekday + 1) % 7;
    await page.select('[data-testid="automation-schedule-cadence"]', "weekly");
    await page.waitForSelector(`[data-testid="automation-schedule-weekday-${startWeekday}"]`, { visible: true, timeout: 30_000 });
    await page.waitForFunction((day) => document.querySelector(`[data-testid="automation-schedule-weekday-${day}"]`)?.getAttribute("aria-pressed") === "true", { timeout: 30_000 }, startWeekday);
    await activateRenderedControl(page, `[data-testid="automation-schedule-weekday-${addedWeekday}"]`);
    await page.select('[data-testid="automation-schedule-missed-run-policy"]', "run_once");
    await fill(page, '[data-testid="automation-schedule-max-occurrences"]', "3");
    await page.waitForFunction((day) => {
      const cadence = document.querySelector<HTMLSelectElement>('[data-testid="automation-schedule-cadence"]')?.value;
      const occurrenceCount = document.querySelector<HTMLInputElement>('[data-testid="automation-schedule-max-occurrences"]')?.value;
      const policy = document.querySelector<HTMLSelectElement>('[data-testid="automation-schedule-missed-run-policy"]')?.value;
      const added = document.querySelector(`[data-testid="automation-schedule-weekday-${day}"]`)?.getAttribute("aria-pressed");
      return cadence === "weekly" && occurrenceCount === "3" && policy === "run_once" && added === "true";
    }, { timeout: 30_000 }, addedWeekday);

    stage = "save the revised disabled weekly schedule through the rendered control";
    const weeklyScheduleResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.origin === BASE_URL.origin && url.pathname === `/api/automations/${automationId}` && response.request().method() === "PATCH";
    }, { timeout: 30_000 });
    await activateRenderedControl(page, '[data-testid="automation-save"]');
    const weeklyScheduleResponse = await weeklyScheduleResponsePromise;
    const weeklyScheduleBody = await weeklyScheduleResponse.json() as typeof dailyScheduleBody;
    const weeklyTrigger = weeklyScheduleBody.automation?.definition?.trigger;
    const weeklyNextRunAt = String(weeklyScheduleBody.automation?.scheduleNextRunAt || "");
    const expectedWeekdays = [startWeekday, addedWeekday].sort((left, right) => left - right);
    assert(weeklyScheduleResponse.ok(), `Rendered weekly schedule save failed (${weeklyScheduleResponse.status()}).`);
    assert(weeklyScheduleBody.automation?.enabled === false, "Revising a bounded schedule unexpectedly enabled the rule.");
    assert(weeklyTrigger?.type === "schedule" && weeklyTrigger.cadence === "weekly", "Revised schedule did not retain its weekly trigger.");
    assert(JSON.stringify(weeklyTrigger.weekdays) === JSON.stringify(expectedWeekdays), `Revised schedule retained unexpected weekdays (${JSON.stringify(weeklyTrigger?.weekdays || [])}).`);
    assert(weeklyTrigger.maxOccurrences === 3 && weeklyTrigger.missedRunPolicy === "run_once", "Revised weekly schedule omitted its bounded occurrence or consolidation policy.");
    assert(weeklyNextRunAt.length > 0 && Number.isFinite(new Date(weeklyNextRunAt).getTime()) && new Date(weeklyNextRunAt).getTime() > Date.now(), "Revised weekly schedule did not retain a future next occurrence.");
    const scheduleRunNowDisabledAfterRevision = await page.$eval('[data-testid="automation-run-now"]', (element) => (element as HTMLButtonElement).disabled);
    assert(scheduleRunNowDisabledAfterRevision, "A revised scheduled automation exposed the manual Run now action.");

    stage = "preview the revised saved schedule without executing it";
    const scheduledPreviewResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.origin === BASE_URL.origin && url.pathname === `/api/automations/${automationId}/preview` && response.request().method() === "POST";
    }, { timeout: 30_000 });
    await activateRenderedControl(page, '[data-testid="automation-preview"]');
    const scheduledPreviewResponse = await scheduledPreviewResponsePromise;
    const scheduledPreviewBody = await scheduledPreviewResponse.json() as typeof previewBody;
    assert(scheduledPreviewResponse.ok() && scheduledPreviewBody.preview?.matched === true, `Rendered scheduled preview failed (${scheduledPreviewResponse.status()}).`);
    assert(scheduledPreviewBody.preview?.disclosure === previewBody.preview.disclosure, "Scheduled preview changed the exact non-mutation disclosure.");
    const detailAfterSchedule = await browserApiRequest(page, `/api/automations/${automationId}`);
    const runsAfterSchedule = (detailAfterSchedule.body as { runs?: unknown[] } | null)?.runs || [];
    assert(detailAfterSchedule.status === 200 && runsAfterSchedule.length === 0, "Disabled schedule authoring or preview created an execution receipt.");
    const missionsAfterScheduleResponse = await browserApiRequest(page, `/api/users/${userId}/quests`);
    const missionsAfterSchedule = (missionsAfterScheduleResponse.body as { quests?: Array<{ title?: unknown }> } | null)?.quests || [];
    const followUpCreatedAfterSchedule = missionsAfterSchedule.some((mission) => mission.title === AUTOMATION_FOLLOW_UP_TITLE);
    assert(missionsAfterScheduleResponse.status === 200 && !followUpCreatedAfterSchedule, "Disabled schedule authoring or preview created the declared follow-up Mission.");
    const progressionAfterSchedule = await readProgression(page);
    const progressionUnchangedAfterSchedule = progressionMatches(progressionBefore, progressionAfterSchedule);
    assert(progressionUnchangedAfterSchedule, "Disabled schedule authoring or preview changed activity XP, capability XP, badges, or authority.");
    assert(weeklyTrigger?.questId === missionId && typeof weeklyTrigger.timeZone === "string" && typeof weeklyTrigger.localTime === "string" && typeof weeklyTrigger.startDate === "string", "Revised schedule omitted its required trigger fields.");

    const evidence: AutomationControlEvidence = {
    automationId,
    missionId,
    matched: true,
    actionTypes: previewBody.preview.actions.map((action) => String(action.type || "")),
    disclosure: previewBody.preview.disclosure,
    renderedText: rendered,
    runCount: runsAfterSchedule.length,
    followUpCreated: followUpCreatedAfterSchedule,
    progressionUnchanged: progressionUnchanged && progressionUnchangedAfterSchedule,
    enabledThenPaused: true,
    runNowEnabledWhileRuleEnabled,
    scheduleSavedAndRevised: true,
    scheduleRunNowDisabled: scheduleRunNowDisabled && scheduleRunNowDisabledAfterRevision,
    scheduleNextRunAt: weeklyNextRunAt,
    scheduleTrigger: {
      questId: weeklyTrigger.questId,
      timeZone: weeklyTrigger.timeZone,
      localTime: weeklyTrigger.localTime,
      cadence: "weekly",
      weekdays: weeklyTrigger.weekdays || [],
      startDate: weeklyTrigger.startDate,
      endDate: weeklyTrigger.endDate || null,
      maxOccurrences: weeklyTrigger.maxOccurrences || 0,
      missedRunPolicy: "run_once",
    },
  };

    stage = "delete the synthetic automation through the rendered control";
    const deleteResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.origin === BASE_URL.origin && url.pathname === `/api/automations/${automationId}` && response.request().method() === "DELETE";
  }, { timeout: 30_000 });
    page.once("dialog", async (dialog) => dialog.accept());
    await activateRenderedControl(page, '[data-testid="automation-delete"]');
    const deleteResponse = await deleteResponsePromise;
    assert(deleteResponse.status() === 204, `Rendered automation deletion failed (${deleteResponse.status()}).`);
    automationDeleted = true;
    const listAfterDelete = await browserApiRequest(page, "/api/automations");
    const remaining = (listAfterDelete.body as { automations?: Array<{ id?: unknown }> } | null)?.automations || [];
    assert(listAfterDelete.status === 200 && !remaining.some((automation) => Number(automation.id) === automationId), "Deleted synthetic automation remained in the owner list.");
    return evidence;
  } catch (error) {
    throw new Error(`Automation control journey could not ${stage}: ${sanitizedMessage(error)}`);
  }
}

async function activateRenderedControl(page: Page, selector: string): Promise<void> {
  await page.waitForSelector(selector, { visible: true, timeout: 30_000 });
  await page.evaluate((controlSelector) => {
    const control = document.querySelector<HTMLElement>(controlSelector);
    if (!control) throw new Error(`Rendered control disappeared before activation: ${controlSelector}`);
    control.click();
  }, selector);
}

async function activateMissionControl(page: Page, action: "start" | "done" | "undo"): Promise<void> {
  assert(missionId !== null, `Cannot activate ${action} without a synthetic Mission.`);
  const cardSelector = `[data-testid="mission-card-${missionId}"]`;
  const selector = `[data-testid="mission-${action}-${missionId}"]`;
  const label = ({ start: "Start", done: "Done", undo: "Undo" } as const)[action];
  await page.waitForSelector(cardSelector, { visible: true, timeout: 30_000 });
  await page.waitForFunction(({ cardSelector: ownedCard, controlSelector, controlLabel }) => {
    const card = document.querySelector<HTMLElement>(ownedCard);
    if (!card) return false;
    const control = document.querySelector<HTMLElement>(controlSelector)
      || Array.from(card.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.trim() === controlLabel);
    if (!control || !card.contains(control)) return false;
    const style = getComputedStyle(control);
    return style.display !== "none" && style.visibility !== "hidden" && control.getClientRects().length > 0;
  }, { timeout: 30_000 }, { cardSelector, controlSelector: selector, controlLabel: label });
  await page.evaluate(({ cardSelector: ownedCard, controlSelector, controlLabel }) => {
    const card = document.querySelector<HTMLElement>(ownedCard);
    const control = document.querySelector<HTMLElement>(controlSelector)
      || Array.from(card?.querySelectorAll<HTMLButtonElement>("button") || []).find((button) => button.textContent?.trim() === controlLabel);
    if (!card || !control || !card.contains(control)) throw new Error(`Rendered ${controlLabel} control disappeared before activation.`);
    control.scrollIntoView({ block: "center", inline: "nearest" });
    control.click();
  }, { cardSelector, controlSelector: selector, controlLabel: label });
}

async function waitForMissionToggle(page: Page, action: () => Promise<void>): Promise<{ quest?: { completed?: boolean }; xpAwarded?: number }> {
  assert(missionId !== null, "Cannot observe a Mission toggle without a synthetic Mission.");
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.origin === BASE_URL.origin && url.pathname === `/api/quests/${missionId}/toggle` && response.request().method() === "POST";
  }, { timeout: 30_000 });
  await action();
  const response = await responsePromise;
  const body = await response.json() as { quest?: { completed?: boolean }; xpAwarded?: number; error?: unknown };
  assert(response.ok(), `Rendered Mission completion change failed (${response.status()}).`);
  return body;
}

async function dismissBlockingTutorial(page: Page): Promise<boolean> {
  const selector = 'button[aria-label="Skip this tutorial"]';
  const control = await page.$(selector);
  if (!control) return false;
  const visible = await control.evaluate((element) => {
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
  });
  if (!visible) return false;
  // Trigger the control through the DOM so the tutorial's moving spotlight
  // cannot make Puppeteer's coordinate-based click land on stale geometry.
  await page.evaluate((tutorialSelector) => {
    const button = document.querySelector<HTMLButtonElement>(tutorialSelector);
    if (!button) throw new Error("Tutorial skip control disappeared before dismissal.");
    button.click();
  }, selector);
  await page.waitForSelector(selector, { hidden: true, timeout: 10_000 });
  return true;
}

async function inspectMissionView(page: Page, viewport: string): Promise<ViewEvidence> {
  const evidence = await page.evaluate(({ missionTitle, purpose, evidenceSummary }) => {
    const bodyText = document.body.innerText;
    const controls = Array.from(document.querySelectorAll<HTMLElement>("button,input,select,textarea"));
    const unlabeledControls = controls.filter((element) => {
      if (element.getAttribute("aria-hidden") === "true") return false;
      if (element instanceof HTMLInputElement && element.type === "hidden") return false;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || element.getClientRects().length === 0) return false;
      const id = element.id;
      const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
      const name = element.getAttribute("aria-label") || element.getAttribute("aria-labelledby") || element.getAttribute("title") || element.textContent?.trim();
      return !label && !element.closest("label") && !name;
    }).slice(0, 20).map((element) => `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${element.getAttribute("data-testid") ? `[data-testid=${element.getAttribute("data-testid")}]` : ""}`);
    const documentWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    return {
      titleVisible: bodyText.includes(missionTitle),
      proofPlanVisible: bodyText.includes(purpose) && bodyText.includes("accepted"),
      evidenceVisible: bodyText.includes(evidenceSummary) && bodyText.includes("artifact") && bodyText.includes("medium"),
      mainCount: document.querySelectorAll("main,[role=main]").length,
      headingCount: document.querySelectorAll("h1,h2,h3,h4,h5,h6,[role=heading]").length,
      unlabeledControls,
      horizontalOverflowPx: Math.max(0, documentWidth - window.innerWidth),
    };
  }, { missionTitle: MISSION_TITLE, purpose: PURPOSE, evidenceSummary: EVIDENCE_SUMMARY });
  return { viewport, ...evidence };
}

async function requireMissionView(page: Page, viewport: string): Promise<void> {
  await page.waitForFunction(
    ({ missionTitle, purpose, evidenceSummary }) => {
      const text = document.body.innerText;
      return text.includes(missionTitle) && text.includes(purpose) && text.includes(evidenceSummary);
    },
    { timeout: 30_000 },
    { missionTitle: MISSION_TITLE, purpose: PURPOSE, evidenceSummary: EVIDENCE_SUMMARY },
  );
  const evidence = await inspectMissionView(page, viewport);
  views.push(evidence);
  assert(evidence.titleVisible && evidence.proofPlanVisible && evidence.evidenceVisible, `${viewport} did not render the saved Mission proof and evidence state.`);
  assert(evidence.mainCount === 1, `${viewport} rendered ${evidence.mainCount} main landmarks.`);
  assert(evidence.headingCount > 0, `${viewport} rendered no heading.`);
  assert(evidence.unlabeledControls.length === 0, `${viewport} rendered unlabeled controls: ${evidence.unlabeledControls.join(", ")}.`);
  assert(evidence.horizontalOverflowPx <= 2, `${viewport} rendered ${evidence.horizontalOverflowPx}px horizontal overflow.`);
}

async function requireThreadContinuityView(input: {
  page: Page;
  phase: "reviewed" | "reversed";
  expectedEventDelta: number;
  expectedCapabilityExperience?: number;
}): Promise<ThreadContinuityEvidence> {
  const { page, phase, expectedEventDelta, expectedCapabilityExperience } = input;
  assert(missionId !== null && reviewedSkillNodeId !== null, "Thread continuity requires the reviewed synthetic Mission and its skill node.");
  await page.goto(new URL("/dashboard", BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector('[data-testid="transformation-thread-panel"]', { visible: true, timeout: 30_000 });
  await page.waitForSelector('[data-testid="thread-current-path"]', { visible: true, timeout: 30_000 });
  await page.waitForSelector('[data-testid="capability-constellation"]', { visible: true, timeout: 30_000 });

  const threadResponse = await browserApiRequest(page, "/api/transformation-thread");
  const thread = (threadResponse.body as {
    thread?: {
      id?: unknown;
      status?: unknown;
      focus?: unknown;
      skills?: Array<{ id?: unknown; name?: unknown; capabilityId?: unknown }>;
      skillGraph?: {
        nodes?: Array<{ id?: unknown }>;
        nextPractice?: null | { skillNodeId?: unknown; skillName?: unknown; questId?: unknown; title?: unknown };
      };
    };
  } | null)?.thread;
  assert(threadResponse.status === 200 && thread, `Rendered Thread continuity API returned ${threadResponse.status}.`);
  const threadId = Number(thread.id);
  const threadStatus = String(thread.status || "");
  const objective = String(thread.focus || "");
  const reviewedSkill = (thread.skills || []).find((skill) => Number(skill.id) === reviewedSkillNodeId);
  const capabilityId = Number(reviewedSkill?.capabilityId);
  const nextPractice = thread.skillGraph?.nextPractice;
  assert(Number.isInteger(threadId) && ["active", "paused"].includes(threadStatus), "Rendered Thread continuity did not resolve an active or paused owned Thread.");
  assert(reviewedSkill && typeof reviewedSkill.capabilityId === "number" && Number.isInteger(capabilityId) && capabilityId > 0, "Reviewed skill was not linked to a durable private capability.");
  assert(nextPractice && typeof nextPractice.skillNodeId === "number" && Number.isInteger(nextPractice.skillNodeId), "Current Thread did not expose one canonical next practice.");

  const [capabilitiesResponse, historyResponse] = await Promise.all([
    browserApiRequest(page, "/api/capabilities"),
    browserApiRequest(page, `/api/capabilities/${capabilityId}/history`),
  ]);
  const capabilitySummary = ((capabilitiesResponse.body as { capabilities?: Array<{ id?: unknown; focusCount?: unknown }> } | null)?.capabilities || [])
    .find((capability) => Number(capability.id) === capabilityId);
  const history = historyResponse.body as {
    capability?: { id?: unknown; name?: unknown; experience?: unknown };
    focuses?: Array<{ threadId?: unknown }>;
    events?: Array<{ id?: unknown; questId?: unknown; sourceType?: unknown; reversalOfId?: unknown; experienceDelta?: unknown }>;
    disclosure?: unknown;
  } | null;
  const expectedEventType = phase === "reviewed" ? "mission_evidence_review" : "mission_evidence_reversal";
  const matchingEvent = (history?.events || []).find((event) => Number(event.questId) === missionId
    && event.sourceType === expectedEventType
    && Number(event.experienceDelta) === expectedEventDelta);
  const capabilityExperience = Number(history?.capability?.experience);
  const focusCount = Number(capabilitySummary?.focusCount);
  assert(capabilitiesResponse.status === 200 && capabilitySummary && Number.isInteger(focusCount) && focusCount >= 1, "Capability summary did not preserve an owned focus period.");
  assert(historyResponse.status === 200 && Number(history?.capability?.id) === capabilityId && Number.isFinite(capabilityExperience), "Durable capability history did not reconcile to its owned capability.");
  assert((history?.focuses || []).some((focus) => Number(focus.threadId) === threadId), "Durable capability history omitted the current Thread focus period.");
  assert(typeof history?.disclosure === "string" && history.disclosure.includes("not certification"), "Durable capability history omitted its non-certification boundary.");
  assert(matchingEvent && typeof matchingEvent.id === "number" && Number.isInteger(matchingEvent.id), `Durable capability history omitted the synthetic Mission's ${expectedEventType} event.`);
  if (expectedCapabilityExperience !== undefined) {
    assert(capabilityExperience === expectedCapabilityExperience, `Durable capability history showed ${capabilityExperience} XP instead of the expected ${expectedCapabilityExperience}.`);
  }
  if (phase === "reversed") {
    assert(typeof matchingEvent.reversalOfId === "number" && Number.isInteger(matchingEvent.reversalOfId), "Capability reversal did not reference the reviewed event it reversed.");
  }

  const historyToggle = `[data-testid="capability-history-toggle-${reviewedSkillNodeId}"]`;
  await page.waitForSelector(historyToggle, { visible: true, timeout: 30_000 });
  await page.click(historyToggle);
  await page.waitForSelector(`[data-testid="capability-history-${capabilityId}"] [data-testid="capability-history-reviewed-xp"]`, { visible: true, timeout: 30_000 });
  await page.waitForSelector(`[data-testid="capability-history-event-${matchingEvent.id}"]`, { visible: true, timeout: 30_000 });
  const rendered = await page.evaluate(`
    (() => {
      const text = (selector) => document.querySelector(selector)?.textContent?.replace(/\\s+/g, " ").trim() || "";
      return {
        constellationNodeCount: document.querySelectorAll('[data-testid^="capability-constellation-node-"]').length,
        currentPathText: text('[data-testid="thread-current-path"]'),
        currentPathSkill: text('[data-testid="thread-current-path-skill"]'),
        currentPathObjective: text('[data-testid="thread-current-path-objective"]'),
        currentPathTitle: text('[data-testid="thread-current-path-title"]'),
        method: text('[data-testid="thread-current-path-method"]'),
        proof: text('[data-testid="thread-current-path-proof"]'),
        support: text('[data-testid="thread-current-path-support"]'),
        advancement: text('[data-testid="thread-current-path-advancement"]'),
        pathDisclosure: text('[data-testid="thread-current-path-disclosure"]'),
        capabilityName: text('[data-testid="capability-history-name"]'),
        capabilityExperience: text('[data-testid="capability-history-reviewed-xp"]'),
        capabilityDisclosure: text('[data-testid="capability-history-disclosure"]'),
        capabilityHistoryText: text('[data-testid="capability-history-${capabilityId}"]'),
        focusVisible: Boolean(document.querySelector('[data-testid="capability-focus-${threadId}"]')),
      };
    })()
  `) as {
    constellationNodeCount: number;
    currentPathText: string;
    currentPathSkill: string;
    currentPathObjective: string;
    currentPathTitle: string;
    method: string;
    proof: string;
    support: string;
    advancement: string;
    pathDisclosure: string;
    capabilityName: string;
    capabilityExperience: string;
    capabilityDisclosure: string;
    capabilityHistoryText: string;
    focusVisible: boolean;
  };
  const graphNodeCount = thread.skillGraph?.nodes?.length || 0;
  const nextSkillName = String(nextPractice.skillName || "");
  const nextTitle = String(nextPractice.title || "");
  assert(rendered.constellationNodeCount === graphNodeCount && graphNodeCount > 0, "Rendered capability constellation did not match the current Thread graph.");
  assert(rendered.currentPathSkill.includes(nextSkillName) && rendered.currentPathObjective.includes(objective) && rendered.currentPathTitle === nextTitle, "Rendered current path did not match the authenticated Thread recommendation.");
  assert(rendered.method.includes("Method and tools") && rendered.proof.includes("Proof standard") && rendered.support.includes("Support and review") && rendered.advancement.includes("Advancement"), "Rendered current path omitted a required execution or evidence answer.");
  assert(rendered.pathDisclosure.includes("not certification") && rendered.pathDisclosure.includes("authority") && rendered.pathDisclosure.includes("personal worth"), "Rendered current path omitted its evidence and authority boundary.");
  assert(rendered.capabilityName === String(history?.capability?.name || "") && rendered.capabilityExperience.includes(`${capabilityExperience} reviewed XP`), "Rendered durable capability total did not match its authenticated history.");
  assert(rendered.capabilityDisclosure.includes("not certification") && rendered.focusVisible, "Rendered capability history omitted its focus or truth boundary.");
  assert(rendered.capabilityHistoryText.includes(`${expectedEventDelta > 0 ? "+" : ""}${expectedEventDelta} XP`) && rendered.capabilityHistoryText.includes(expectedEventType.replaceAll("_", " ")), "Rendered capability history omitted the expected reviewed progression event.");

  return {
    phase,
    threadId,
    threadStatus,
    currentPath: {
      skillNodeId: nextPractice.skillNodeId,
      skillName: nextSkillName,
      missionId: typeof nextPractice.questId === "number" && Number.isInteger(nextPractice.questId) ? nextPractice.questId : null,
      title: nextTitle,
      objective,
    },
    capability: {
      id: capabilityId,
      name: String(history?.capability?.name || ""),
      reviewedExperience: capabilityExperience,
      focusCount,
      eventId: matchingEvent.id,
      eventType: expectedEventType,
      eventDelta: expectedEventDelta,
      reversesEventId: typeof matchingEvent.reversalOfId === "number" && Number.isInteger(matchingEvent.reversalOfId) ? matchingEvent.reversalOfId : null,
    },
    rendered: {
      constellationNodeCount: rendered.constellationNodeCount,
      currentPathText: rendered.currentPathText,
      capabilityHistoryText: rendered.capabilityHistoryText,
    },
  };
}

async function cleanupAutomation(page: Page): Promise<void> {
  if (automationId === null) return;
  automationCleanupAttempted = true;
  const list = await browserApiRequest(page, "/api/automations");
  const automations = (list.body as { automations?: Array<{ id?: unknown }> } | null)?.automations || [];
  assert(list.status === 200, `Synthetic automation cleanup preflight returned ${list.status}.`);
  if (automations.some((automation) => Number(automation.id) === automationId)) {
    const deleted = await browserApiRequest(page, `/api/automations/${automationId}`, "DELETE");
    assert(deleted.status === 204, `Synthetic automation cleanup returned ${deleted.status}.`);
  }
  const verification = await browserApiRequest(page, "/api/automations");
  const remaining = (verification.body as { automations?: Array<{ id?: unknown }> } | null)?.automations || [];
  assert(verification.status === 200 && !remaining.some((automation) => Number(automation.id) === automationId), "Synthetic automation still existed after cleanup.");
  automationDeleted = true;
}

async function cleanupMission(page: Page): Promise<void> {
  if (missionId === null) return;
  cleanupAttempted = true;
  await waitForApiBudget(page, 5);
  const session = await browserApiRequest(page, "/api/auth/me");
  const userId = Number((session.body as { user?: { id?: unknown } } | null)?.user?.id);
  assert(session.status === 200 && Number.isInteger(userId), "Synthetic Mission cleanup could not resolve its owner.");
  const missionsResponse = await browserApiRequest(page, `/api/users/${userId}/quests`);
  const mission = ((missionsResponse.body as { quests?: Array<{ id?: unknown; completed?: unknown }> } | null)?.quests || [])
    .find((candidate) => Number(candidate.id) === missionId);
  assert(missionsResponse.status === 200 && mission, "Synthetic Mission cleanup could not resolve the active Mission.");
  if (mission.completed === true) {
    const reopened = await browserApiRequest(page, `/api/quests/${missionId}/toggle`, "POST");
    assert(reopened.status === 200 && (reopened.body as { quest?: { completed?: unknown } } | null)?.quest?.completed === false, "Synthetic Mission cleanup could not reverse its progression before archival.");
  }
  const cleanup = await browserApiRequest(page, `/api/quests/${missionId}`, "DELETE");
  assert(cleanup.status === 200, `Synthetic Mission cleanup returned ${cleanup.status}.`);
  const archivedResponse = await browserApiRequest(page, "/api/quests/archived");
  const archived = Array.isArray(archivedResponse.body) ? archivedResponse.body as Array<{ id?: unknown }> : [];
  assert(archivedResponse.status === 200 && archived.some((mission) => Number(mission.id) === missionId), "Synthetic Mission was not visible in the recoverable archive after cleanup.");
  cleanupArchived = true;
}

async function writeReport(): Promise<void> {
  const report = {
    contract: "lyfeos.production-core-loop-acceptance.v6",
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL.origin,
    source: SOURCE,
    harnessSource: HARNESS_SOURCE,
    runId: RUN_ID,
    syntheticMissionId: missionId,
    progression: {
      before: progressionBefore,
      afterUnreviewedEvidence: progressionAfterEvidence,
      afterCompletion: progressionAfterCompletion,
      afterPositiveReview: progressionAfterReview,
      afterRenderedReopen: progressionAfterReopen,
      afterCleanup: progressionAfterCleanup,
      unchangedBeforeReview: Boolean(progressionBefore && progressionAfterEvidence && progressionMatches(progressionBefore, progressionAfterEvidence)),
      expectedActivityExperience,
      reviewedSkillExperience,
      exactActivityAward: Boolean(progressionBefore && progressionAfterCompletion && progressionAfterCompletion.activityExperience - progressionBefore.activityExperience === expectedActivityExperience),
      reviewedCapabilityAward: Boolean(progressionAfterCompletion && progressionAfterReview && progressionAfterReview.capabilityExperience - progressionAfterCompletion.capabilityExperience === reviewedSkillExperience && reviewedSkillExperience > 0),
      noAuthorityGranted: Boolean(progressionAfterReview && progressionAfterReview.certifications.length === 0 && progressionAfterReview.entrustedRoles.length === 0),
      exactRenderedReversal: Boolean(progressionBefore && progressionAfterReopen && progressionMatches(progressionBefore, progressionAfterReopen)),
      unchangedAfterCleanup: Boolean(progressionBefore && progressionAfterCleanup && progressionMatches(progressionBefore, progressionAfterCleanup)),
    },
    threadContinuity: {
      afterPositiveReview: reviewedThreadContinuity,
      afterRenderedReopen: reversedThreadContinuity,
      exactCapabilityReversal: Boolean(reviewedThreadContinuity && reversedThreadContinuity
        && reviewedThreadContinuity.capability.id === reversedThreadContinuity.capability.id
        && reviewedThreadContinuity.capability.reviewedExperience - reviewedSkillExperience === reversedThreadContinuity.capability.reviewedExperience
        && reversedThreadContinuity.capability.reversesEventId === reviewedThreadContinuity.capability.eventId),
    },
    automationControls: automationControlEvidence,
    views,
    cleanup: {
      mission: { attempted: cleanupAttempted, archived: cleanupArchived },
      automation: { id: automationId, attempted: automationCleanupAttempted, deleted: automationDeleted },
    },
    steps,
    summary: { passed: failureMessage === null && cleanupArchived && automationDeleted && automationControlEvidence !== null, failure: failureMessage },
    boundary: "This journey proves one self-reviewed, skill-linked synthetic Mission plus a saved manual automation preview and explicit enable/pause cycle followed by disabled daily-schedule authoring, weekly revision, and preview, its rendered current path, private capability graph, durable focus history, and exact reviewed-capability reversal. Preview, enable, pause, and disabled schedule authoring write no execution receipt, follow-up Mission, or progression. The journey does not activate Run now or enable the scheduled rule. Activity XP recognizes completion; capability XP requires declared evidence plus positive self-review; reopening reverses both tracks and supported badges. LyfeOS grants no certification or authority.",
  } as const;
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (process.env.GITHUB_STEP_SUMMARY) {
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, [
      "## LyfeOS truthful Mission core-loop acceptance",
      "",
      `- Source: ${SOURCE}`,
      `- Result: ${report.summary.passed ? "PASS" : "FAIL"}`,
      `- Synthetic Mission archived: ${cleanupArchived}`,
      `- Progression unchanged before review: ${report.progression.unchangedBeforeReview}`,
      `- Exact activity XP awarded: ${report.progression.exactActivityAward}`,
      `- Reviewed capability XP awarded: ${report.progression.reviewedCapabilityAward}`,
      `- No certification or authority granted: ${report.progression.noAuthorityGranted}`,
      `- Rendered reopen restored the exact baseline: ${report.progression.exactRenderedReversal}`,
      `- Rendered Thread and capability history reconciled after review and reversal: ${report.threadContinuity.exactCapabilityReversal}`,
      `- Manual preview/enable/pause plus disabled schedule save/revision/preview created no run, Mission, or progression: ${Boolean(report.automationControls && report.automationControls.runCount === 0 && !report.automationControls.followUpCreated && report.automationControls.progressionUnchanged && report.automationControls.enabledThenPaused && report.automationControls.runNowEnabledWhileRuleEnabled && report.automationControls.scheduleSavedAndRevised && report.automationControls.scheduleRunNowDisabled && report.automationControls.scheduleNextRunAt)}`,
      `- Synthetic automation deleted: ${automationDeleted}`,
      `- Desktop/mobile Mission Detail views qualified: ${views.length === 2}`,
      "",
      report.boundary,
      "",
    ].join("\n"), "utf8");
  }
}

async function main(): Promise<void> {
  if (BASE_URL.protocol !== "https:" && !["127.0.0.1", "localhost"].includes(BASE_URL.hostname)) throw new Error("Core-loop base URL must use HTTPS except for explicit localhost qualification.");
  if (!EMAIL || !PASSWORD) throw new Error("Core-loop acceptance requires the dedicated LYFEOS_ACCEPTANCE_EMAIL and LYFEOS_ACCEPTANCE_PASSWORD secrets.");
  if (!/^[0-9a-f]{40}$/.test(SOURCE)) throw new Error("Core-loop acceptance requires the exact 40-character deployed source revision.");
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: await findChromium(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.setCacheEnabled(false);

  try {
    await login(page);
    steps.push({ name: "authenticated dedicated account", status: "passed", detail: "Session and completed onboarding verified." });
    await waitForApiBudget(page, 80);
    const strandedMissionCount = await archiveStrandedSyntheticMissions(page);
    steps.push({ name: "synthetic Mission preflight", status: "passed", detail: strandedMissionCount > 0 ? `Archived ${strandedMissionCount} stranded synthetic Mission(s).` : "No stranded synthetic Missions were present." });
    const strandedAutomationCount = await deleteStrandedSyntheticAutomations(page);
    steps.push({ name: "synthetic automation preflight", status: "passed", detail: strandedAutomationCount > 0 ? `Deleted ${strandedAutomationCount} stranded synthetic automation(s).` : "No stranded synthetic automations were present." });
    const threadPreflight = await ensureAcceptanceThread(page);
    if (threadPreflight.fixturePrepared) {
      steps.push({ name: "dedicated account fixture prerequisites", status: "passed", detail: "Recorded the missing onboarding Mission IDs on the already completed, dedicated acceptance account before its first truthful Thread initialization." });
    }
    steps.push({ name: "onboarding-derived Thread preflight", status: "passed", detail: threadPreflight.state === "existing" ? "The dedicated account already had an active onboarding-derived Thread." : "Activated the dedicated account's onboarding-derived draft Thread using the same product APIs as the rendered onboarding journey." });
    await page.goto(new URL("/missions", BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector('[data-tour="create-mission"]', { visible: true, timeout: 30_000 });
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    progressionBefore = await readStableProgression(page);
    steps.push({ name: "settled progression baseline", status: "passed", detail: "Captured a stable baseline after any legitimate one-time onboarding reconciliation completed." });
    const tutorialDismissed = await dismissBlockingTutorial(page);
    steps.push({ name: "first-use tutorial boundary", status: "passed", detail: tutorialDismissed ? "Dismissed the visible tutorial through its named Skip control." : "No blocking tutorial was presented." });
    await activateRenderedControl(page, '[data-tour="create-mission"]');
    await fill(page, "#create-title", MISSION_TITLE);
    const skillSelector = '[data-testid^="mission-skill-"]:not([disabled])';
    await page.waitForSelector(skillSelector, { visible: true, timeout: 30_000 });
    const selectedSkill = await page.$eval(skillSelector, (element) => ({
      testId: element.getAttribute("data-testid"),
      name: element.getAttribute("data-skill-name"),
    }));
    assert(selectedSkill.testId && selectedSkill.name, "The dedicated acceptance account has no selectable unlocked skill for reviewed progression qualification.");
    const selectedSkillMatch = /^mission-skill-(\d+)$/.exec(selectedSkill.testId);
    reviewedSkillNodeId = Number(selectedSkillMatch?.[1]);
    assert(Number.isInteger(reviewedSkillNodeId), "The selected Mission skill did not expose its owned skill-node identifier.");
    await activateRenderedControl(page, `[data-testid="${selectedSkill.testId}"]`);
    await page.waitForFunction((testId) => document.querySelector(`[data-testid="${testId}"]`)?.getAttribute("aria-checked") === "true", { timeout: 10_000 }, selectedSkill.testId);
    const createResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.origin === BASE_URL.origin && url.pathname === "/api/quests" && response.request().method() === "POST";
    }, { timeout: 30_000 });
    await page.click('[data-testid="mission-create-submit"]');
    const createResponse = await createResponsePromise;
    const createBody = await createResponse.json() as { quest?: { id?: number; experienceReward?: number; difficulty?: string }; error?: unknown };
    assert(createResponse.ok() && Number.isInteger(createBody.quest?.id), `Rendered Mission creation failed (${createResponse.status()}).`);
    missionId = createBody.quest!.id!;
    const activityMultiplier = ({ D: 1, C: 1.5, B: 2, A: 3, S: 5 } as Record<string, number>)[createBody.quest?.difficulty || "D"] || 1;
    expectedActivityExperience = Math.floor(Number(createBody.quest?.experienceReward || 0) * activityMultiplier);
    assert(expectedActivityExperience > 0, "Created Mission did not expose a positive, difficulty-adjusted activity XP value.");
    steps.push({ name: "rendered Mission creation", status: "passed", detail: `Canonical UI created one synthetic Mission linked to the unlocked ${selectedSkill.name} skill.` });

    await page.goto(new URL(`/mission/${missionId}`, BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForFunction((title) => document.body.innerText.includes(title), { timeout: 30_000 }, MISSION_TITLE);
    await waitForApiBudget(page, 60);
    await page.waitForFunction(() => Boolean(
      document.querySelector('[data-testid="proof-plan-purpose"]')
      || document.querySelector('[data-testid="proof-plan-edit"]'),
    ), { timeout: 30_000 });
    if (await page.$('[data-testid="proof-plan-edit"]')) {
      await activateRenderedControl(page, '[data-testid="proof-plan-edit"]');
    }
    await fill(page, '[data-testid="proof-plan-purpose"]', PURPOSE);
    await fill(page, '[data-testid="proof-plan-output"]', EXPECTED_OUTPUT);
    await fill(page, '[data-testid="proof-plan-method"]', "Create one bounded synthetic Mission.\nAttach one synthetic browser receipt.\nComplete through the focus-timer workflow.\nReview only the declared evidence.\nReopen and verify exact reversal.");
    await fill(page, '[data-testid="proof-plan-tools"]', "LyfeOS production browser acceptance");
    await fill(page, '[data-testid="proof-plan-evidence-requirement"]', REQUIRED_EVIDENCE);
    const contractResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.origin === BASE_URL.origin && url.pathname === `/api/quests/${missionId}/contract` && response.request().method() === "PUT";
    }, { timeout: 30_000 });
    await page.click('[data-testid="proof-plan-save"]');
    const contractResponse = await contractResponsePromise;
    assert(contractResponse.ok(), `Rendered proof-plan save failed (${contractResponse.status()}).`);
    await page.waitForFunction((purpose) => document.body.innerText.includes(purpose), { timeout: 30_000 }, PURPOSE);
    steps.push({ name: "truthful proof plan", status: "passed", detail: "Purpose, method, observable output, evidence rubric, low risk, and self-review boundary persisted." });

    await page.select('[data-testid="mission-evidence-source"]', "artifact");
    await page.select('[data-testid="mission-evidence-confidence"]', "medium");
    await fill(page, '[data-testid="mission-evidence-reference"]', `urn:lyfeos:acceptance:${RUN_ID}`);
    await fill(page, '[data-testid="mission-evidence-summary"]', EVIDENCE_SUMMARY);
    const evidenceResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.origin === BASE_URL.origin && url.pathname === `/api/quests/${missionId}/evidence` && response.request().method() === "POST";
    }, { timeout: 30_000 });
    await page.click('[data-testid="mission-evidence-add"]');
    const evidenceResponse = await evidenceResponsePromise;
    assert(evidenceResponse.ok(), `Rendered evidence submission failed (${evidenceResponse.status()}).`);
    await page.waitForFunction((summary) => document.body.innerText.includes(summary), { timeout: 30_000 }, EVIDENCE_SUMMARY);
    progressionAfterEvidence = await readProgression(page);
    assert(progressionMatches(progressionBefore, progressionAfterEvidence), "Unreviewed Mission evidence changed activity XP, capability XP, or active badges.");
    steps.push({ name: "unreviewed evidence boundary", status: "passed", detail: "Artifact evidence persisted without changing activity XP, capability XP, or badges." });

    automationControlEvidence = await exerciseNonMutatingAutomationControls(page);
    steps.push({ name: "rendered non-mutating automation controls", status: "passed", detail: "Created and saved one bounded manual rule, matched the synthetic Mission in Preview, explicitly enabled then paused it, proved Run now was available only while enabled, converted the paused rule to a disabled daily schedule, revised it to selected weekdays, proved a future next occurrence and unavailable Run now, previewed again, proved zero run receipts, follow-up Missions, and progression changes, then deleted the rule through the rendered control." });

    await page.goto(new URL(`/mission/${missionId}`, BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForFunction((title) => document.body.innerText.includes(title), { timeout: 30_000 }, MISSION_TITLE);
    await requireMissionView(page, "desktop-1440x900");
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
    await requireMissionView(page, "mobile-390x844");
    steps.push({ name: "dynamic Mission Detail rendering", status: "passed", detail: "Saved proof and evidence state passed desktop/mobile semantics and overflow checks." });

    // Responsive rendering and automation preview share the account's aggregate
    // API window. Refill before the first rendered state change so the result
    // measures Mission semantics instead of harness traffic volume.
    await waitForApiBudget(page, 45);
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.goto(new URL("/missions", BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector(`[data-testid="mission-card-${missionId}"]`, { visible: true, timeout: 30_000 });
    await activateMissionControl(page, "start");
    await page.waitForSelector('[data-testid="mission-timer-stop"]', { visible: true, timeout: 30_000 });
    await activateRenderedControl(page, '[data-testid="mission-timer-stop"]');
    const completedBody = await waitForMissionToggle(page, () => activateMissionControl(page, "done"));
    assert(completedBody.quest?.completed === true, "Rendered Mission Done control did not produce a completed Mission.");
    assert(completedBody.xpAwarded === expectedActivityExperience, `Mission awarded ${completedBody.xpAwarded ?? "unknown"} activity XP instead of ${expectedActivityExperience}.`);
    progressionAfterCompletion = await readProgression(page);
    assert(progressionAfterCompletion.activityExperience - progressionBefore.activityExperience === expectedActivityExperience, "Completion did not produce the exact difficulty-adjusted activity XP delta.");
    assert(progressionAfterCompletion.capabilityExperience === progressionBefore.capabilityExperience, "Completion awarded capability XP before evidence review.");
    assert(progressionAfterCompletion.certifications.length === 0 && progressionAfterCompletion.entrustedRoles.length === 0, "Completion created an unsupported certification or authority record.");
    steps.push({ name: "rendered timer-backed completion", status: "passed", detail: `Start, stop, and Done awarded exactly ${expectedActivityExperience} activity XP while capability XP remained withheld.` });

    await waitForApiBudget(page, 40);
    await page.goto(new URL(`/mission/${missionId}`, BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await fill(page, '[data-testid="mission-self-review-summary"]', REVIEW_SUMMARY);
    await page.waitForSelector('[data-testid="mission-review-requirement-0"]', { visible: true, timeout: 30_000 });
    await page.click('[data-testid="mission-review-requirement-0"]');
    await page.waitForSelector('[data-testid="mission-self-review-submit"]:not([disabled])', { visible: true, timeout: 10_000 });
    const reviewResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.origin === BASE_URL.origin && url.pathname === `/api/quests/${missionId}/reviews` && response.request().method() === "POST";
    }, { timeout: 30_000 });
    await page.click('[data-testid="mission-self-review-submit"]');
    const reviewResponse = await reviewResponsePromise;
    const reviewBody = await reviewResponse.json() as { progression?: { applied?: boolean; skillExperienceAwarded?: number }; error?: unknown };
    assert(reviewResponse.ok(), `Rendered self-review failed (${reviewResponse.status()}).`);
    reviewedSkillExperience = Number(reviewBody.progression?.skillExperienceAwarded || 0);
    assert(reviewBody.progression?.applied === true && reviewedSkillExperience > 0, "Positive evidence review did not apply a positive skill contribution.");
    progressionAfterReview = await readProgression(page);
    assert(progressionAfterReview.activityExperience === progressionAfterCompletion.activityExperience, "Evidence review changed activity XP after completion.");
    assert(progressionAfterReview.capabilityExperience - progressionAfterCompletion.capabilityExperience === reviewedSkillExperience, "Capability XP did not match the server-recorded reviewed skill contribution.");
    assert(progressionAfterReview.certifications.length === 0 && progressionAfterReview.entrustedRoles.length === 0, "Self-review created unsupported certification or authority.");
    steps.push({ name: "rendered positive self-review", status: "passed", detail: `Declared evidence review applied exactly ${reviewedSkillExperience} capability XP and no certification or authority.` });

    await waitForApiBudget(page, 45);
    reviewedThreadContinuity = await requireThreadContinuityView({
      page,
      phase: "reviewed",
      expectedEventDelta: reviewedSkillExperience,
    });
    steps.push({ name: "rendered current path and durable capability history", status: "passed", detail: `The dashboard reconciled its canonical current path, ${reviewedThreadContinuity.rendered.constellationNodeCount}-node private capability graph, current focus, and +${reviewedSkillExperience} XP reviewed event to authenticated state.` });

    await waitForApiBudget(page, 40);
    await page.goto(new URL("/experience", BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector('[data-testid="activity-total-experience"]', { visible: true, timeout: 30_000 });
    await page.waitForSelector('[data-testid="activity-ledger-history"]', { timeout: 30_000 });
    // Evaluate a literal browser script so the TypeScript runner cannot wrap
    // this evidence reader with host-only helpers such as `__name` before
    // Puppeteer serializes it into the page.
    const renderedProgression = await page.evaluate(`
      (() => {
        const total = document.querySelector('[data-testid="activity-total-experience"]')?.textContent;
        const rows = Array.from(document.querySelectorAll('[data-testid="activity-ledger-history"] tbody tr'));
        const lastCumulative = rows.at(-1)?.querySelector("td:last-child")?.textContent;
        return {
          activityExperience: Number((total || "").replace(/[^0-9-]/g, "")),
          endingExperience: Number((lastCumulative || "").replace(/[^0-9-]/g, "")),
          text: document.body.innerText,
        };
      })()
    `) as { activityExperience: number; endingExperience: number; text: string };
    assert(renderedProgression.activityExperience === progressionAfterReview.activityExperience, "Rendered Experience total did not match the authoritative activity ledger.");
    assert(renderedProgression.endingExperience === progressionAfterReview.activityExperience, "Rendered activity history did not reconcile to the current activity total.");
    assert(renderedProgression.text.includes(`${progressionAfterReview.capabilityExperience} reviewed XP`), "Rendered Experience view did not preserve the separate reviewed-capability total.");
    assert(renderedProgression.text.includes("Certification & authority"), "Rendered Experience view omitted the authority boundary.");
    steps.push({ name: "rendered progression visualization", status: "passed", detail: "Activity total and bounded reversal-aware ledger history reconciled exactly; reviewed capability and authority remained separate." });

    // The broad protected-route sweep and this evidence journey intentionally
    // share the production account's aggregate API budget. Refill before the
    // final rendered mutation so Undo is measuring reversal semantics rather
    // than the acceptance harness's own traffic volume.
    await waitForApiBudget(page, 30);
    await page.goto(new URL("/missions", BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    const reopenedBody = await waitForMissionToggle(page, () => activateMissionControl(page, "undo"));
    assert(reopenedBody.quest?.completed === false, "Rendered Mission Undo control did not reopen the Mission.");
    progressionAfterReopen = await readProgression(page);
    assert(progressionMatches(progressionBefore, progressionAfterReopen), "Rendered reopen did not restore activity XP, capability XP, badges, and authority to the exact baseline.");
    const reopenedContract = await browserApiRequest(page, `/api/quests/${missionId}/contract`);
    assert(reopenedContract.status === 200 && (reopenedContract.body as { unlockResult?: { state?: unknown } } | null)?.unlockResult?.state === "declared", "Reopened Mission still presented its reviewed skill contribution as applied.");
    steps.push({ name: "rendered progression reversal", status: "passed", detail: "Undo reopened the Mission and restored the exact pre-journey progression snapshot; reviewed skill XP returned to declared-only state." });

    await waitForApiBudget(page, 35);
    assert(reviewedThreadContinuity, "Reviewed Thread continuity evidence was unavailable before reversal qualification.");
    reversedThreadContinuity = await requireThreadContinuityView({
      page,
      phase: "reversed",
      expectedEventDelta: -reviewedSkillExperience,
      expectedCapabilityExperience: reviewedThreadContinuity.capability.reviewedExperience - reviewedSkillExperience,
    });
    assert(reversedThreadContinuity.capability.reversesEventId === reviewedThreadContinuity.capability.eventId, "Rendered capability history reversal did not reference the reviewed event it reversed.");
    steps.push({ name: "rendered capability-history reversal", status: "passed", detail: `The same durable capability returned to ${reversedThreadContinuity.capability.reviewedExperience} reviewed XP and rendered a -${reviewedSkillExperience} XP reversal linked to the reviewed event.` });
  } catch (error) {
    failureMessage = sanitizedMessage(error);
    steps.push({ name: "core-loop journey", status: "failed", detail: failureMessage });
    try {
      await page.screenshot({ path: path.join(OUTPUT_DIR, "core-loop-failure.png"), fullPage: true });
    } catch {
      // Structured evidence and cleanup remain authoritative if capture fails.
    }
  } finally {
    try {
      await cleanupAutomation(page);
      if (automationId !== null) steps.push({ name: "synthetic automation cleanup", status: "passed", detail: "Automation was absent after the rendered deletion or idempotent owner-scoped cleanup." });
    } catch (cleanupError) {
      const message = sanitizedMessage(cleanupError);
      failureMessage = failureMessage ? `${failureMessage}; automation cleanup: ${message}` : `automation cleanup: ${message}`;
      steps.push({ name: "synthetic automation cleanup", status: "failed", detail: message });
    }
    try {
      await cleanupMission(page);
      if (missionId !== null) steps.push({ name: "synthetic Mission cleanup", status: "passed", detail: "Mission archived through the canonical recoverable deletion route." });
      progressionAfterCleanup = await readProgression(page);
      if (progressionBefore) assert(progressionMatches(progressionBefore, progressionAfterCleanup), "Progression did not return to its exact pre-journey snapshot after cleanup.");
    } catch (cleanupError) {
      const message = sanitizedMessage(cleanupError);
      failureMessage = failureMessage ? `${failureMessage}; cleanup: ${message}` : `cleanup: ${message}`;
      steps.push({ name: "synthetic Mission cleanup", status: "failed", detail: message });
    }
    await browser.close();
    await writeReport();
  }

  console.log(`Wrote ${OUTPUT_FILE}`);
  if (failureMessage || !cleanupArchived || !automationDeleted || !automationControlEvidence) {
    console.error(failureMessage || "Synthetic Mission or automation qualification/cleanup did not complete.");
    process.exitCode = 1;
  } else {
    console.log("Truthful Mission and automation acceptance passed; preview plus enable/pause were non-mutating, completion and review were awarded accurately, and rendered reopen restored the exact baseline before cleanup.");
  }
}

main().catch(async (error) => {
  failureMessage = sanitizedMessage(error);
  try {
    await writeReport();
  } catch {
    // Preserve the original setup error.
  }
  console.error(failureMessage);
  process.exitCode = 1;
});
