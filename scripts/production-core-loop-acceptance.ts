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
  await page.click(selector, { clickCount: 3 });
  await page.type(selector, value);
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
    contract: "lyfeos.production-core-loop-acceptance.v2",
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL.origin,
    source: SOURCE,
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
    views,
    cleanup: { attempted: cleanupAttempted, archived: cleanupArchived },
    steps,
    summary: { passed: failureMessage === null && cleanupArchived, failure: failureMessage },
    boundary: "This journey proves one self-reviewed, skill-linked synthetic Mission. Activity XP recognizes completion; capability XP requires declared evidence plus positive self-review; reopening reverses both tracks and supported badges. LyfeOS grants no certification or authority.",
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

    await requireMissionView(page, "desktop-1440x900");
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
    await requireMissionView(page, "mobile-390x844");
    steps.push({ name: "dynamic Mission Detail rendering", status: "passed", detail: "Saved proof and evidence state passed desktop/mobile semantics and overflow checks." });

    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
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

    await page.goto(new URL("/missions", BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    const reopenedBody = await waitForMissionToggle(page, () => activateMissionControl(page, "undo"));
    assert(reopenedBody.quest?.completed === false, "Rendered Mission Undo control did not reopen the Mission.");
    progressionAfterReopen = await readProgression(page);
    assert(progressionMatches(progressionBefore, progressionAfterReopen), "Rendered reopen did not restore activity XP, capability XP, badges, and authority to the exact baseline.");
    const reopenedContract = await browserApiRequest(page, `/api/quests/${missionId}/contract`);
    assert(reopenedContract.status === 200 && (reopenedContract.body as { unlockResult?: { state?: unknown } } | null)?.unlockResult?.state === "declared", "Reopened Mission still presented its reviewed skill contribution as applied.");
    steps.push({ name: "rendered progression reversal", status: "passed", detail: "Undo reopened the Mission and restored the exact pre-journey progression snapshot; reviewed skill XP returned to declared-only state." });
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
  if (failureMessage || !cleanupArchived) {
    console.error(failureMessage || "Synthetic Mission cleanup did not complete.");
    process.exitCode = 1;
  } else {
    console.log("Truthful Mission core-loop acceptance passed; completion and review were awarded accurately, then rendered reopen restored the exact baseline before archival.");
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
