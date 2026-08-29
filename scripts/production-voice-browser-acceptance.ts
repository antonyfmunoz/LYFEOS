import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer, { type Browser, type BrowserContext, type Page, type Viewport } from "puppeteer-core";
import {
  acknowledgeBoundedChunkRecovery,
  hasUnexpectedBrowserSignals,
  type BrowserSignals,
} from "./lib/production-browser-signals";

type ApiResult = { status: number; body: any; cookie: string };
type Account = { id: number; email: string; displayName: string; cookie: string };
type Signals = BrowserSignals;
type Cleanup = { viewport: string; accountErased: boolean; sessionInvalidated: boolean; emailReleased: boolean; displayNameReleased: boolean };
type ViewResult = {
  viewport: string;
  tutorialDismissed: boolean;
  oneDurableSession: boolean;
  firstCommandSegmentCount: number;
  secondCommandSegmentCount: number;
  reloadRestoredSameSession: boolean;
  explicitCloseCompleted: boolean;
  archiveRendered: boolean;
  opaqueReferenceCleared: boolean;
  mainCount: number;
  duplicateIds: string[];
  unlabeledControls: string[];
  horizontalOverflowPx: number;
  signals: Signals;
};

const BASE_URL = new URL(process.env.LYFEOS_TEST_API_URL || "https://lyfeos.net");
const SOURCE = process.env.LYFEOS_ACCEPTANCE_SOURCE || "";
const HARNESS_SOURCE = process.env.LYFEOS_ACCEPTANCE_HARNESS_SOURCE || process.env.GITHUB_SHA || "";
const OUTPUT_DIR = path.resolve(process.env.LYFEOS_VOICE_OUTPUT_DIR || path.join(os.tmpdir(), "lyfeos-production-voice"));
const OUTPUT_FILE = path.join(OUTPUT_DIR, "voice-report.json");
const PASSWORD = "TestPass123!";
const ACTIVE_SESSION_KEY = "lyfeos-active-voice-session-v1";
const PROVIDER_STUB_RESPONSE = "Voice lifecycle recorded for acceptance.";
const VIEWPORTS: Array<{ name: string; value: Viewport }> = [
  { name: "desktop-1440x900", value: { width: 1440, height: 900, deviceScaleFactor: 1 } },
  { name: "mobile-390x844", value: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/[a-z0-9._%+-]+@example\.com/gi, "[redacted fixture]")
    .replace(/voice_production_[a-z0-9_]+/gi, "[redacted fixture]")
    .slice(0, 1_000);
}

async function request(method: string, pathname: string, body?: unknown, cookie = ""): Promise<ApiResult> {
  const response = await fetch(new URL(pathname, BASE_URL), {
    method,
    signal: AbortSignal.timeout(25_000),
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  return {
    status: response.status,
    body: await response.json().catch(() => ({})),
    cookie: (response.headers.get("set-cookie") || "").split(";", 1)[0],
  };
}

async function findChromium(): Promise<string> {
  const candidates = [
    process.env.LYFEOS_CHROMIUM_PATH,
    process.env.CHROME_PATH,
    process.env.CHROMIUM_PATH,
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
      // Continue through explicit bounded locations.
    }
  }
  throw new Error("No Chromium executable found for production Voice acceptance.");
}

function cookieParts(cookie: string): { name: string; value: string } {
  const separator = cookie.indexOf("=");
  assert(separator > 0, "Registration did not return a usable session cookie.");
  return { name: cookie.slice(0, separator), value: cookie.slice(separator + 1) };
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
  await page.evaluate((tutorialSelector) => {
    const button = document.querySelector<HTMLButtonElement>(tutorialSelector);
    if (!button) throw new Error("Tutorial skip control disappeared before dismissal.");
    button.click();
  }, selector);
  await page.waitForSelector(selector, { hidden: true, timeout: 10_000 });
  return true;
}

async function activateHitTestedControl(page: Page, selector: string): Promise<void> {
  await page.waitForFunction((targetSelector) => {
    const control = document.querySelector<HTMLElement>(targetSelector);
    if (!control || (control as HTMLButtonElement).disabled) return false;
    const rect = control.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hit === control || (hit !== null && control.contains(hit));
  }, { timeout: 30_000 }, selector);
  await page.click(selector);
}

function captureSignals(page: Page): Signals {
  const signals: Signals = { consoleErrors: [], pageErrors: [], failedRequests: [], serverErrors: [], recoveredChunkLoads: [] };
  page.on("console", (entry) => {
    if (entry.type() !== "error") return;
    const source = entry.location().url;
    signals.consoleErrors.push(`${entry.text().slice(0, 500)}${source ? ` @ ${source}` : ""}`);
  });
  page.on("pageerror", (error) => signals.pageErrors.push(error.message.slice(0, 500)));
  page.on("requestfailed", (failed) => {
    const method = failed.method();
    const errorText = failed.failure()?.errorText || "failed";
    if (["GET", "HEAD"].includes(method) && errorText.includes("ERR_ABORTED")) return;
    if (failed.url().startsWith(BASE_URL.origin)) signals.failedRequests.push(`${method} ${new URL(failed.url()).pathname}: ${errorText}`);
  });
  page.on("response", (response) => {
    if (response.url().startsWith(BASE_URL.origin) && response.status() >= 500) signals.serverErrors.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  return signals;
}

async function auditPage(page: Page): Promise<Pick<ViewResult, "mainCount" | "duplicateIds" | "unlabeledControls" | "horizontalOverflowPx">> {
  return page.evaluate(() => {
    const ids = new Map<string, number>();
    for (const element of document.querySelectorAll<HTMLElement>("[id]")) ids.set(element.id, (ids.get(element.id) || 0) + 1);
    const duplicateIds = [...ids.entries()].filter(([, count]) => count > 1).map(([id]) => id).sort();
    const unlabeledControls = [...document.querySelectorAll<HTMLElement>("button,input,select,textarea")]
      .filter((element) => {
        if (element.getAttribute("aria-hidden") === "true") return false;
        if (element instanceof HTMLInputElement && element.type === "hidden") return false;
        const style = window.getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden" || element.getClientRects().length === 0) return false;
        const label = element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`) : null;
        const name = element.getAttribute("aria-label") || element.getAttribute("aria-labelledby") || element.getAttribute("title") || element.textContent?.trim();
        return !label && !element.closest("label") && !name;
      })
      .map((element) => element.getAttribute("data-testid") || element.tagName.toLowerCase())
      .slice(0, 20);
    const documentWidth = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0);
    return { mainCount: document.querySelectorAll("main").length, duplicateIds, unlabeledControls, horizontalOverflowPx: Math.max(0, documentWidth - window.innerWidth) };
  });
}

async function installBrowserDoubles(page: Page): Promise<void> {
  // Keep this as literal browser JavaScript. Passing a TypeScript callback here
  // can serialize references to tsx/esbuild helpers that do not exist in-page.
  await page.evaluateOnNewDocument(String.raw`
    (() => {
      const instances = [];
      let toggleEvents = 0;
      window.addEventListener("toggle-voice-control", () => { toggleEvents += 1; });
      class AcceptanceSpeechRecognition {
        continuous = false;
        interimResults = true;
        lang = "en-US";
        maxAlternatives = 1;
        onstart = null;
        onresult = null;
        onerror = null;
        onend = null;
        constructor() { instances.push(this); }
        start() { queueMicrotask(() => this.onstart?.()); }
        stop() { queueMicrotask(() => this.onend?.()); }
        abort() { queueMicrotask(() => this.onend?.()); }
        emitFinal(value) {
          const result = [{ transcript: value }];
          result.isFinal = true;
          this.onresult?.({ resultIndex: 0, results: [result] });
          queueMicrotask(() => this.onend?.());
        }
      }
      Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: AcceptanceSpeechRecognition });
      Object.defineProperty(window, "webkitSpeechRecognition", { configurable: true, value: AcceptanceSpeechRecognition });
      Object.defineProperty(window, "__lyfeosAcceptanceSpeech", { configurable: true, value: instances });
      Object.defineProperty(window, "__lyfeosAcceptanceVoiceToggleCount", { configurable: true, get: () => toggleEvents });
    })();
  `);
  await page.setRequestInterception(true);
  page.on("request", (intercepted) => {
    if (intercepted.method() === "POST" && new URL(intercepted.url()).pathname === "/api/voice-command") {
      void intercepted.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ speech: PROVIDER_STUB_RESPONSE, toolActions: [], understood: true }),
      }).catch(() => undefined);
      return;
    }
    void intercepted.continue().catch(() => undefined);
  });
}

async function emitCommand(page: Page, transcript: string): Promise<void> {
  await page.waitForFunction(() => document.querySelector('[data-testid="voice-pause-resume"]')?.getAttribute("aria-label") === "Pause dictation", { timeout: 30_000 });
  await page.evaluate((value) => {
    const instances = (window as any).__lyfeosAcceptanceSpeech as any[];
    const recognition = instances?.[instances.length - 1];
    if (!recognition) throw new Error("Acceptance speech recognizer is unavailable.");
    recognition.emitFinal(value);
  }, transcript);
  await page.waitForFunction((expected) => document.body.innerText.includes(expected), { timeout: 30_000 }, PROVIDER_STUB_RESPONSE);
  await page.waitForFunction(() => (document.querySelector('[data-testid="voice-stop"]') as HTMLButtonElement | null)?.disabled === false, { timeout: 30_000 });
}

async function waitForVoice(account: Account, expectedSegments: number, expectedStatus: "active" | "completed", sessionId?: string): Promise<any> {
  const deadline = Date.now() + 30_000;
  let last: any = null;
  while (Date.now() < deadline) {
    const list = await request("GET", "/api/ai/voice-sessions", undefined, account.cookie);
    if (list.status === 200) {
      const sessions = Array.isArray(list.body?.sessions) ? list.body.sessions : [];
      const candidate = sessionId ? sessions.find((session: any) => session.id === sessionId) : sessions[0];
      if (candidate) {
        const detail = await request("GET", `/api/ai/voice-sessions/${candidate.id}`, undefined, account.cookie);
        last = detail;
        if (detail.status === 200 && detail.body?.session?.status === expectedStatus && detail.body?.segments?.length === expectedSegments) return { list: sessions, detail: detail.body };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Voice session did not reach ${expectedStatus} with ${expectedSegments} segments; last=${JSON.stringify(last?.body || last).slice(0, 500)}.`);
}

async function eraseAccount(account: Account, viewport: string): Promise<Cleanup> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const deletion = await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, account.cookie).catch(() => null);
    if (deletion && deletion.status >= 200 && deletion.status < 300) break;
    const session = await request("GET", "/api/auth/me", undefined, account.cookie).catch(() => null);
    if (session?.status === 401) break;
  }
  const session = await request("GET", "/api/auth/me", undefined, account.cookie).catch(() => null);
  const email = await request("GET", `/api/auth/check-email?email=${encodeURIComponent(account.email)}`).catch(() => null);
  const displayName = await request("GET", `/api/auth/check-display-name?displayName=${encodeURIComponent(account.displayName)}`).catch(() => null);
  const cleanup = {
    viewport,
    sessionInvalidated: session?.status === 401,
    emailReleased: email?.status === 200 && email.body?.available === true,
    displayNameReleased: displayName?.status === 200 && displayName.body?.available === true,
    accountErased: false,
  };
  cleanup.accountErased = cleanup.sessionInvalidated && cleanup.emailReleased && cleanup.displayNameReleased;
  return cleanup;
}

async function runViewport(browser: Browser, viewport: { name: string; value: Viewport }, ordinal: number): Promise<{ view: ViewResult; cleanup: Cleanup }> {
  const stamp = `${Date.now()}_${ordinal}_${randomUUID().slice(0, 8)}`;
  const account: Account = { id: 0, email: `voice_production_${stamp}@example.com`, displayName: `voice_production_${ordinal}_${stamp.slice(-8)}`, cookie: "" };
  let context: BrowserContext | null = null;
  let view: ViewResult | null = null;
  let cleanup: Cleanup = { viewport: viewport.name, accountErased: false, sessionInvalidated: false, emailReleased: false, displayNameReleased: false };
  let failure: unknown = null;
  let stage = "register disposable account";
  try {
    const registration = await request("POST", "/api/auth/complete-registration", { email: account.email, password: PASSWORD, displayName: account.displayName, termsAccepted: true });
    assert(registration.status === 201, `Registration returned ${registration.status}.`);
    account.id = Number(registration.body.user?.id);
    account.cookie = registration.cookie;
    assert(Number.isInteger(account.id) && account.id > 0 && account.cookie, "Registration did not create a disposable owner and session.");
    const onboarding = await request("PATCH", "/api/profile", { onboardingCompleted: true }, account.cookie);
    assert(onboarding.status === 200 && onboarding.body?.onboardingCompleted === true, `Onboarding setup returned ${onboarding.status}.`);

    stage = "open authenticated AI page";
    context = await browser.createBrowserContext();
    const page = await context.newPage();
    const signals = captureSignals(page);
    const sessionCookie = cookieParts(account.cookie);
    await page.setCookie({ ...sessionCookie, url: BASE_URL.origin, path: "/", httpOnly: true, secure: true, sameSite: "Lax" });
    await page.evaluateOnNewDocument((fixtureUser) => {
      try { localStorage.setItem("lyfeos_user", JSON.stringify(fixtureUser)); } catch { /* Target-origin load will retry. */ }
    }, { id: account.id, displayName: account.displayName });
    await installBrowserDoubles(page);
    await page.setViewport(viewport.value);
    await page.setCacheEnabled(false);
    await page.goto(new URL("/ai", BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector('[data-tour="ai-voice"]', { visible: true, timeout: 60_000 });
    const tutorialDismissed = await dismissBlockingTutorial(page);
    stage = "launch and pause Voice";
    await activateHitTestedControl(page, '[data-tour="ai-voice"]');
    try {
      await page.waitForSelector('[data-testid="voice-pause-resume"]', { visible: true, timeout: 30_000 });
    } catch {
      await page.screenshot({ path: path.join(OUTPUT_DIR, `voice-launch-${viewport.name}.png`), fullPage: true }).catch(() => undefined);
      const diagnostics = await page.evaluate(() => {
        const launch = document.querySelector<HTMLElement>('[data-tour="ai-voice"]');
        const rect = launch?.getBoundingClientRect();
        const hit = rect ? document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) as HTMLElement | null : null;
        return {
          pathname: window.location.pathname,
          toggleEvents: Number((window as any).__lyfeosAcceptanceVoiceToggleCount || 0),
          speechRecognitionType: typeof (window as any).SpeechRecognition,
          webkitSpeechRecognitionType: typeof (window as any).webkitSpeechRecognition,
          recognizerInstances: Array.isArray((window as any).__lyfeosAcceptanceSpeech) ? (window as any).__lyfeosAcceptanceSpeech.length : -1,
          launchButtons: document.querySelectorAll('[data-tour="ai-voice"]').length,
          pauseControls: document.querySelectorAll('[data-testid="voice-pause-resume"]').length,
          stopControls: document.querySelectorAll('[data-testid="voice-stop"]').length,
          dialogs: document.querySelectorAll('[role="dialog"]').length,
          hitTarget: hit ? {
            tag: hit.tagName.toLowerCase(),
            testId: hit.getAttribute("data-testid"),
            tour: hit.getAttribute("data-tour"),
            role: hit.getAttribute("role"),
            label: hit.getAttribute("aria-label"),
            className: String(hit.className).slice(0, 300),
          } : null,
        };
      });
      throw new Error(`Voice overlay did not open after its rendered launch control dispatched: ${JSON.stringify({ ...diagnostics, signals })}`);
    }
    await page.click('[data-testid="voice-pause-resume"]');
    await page.waitForFunction(() => document.querySelector('[data-testid="voice-pause-resume"]')?.getAttribute("aria-label") === "Resume dictation", { timeout: 30_000 });
    await page.click('[data-testid="voice-pause-resume"]');

    stage = "emit first Voice command";
    await emitCommand(page, "Record the first bounded acceptance observation.");
    const firstStored = JSON.parse(await page.evaluate((key) => sessionStorage.getItem(key) || "null", ACTIVE_SESSION_KEY)) as { id?: string; version?: number } | null;
    assert(firstStored?.id && firstStored.version === 1, "The first command did not retain an opaque active-session reference.");
    stage = "verify first durable Voice command";
    const first = await waitForVoice(account, 2, "active", firstStored.id);
    assert(first.list.length === 1, "The first command created more than one Voice session.");

    stage = "emit second Voice command";
    await page.click('[data-testid="voice-pause-resume"]');
    await emitCommand(page, "Record the second bounded acceptance observation.");
    stage = "verify second durable Voice command";
    const second = await waitForVoice(account, 4, "active", firstStored.id);
    assert(second.list.length === 1, "The second command created a duplicate Voice session.");

    stage = "reload and restore Voice session";
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector('[data-tour="ai-voice"]', { visible: true, timeout: 60_000 });
    stage = "verify opaque Voice reference after reload";
    const afterReloadStored = JSON.parse(await page.evaluate((key) => sessionStorage.getItem(key) || "null", ACTIVE_SESSION_KEY)) as { id?: string; version?: number } | null;
    assert(afterReloadStored?.id === firstStored.id && afterReloadStored.version === firstStored.version, "Reload lost or changed the active Voice reference.");
    stage = "relaunch Voice after reload";
    await activateHitTestedControl(page, '[data-tour="ai-voice"]');
    stage = "wait for restored Voice listening state";
    try {
      await page.waitForFunction(() => document.querySelector('[data-testid="voice-pause-resume"]')?.getAttribute("aria-label") === "Pause dictation", { timeout: 30_000 });
    } catch {
      await page.screenshot({ path: path.join(OUTPUT_DIR, `voice-restore-${viewport.name}.png`), fullPage: true }).catch(() => undefined);
      const diagnostics = await page.evaluate(() => ({
        toggleEvents: Number((window as any).__lyfeosAcceptanceVoiceToggleCount || 0),
        recognizerInstances: Array.isArray((window as any).__lyfeosAcceptanceSpeech) ? (window as any).__lyfeosAcceptanceSpeech.length : -1,
        pauseControls: document.querySelectorAll('[data-testid="voice-pause-resume"]').length,
        pauseLabel: document.querySelector('[data-testid="voice-pause-resume"]')?.getAttribute("aria-label") || null,
        tutorialSkipControls: document.querySelectorAll('button[aria-label="Skip this tutorial"]').length,
        dialogs: document.querySelectorAll('[role="dialog"]').length,
      }));
      throw new Error(`Restored Voice did not reach listening state: ${JSON.stringify({ ...diagnostics, signals })}`);
    }
    stage = "verify restored durable Voice session";
    const restored = await waitForVoice(account, 4, "active", firstStored.id);
    assert(restored.list.length === 1, "Reload restoration created a duplicate Voice session.");

    stage = "explicitly complete Voice session";
    const completionResponse = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/ai/voice-sessions/${firstStored.id}/complete`, { timeout: 30_000 });
    await page.click('[data-testid="voice-stop"]');
    assert((await completionResponse).status() === 200, "Explicit Voice close did not complete the durable session.");
    const completed = await waitForVoice(account, 4, "completed", firstStored.id);
    await page.waitForFunction((key) => sessionStorage.getItem(key) === null, { timeout: 30_000 }, ACTIVE_SESSION_KEY);
    assert(completed.detail.session.summaryMethod === "extractive_v1", "Explicit close did not create the extractive review record.");

    stage = "render completed Voice archive";
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector('[data-testid="voice-session-archive"]', { visible: true, timeout: 60_000 });
    const recordSelector = `[data-testid="voice-session-record-${firstStored.id}"]`;
    await page.waitForSelector(recordSelector, { visible: true, timeout: 30_000 });
    await page.$eval(recordSelector, (element) => (element as HTMLButtonElement).click());
    await page.waitForFunction(() => document.querySelector('[data-testid="voice-session-archive"]')?.textContent?.includes("Extractive summary from your transcript") === true, { timeout: 30_000 });
    const rendered = await auditPage(page);
    assert(rendered.mainCount === 1 && rendered.duplicateIds.length === 0 && rendered.unlabeledControls.length === 0 && rendered.horizontalOverflowPx <= 2, `${viewport.name} failed Voice semantics or overflow checks.`);
    await acknowledgeBoundedChunkRecovery(page, signals);
    assert(!hasUnexpectedBrowserSignals(signals), `${viewport.name} produced application errors: ${JSON.stringify(signals)}.`);

    view = {
      viewport: viewport.name,
      tutorialDismissed,
      oneDurableSession: second.list.length === 1 && restored.list.length === 1,
      firstCommandSegmentCount: first.detail.segments.length,
      secondCommandSegmentCount: second.detail.segments.length,
      reloadRestoredSameSession: afterReloadStored.id === firstStored.id && restored.detail.session.id === firstStored.id,
      explicitCloseCompleted: completed.detail.session.status === "completed" && completed.detail.session.summaryMethod === "extractive_v1",
      archiveRendered: true,
      opaqueReferenceCleared: (await page.evaluate((key) => sessionStorage.getItem(key), ACTIVE_SESSION_KEY)) === null,
      ...rendered,
      signals,
    };
  } catch (error) {
    failure = new Error(`${stage}: ${safeError(error)}`);
  } finally {
    if (context) await context.close().catch(() => undefined);
    if (account.cookie) cleanup = await eraseAccount(account, viewport.name);
  }
  if (failure) throw new Error(`${safeError(failure)}; accountErased=${cleanup.accountErased}`);
  assert(view && cleanup.accountErased, `${viewport.name} did not complete the Voice journey and verified account erasure.`);
  return { view, cleanup };
}

async function main(): Promise<void> {
  assert(BASE_URL.origin === "https://lyfeos.net", "Production Voice acceptance may target only https://lyfeos.net.");
  assert(/^[0-9a-f]{40}$/.test(SOURCE), "Production Voice acceptance requires the exact deployed source revision.");
  assert(/^[0-9a-f]{40}$/.test(HARNESS_SOURCE), "Production Voice acceptance requires the exact harness source revision.");
  const release = await request("GET", "/api/release");
  assert(release.status === 200 && release.body?.sourceRevision === SOURCE, "Production Voice runtime does not match the requested immutable source.");
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  let browser: Browser | null = null;
  const views: ViewResult[] = [];
  const cleanups: Cleanup[] = [];
  let failure: string | null = null;
  try {
    browser = await puppeteer.launch({ executablePath: await findChromium(), headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--no-proxy-server"] });
    for (const [index, viewport] of VIEWPORTS.entries()) {
      const result = await runViewport(browser, viewport, index + 1);
      views.push(result.view);
      cleanups.push(result.cleanup);
    }
  } catch (error) {
    failure = safeError(error);
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    const passed = failure === null && views.length === VIEWPORTS.length && cleanups.length === VIEWPORTS.length && cleanups.every((cleanup) => cleanup.accountErased);
    const report = {
      contract: "lyfeos.production-voice-browser.v1",
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL.origin,
      sourceRevision: SOURCE,
      harnessSource: HARNESS_SOURCE,
      views,
      cleanups,
      summary: { passed, failure },
      boundary: "Disposable production-account Chromium evidence for the durable Voice UI. It proves an injected standards-shaped speech recognizer can drive rendered pause/resume, two commands remain in one owner-scoped session, reload restores the opaque session reference, explicit close completes the extractive record, the archive renders it, responsive semantics remain clean, and account/session/identifier erasure succeeds. The command response is deliberately intercepted with a fixed content-free provider stub, so this does not prove browser microphone permission, native speech-recognition quality, an AI model provider, tool execution, real-device behavior, human assistive-technology comprehension, transcript-summary quality, or longitudinal usefulness.",
    };
    await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    if (process.env.GITHUB_STEP_SUMMARY) {
      await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, [
        "## LyfeOS production Voice acceptance",
        "",
        `- Runtime source: ${SOURCE}`,
        `- Harness source: ${HARNESS_SOURCE}`,
        `- Passed: ${passed}`,
        `- Desktop/mobile views: ${views.length}/${VIEWPORTS.length}`,
        `- Accounts erased: ${cleanups.filter((cleanup) => cleanup.accountErased).length}/${VIEWPORTS.length}`,
        "",
        report.boundary,
        "",
      ].join("\n"), "utf8");
    }
    console.log(JSON.stringify({ contract: report.contract, passed, viewCount: views.length, erasedAccounts: cleanups.filter((cleanup) => cleanup.accountErased).length }));
    if (!passed && !failure) failure = "Production Voice acceptance did not satisfy every rendered, API and cleanup invariant.";
  }
  if (failure) throw new Error(failure);
}

main().catch((error) => {
  console.error(safeError(error));
  process.exitCode = 1;
});
