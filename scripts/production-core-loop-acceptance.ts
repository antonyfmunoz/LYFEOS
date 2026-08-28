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

const BASE_URL = new URL(process.env.LYFEOS_ACCEPTANCE_BASE_URL || "https://lyfeos.net");
const EMAIL = process.env.LYFEOS_ACCEPTANCE_EMAIL?.trim() || "";
const PASSWORD = process.env.LYFEOS_ACCEPTANCE_PASSWORD || "";
const SOURCE = process.env.LYFEOS_ACCEPTANCE_SOURCE?.trim() || "";
const OUTPUT_DIR = path.resolve(process.env.LYFEOS_ACCEPTANCE_OUTPUT_DIR || path.join(os.tmpdir(), "lyfeos-browser-acceptance"));
const OUTPUT_FILE = path.join(OUTPUT_DIR, "core-loop-report.json");
const RUN_ID = randomUUID();
const MISSION_TITLE = `[AUTOMATED ACCEPTANCE] Truthful evidence ${RUN_ID.slice(0, 8)}`;
const PURPOSE = "Verify that real Mission evidence remains separate from progression until review.";
const EXPECTED_OUTPUT = "A synthetic proof-plan receipt and one unreviewed evidence record.";
const REQUIRED_EVIDENCE = "A bounded browser acceptance receipt for this synthetic Mission.";
const EVIDENCE_SUMMARY = `Synthetic browser receipt ${RUN_ID.slice(0, 8)}; no competence or authority claim.`;

const steps: StepEvidence[] = [];
let missionId: number | null = null;
let progressionBefore: ProgressionSnapshot | null = null;
let progressionAfterEvidence: ProgressionSnapshot | null = null;
let progressionAfterCleanup: ProgressionSnapshot | null = null;
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
        };
        badges?: Array<{ key?: string }>;
      };
    };
    return {
      activityExperience: body.progression?.tracks?.activity?.totalExperience,
      capabilityExperience: body.progression?.tracks?.capability?.totalVerifiedExperience,
      activeBadges: (body.progression?.badges || []).map((badge) => badge.key).filter((key): key is string => Boolean(key)).sort(),
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
    && JSON.stringify(left.activeBadges) === JSON.stringify(right.activeBadges);
}

async function fill(page: Page, selector: string, value: string): Promise<void> {
  await page.waitForSelector(selector, { visible: true, timeout: 30_000 });
  await page.click(selector, { clickCount: 3 });
  await page.type(selector, value);
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
  const cleanup = await page.evaluate(async (id) => {
    const response = await fetch(`/api/quests/${id}`, { method: "DELETE", credentials: "include" });
    const archivedResponse = await fetch("/api/quests/archived", { credentials: "include", cache: "no-store" });
    const archived = archivedResponse.ok ? await archivedResponse.json() as Array<{ id: number }> : [];
    return { deleteStatus: response.status, archivedStatus: archivedResponse.status, found: archived.some((mission) => Number(mission.id) === id) };
  }, missionId);
  assert(cleanup.deleteStatus === 200, `Synthetic Mission cleanup returned ${cleanup.deleteStatus}.`);
  assert(cleanup.archivedStatus === 200 && cleanup.found, "Synthetic Mission was not visible in the recoverable archive after cleanup.");
  cleanupArchived = true;
}

async function writeReport(): Promise<void> {
  const report = {
    contract: "lyfeos.production-core-loop-acceptance.v1",
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL.origin,
    source: SOURCE,
    runId: RUN_ID,
    syntheticMissionId: missionId,
    progression: {
      before: progressionBefore,
      afterUnreviewedEvidence: progressionAfterEvidence,
      afterCleanup: progressionAfterCleanup,
      unchangedBeforeReview: Boolean(progressionBefore && progressionAfterEvidence && progressionMatches(progressionBefore, progressionAfterEvidence)),
      unchangedAfterCleanup: Boolean(progressionBefore && progressionAfterCleanup && progressionMatches(progressionBefore, progressionAfterCleanup)),
    },
    views,
    cleanup: { attempted: cleanupAttempted, archived: cleanupArchived },
    steps,
    summary: { passed: failureMessage === null && cleanupArchived, failure: failureMessage },
    boundary: "The journey stops before completion or review. Unreviewed evidence must not award activity XP, capability XP, badges, certification, or authority.",
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
    progressionBefore = await readProgression(page);

    await page.goto(new URL("/missions", BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector('[data-tour="create-mission"]', { visible: true, timeout: 30_000 });
    await page.click('[data-tour="create-mission"]');
    await fill(page, "#create-title", MISSION_TITLE);
    const createResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.origin === BASE_URL.origin && url.pathname === "/api/quests" && response.request().method() === "POST";
    }, { timeout: 30_000 });
    await page.click('[data-testid="mission-create-submit"]');
    const createResponse = await createResponsePromise;
    const createBody = await createResponse.json() as { quest?: { id?: number }; error?: unknown };
    assert(createResponse.ok() && Number.isInteger(createBody.quest?.id), `Rendered Mission creation failed (${createResponse.status()}).`);
    missionId = createBody.quest!.id!;
    steps.push({ name: "rendered Mission creation", status: "passed", detail: "Canonical UI creation returned one synthetic Mission." });

    await page.goto(new URL(`/mission/${missionId}`, BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForFunction((title) => document.body.innerText.includes(title), { timeout: 30_000 }, MISSION_TITLE);
    await fill(page, '[data-testid="proof-plan-purpose"]', PURPOSE);
    await fill(page, '[data-testid="proof-plan-output"]', EXPECTED_OUTPUT);
    await fill(page, '[data-testid="proof-plan-method"]', "Create one bounded synthetic Mission.\nAttach one synthetic browser receipt.\nStop before completion or review.");
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
    console.log("Truthful Mission core-loop acceptance passed; synthetic Mission archived and progression remained unchanged.");
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
