import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer, { type Browser, type BrowserContext, type Page, type Viewport } from "puppeteer-core";
import { acknowledgeBoundedChunkRecovery, hasUnexpectedBrowserSignals, type BrowserSignals } from "./lib/production-browser-signals";

type ApiResult = { status: number; body: any; cookie: string; retryAfterSeconds: number | null };
type Account = { id: number; email: string; displayName: string; cookie: string };
type Signals = BrowserSignals & { expectedOfflineFailures: string[] };
type Audit = { mainCount: number; duplicateIds: string[]; invalidLabelReferences: string[]; unlabeledControls: string[]; horizontalOverflowPx: number };
type ViewResult = {
  viewport: string;
  quotaFailureLeftFormIntact: boolean;
  quotaFailureCreatedNoQueueItem: boolean;
  offlineRecordRenderedAsDeviceOnly: boolean;
  offlineRecordAbsentFromServer: boolean;
  reconnectSyncedExactlyOnce: boolean;
  reloadRenderedPersistedRecord: boolean;
  offlineMeasurementRenderedAsDeviceOnly: boolean;
  measurementReconnectSyncedExactlyOnce: boolean;
  reloadRenderedPersistedMeasurement: boolean;
  offlineSupplementRenderedAsDeviceOnly: boolean;
  supplementReconnectSyncedExactlyOnce: boolean;
  reloadRenderedPersistedSupplement: boolean;
  offlineRecoveryRenderedAsDeviceOnly: boolean;
  recoveryReconnectSyncedExactlyOnce: boolean;
  reloadRenderedPersistedRecovery: boolean;
  queueDrained: boolean;
  audit: Audit;
  signals: Signals;
};

const BASE_URL = new URL(process.env.LYFEOS_TEST_API_URL || "https://lyfeos.net");
const MODE = process.env.LYFEOS_HEALTH_OFFLINE_ACCEPTANCE_MODE || "production";
const SOURCE = process.env.LYFEOS_ACCEPTANCE_SOURCE || "";
const HARNESS_SOURCE = process.env.LYFEOS_ACCEPTANCE_HARNESS_SOURCE || process.env.GITHUB_SHA || "";
const OUTPUT_DIR = path.resolve(process.env.LYFEOS_HEALTH_OFFLINE_OUTPUT_DIR || path.join(os.tmpdir(), "lyfeos-production-health-offline"));
const OUTPUT_FILE = path.join(OUTPUT_DIR, "health-offline-report.json");
const PASSWORD = "TestPass123!";
const HYDRATION_ML = 432.1;
const WEIGHT_KG = 72.4;
const SUPPLEMENT_NAME = "Vitamin C";
const SUPPLEMENT_AMOUNT_MG = 250;
const RECOVERY_ACTIVITY_TYPE = "sauna";
const RECOVERY_DURATION_MINUTES = 20;
const VIEWPORTS: Array<{ name: string; value: Viewport }> = [
  { name: "desktop-1440x900", value: { width: 1440, height: 900, deviceScaleFactor: 1 } },
  { name: "mobile-390x844", value: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
];
const VIEWPORT_FILTER = process.env.LYFEOS_ACCEPTANCE_VIEWPORT?.trim() || null;
const SELECTED_VIEWPORTS = VIEWPORT_FILTER
  ? VIEWPORTS.filter((viewport) => viewport.name === VIEWPORT_FILTER)
  : VIEWPORTS;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/[a-z0-9._%+-]+@example\.com/gi, "[redacted fixture]")
    .replace(/health_offline_(owner|production)_[a-z0-9_]+/gi, "[redacted fixture]")
    .slice(0, 1_500);
}

async function request(method: string, pathname: string, body?: unknown, cookie = "", headers: Record<string, string> = {}): Promise<ApiResult> {
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
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await request("POST", "/api/auth/complete-registration", { email: account.email, password: PASSWORD, displayName: account.displayName, termsAccepted: true });
    if (result.status === 201) {
      account.id = Number(result.body.user?.id);
      account.cookie = result.cookie;
      assert(Number.isInteger(account.id) && account.id > 0 && account.cookie, "Registration did not create a disposable owner and session.");
      return;
    }
    if (result.status !== 429 || attempt === 2) throw new Error(`Registration returned ${result.status}.`);
    await new Promise((resolve) => setTimeout(resolve, Math.min(61, Math.max(1, result.retryAfterSeconds || 60)) * 1_000 + 250));
  }
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
    try { await access(candidate); return candidate; } catch { /* Continue through bounded locations. */ }
  }
  throw new Error("No Chromium executable found for Health offline acceptance.");
}

function cookieParts(cookie: string): { name: string; value: string } {
  const separator = cookie.indexOf("=");
  assert(separator > 0, "Registration did not return a usable session cookie.");
  return { name: cookie.slice(0, separator), value: cookie.slice(separator + 1) };
}

function captureSignals(page: Page, state: { intentionalOffline: boolean }): Signals {
  const signals: Signals = { consoleErrors: [], pageErrors: [], failedRequests: [], serverErrors: [], recoveredChunkLoads: [], expectedOfflineFailures: [] };
  page.on("console", (entry) => {
    if (entry.type() !== "error") return;
    const detail = `${entry.text()}${entry.location().url ? ` @ ${entry.location().url}` : ""}`.slice(0, 500);
    if (state.intentionalOffline && detail.includes("ERR_INTERNET_DISCONNECTED")) return;
    signals.consoleErrors.push(detail);
  });
  page.on("pageerror", (error) => signals.pageErrors.push(error.message.slice(0, 500)));
  page.on("requestfailed", (failed) => {
    const method = failed.method();
    const detail = `${method} ${new URL(failed.url()).pathname}: ${failed.failure()?.errorText || "failed"}`;
    if (["GET", "HEAD"].includes(method) && detail.includes("ERR_ABORTED")) return;
    if (state.intentionalOffline && detail.includes("ERR_INTERNET_DISCONNECTED")) signals.expectedOfflineFailures.push(detail.slice(0, 500));
    else if (failed.url().startsWith(BASE_URL.origin)) signals.failedRequests.push(detail.slice(0, 500));
  });
  page.on("response", (response) => {
    if (response.url().startsWith(BASE_URL.origin) && response.status() >= 500) signals.serverErrors.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  return signals;
}

async function dismissBlockingTutorial(page: Page): Promise<void> {
  await page.evaluate(() => {
    const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find((candidate) => {
      const label = candidate.getAttribute("aria-label") || "";
      const text = candidate.textContent?.trim() || "";
      return (label === "Skip this tutorial" || text === "Skip tour") && candidate.getClientRects().length > 0;
    });
    button?.click();
  });
}

async function setValue(page: Page, selector: string, value: string): Promise<void> {
  await page.waitForSelector(selector, { visible: true, timeout: 30_000 });
  await page.$eval(selector, (element, nextValue) => {
    const input = element as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, nextValue);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function clickReady(page: Page, selector: string): Promise<void> {
  await page.waitForSelector(selector, { visible: true, timeout: 30_000 });
  await page.waitForFunction((target) => {
    const control = document.querySelector<HTMLButtonElement>(target);
    return Boolean(control && !control.disabled && control.getClientRects().length);
  }, { timeout: 30_000 }, selector);
  await page.click(selector);
}

async function installQuotaFailure(page: Page): Promise<void> {
  await page.waitForFunction(async () => (await indexedDB.databases()).some((database) => database.name === "lyfeos-health-mutations"), { timeout: 30_000 });
  await page.evaluate(String.raw`
    window.__lyfeosOriginalIndexedDBOpen = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function () {
      throw new DOMException("Acceptance fixture quota", "QuotaExceededError");
    };
  `);
}

async function restoreIndexedDb(page: Page): Promise<void> {
  await page.evaluate(String.raw`
    if (window.__lyfeosOriginalIndexedDBOpen) {
      IDBFactory.prototype.open = window.__lyfeosOriginalIndexedDBOpen;
      delete window.__lyfeosOriginalIndexedDBOpen;
    }
  `);
}

async function auditPage(page: Page): Promise<Audit> {
  return page.evaluate(() => {
    const scope = document.querySelector<HTMLElement>('[data-testid="health-page"]');
    if (!scope) throw new Error("Health acceptance scope is not rendered.");
    const ids = new Map<string, number>();
    for (const element of document.querySelectorAll<HTMLElement>("[id]")) ids.set(element.id, (ids.get(element.id) || 0) + 1);
    const invalidLabelReferences = [...scope.querySelectorAll<HTMLElement>("[aria-labelledby]")]
      .filter((element) => (element.getAttribute("aria-labelledby") || "").split(/\s+/).some((id) => id && !document.getElementById(id)))
      .map((element) => element.getAttribute("data-testid") || element.tagName.toLowerCase());
    const unlabeledControls = [...scope.querySelectorAll<HTMLElement>("button,input,select,textarea,[role=button]")]
      .filter((element) => {
        if (element.getAttribute("aria-hidden") === "true") return false;
        if (element instanceof HTMLInputElement && element.type === "hidden") return false;
        const style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden" || element.getClientRects().length === 0) return false;
        const label = element.id ? scope.querySelector(`label[for="${CSS.escape(element.id)}"]`) : null;
        const name = element.getAttribute("aria-label") || element.getAttribute("aria-labelledby") || element.getAttribute("title") || element.textContent?.trim();
        return !label && !element.closest("label") && !name;
      })
      .map((element) => element.getAttribute("data-testid") || element.tagName.toLowerCase())
      .slice(0, 20);
    const width = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0);
    return {
      mainCount: document.querySelectorAll("main").length,
      duplicateIds: [...ids.entries()].filter(([, count]) => count > 1).map(([id]) => id).sort(),
      invalidLabelReferences,
      unlabeledControls,
      horizontalOverflowPx: Math.max(0, width - window.innerWidth),
    };
  });
}

async function readHydration(account: Account, date: string, timeZone: string, utcOffsetMinutes: number): Promise<any[]> {
  const result = await request("GET", `/api/health-fitness/hydration?date=${encodeURIComponent(date)}`, undefined, account.cookie, { "x-lyfeos-time-zone": timeZone, "x-lyfeos-utc-offset-minutes": String(utcOffsetMinutes) });
  assert(result.status === 200 && Array.isArray(result.body?.entries), `Hydration read returned ${result.status}.`);
  return result.body.entries;
}

function isAcceptanceHydration(entry: any): boolean {
  return entry?.inputUnit === "ml"
    && Math.abs(Number(entry.inputQuantity) - HYDRATION_ML) < 0.001
    && Number(entry.volumeMl) === Math.round(HYDRATION_ML);
}

async function waitForHydrationCount(account: Account, date: string, timeZone: string, utcOffsetMinutes: number, expected: number): Promise<void> {
  const deadline = Date.now() + 45_000;
  let latest = -1;
  while (Date.now() < deadline) {
    latest = (await readHydration(account, date, timeZone, utcOffsetMinutes)).filter(isAcceptanceHydration).length;
    if (latest === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Expected ${expected} accepted hydration record(s), observed ${latest}.`);
}

async function readMeasurements(account: Account): Promise<any[]> {
  const result = await request("GET", "/api/health-fitness/measurements", undefined, account.cookie);
  assert(result.status === 200 && Array.isArray(result.body?.measurements), `Measurement read returned ${result.status}.`);
  return result.body.measurements;
}

function isAcceptanceWeight(entry: any): boolean {
  return entry?.metric === "weight" && entry?.unit === "kg" && Math.abs(Number(entry?.value) - WEIGHT_KG) < 0.001;
}

async function waitForWeightCount(account: Account, expected: number): Promise<void> {
  const deadline = Date.now() + 45_000;
  let latest = -1;
  while (Date.now() < deadline) {
    latest = (await readMeasurements(account)).filter(isAcceptanceWeight).length;
    if (latest === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Expected ${expected} accepted weight record(s), observed ${latest}.`);
}

async function readSupplements(account: Account, date: string, timeZone: string, utcOffsetMinutes: number): Promise<any[]> {
  const result = await request("GET", `/api/health-fitness/supplements?date=${encodeURIComponent(date)}`, undefined, account.cookie, { "x-lyfeos-time-zone": timeZone, "x-lyfeos-utc-offset-minutes": String(utcOffsetMinutes) });
  assert(result.status === 200 && Array.isArray(result.body?.entries), `Supplement read returned ${result.status}.`);
  return result.body.entries;
}

function isAcceptanceSupplement(entry: any): boolean {
  return entry?.name === SUPPLEMENT_NAME && entry?.unit === "mg" && Math.abs(Number(entry?.amount) - SUPPLEMENT_AMOUNT_MG) < 0.001;
}

async function waitForSupplementCount(account: Account, date: string, timeZone: string, utcOffsetMinutes: number, expected: number): Promise<void> {
  const deadline = Date.now() + 45_000;
  let latest = -1;
  while (Date.now() < deadline) {
    latest = (await readSupplements(account, date, timeZone, utcOffsetMinutes)).filter(isAcceptanceSupplement).length;
    if (latest === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Expected ${expected} accepted supplement record(s), observed ${latest}.`);
}

async function readRecoveryActivities(account: Account, date: string, timeZone: string, utcOffsetMinutes: number): Promise<any[]> {
  const result = await request("GET", `/api/recovery-activities?date=${encodeURIComponent(date)}`, undefined, account.cookie, { "x-lyfeos-time-zone": timeZone, "x-lyfeos-utc-offset-minutes": String(utcOffsetMinutes) });
  assert(result.status === 200 && Array.isArray(result.body?.activities), `Recovery activity read returned ${result.status}.`);
  return result.body.activities;
}

function isAcceptanceRecoveryActivity(entry: any): boolean {
  return entry?.activityType === RECOVERY_ACTIVITY_TYPE && Number(entry?.durationMinutes) === RECOVERY_DURATION_MINUTES;
}

async function waitForRecoveryActivityCount(account: Account, date: string, timeZone: string, utcOffsetMinutes: number, expected: number): Promise<void> {
  const deadline = Date.now() + 45_000;
  let latest = -1;
  while (Date.now() < deadline) {
    latest = (await readRecoveryActivities(account, date, timeZone, utcOffsetMinutes)).filter(isAcceptanceRecoveryActivity).length;
    if (latest === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Expected ${expected} accepted recovery activity record(s), observed ${latest}.`);
}

async function eraseAccount(account: Account): Promise<boolean> {
  if (!account.cookie) return true;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const deletion = await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, account.cookie).catch(() => null);
    if (deletion && deletion.status >= 200 && deletion.status < 300) break;
    if ((await request("GET", "/api/auth/me", undefined, account.cookie).catch(() => null))?.status === 401) break;
  }
  const session = await request("GET", "/api/auth/me", undefined, account.cookie).catch(() => null);
  const email = await request("GET", `/api/auth/check-email?email=${encodeURIComponent(account.email)}`).catch(() => null);
  const displayName = await request("GET", `/api/auth/check-display-name?displayName=${encodeURIComponent(account.displayName)}`).catch(() => null);
  return session?.status === 401 && email?.status === 200 && email.body?.available === true && displayName?.status === 200 && displayName.body?.available === true;
}

async function runViewport(browser: Browser, viewport: { name: string; value: Viewport }, ordinal: number): Promise<{ view: ViewResult; accountErased: boolean }> {
  const stamp = `${Date.now()}_${ordinal}_${randomUUID().slice(0, 8)}`;
  const account: Account = { id: 0, email: `health_offline_production_${stamp}@example.com`, displayName: `health_offline_owner_${ordinal}_${stamp.slice(-8)}`, cookie: "" };
  let context: BrowserContext | null = null;
  let quotaFailureInstalled = false;
  let page: Page | null = null;
  let view: ViewResult | null = null;
  let accountErased = false;
  let failure: unknown = null;
  let stage = "register disposable account";
  try {
    await registerDisposableAccount(account);
    stage = "complete onboarding fixture";
    const onboarding = await request("PATCH", "/api/profile", { onboardingCompleted: true }, account.cookie);
    assert(onboarding.status === 200, `Onboarding setup returned ${onboarding.status}.`);

    context = await browser.createBrowserContext();
    page = await context.newPage();
    const offlineState = { intentionalOffline: false };
    const signals = captureSignals(page, offlineState);
    const session = cookieParts(account.cookie);
    await page.setCookie({ ...session, url: BASE_URL.origin, path: "/", httpOnly: true, secure: true, sameSite: "Lax" });
    await page.evaluateOnNewDocument((fixtureUser) => {
      try { localStorage.setItem("lyfeos_user", JSON.stringify(fixtureUser)); } catch { /* Origin storage can be unavailable before navigation. */ }
    }, { id: account.id, displayName: account.displayName });
    await page.setViewport(viewport.value);
    await page.setCacheEnabled(false);
    stage = "navigate to Health";
    await page.goto(new URL("/health", BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    stage = "wait for Health page";
    await page.waitForSelector('[data-testid="health-page"]', { visible: true, timeout: 60_000 });
    stage = "wait for daily Health log";
    await page.waitForSelector('[data-testid="daily-health-log"]', { visible: true, timeout: 60_000 });
    await dismissBlockingTutorial(page);
    stage = "read browser date context";
    const localContext = await page.evaluate(() => {
      const now = new Date();
      return {
        date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        utcOffsetMinutes: -now.getTimezoneOffset(),
      };
    });
    stage = "prove initial hydration absence";
    await waitForHydrationCount(account, localContext.date, localContext.timeZone, localContext.utcOffsetMinutes, 0);

    stage = "prepare quota-failure hydration";
    await setValue(page, '[data-testid="health-hydration-amount"]', String(HYDRATION_ML));
    offlineState.intentionalOffline = true;
    await page.setOfflineMode(true);
    await installQuotaFailure(page);
    quotaFailureInstalled = true;
    const quotaFailureObserved = await page.evaluate(() => {
      try { indexedDB.open("lyfeos-health-mutations", 1); return false; }
      catch (error) { return error instanceof DOMException && error.name === "QuotaExceededError"; }
    });
    assert(quotaFailureObserved, "The browser did not observe the quota-refusal fixture.");
    stage = "submit with unavailable offline storage";
    await clickReady(page, '[data-testid="health-hydration-save"]');
    stage = "wait for storage refusal";
    await page.waitForFunction(() => document.body.innerText.includes("Hydration was not saved"), { timeout: 30_000 }).catch(async (error) => {
      const state = await page.evaluate(() => ({
        online: navigator.onLine,
        amount: (document.querySelector('[data-testid="health-hydration-amount"]') as HTMLInputElement | null)?.value || null,
        saveDisabled: (document.querySelector('[data-testid="health-hydration-save"]') as HTMLButtonElement | null)?.disabled ?? null,
        storageUnavailable: Boolean(document.querySelector('[data-testid="health-offline-storage-unavailable"]')),
        queueVisible: Boolean(document.querySelector('[data-testid="health-offline-queue"]')),
        saveErrorVisible: document.body.innerText.includes("Could not save that hydration record"),
      }));
      throw new Error(`${safeError(error)}; state=${JSON.stringify(state)}`);
    });
    const quotaFailureLeftFormIntact = await page.$eval('[data-testid="health-hydration-amount"]', (input) => (input as HTMLInputElement).value === String(432.1));
    const quotaFailureCreatedNoQueueItem = (await page.$$('[data-testid="health-offline-queue"]')).length === 0;
    assert(quotaFailureLeftFormIntact && quotaFailureCreatedNoQueueItem, "Unavailable offline storage either cleared the form or falsely claimed a queued record.");
    stage = "prove quota-refused record absent from server";
    await waitForHydrationCount(account, localContext.date, localContext.timeZone, localContext.utcOffsetMinutes, 0);

    stage = "restore offline storage";
    await restoreIndexedDb(page);
    quotaFailureInstalled = false;
    stage = "submit durable offline hydration";
    await clickReady(page, '[data-testid="health-hydration-save"]');
    stage = "wait for offline queue";
    await page.waitForSelector('[data-testid="health-offline-queue"]', { visible: true, timeout: 30_000 });
    stage = "wait for queued hydration label";
    await page.waitForFunction(() => document.querySelector('[data-testid="health-offline-queue"]')?.textContent?.includes("Hydration record"), { timeout: 30_000 });
    const offlineRecordRenderedAsDeviceOnly = true;
    stage = "prove queued record absent from server";
    await waitForHydrationCount(account, localContext.date, localContext.timeZone, localContext.utcOffsetMinutes, 0);
    const offlineRecordAbsentFromServer = true;

    offlineState.intentionalOffline = false;
    await page.setOfflineMode(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    stage = "wait for reconnect queue drainage";
    await page.waitForSelector('[data-testid="health-offline-queue"]', { hidden: true, timeout: 45_000 });
    stage = "prove exactly one reconnected record";
    await waitForHydrationCount(account, localContext.date, localContext.timeZone, localContext.utcOffsetMinutes, 1);
    const reconnectSyncedExactlyOnce = true;

    stage = "reload Health";
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
    stage = "wait for reloaded Health page";
    await page.waitForSelector('[data-testid="health-page"]', { visible: true, timeout: 60_000 });
    stage = "wait for persisted hydration rendering";
    await page.waitForFunction((value) => document.body.innerText.includes(`${value} ml`), { timeout: 45_000 }, String(HYDRATION_ML));
    stage = "re-prove exactly one persisted record";
    await waitForHydrationCount(account, localContext.date, localContext.timeZone, localContext.utcOffsetMinutes, 1);
    const reloadRenderedPersistedRecord = true;
    const queueDrained = (await page.$$('[data-testid="health-offline-queue"]')).length === 0;
    assert(queueDrained, "The Health offline queue did not drain after the server accepted the record.");

    stage = "prove initial weight absence";
    await waitForWeightCount(account, 0);
    stage = "submit durable offline weight";
    await setValue(page, '[data-testid="health-weight-amount"]', String(WEIGHT_KG));
    offlineState.intentionalOffline = true;
    await page.setOfflineMode(true);
    await clickReady(page, '[data-testid="health-weight-save"]');
    stage = "wait for queued measurement label";
    await page.waitForSelector('[data-testid="health-offline-queue"]', { visible: true, timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector('[data-testid="health-offline-queue"]')?.textContent?.includes("Measurement record"), { timeout: 30_000 });
    const offlineMeasurementRenderedAsDeviceOnly = true;
    stage = "prove queued weight absent from server";
    await waitForWeightCount(account, 0);
    offlineState.intentionalOffline = false;
    await page.setOfflineMode(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    stage = "wait for weight reconnect queue drainage";
    await page.waitForSelector('[data-testid="health-offline-queue"]', { hidden: true, timeout: 45_000 });
    stage = "prove exactly one reconnected weight";
    await waitForWeightCount(account, 1);
    const measurementReconnectSyncedExactlyOnce = true;
    stage = "reload Health after weight sync";
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector('[data-testid="daily-health-log"]', { visible: true, timeout: 60_000 });
    await page.waitForFunction((value) => document.body.innerText.includes(`${value} kg`), { timeout: 45_000 }, String(WEIGHT_KG));
    await waitForWeightCount(account, 1);
    const reloadRenderedPersistedMeasurement = true;

    stage = "prove initial supplement absence";
    await waitForSupplementCount(account, localContext.date, localContext.timeZone, localContext.utcOffsetMinutes, 0);
    stage = "submit durable offline supplement";
    await setValue(page, '[data-testid="health-supplement-name"]', SUPPLEMENT_NAME);
    await setValue(page, '[data-testid="health-supplement-amount"]', String(SUPPLEMENT_AMOUNT_MG));
    await setValue(page, '[data-testid="health-supplement-unit"]', "mg");
    offlineState.intentionalOffline = true;
    await page.setOfflineMode(true);
    await clickReady(page, '[data-testid="health-supplement-save"]');
    stage = "wait for queued supplement label";
    await page.waitForSelector('[data-testid="health-offline-queue"]', { visible: true, timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector('[data-testid="health-offline-queue"]')?.textContent?.includes("Supplement record"), { timeout: 30_000 });
    const offlineSupplementRenderedAsDeviceOnly = true;
    stage = "prove queued supplement absent from server";
    await waitForSupplementCount(account, localContext.date, localContext.timeZone, localContext.utcOffsetMinutes, 0);
    offlineState.intentionalOffline = false;
    await page.setOfflineMode(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    stage = "wait for supplement reconnect queue drainage";
    await page.waitForSelector('[data-testid="health-offline-queue"]', { hidden: true, timeout: 45_000 });
    stage = "prove exactly one reconnected supplement";
    await waitForSupplementCount(account, localContext.date, localContext.timeZone, localContext.utcOffsetMinutes, 1);
    const supplementReconnectSyncedExactlyOnce = true;
    stage = "reload Health after supplement sync";
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector('[data-testid="daily-health-log"]', { visible: true, timeout: 60_000 });
    await page.waitForFunction((name, amount) => document.body.innerText.includes(`${name} ${amount} mg`), { timeout: 45_000 }, SUPPLEMENT_NAME, String(SUPPLEMENT_AMOUNT_MG));
    await waitForSupplementCount(account, localContext.date, localContext.timeZone, localContext.utcOffsetMinutes, 1);
    const reloadRenderedPersistedSupplement = true;

    stage = "load recovery log";
    await page.evaluate(() => document.getElementById("health-section-recovery")?.scrollIntoView({ block: "center" }));
    await page.waitForSelector('[data-testid="recovery-log"]', { visible: true, timeout: 60_000 });
    stage = "prove initial recovery absence";
    await waitForRecoveryActivityCount(account, localContext.date, localContext.timeZone, localContext.utcOffsetMinutes, 0);
    stage = "submit durable offline recovery activity";
    await page.select('[data-testid="recovery-activity-type"]', RECOVERY_ACTIVITY_TYPE);
    await setValue(page, '[data-testid="recovery-duration-minutes"]', String(RECOVERY_DURATION_MINUTES));
    offlineState.intentionalOffline = true;
    await page.setOfflineMode(true);
    await clickReady(page, '[data-testid="recovery-save"]');
    stage = "wait for queued recovery label";
    await page.waitForSelector('[data-testid="health-offline-queue"]', { visible: true, timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector('[data-testid="health-offline-queue"]')?.textContent?.includes("Recovery record"), { timeout: 30_000 });
    const offlineRecoveryRenderedAsDeviceOnly = true;
    stage = "prove queued recovery activity absent from server";
    await waitForRecoveryActivityCount(account, localContext.date, localContext.timeZone, localContext.utcOffsetMinutes, 0);
    offlineState.intentionalOffline = false;
    await page.setOfflineMode(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    stage = "wait for recovery reconnect queue drainage";
    await page.waitForSelector('[data-testid="health-offline-queue"]', { hidden: true, timeout: 45_000 });
    stage = "prove exactly one reconnected recovery activity";
    await waitForRecoveryActivityCount(account, localContext.date, localContext.timeZone, localContext.utcOffsetMinutes, 1);
    const recoveryReconnectSyncedExactlyOnce = true;
    stage = "reload Health after recovery sync";
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector('[data-testid="health-page"]', { visible: true, timeout: 60_000 });
    await page.evaluate(() => document.getElementById("health-section-recovery")?.scrollIntoView({ block: "center" }));
    await page.waitForSelector('[data-testid="recovery-log"]', { visible: true, timeout: 60_000 });
    await page.waitForFunction((label, minutes) => document.body.innerText.includes(`${label} · ${minutes}m`), { timeout: 45_000 }, "Sauna", String(RECOVERY_DURATION_MINUTES));
    await waitForRecoveryActivityCount(account, localContext.date, localContext.timeZone, localContext.utcOffsetMinutes, 1);
    const reloadRenderedPersistedRecovery = true;

    stage = "audit final Health page";
    const audit = await auditPage(page);
    assert(audit.mainCount === 1 && audit.duplicateIds.length === 0 && audit.invalidLabelReferences.length === 0 && audit.unlabeledControls.length === 0 && audit.horizontalOverflowPx <= 2, `${viewport.name} failed Health semantics or overflow checks.`);
    await acknowledgeBoundedChunkRecovery(page, signals);
    assert(!hasUnexpectedBrowserSignals(signals), `${viewport.name} produced unexpected browser signals: ${JSON.stringify(signals)}.`);
    view = { viewport: viewport.name, quotaFailureLeftFormIntact, quotaFailureCreatedNoQueueItem, offlineRecordRenderedAsDeviceOnly, offlineRecordAbsentFromServer, reconnectSyncedExactlyOnce, reloadRenderedPersistedRecord, offlineMeasurementRenderedAsDeviceOnly, measurementReconnectSyncedExactlyOnce, reloadRenderedPersistedMeasurement, offlineSupplementRenderedAsDeviceOnly, supplementReconnectSyncedExactlyOnce, reloadRenderedPersistedSupplement, offlineRecoveryRenderedAsDeviceOnly, recoveryReconnectSyncedExactlyOnce, reloadRenderedPersistedRecovery, queueDrained, audit, signals };
  } catch (error) {
    const pages = context ? await context.pages().catch(() => []) : [];
    const rendered = pages[0] ? await pages[0].evaluate(() => document.body?.innerText.slice(0, 4_000) || "").catch(() => "") : "";
    failure = new Error(`${stage}: ${safeError(error)}${rendered ? `; rendered=${rendered}` : ""}`);
  } finally {
    if (quotaFailureInstalled && page) await restoreIndexedDb(page).catch(() => undefined);
    if (context) await context.close().catch(() => undefined);
    if (account.cookie) accountErased = await eraseAccount(account);
  }
  if (failure) throw new Error(`${safeError(failure)}; accountErased=${accountErased}`);
  assert(view && accountErased, `${viewport.name} did not complete the Health offline lifecycle and verified account erasure.`);
  return { view, accountErased };
}

async function main(): Promise<void> {
  if (MODE === "production") assert(BASE_URL.origin === "https://lyfeos.net", "Production Health offline acceptance may target only https://lyfeos.net.");
  assert(/^[0-9a-f]{40}$/.test(SOURCE), "Health offline acceptance requires the exact deployed source revision.");
  assert(/^[0-9a-f]{40}$/.test(HARNESS_SOURCE), "Health offline acceptance requires the exact harness source revision.");
  assert(SELECTED_VIEWPORTS.length > 0, `Unknown Health offline acceptance viewport: ${VIEWPORT_FILTER || "none"}.`);
  const release = await request("GET", "/api/release");
  assert(release.status === 200 && release.body?.sourceRevision === SOURCE, "Health offline runtime does not match the requested immutable source.");
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({ executablePath: await findChromium(), headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] });
  const views: ViewResult[] = [];
  const cleanup: Array<{ viewport: string; accountErased: boolean }> = [];
  try {
    for (const [ordinal, viewport] of SELECTED_VIEWPORTS.entries()) {
      const result = await runViewport(browser, viewport, ordinal);
      views.push(result.view);
      cleanup.push({ viewport: viewport.name, accountErased: result.accountErased });
    }
  } finally {
    await browser.close().catch(() => undefined);
  }

  const passed = views.length === SELECTED_VIEWPORTS.length && views.every((view) => view.quotaFailureLeftFormIntact && view.quotaFailureCreatedNoQueueItem && view.offlineRecordRenderedAsDeviceOnly && view.offlineRecordAbsentFromServer && view.reconnectSyncedExactlyOnce && view.reloadRenderedPersistedRecord && view.offlineMeasurementRenderedAsDeviceOnly && view.measurementReconnectSyncedExactlyOnce && view.reloadRenderedPersistedMeasurement && view.offlineSupplementRenderedAsDeviceOnly && view.supplementReconnectSyncedExactlyOnce && view.reloadRenderedPersistedSupplement && view.offlineRecoveryRenderedAsDeviceOnly && view.recoveryReconnectSyncedExactlyOnce && view.reloadRenderedPersistedRecovery && view.queueDrained && !hasUnexpectedBrowserSignals(view.signals)) && cleanup.every((item) => item.accountErased);
  const report = {
    contract: "lyfeos.production-health-offline-browser.v1",
    generatedAt: new Date().toISOString(),
    targetOrigin: BASE_URL.origin,
    sourceRevision: SOURCE,
    harnessSource: HARNESS_SOURCE,
    evidenceBoundary: "Automated Chromium proves the supported online-loaded offline queue, unavailable-storage refusal, reconnect, exact-once persistence, reload and cleanup lifecycles. It does not prove first-ever offline use, storage eviction, every physical browser/device, human assistive-technology comprehension or recovery after site-data deletion.",
    views,
    cleanup,
    passed,
  };
  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  assert(passed, `Health offline acceptance failed; report=${OUTPUT_FILE}`);
  console.log(JSON.stringify({ contract: report.contract, passed, viewCount: views.length, accountErased: cleanup.every((item) => item.accountErased) }));
}

main().catch(async (error) => {
  await fs.mkdir(OUTPUT_DIR, { recursive: true }).catch(() => undefined);
  await fs.writeFile(path.join(OUTPUT_DIR, "health-offline-failure.json"), `${JSON.stringify({ contract: "lyfeos.production-health-offline-browser.failure.v1", generatedAt: new Date().toISOString(), sourceRevision: SOURCE, harnessSource: HARNESS_SOURCE, error: safeError(error) }, null, 2)}\n`, "utf8").catch(() => undefined);
  console.error(safeError(error));
  process.exitCode = 1;
});
