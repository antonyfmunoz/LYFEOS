import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer, { type Browser, type BrowserContext, type Page, type Viewport } from "puppeteer-core";

type ApiResult = { status: number; body: any; cookie: string };
type Account = { id: number; email: string; displayName: string; cookie: string };
type Signals = { consoleErrors: string[]; pageErrors: string[]; failedRequests: string[]; serverErrors: string[] };
type Cleanup = { viewport: string; accountErased: boolean; sessionInvalidated: boolean; emailReleased: boolean; displayNameReleased: boolean };
type ViewResult = {
  viewport: string;
  tutorialDismissed: boolean;
  domainsDefaultedOff: boolean;
  explicitConsentRendered: boolean;
  availableAssociationRendered: boolean;
  qualityDisclosureRendered: boolean;
  privateInterpretationRendered: boolean;
  pauseResumeRendered: boolean;
  revocationPausedAnalysis: boolean;
  noProgressionOrAutomaticAction: boolean;
  deletionRendered: boolean;
  mainCount: number;
  duplicateIds: string[];
  unlabeledControls: string[];
  horizontalOverflowPx: number;
  signals: Signals;
};

const BASE_URL = new URL(process.env.LYFEOS_TEST_API_URL || "https://lyfeos.net");
const SOURCE = process.env.LYFEOS_ACCEPTANCE_SOURCE || "";
const HARNESS_SOURCE = process.env.LYFEOS_ACCEPTANCE_HARNESS_SOURCE || process.env.GITHUB_SHA || "";
const OUTPUT_DIR = path.resolve(process.env.LYFEOS_PATTERN_OUTPUT_DIR || path.join(os.tmpdir(), "lyfeos-production-pattern-explorer"));
const OUTPUT_FILE = path.join(OUTPUT_DIR, "pattern-explorer-report.json");
const PASSWORD = "TestPass123!";
const TITLE = "Recorded hydration and mental-state reflection";
const PRIVATE_NOTE = "A private synthetic interpretation for rendered lifecycle qualification.";
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
    .replace(/pattern_production_[a-z0-9_]+/gi, "[redacted fixture]")
    .slice(0, 1_000);
}

async function request(method: string, pathname: string, body?: unknown, cookie = "", headers: Record<string, string> = {}): Promise<ApiResult> {
  const response = await fetch(new URL(pathname, BASE_URL), {
    method,
    signal: AbortSignal.timeout(30_000),
    headers: { "Content-Type": "application/json", ...headers, ...(cookie ? { Cookie: cookie } : {}) },
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
  throw new Error("No Chromium executable found for production Pattern Explorer acceptance.");
}

function cookieParts(cookie: string): { name: string; value: string } {
  const separator = cookie.indexOf("=");
  assert(separator > 0, "Registration did not return a usable session cookie.");
  return { name: cookie.slice(0, separator), value: cookie.slice(separator + 1) };
}

function captureSignals(page: Page): Signals {
  const signals: Signals = { consoleErrors: [], pageErrors: [], failedRequests: [], serverErrors: [] };
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

async function dismissBlockingTutorial(page: Page): Promise<boolean> {
  const selector = 'button[aria-label="Skip this tutorial"]';
  const control = await page.$(selector);
  if (!control) return false;
  const visible = await control.evaluate((element) => {
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
  });
  if (!visible) return false;
  await page.click(selector);
  await page.waitForSelector(selector, { hidden: true, timeout: 10_000 });
  return true;
}

async function waitForText(page: Page, text: string, selector = "body"): Promise<void> {
  await page.waitForFunction(
    (targetSelector, expected) => document.querySelector(targetSelector)?.textContent?.includes(expected),
    { timeout: 45_000 },
    selector,
    text,
  );
}

async function clickAndWaitPressed(page: Page, selector: string, pressed: boolean): Promise<void> {
  await page.click(selector);
  await page.waitForFunction(
    (targetSelector, expected) => document.querySelector(targetSelector)?.getAttribute("aria-pressed") === String(expected),
    { timeout: 30_000 },
    selector,
    pressed,
  );
}

async function auditWorkbench(page: Page): Promise<Pick<ViewResult, "mainCount" | "duplicateIds" | "unlabeledControls" | "horizontalOverflowPx">> {
  return page.evaluate(() => {
    const ids = new Map<string, number>();
    for (const element of document.querySelectorAll<HTMLElement>("[id]")) ids.set(element.id, (ids.get(element.id) || 0) + 1);
    const duplicateIds = [...ids.entries()].filter(([, count]) => count > 1).map(([id]) => id).sort();
    const scope = document.querySelector<HTMLElement>('[data-testid="hypothesis-workbench"]');
    if (!scope) throw new Error("Pattern Explorer workbench is not rendered.");
    const unlabeledControls = [...scope.querySelectorAll<HTMLElement>("button,input,select,textarea")]
      .filter((element) => {
        if (element.getAttribute("aria-hidden") === "true") return false;
        if (element instanceof HTMLInputElement && element.type === "hidden") return false;
        const style = window.getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden" || element.getClientRects().length === 0) return false;
        const label = element.id ? scope.querySelector(`label[for="${CSS.escape(element.id)}"]`) : null;
        const name = element.getAttribute("aria-label") || element.getAttribute("aria-labelledby") || element.getAttribute("title") || element.textContent?.trim();
        return !label && !element.closest("label") && !name;
      })
      .map((element) => element.getAttribute("data-testid") || element.tagName.toLowerCase())
      .slice(0, 20);
    const documentWidth = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0);
    return { mainCount: document.querySelectorAll("main").length, duplicateIds, unlabeledControls, horizontalOverflowPx: Math.max(0, documentWidth - window.innerWidth) };
  });
}

function dateDaysAgo(daysAgo: number): string {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

async function seedOwnedEvidence(account: Account): Promise<void> {
  for (let index = 0; index < 7; index += 1) {
    const daysAgo = 6 - index;
    const date = dateDaysAgo(daysAgo);
    const daily = await request("POST", `/api/users/${account.id}/daily-logs`, {
      date,
      mentalState: index + 2,
      physicalState: 5,
      emotionalState: 5,
    }, account.cookie);
    assert(daily.status === 200, `Daily-state fixture ${index + 1} returned ${daily.status}.`);
    const hydration = await request("POST", "/api/health-fitness/hydration", {
      volumeMl: 500 + index * 100,
      occurredAt: `${date}T12:00:00.000Z`,
      note: "Synthetic Pattern Explorer acceptance evidence",
    }, account.cookie, { "x-lyfeos-mutation-id": randomUUID(), "x-lyfeos-time-zone": "UTC" });
    assert(hydration.status === 201, `Hydration fixture ${index + 1} returned ${hydration.status}.`);
  }
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
  const account: Account = { id: 0, email: `pattern_production_${stamp}@example.com`, displayName: `pattern_production_${ordinal}_${stamp.slice(-8)}`, cookie: "" };
  let context: BrowserContext | null = null;
  let view: ViewResult | null = null;
  let cleanup: Cleanup = { viewport: viewport.name, accountErased: false, sessionInvalidated: false, emailReleased: false, displayNameReleased: false };
  let failure: unknown = null;
  try {
    const registration = await request("POST", "/api/auth/complete-registration", { email: account.email, password: PASSWORD, displayName: account.displayName, termsAccepted: true });
    assert(registration.status === 201, `Registration returned ${registration.status}.`);
    account.id = Number(registration.body.user?.id);
    account.cookie = registration.cookie;
    assert(Number.isInteger(account.id) && account.id > 0 && account.cookie, "Registration did not create a disposable owner and session.");
    const onboarding = await request("PATCH", "/api/profile", { onboardingCompleted: true }, account.cookie);
    assert(onboarding.status === 200 && onboarding.body?.onboardingCompleted === true, `Onboarding setup returned ${onboarding.status}.`);
    await seedOwnedEvidence(account);

    context = await browser.createBrowserContext();
    const page = await context.newPage();
    const signals = captureSignals(page);
    const session = cookieParts(account.cookie);
    await page.setCookie({ ...session, url: BASE_URL.origin, path: "/", httpOnly: true, secure: true, sameSite: "Lax" });
    await page.evaluateOnNewDocument((fixtureUser) => {
      try { localStorage.setItem("lyfeos_user", JSON.stringify(fixtureUser)); } catch { /* origin not ready */ }
    }, { id: account.id, displayName: account.displayName });
    await page.setViewport(viewport.value);
    await page.setCacheEnabled(false);
    await page.goto(new URL("/tracker", BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector('[data-testid="hypothesis-workbench"]', { visible: true, timeout: 60_000 });
    const tutorialDismissed = await dismissBlockingTutorial(page);
    await waitForText(page, "No saved hypotheses yet.", '[data-testid="hypothesis-workbench"]');

    const domainsDefaultedOff = await page.evaluate(() => ["missions", "daily_state", "health"].every((domain) => document.querySelector(`[data-testid="hypothesis-consent-${domain}"]`)?.getAttribute("aria-pressed") === "false"));
    assert(domainsDefaultedOff, "Pattern Explorer domains did not default off.");
    await clickAndWaitPressed(page, '[data-testid="hypothesis-consent-daily_state"]', true);
    await clickAndWaitPressed(page, '[data-testid="hypothesis-consent-health"]', true);
    const explicitConsentRendered = await page.evaluate(() => ["daily_state", "health"].every((domain) => document.querySelector(`[data-testid="hypothesis-consent-${domain}"]`)?.getAttribute("aria-pressed") === "true"));

    await page.type("#hypothesis-title", TITLE);
    await page.select("#hypothesis-left", "daily_state.mental_state");
    await page.select("#hypothesis-right", "health.hydration_ml");
    await page.select("#hypothesis-period", "14");
    await page.$eval('#hypothesis-workbench input[type="checkbox"]', (input) => (input as HTMLInputElement).click());
    await page.click('[data-testid="hypothesis-create"]');
    await waitForText(page, TITLE, '[data-testid="hypothesis-workbench"]');
    await waitForText(page, "r = 1.000", '[data-testid="hypothesis-workbench"]');

    const hypotheses = await request("GET", "/api/hypotheses", undefined, account.cookie);
    assert(hypotheses.status === 200 && hypotheses.body.hypotheses?.length === 1, "Rendered creation did not reconcile to one owner-scoped hypothesis.");
    const hypothesis = hypotheses.body.hypotheses[0];
    const result = hypothesis.latestSnapshot?.result;
    assert(result?.status === "available" && result.pairedSamples === 7 && result.coefficient === 1, "The synthetic evidence did not produce the expected bounded association.");
    const noProgressionOrAutomaticAction = result.progressionAwarded === false && result.automaticActionTaken === false;
    assert(noProgressionOrAutomaticAction, "Pattern analysis mutated progression or took an automatic action.");
    const availableAssociationRendered = await page.$eval(`[data-testid="hypothesis-card-${hypothesis.id}"]`, (card) => card.textContent?.includes("7 paired days") && card.textContent?.includes("50% aligned coverage"));
    await page.click(`[data-testid="hypothesis-card-${hypothesis.id}"] details`);
    const qualityDisclosureRendered = await page.$eval(`[data-testid="hypothesis-card-${hypothesis.id}"]`, (card) => {
      const text = card.textContent || "";
      return text.includes("7/14 recorded days") && text.includes("does not prove cause") && text.includes("An absent day is unknown, not zero intake");
    });
    assert(availableAssociationRendered && qualityDisclosureRendered, "Rendered association or evidence-quality disclosure is incomplete.");

    await page.type(`[data-testid="hypothesis-card-${hypothesis.id}"] input[aria-label="Private interpretation context"]`, PRIVATE_NOTE);
    await page.$eval(`[data-testid="hypothesis-card-${hypothesis.id}"] input[type="checkbox"]`, (input) => (input as HTMLInputElement).click());
    await page.click(`[data-testid="hypothesis-save-interpretation-${hypothesis.id}"]`);
    await waitForText(page, "Saved interpretations (1)", `[data-testid="hypothesis-card-${hypothesis.id}"]`);
    await page.click(`[data-testid="hypothesis-card-${hypothesis.id}"] details:last-of-type`);
    await waitForText(page, PRIVATE_NOTE, `[data-testid="hypothesis-card-${hypothesis.id}"]`);
    const privateInterpretationRendered = true;

    await page.click(`button[aria-label="Pause ${TITLE}"]`);
    await page.waitForSelector(`button[aria-label="Resume ${TITLE}"]`, { timeout: 30_000 });
    await page.click(`button[aria-label="Resume ${TITLE}"]`);
    await page.waitForSelector(`button[aria-label="Pause ${TITLE}"]`, { timeout: 30_000 });
    const pauseResumeRendered = true;

    await clickAndWaitPressed(page, '[data-testid="hypothesis-consent-health"]', false);
    await page.waitForSelector(`button[aria-label="Resume ${TITLE}"]`, { timeout: 30_000 });
    await waitForText(page, "domain consent revoked", `[data-testid="hypothesis-card-${hypothesis.id}"]`);
    const revoked = await request("GET", "/api/hypotheses", undefined, account.cookie);
    const revocationPausedAnalysis = revoked.body.hypotheses?.[0]?.status === "paused" && revoked.body.hypotheses?.[0]?.lastErrorCode === "domain_consent_revoked";
    assert(revocationPausedAnalysis, "Consent revocation did not pause the affected analysis.");
    await clickAndWaitPressed(page, '[data-testid="hypothesis-consent-health"]', true);
    await page.click(`button[aria-label="Resume ${TITLE}"]`);
    await page.waitForSelector(`button[aria-label="Pause ${TITLE}"]`, { timeout: 30_000 });

    await page.click(`button[aria-label="Delete ${TITLE}"]`);
    await waitForText(page, "No saved hypotheses yet.", '[data-testid="hypothesis-workbench"]');
    const finalHypotheses = await request("GET", "/api/hypotheses", undefined, account.cookie);
    const deletionRendered = finalHypotheses.status === 200 && finalHypotheses.body.hypotheses?.length === 0;
    assert(deletionRendered, "Rendered deletion did not reconcile to the owner API.");
    const rendered = await auditWorkbench(page);
    assert(rendered.mainCount === 1 && rendered.duplicateIds.length === 0 && rendered.unlabeledControls.length === 0 && rendered.horizontalOverflowPx <= 2, `${viewport.name} failed Pattern Explorer semantics or overflow checks.`);
    assert(Object.values(signals).every((items) => items.length === 0), `${viewport.name} produced application errors: ${JSON.stringify(signals)}.`);

    view = {
      viewport: viewport.name,
      tutorialDismissed,
      domainsDefaultedOff,
      explicitConsentRendered,
      availableAssociationRendered,
      qualityDisclosureRendered,
      privateInterpretationRendered,
      pauseResumeRendered,
      revocationPausedAnalysis,
      noProgressionOrAutomaticAction,
      deletionRendered,
      ...rendered,
      signals,
    };
  } catch (error) {
    failure = error;
  } finally {
    if (context) await context.close().catch(() => undefined);
    if (account.cookie) cleanup = await eraseAccount(account, viewport.name);
  }
  if (failure) throw new Error(`${safeError(failure)}; accountErased=${cleanup.accountErased}`);
  assert(view && cleanup.accountErased, `${viewport.name} did not complete the rendered journey and verified account erasure.`);
  return { view, cleanup };
}

async function main(): Promise<void> {
  assert(BASE_URL.origin === "https://lyfeos.net", "Production Pattern Explorer acceptance may target only https://lyfeos.net.");
  assert(/^[0-9a-f]{40}$/.test(SOURCE), "Production Pattern Explorer acceptance requires the exact deployed source revision.");
  assert(/^[0-9a-f]{40}$/.test(HARNESS_SOURCE), "Production Pattern Explorer acceptance requires the exact harness source revision.");
  const release = await request("GET", "/api/release");
  assert(release.status === 200 && release.body?.sourceRevision === SOURCE, "Production Pattern Explorer runtime does not match the requested immutable source.");
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
      contract: "lyfeos.production-pattern-explorer-browser.v1",
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL.origin,
      sourceRevision: SOURCE,
      harnessSource: HARNESS_SOURCE,
      views,
      cleanups,
      summary: { passed, failure },
      boundary: "Disposable production-account Chromium evidence for the private Pattern Explorer. It proves domains default off; explicit local-domain consent; a user-selected, seven-pair association with missing-data and provenance disclosure; a private interpretation; pause/resume; consent-revocation pausing; zero automatic action or progression; rendered deletion; responsive semantics; and verified account/session/identifier erasure. It does not prove causality, prediction, diagnosis, competence, cross-product adapters, provider data, real-device behavior, human assistive-technology comprehension, or longitudinal usefulness.",
    };
    await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    if (process.env.GITHUB_STEP_SUMMARY) {
      await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, [
        "## LyfeOS production Pattern Explorer acceptance",
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
    if (!passed && !failure) failure = "Production Pattern Explorer acceptance did not satisfy every rendered, analytical and cleanup invariant.";
  }
  if (failure) throw new Error(failure);
}

main().catch((error) => {
  console.error(safeError(error));
  process.exitCode = 1;
});
