import { access } from "node:fs/promises";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";

type ViewportCase = {
  name: "desktop" | "mobile";
  width: number;
  height: number;
  deviceScaleFactor: number;
};

type JourneyEvidence = {
  viewport: string;
  registrationRendered: boolean;
  invalidUsernameBlocked: boolean;
  availableUsernameAdvanced: boolean;
  verificationScreenAbsent: boolean;
  progressSurvivedReload: boolean;
  completedMissionIds: number[];
  onboardingCompleted: boolean;
  activeThread: boolean;
  sessionEstablished: boolean;
  sessionSurvivedReload: boolean;
  accountDeletedThroughRenderedControl: boolean;
  sessionInvalidated: boolean;
  emailReleased: boolean;
  displayNameReleased: boolean;
  mainCount: number;
  duplicateIds: string[];
  unlabeledControls: string[];
  horizontalOverflowPx: number;
  sameOriginServerErrors: string[];
  failedSameOriginRequests: string[];
  unexpectedConsoleErrors: string[];
  cleanup: "rendered-erasure" | "api-recovery" | "not-created" | "failed";
};

type BrowserApiResponse = { status: number; body: any };

const BASE_URL = new URL(process.env.LYFEOS_ACCEPTANCE_BASE_URL || "https://lyfeos.net");
const SOURCE = process.env.LYFEOS_ACCEPTANCE_SOURCE?.trim() || "";
const HARNESS_SOURCE = process.env.LYFEOS_ACCEPTANCE_HARNESS_SOURCE?.trim() || "";
const OUTPUT_DIR = path.resolve(process.env.LYFEOS_ACCEPTANCE_OUTPUT_DIR || path.join(os.tmpdir(), "lyfeos-browser-acceptance"));
const OUTPUT_FILE = path.join(OUTPUT_DIR, "onboarding-report.json");
const RUN_ID = randomUUID();
const VIEWPORTS: ViewportCase[] = [
  { name: "desktop", width: 1440, height: 900, deviceScaleFactor: 1 },
  { name: "mobile", width: 390, height: 844, deviceScaleFactor: 2 },
];
const TOTAL_ONBOARDING_STEPS = [6, 55, 22, 9, 13, 15, 6, 11].reduce((sum, value) => sum + value, 0);

const journeys: JourneyEvidence[] = [];
let fatalError: string | null = null;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitize(error: unknown, secrets: string[] = []): string {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of secrets.filter(Boolean)) message = message.replaceAll(secret, "[redacted synthetic credential]");
  return message.slice(0, 1_000);
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
      // Continue through the bounded executable locations.
    }
  }
  throw new Error("No Chromium executable found. Set LYFEOS_CHROMIUM_PATH for onboarding qualification.");
}

async function fill(page: Page, selector: string, value: string): Promise<void> {
  await page.waitForSelector(selector, { visible: true, timeout: 30_000 });
  await page.focus(selector);
  const modifier = process.platform === "darwin" ? "Meta" : "Control";
  await page.keyboard.down(modifier);
  await page.keyboard.press("A");
  await page.keyboard.up(modifier);
  await page.keyboard.press("Backspace");
  await page.type(selector, value, { delay: 3 });
  await page.waitForFunction(({ inputSelector, expectedValue }) => {
    const control = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(inputSelector);
    return control?.value === expectedValue;
  }, { timeout: 10_000 }, { inputSelector: selector, expectedValue: value });
}

async function browserApiRequest(page: Page, pathname: string, method = "GET", body?: unknown): Promise<BrowserApiResponse> {
  return page.evaluate(async ({ requestPath, requestMethod, requestBody }) => {
    const response = await fetch(requestPath, {
      method: requestMethod,
      credentials: "include",
      cache: "no-store",
      headers: requestBody === undefined ? undefined : { "Content-Type": "application/json" },
      body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
    });
    let responseBody: unknown = null;
    try {
      responseBody = await response.json();
    } catch {
      // Status remains authoritative for empty responses.
    }
    return { status: response.status, body: responseBody };
  }, { requestPath: pathname, requestMethod: method, requestBody: body });
}

async function poll<T>(read: () => Promise<T>, accept: (value: T) => boolean, label: string, timeoutMs = 45_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T | undefined;
  while (Date.now() < deadline) {
    last = await read();
    if (accept(last)) return last;
    await delay(500);
  }
  throw new Error(`${label} did not settle before timeout${last === undefined ? "" : ` (${JSON.stringify(last).slice(0, 300)})`}.`);
}

async function currentOnboardingStep(page: Page): Promise<{ mission: number; step: number }> {
  await page.waitForSelector('[data-testid="onboarding-step"]', { visible: true, timeout: 30_000 });
  return page.$eval('[data-testid="onboarding-step"]', (element) => ({
    mission: Number(element.getAttribute("data-mission")),
    step: Number(element.getAttribute("data-step")),
  }));
}

async function waitForOnboardingStep(page: Page, mission: number, step: number, timeoutMs = 15_000): Promise<void> {
  try {
    await page.waitForFunction(({ expectedMission, expectedStep }) => {
      const node = document.querySelector('[data-testid="onboarding-step"]');
      return node?.getAttribute("data-mission") === String(expectedMission)
        && node?.getAttribute("data-step") === String(expectedStep);
    }, { timeout: timeoutMs }, { expectedMission: mission, expectedStep: step });
  } catch (error) {
    const rendered = await page.$eval('[data-testid="onboarding-step"]', (node) => ({
      mission: node.getAttribute("data-mission"),
      step: node.getAttribute("data-step"),
      heading: node.querySelector("h2, h3")?.textContent?.trim().slice(0, 160) || null,
      nextDisabled: document.querySelector<HTMLButtonElement>('[data-testid="onboarding-next"]')?.disabled ?? null,
    })).catch(() => ({ mission: null, step: null, heading: null, nextDisabled: null }));
    throw new Error(`Expected onboarding Mission ${mission} step ${step}, but rendered ${rendered.mission}/${rendered.step} (${rendered.heading || "no heading"}; nextDisabled=${rendered.nextDisabled}): ${sanitize(error)}`);
  }
}

async function waitForPersistedOnboardingPosition(page: Page, mission: number, step: number): Promise<void> {
  await page.waitForFunction(({ expectedMission, expectedStep }) => {
    try {
      const raw = localStorage.getItem("lyfeos-onboarding-resume");
      if (!raw) return false;
      const position = JSON.parse(raw) as { mission?: unknown; step?: unknown };
      return position.mission === expectedMission && position.step === expectedStep;
    } catch {
      return false;
    }
  }, { timeout: 10_000 }, { expectedMission: mission, expectedStep: step });
}

async function nextEnabled(page: Page): Promise<boolean> {
  return page.$eval('[data-testid="onboarding-next"]', (element) => !(element as HTMLButtonElement).disabled);
}

async function selectRadixOption(page: Page, triggerSelector: string, text: string): Promise<void> {
  await page.click(triggerSelector);
  await page.waitForSelector('[role="option"]', { visible: true, timeout: 10_000 });
  const selected = await page.evaluate((expected) => {
    const option = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'))
      .find((candidate) => candidate.innerText.trim() === expected);
    option?.click();
    return Boolean(option);
  }, text);
  assert(selected, `Could not select ${text} from ${triggerSelector}.`);
}

async function fillVisibleTextControls(page: Page): Promise<void> {
  const selectors = await page.$$eval('[data-testid="onboarding-step"] input:not([type="range"]), [data-testid="onboarding-step"] textarea', (elements) =>
    elements.map((element, index) => ({
      index,
      value: (element as HTMLInputElement | HTMLTextAreaElement).value,
      type: element.tagName.toLowerCase(),
    })),
  );
  for (const control of selectors) {
    if (control.value.trim()) continue;
    const selector = control.type === "textarea"
      ? `[data-testid="onboarding-step"] textarea:nth-of-type(${control.index + 1})`
      : "";
    if (selector) {
      // nth-of-type is not stable across mixed controls; use the indexed handle below.
    }
    const handles = await page.$$('[data-testid="onboarding-step"] input:not([type="range"]), [data-testid="onboarding-step"] textarea');
    const handle = handles[control.index];
    assert(handle, "A visible onboarding text control disappeared before it could be filled.");
    await handle.focus();
    await page.keyboard.type("Synthetic acceptance response", { delay: 2 });
    await delay(20);
  }
}

async function chooseFirstRenderedAnswer(page: Page): Promise<boolean> {
  return page.$eval('[data-testid="onboarding-step"]', (container) => {
    const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((candidate) => {
        const style = getComputedStyle(candidate);
        return !candidate.disabled && style.display !== "none" && style.visibility !== "hidden" && candidate.getClientRects().length > 0;
      });
    button?.scrollIntoView({ block: "center", inline: "nearest" });
    button?.click();
    return Boolean(button);
  });
}

async function prepareStep(page: Page, username: string, evidence: JourneyEvidence): Promise<void> {
  const { mission, step } = await currentOnboardingStep(page);
  if (mission === 0 && step === 0) {
    await fill(page, '[data-testid="onboarding-display-name"]', "ab");
    evidence.invalidUsernameBlocked = !(await nextEnabled(page));
    assert(evidence.invalidUsernameBlocked, "The username step allowed a display name shorter than three characters.");
    await fill(page, '[data-testid="onboarding-display-name"]', username);
    const availability = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/auth/check-display-name", { timeout: 30_000 });
    await page.$eval('[data-testid="onboarding-display-name"]', (element) => (element as HTMLInputElement).blur());
    const response = await availability;
    const body = await response.json() as { available?: unknown };
    assert(response.ok() && body.available === true, `The synthetic display name was not available (${response.status()}).`);
    await page.waitForFunction(() => document.body.innerText.includes("Display name is available!"), { timeout: 10_000 });
    return;
  }
  if (mission === 0 && step === 1) {
    await fill(page, '[data-testid="onboarding-first-name"]', "Synthetic");
    await fill(page, '[data-testid="onboarding-last-name"]', "Acceptance");
    return;
  }
  if (mission === 0 && step === 2) {
    await selectRadixOption(page, '[data-testid="onboarding-birth-month"]', "January");
    await selectRadixOption(page, '[data-testid="onboarding-birth-day"]', "1");
    await selectRadixOption(page, '[data-testid="onboarding-birth-year"]', "2000");
    return;
  }
  if (mission === 0 && step === 3) {
    await fill(page, '[data-testid="onboarding-location"]', "Los Angeles, California, United States");
    return;
  }
  if (mission === 0 && step === 4) {
    assert(await nextEnabled(page), "The browser-resolved timezone did not enable the timezone step.");
    return;
  }
  if (mission === 0 && step === 5) {
    await page.click('[data-testid="onboarding-theme-cyan"]');
    return;
  }

  await fillVisibleTextControls(page);
  if (!(await nextEnabled(page))) {
    const answered = await chooseFirstRenderedAnswer(page);
    assert(answered, `Mission ${mission} step ${step} had no rendered answer control.`);
  }
  await page.waitForFunction(() => {
    const button = document.querySelector<HTMLButtonElement>('[data-testid="onboarding-next"]');
    return Boolean(button && !button.disabled);
  }, { timeout: 10_000 });
}

async function waitForMissionReceipt(page: Page, mission: number): Promise<void> {
  await poll(
    () => browserApiRequest(page, "/api/profile"),
    (response) => response.status === 200
      && Array.isArray(response.body?.completedOnboardingMissions)
      && response.body.completedOnboardingMissions.includes(mission),
    `Onboarding Mission ${mission} persistence`,
    60_000,
  );
}

async function advanceFullOnboarding(page: Page, username: string, evidence: JourneyEvidence): Promise<void> {
  let advancedSteps = 0;
  for (let mission = 0; mission < 8; mission++) {
    const expectedSteps = [6, 55, 22, 9, 13, 15, 6, 11][mission];
    for (let step = 0; step < expectedSteps; step++) {
      const state = await currentOnboardingStep(page);
      assert(state.mission === mission && state.step === step, `Expected onboarding Mission ${mission} step ${step}, found ${state.mission}/${state.step}.`);
      if (mission === 2 && step === 10 && !evidence.progressSurvivedReload) {
        await waitForPersistedOnboardingPosition(page, mission, step);
        await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
        await waitForOnboardingStep(page, mission, step, 30_000);
        evidence.progressSurvivedReload = true;
      }
      await prepareStep(page, username, evidence);
      await page.waitForFunction(() => {
        const button = document.querySelector<HTMLButtonElement>('[data-testid="onboarding-next"]');
        return Boolean(button && !button.disabled);
      }, { timeout: 10_000 });
      await page.click('[data-testid="onboarding-next"]');
      advancedSteps += 1;
      if (step < expectedSteps - 1) {
        await waitForOnboardingStep(page, mission, step + 1);
        if (mission === 0 && step === 0) evidence.availableUsernameAdvanced = true;
      } else {
        await page.waitForFunction(() => document.body.innerText.includes("Mission Complete!"), { timeout: 30_000 });
        await waitForMissionReceipt(page, mission);
        evidence.completedMissionIds.push(mission);
        if (mission < 7) {
          await page.click('[data-testid="onboarding-continue"]');
          await waitForOnboardingStep(page, mission + 1, 0);
        }
      }
    }
  }
  assert(advancedSteps === TOTAL_ONBOARDING_STEPS, `Advanced ${advancedSteps} onboarding steps instead of ${TOTAL_ONBOARDING_STEPS}.`);

  await poll(
    () => browserApiRequest(page, "/api/transformation-thread"),
    (response) => response.status === 200 && response.body?.thread?.status === "active",
    "Onboarding-derived active Thread",
    60_000,
  );
  evidence.activeThread = true;
  await page.click('[data-testid="onboarding-enter-system"]');
  await poll(
    () => browserApiRequest(page, "/api/profile"),
    (response) => response.status === 200 && response.body?.onboardingCompleted === true,
    "Onboarding completion",
    60_000,
  );
  evidence.onboardingCompleted = true;
  await page.waitForFunction(() => ["/ceremony", "/dashboard", "/missions"].some((path) => window.location.pathname.startsWith(path)), { timeout: 60_000 });
}

async function auditRenderedState(page: Page): Promise<Pick<JourneyEvidence, "mainCount" | "duplicateIds" | "unlabeledControls" | "horizontalOverflowPx">> {
  return page.evaluate(() => {
    const visible = (element: Element) => {
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
    };
    const ids = Array.from(document.querySelectorAll<HTMLElement>("[id]")).map((element) => element.id).filter(Boolean);
    const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))].sort();
    const unlabeledControls = Array.from(document.querySelectorAll<HTMLElement>("button, input, textarea, select"))
      .filter(visible)
      .filter((element) => {
        if (element.getAttribute("aria-hidden") === "true") return false;
        const id = element.id;
        const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent?.trim() : "";
        const name = element.getAttribute("aria-label")
          || element.getAttribute("aria-labelledby")
          || label
          || element.getAttribute("title")
          || element.getAttribute("placeholder")
          || element.textContent?.trim();
        return !name;
      })
      .map((element) => `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}`)
      .sort();
    return {
      mainCount: document.querySelectorAll("main").length,
      duplicateIds,
      unlabeledControls,
      horizontalOverflowPx: Math.max(0, Math.ceil(document.documentElement.scrollWidth - document.documentElement.clientWidth)),
    };
  });
}

async function deleteRenderedAccount(page: Page, evidence: JourneyEvidence): Promise<void> {
  await page.goto(new URL("/profile", BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector('[data-testid="account-delete-confirmation"]', { visible: true, timeout: 30_000 });
  const audit = await auditRenderedState(page);
  evidence.mainCount = audit.mainCount;
  evidence.duplicateIds = audit.duplicateIds;
  evidence.unlabeledControls = audit.unlabeledControls;
  evidence.horizontalOverflowPx = audit.horizontalOverflowPx;
  assert(audit.mainCount === 1, `Profile deletion surface rendered ${audit.mainCount} main landmarks.`);
  assert(audit.duplicateIds.length === 0, `Profile deletion surface rendered duplicate IDs: ${audit.duplicateIds.join(", ")}.`);
  assert(audit.unlabeledControls.length === 0, `Profile deletion surface rendered unlabeled controls: ${audit.unlabeledControls.join(", ")}.`);
  assert(audit.horizontalOverflowPx <= 2, `Profile deletion surface overflowed horizontally by ${audit.horizontalOverflowPx}px.`);
  await fill(page, '[data-testid="account-delete-confirmation"]', "DELETE MY ACCOUNT");
  await page.waitForFunction(() => {
    const button = document.querySelector<HTMLButtonElement>('[data-testid="account-delete-submit"]');
    return Boolean(button && !button.disabled);
  }, { timeout: 10_000 });
  const deletionResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.origin === BASE_URL.origin && url.pathname === "/api/account" && response.request().method() === "DELETE";
  }, { timeout: 60_000 });
  await page.click('[data-testid="account-delete-submit"]');
  const response = await deletionResponse;
  assert(response.ok(), `Rendered account erasure returned ${response.status()}.`);
  evidence.accountDeletedThroughRenderedControl = true;
  evidence.cleanup = "rendered-erasure";
  await page.waitForFunction(() => window.location.pathname.startsWith("/register"), { timeout: 60_000 });
}

async function runJourney(browser: Browser, viewport: ViewportCase): Promise<JourneyEvidence> {
  const token = `${RUN_ID.slice(0, 8)}${viewport.name[0]}`;
  const email = `lyfeos.acceptance.${token}@example.com`;
  const username = `acc_${token.replaceAll("-", "")}`;
  const password = `A!${randomBytes(18).toString("base64url")}9z`;
  const evidence: JourneyEvidence = {
    viewport: `${viewport.name} ${viewport.width}x${viewport.height}`,
    registrationRendered: false,
    invalidUsernameBlocked: false,
    availableUsernameAdvanced: false,
    verificationScreenAbsent: false,
    progressSurvivedReload: false,
    completedMissionIds: [],
    onboardingCompleted: false,
    activeThread: false,
    sessionEstablished: false,
    sessionSurvivedReload: false,
    accountDeletedThroughRenderedControl: false,
    sessionInvalidated: false,
    emailReleased: false,
    displayNameReleased: false,
    mainCount: 0,
    duplicateIds: [],
    unlabeledControls: [],
    horizontalOverflowPx: 0,
    sameOriginServerErrors: [],
    failedSameOriginRequests: [],
    unexpectedConsoleErrors: [],
    cleanup: "not-created",
  };
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport(viewport);
  await page.setCacheEnabled(false);
  const redactions = [email, username, password];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === BASE_URL.origin && response.status() >= 500) evidence.sameOriginServerErrors.push(`${response.request().method()} ${url.pathname} ${response.status()}`);
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (url.origin === BASE_URL.origin) evidence.failedSameOriginRequests.push(`${request.method()} ${url.pathname}: ${request.failure()?.errorText || "failed"}`);
  });
  page.on("console", (entry) => {
    if (entry.type() !== "error") return;
    const message = sanitize(entry.text(), redactions);
    if (/ERR_BLOCKED_BY_CLIENT|clerk|favicon|Failed to load resource: the server responded with a status of 401/i.test(message)) return;
    evidence.unexpectedConsoleErrors.push(message);
  });

  try {
    await page.goto(new URL("/register", BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("#email", { visible: true, timeout: 30_000 });
    evidence.registrationRendered = true;
    await fill(page, "#email", email);
    await fill(page, "#password", password);
    await fill(page, "#confirmPassword", password);
    await page.click("#terms");
    await page.waitForFunction(() => document.querySelector('[role="checkbox"]')?.getAttribute("data-state") === "checked", { timeout: 10_000 });
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => window.location.pathname.startsWith("/onboarding"), { timeout: 60_000 });
    evidence.verificationScreenAbsent = !/verification code|verify your email|email verification/i.test(await page.$eval("body", (element) => element.innerText));
    assert(evidence.verificationScreenAbsent, "Registration unexpectedly entered an email-verification ceremony.");

    await advanceFullOnboarding(page, username, evidence);
    evidence.availableUsernameAdvanced = evidence.completedMissionIds.includes(0);
    const session = await browserApiRequest(page, "/api/auth/me");
    evidence.sessionEstablished = session.status === 200;
    assert(evidence.sessionEstablished, `Rendered registration did not establish a session (${session.status}).`);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
    const reloadedSession = await browserApiRequest(page, "/api/auth/me");
    evidence.sessionSurvivedReload = reloadedSession.status === 200;
    assert(evidence.sessionSurvivedReload, `New-account session did not survive reload (${reloadedSession.status}).`);

    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(OUTPUT_DIR, `onboarding-${viewport.name}-complete.png`), fullPage: true });
    await deleteRenderedAccount(page, evidence);
    const deletedSession = await browserApiRequest(page, "/api/auth/me");
    evidence.sessionInvalidated = deletedSession.status === 401;
    const emailCheck = await browserApiRequest(page, `/api/auth/check-email?email=${encodeURIComponent(email)}`);
    evidence.emailReleased = emailCheck.status === 200 && emailCheck.body?.available === true;
    const displayNameCheck = await browserApiRequest(page, `/api/auth/check-display-name?displayName=${encodeURIComponent(username)}`);
    evidence.displayNameReleased = displayNameCheck.status === 200 && displayNameCheck.body?.available === true;
    assert(evidence.sessionInvalidated, "Rendered account erasure did not invalidate the session.");
    assert(evidence.emailReleased, "Rendered account erasure did not release the synthetic email.");
    assert(evidence.displayNameReleased, "Rendered account erasure did not release the synthetic display name.");
    assert(evidence.sameOriginServerErrors.length === 0, `Onboarding received same-origin server errors: ${evidence.sameOriginServerErrors.join("; ")}.`);
    assert(evidence.failedSameOriginRequests.length === 0, `Onboarding had failed same-origin requests: ${evidence.failedSameOriginRequests.join("; ")}.`);
    assert(evidence.unexpectedConsoleErrors.length === 0, `Onboarding logged unexpected console errors: ${evidence.unexpectedConsoleErrors.join("; ")}.`);
    return evidence;
  } catch (error) {
    const session = await browserApiRequest(page, "/api/auth/me").catch(() => ({ status: 0, body: null }));
    if (session.status === 200 && !evidence.accountDeletedThroughRenderedControl) {
      const cleanup = await browserApiRequest(page, "/api/account", "DELETE", { confirmation: "DELETE MY ACCOUNT" }).catch(() => ({ status: 0, body: null }));
      evidence.cleanup = cleanup.status >= 200 && cleanup.status < 300 ? "api-recovery" : "failed";
    }
    throw new Error(`${viewport.name} journey failed: ${sanitize(error, redactions)}; recovery=${evidence.cleanup}`);
  } finally {
    journeys.push(evidence);
    await context.close();
  }
}

async function writeReport(): Promise<void> {
  const passed = !fatalError && journeys.length === VIEWPORTS.length && journeys.every((journey) =>
    journey.registrationRendered
      && journey.invalidUsernameBlocked
      && journey.availableUsernameAdvanced
      && journey.verificationScreenAbsent
      && journey.progressSurvivedReload
      && journey.completedMissionIds.join(",") === "0,1,2,3,4,5,6,7"
      && journey.onboardingCompleted
      && journey.activeThread
      && journey.sessionEstablished
      && journey.sessionSurvivedReload
      && journey.accountDeletedThroughRenderedControl
      && journey.sessionInvalidated
      && journey.emailReleased
      && journey.displayNameReleased
      && journey.mainCount === 1
      && journey.duplicateIds.length === 0
      && journey.unlabeledControls.length === 0
      && journey.horizontalOverflowPx <= 2
      && journey.sameOriginServerErrors.length === 0
      && journey.failedSameOriginRequests.length === 0
      && journey.unexpectedConsoleErrors.length === 0
      && journey.cleanup === "rendered-erasure");
  const report = {
    contract: "lyfeos.production-onboarding-acceptance.v2",
    generatedAt: new Date().toISOString(),
    sourceRevision: SOURCE,
    harnessSource: HARNESS_SOURCE,
    runIdHash: createHash("sha256").update(RUN_ID).digest("hex"),
    passed,
    journeys,
    failure: fatalError,
    boundary: "This disposable synthetic journey proves the rendered local email/password registration path, username validation and availability, absence of an email-verification ceremony, in-progress answer and Mission continuity through reload, all eight onboarding Missions, onboarding-derived active Thread, session persistence, and rendered account erasure at desktop and mobile viewport sizes. It does not approve legal terms, exercise Clerk/OAuth or recovery-email delivery, establish human screen-reader comprehension, or validate longitudinal outcomes.",
  };
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (process.env.GITHUB_STEP_SUMMARY) {
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, [
      "## LyfeOS disposable production onboarding acceptance",
      "",
      `- Runtime source: ${SOURCE}`,
      `- Harness source: ${HARNESS_SOURCE}`,
      `- Passed: ${passed}`,
      `- Desktop/mobile disposable journeys: ${journeys.length}/${VIEWPORTS.length}`,
      `- All eight rendered onboarding Missions per journey: ${journeys.every((journey) => journey.completedMissionIds.length === 8)}`,
      `- In-progress Mission and answer state survived reload: ${journeys.every((journey) => journey.progressSurvivedReload)}`,
      `- Rendered account erasure and released identifiers: ${journeys.every((journey) => journey.accountDeletedThroughRenderedControl && journey.emailReleased && journey.displayNameReleased)}`,
      "",
      report.boundary,
      "",
    ].join("\n"), "utf8");
  }
  if (!passed) throw new Error(fatalError || "Production onboarding acceptance did not satisfy every invariant.");
}

async function main(): Promise<void> {
  if (BASE_URL.protocol !== "https:" && !["127.0.0.1", "localhost"].includes(BASE_URL.hostname)) throw new Error("Onboarding acceptance requires HTTPS except for explicit localhost qualification.");
  if (!/^[0-9a-f]{40}$/.test(SOURCE)) throw new Error("Onboarding acceptance requires the exact 40-character deployed source revision.");
  if (!/^[0-9a-f]{40}$/.test(HARNESS_SOURCE)) throw new Error("Onboarding acceptance requires the exact 40-character harness source revision.");
  const release = await fetch(new URL("/api/release", BASE_URL));
  const identity = await release.json() as { sourceRevision?: unknown };
  assert(release.ok && identity.sourceRevision === SOURCE, "Onboarding acceptance runtime source does not match the requested immutable release.");
  const browser = await puppeteer.launch({
    executablePath: await findChromium(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    for (const viewport of VIEWPORTS) await runJourney(browser, viewport);
  } finally {
    await browser.close();
  }
}

main()
  .catch((error) => {
    fatalError = sanitize(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await writeReport();
      console.log(`Disposable production onboarding acceptance passed: ${OUTPUT_FILE}`);
    } catch (error) {
      if (!fatalError) fatalError = sanitize(error);
      console.error(fatalError);
      process.exitCode = 1;
    }
  });
