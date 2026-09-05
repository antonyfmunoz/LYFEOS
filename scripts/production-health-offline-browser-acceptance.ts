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
  offlineObservationRenderedAsDeviceOnly: boolean;
  observationReconnectSyncedExactlyOnce: boolean;
  reloadRenderedPersistedObservation: boolean;
  offlineSleepSessionRenderedAsDeviceOnly: boolean;
  sleepSessionReconnectSyncedExactlyOnce: boolean;
  reloadRenderedPersistedSleepSession: boolean;
  offlineWorkoutRenderedAsDeviceOnly: boolean;
  workoutReconnectSyncedExactlyOnce: boolean;
  reloadRenderedPersistedWorkout: boolean;
  offlineNutritionRenderedAsDeviceOnly: boolean;
  nutritionReconnectSyncedExactlyOnce: boolean;
  reloadRenderedPersistedNutrition: boolean;
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
const OBSERVATION_NAME = "Acceptance resting heart rate";
const OBSERVATION_VALUE_BPM = 60;
const OBSERVATION_UNIT = "bpm";
const WORKOUT_ACTIVITY_TYPE = "Acceptance mobility session";
const WORKOUT_DURATION_MINUTES = 30;
const NUTRITION_FOOD_NAME = "Acceptance measured oats";
const NUTRITION_QUANTITY_GRAMS = 41;
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

/**
 * Clerk can defer a presentation-only browser chunk until a control becomes
 * visible. During this journey we deliberately take the already-loaded Health
 * screen offline. A failed fetch for that exact third-party chunk is expected
 * transport evidence, provided the app finishes its own queued-write and
 * reload lifecycle after reconnect. Do not broaden this exception to LyfeOS
 * assets or to arbitrary page errors.
 */
function isExpectedOfflineClerkChunkError(message: string): boolean {
  return /ChunkLoadError: Loading chunk \d+ failed\.\s*\(error: https:\/\/clerk\.lyfeos\.net\/npm\/@clerk\/clerk-js@\d+(?:\.\d+){1,3}\/dist\/[\w.-]+\.js\)/i.test(message);
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
  page.on("pageerror", (error) => {
    const message = error.message.slice(0, 500);
    if (state.intentionalOffline && isExpectedOfflineClerkChunkError(message)) {
      signals.expectedOfflineFailures.push(`pageerror ${message}`);
      return;
    }
    signals.pageErrors.push(message);
  });
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

async function readHealthObservations(account: Account): Promise<any[]> {
  const result = await request("GET", "/api/health-observations", undefined, account.cookie);
  assert(result.status === 200 && Array.isArray(result.body?.observations), `Health-observation read returned ${result.status}.`);
  return result.body.observations;
}

function isAcceptanceObservation(entry: any): boolean {
  return entry?.displayName === OBSERVATION_NAME && entry?.unit === OBSERVATION_UNIT && Number(entry?.value) === OBSERVATION_VALUE_BPM;
}

async function waitForObservationCount(account: Account, expected: number): Promise<void> {
  const deadline = Date.now() + 45_000;
  let latest = -1;
  while (Date.now() < deadline) {
    latest = (await readHealthObservations(account)).filter(isAcceptanceObservation).length;
    if (latest === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Expected ${expected} accepted health observation(s), observed ${latest}.`);
}

async function readSleepSessions(account: Account, date: string, timeZone: string, utcOffsetMinutes: number): Promise<any[]> {
  const result = await request("GET", `/api/health-fitness/sleep?days=14&endDate=${encodeURIComponent(date)}`, undefined, account.cookie, { "x-lyfeos-time-zone": timeZone, "x-lyfeos-utc-offset-minutes": String(utcOffsetMinutes) });
  assert(result.status === 200 && Array.isArray(result.body?.sessions), `Sleep-session read returned ${result.status}.`);
  return result.body.sessions;
}

function isAcceptanceSleepSession(entry: any, startedAt: string, endedAt: string): boolean {
  return entry?.source === "manual" && entry?.startedAt === startedAt && entry?.endedAt === endedAt && Number(entry?.durationMinutes) === 420;
}

async function waitForSleepSessionCount(account: Account, date: string, timeZone: string, utcOffsetMinutes: number, startedAt: string, endedAt: string, expected: number): Promise<void> {
  const deadline = Date.now() + 45_000;
  let latest = -1;
  while (Date.now() < deadline) {
    latest = (await readSleepSessions(account, date, timeZone, utcOffsetMinutes)).filter((entry) => isAcceptanceSleepSession(entry, startedAt, endedAt)).length;
    if (latest === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Expected ${expected} accepted sleep session(s), observed ${latest}.`);
}

async function readWorkouts(account: Account, date: string, timeZone: string, utcOffsetMinutes: number): Promise<any[]> {
  const result = await request("GET", `/api/workouts?date=${encodeURIComponent(date)}`, undefined, account.cookie, { "x-lyfeos-time-zone": timeZone, "x-lyfeos-utc-offset-minutes": String(utcOffsetMinutes) });
  assert(result.status === 200 && Array.isArray(result.body?.workouts), `Workout read returned ${result.status}.`);
  return result.body.workouts;
}

function isAcceptanceWorkout(entry: any): boolean {
  return entry?.activityType === WORKOUT_ACTIVITY_TYPE && Number(entry?.durationMinutes) === WORKOUT_DURATION_MINUTES;
}

async function waitForWorkoutCount(account: Account, date: string, timeZone: string, utcOffsetMinutes: number, expected: number): Promise<void> {
  const deadline = Date.now() + 45_000;
  let latest = -1;
  while (Date.now() < deadline) {
    latest = (await readWorkouts(account, date, timeZone, utcOffsetMinutes)).filter(isAcceptanceWorkout).length;
    if (latest === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Expected ${expected} accepted workout(s), observed ${latest}.`);
}

async function createAcceptanceFood(account: Account): Promise<number> {
  const created = await request("POST", "/api/nutrition/foods", {
    name: NUTRITION_FOOD_NAME,
    servingSizeGrams: 100,
    nutrients: [
      { nutrientKey: "energy_kcal", amountPer100g: 389 },
      { nutrientKey: "protein_g", amountPer100g: 16.9 },
      { nutrientKey: "carbohydrate_g", amountPer100g: 66.3 },
      { nutrientKey: "fat_g", amountPer100g: 6.9 },
    ],
  }, account.cookie);
  assert(created.status === 201 && Number.isInteger(created.body?.food?.id), `Acceptance food creation returned ${created.status}.`);
  return created.body.food.id;
}

async function readNutritionDiary(account: Account, date: string, timeZone: string, utcOffsetMinutes: number): Promise<any[]> {
  const result = await request("GET", `/api/nutrition/diary?date=${encodeURIComponent(date)}`, undefined, account.cookie, { "x-lyfeos-time-zone": timeZone, "x-lyfeos-utc-offset-minutes": String(utcOffsetMinutes) });
  assert(result.status === 200 && Array.isArray(result.body?.entries), `Nutrition diary read returned ${result.status}.`);
  return result.body.entries;
}

function isAcceptanceNutrition(entry: any): boolean {
  return entry?.foodName === NUTRITION_FOOD_NAME
    && entry?.inputUnit === "g"
    && Math.abs(Number(entry?.inputQuantity) - NUTRITION_QUANTITY_GRAMS) < 0.001
    && Math.abs(Number(entry?.servingGrams) - NUTRITION_QUANTITY_GRAMS) < 0.001;
}

async function waitForNutritionCount(account: Account, date: string, timeZone: string, utcOffsetMinutes: number, expected: number): Promise<void> {
  const deadline = Date.now() + 45_000;
  let latest = -1;
  while (Date.now() < deadline) {
    latest = (await readNutritionDiary(account, date, timeZone, utcOffsetMinutes)).filter(isAcceptanceNutrition).length;
    if (latest === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Expected ${expected} accepted nutrition record(s), observed ${latest}.`);
}

async function clickButtonWithText(page: Page, scopeSelector: string, label: string): Promise<void> {
  const clicked = await page.$eval(scopeSelector, (scope, targetLabel) => {
    const button = Array.from(scope.querySelectorAll("button")).find((candidate) => candidate.textContent?.trim().includes(String(targetLabel)) && !(candidate as HTMLButtonElement).disabled) as HTMLButtonElement | undefined;
    if (!button) return false;
    button.click();
    return true;
  }, label);
  assert(clicked, `Could not activate ${label} in ${scopeSelector}.`);
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

    stage = "load health metrics ledger";
    await page.evaluate(() => document.getElementById("health-section-metrics")?.scrollIntoView({ block: "center" }));
    await page.waitForSelector('[data-testid="health-metrics-ledger"]', { visible: true, timeout: 60_000 });
    stage = "prove initial health observation absence";
    await waitForObservationCount(account, 0);
    stage = "submit durable offline health observation";
    await setValue(page, '[data-testid="health-observation-name"]', OBSERVATION_NAME);
    await setValue(page, '[data-testid="health-observation-unit"]', OBSERVATION_UNIT);
    await setValue(page, '[data-testid="health-observation-value"]', String(OBSERVATION_VALUE_BPM));
    offlineState.intentionalOffline = true;
    await page.setOfflineMode(true);
    await clickReady(page, '[data-testid="health-observation-save"]');
    stage = "wait for queued health observation label";
    await page.waitForSelector('[data-testid="health-offline-queue"]', { visible: true, timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector('[data-testid="health-offline-queue"]')?.textContent?.includes("Health Observation record"), { timeout: 30_000 });
    const offlineObservationRenderedAsDeviceOnly = true;
    stage = "prove queued health observation absent from server";
    await waitForObservationCount(account, 0);
    offlineState.intentionalOffline = false;
    await page.setOfflineMode(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    stage = "wait for health observation reconnect queue drainage";
    await page.waitForSelector('[data-testid="health-offline-queue"]', { hidden: true, timeout: 45_000 });
    stage = "prove exactly one reconnected health observation";
    await waitForObservationCount(account, 1);
    const observationReconnectSyncedExactlyOnce = true;
    stage = "reload Health after health-observation sync";
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector('[data-testid="health-page"]', { visible: true, timeout: 60_000 });
    await page.evaluate(() => document.getElementById("health-section-metrics")?.scrollIntoView({ block: "center" }));
    await page.waitForSelector('[data-testid="health-metrics-ledger"]', { visible: true, timeout: 60_000 });
    await page.waitForFunction((name, value, unit) => document.querySelector('[data-testid="health-metrics-ledger"]')?.textContent?.includes(name) && document.querySelector('[data-testid="health-metrics-ledger"]')?.textContent?.includes(`${value} ${unit}`), { timeout: 45_000 }, OBSERVATION_NAME, String(OBSERVATION_VALUE_BPM), OBSERVATION_UNIT);
    await waitForObservationCount(account, 1);
    const reloadRenderedPersistedObservation = true;

    stage = "load sleep log";
    await page.evaluate(() => document.getElementById("health-section-sleep")?.scrollIntoView({ block: "center" }));
    await page.waitForSelector('[data-testid="sleep-log"]', { visible: true, timeout: 60_000 });
    // Keep this as a literal browser script. The TypeScript runner decorates
    // nested named callbacks with host-only helpers before Puppeteer
    // serializes them, which would make the browser see an undefined helper.
    const sleepSession = await page.evaluate(`
      (() => {
        const end = new Date();
        end.setHours(end.getHours() - 1, 0, 0, 0);
        const start = new Date(end.getTime() - 7 * 60 * 60 * 1_000);
        const localDateTime = (value) => new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
        return { startInput: localDateTime(start), endInput: localDateTime(end), startedAt: start.toISOString(), endedAt: end.toISOString() };
      })()
    `) as { startInput: string; endInput: string; startedAt: string; endedAt: string };
    stage = "prove initial sleep-session absence";
    await waitForSleepSessionCount(account, localContext.date, localContext.timeZone, localContext.utcOffsetMinutes, sleepSession.startedAt, sleepSession.endedAt, 0);
    stage = "submit durable offline sleep session";
    await setValue(page, '[data-testid="sleep-session-start"]', sleepSession.startInput);
    await setValue(page, '[data-testid="sleep-session-end"]', sleepSession.endInput);
    offlineState.intentionalOffline = true;
    await page.setOfflineMode(true);
    await clickReady(page, '[data-testid="sleep-session-save"]');
    stage = "wait for queued sleep-session label";
    await page.waitForSelector('[data-testid="health-offline-queue"]', { visible: true, timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector('[data-testid="health-offline-queue"]')?.textContent?.includes("Sleep record"), { timeout: 30_000 });
    const offlineSleepSessionRenderedAsDeviceOnly = true;
    stage = "prove queued sleep session absent from server";
    await waitForSleepSessionCount(account, localContext.date, localContext.timeZone, localContext.utcOffsetMinutes, sleepSession.startedAt, sleepSession.endedAt, 0);
    offlineState.intentionalOffline = false;
    await page.setOfflineMode(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    stage = "wait for sleep-session reconnect queue drainage";
    await page.waitForSelector('[data-testid="health-offline-queue"]', { hidden: true, timeout: 45_000 });
    stage = "prove exactly one reconnected sleep session";
    await waitForSleepSessionCount(account, localContext.date, localContext.timeZone, localContext.utcOffsetMinutes, sleepSession.startedAt, sleepSession.endedAt, 1);
    const sleepSessionReconnectSyncedExactlyOnce = true;
    stage = "reload Health after sleep-session sync";
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector('[data-testid="health-page"]', { visible: true, timeout: 60_000 });
    await page.evaluate(() => document.getElementById("health-section-sleep")?.scrollIntoView({ block: "center" }));
    await page.waitForSelector('[data-testid="sleep-log"]', { visible: true, timeout: 60_000 });
    await page.waitForFunction(() => document.querySelector('[data-testid="sleep-log"]')?.textContent?.includes("Sleep session") && document.querySelector('[data-testid="sleep-log"]')?.textContent?.includes("7h 0m"), { timeout: 45_000 });
    await waitForSleepSessionCount(account, localContext.date, localContext.timeZone, localContext.utcOffsetMinutes, sleepSession.startedAt, sleepSession.endedAt, 1);
    const reloadRenderedPersistedSleepSession = true;

    stage = "load workout log";
    await page.evaluate(() => document.getElementById("health-section-training")?.scrollIntoView({ block: "center" }));
    await page.waitForSelector('[data-testid="workout-log"]', { visible: true, timeout: 60_000 });
    stage = "prove initial workout absence";
    await waitForWorkoutCount(account, localContext.date, localContext.timeZone, localContext.utcOffsetMinutes, 0);
    stage = "submit durable offline workout";
    await setValue(page, '[data-testid="workout-activity-type"]', WORKOUT_ACTIVITY_TYPE);
    await setValue(page, 'input[aria-label="Workout duration minutes"]', String(WORKOUT_DURATION_MINUTES));
    offlineState.intentionalOffline = true;
    await page.setOfflineMode(true);
    await clickReady(page, '[data-testid="workout-save"]');
    stage = "wait for queued workout label";
    await page.waitForSelector('[data-testid="health-offline-queue"]', { visible: true, timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector('[data-testid="health-offline-queue"]')?.textContent?.includes("Workout record"), { timeout: 30_000 });
    const offlineWorkoutRenderedAsDeviceOnly = true;
    stage = "prove queued workout absent from server";
    await waitForWorkoutCount(account, localContext.date, localContext.timeZone, localContext.utcOffsetMinutes, 0);
    offlineState.intentionalOffline = false;
    await page.setOfflineMode(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    stage = "wait for workout reconnect queue drainage";
    await page.waitForSelector('[data-testid="health-offline-queue"]', { hidden: true, timeout: 45_000 });
    stage = "prove exactly one reconnected workout";
    await waitForWorkoutCount(account, localContext.date, localContext.timeZone, localContext.utcOffsetMinutes, 1);
    const workoutReconnectSyncedExactlyOnce = true;
    stage = "reload Health after workout sync";
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector('[data-testid="health-page"]', { visible: true, timeout: 60_000 });
    await page.evaluate(() => document.getElementById("health-section-training")?.scrollIntoView({ block: "center" }));
    await page.waitForSelector('[data-testid="workout-log"]', { visible: true, timeout: 60_000 });
    await page.waitForFunction((activity, duration) => document.querySelector('[data-testid="workout-log"]')?.textContent?.includes(activity) && document.querySelector('[data-testid="workout-log"]')?.textContent?.includes(`${duration}m`), { timeout: 45_000 }, WORKOUT_ACTIVITY_TYPE, String(WORKOUT_DURATION_MINUTES));
    await waitForWorkoutCount(account, localContext.date, localContext.timeZone, localContext.utcOffsetMinutes, 1);
    const reloadRenderedPersistedWorkout = true;

    stage = "create a factual nutrition fixture";
    const nutritionFoodId = await createAcceptanceFood(account);
    stage = "load nutrition diary";
    await page.evaluate(() => document.getElementById("health-section-nutrition")?.scrollIntoView({ block: "center" }));
    await page.waitForSelector('[aria-labelledby="nutrition-heading"]', { visible: true, timeout: 60_000 });
    await clickButtonWithText(page, '[aria-labelledby="nutrition-heading"]', "Log food");
    await page.waitForFunction((foodName) => Array.from(document.querySelectorAll('[aria-label="Choose saved food"] option')).some((option) => option.textContent?.includes(String(foodName))), { timeout: 45_000 }, NUTRITION_FOOD_NAME);
    stage = "prove initial nutrition absence";
    await waitForNutritionCount(account, localContext.date, localContext.timeZone, localContext.utcOffsetMinutes, 0);
    await page.select('[aria-label="Choose saved food"]', String(nutritionFoodId));
    await setValue(page, '[aria-label="Food quantity"]', String(NUTRITION_QUANTITY_GRAMS));
    await page.select('[aria-label="Food quantity unit"]', "g");
    await page.select('[aria-label="Meal"]', "breakfast");
    await setValue(page, '[aria-label="Meal time"]', "08:15");
    stage = "submit durable offline nutrition";
    offlineState.intentionalOffline = true;
    await page.setOfflineMode(true);
    await clickButtonWithText(page, '[aria-labelledby="nutrition-heading"]', "Add to diary");
    stage = "wait for queued nutrition label";
    await page.waitForSelector('[data-testid="health-offline-queue"]', { visible: true, timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector('[data-testid="health-offline-queue"]')?.textContent?.includes("Nutrition record"), { timeout: 30_000 });
    const offlineNutritionRenderedAsDeviceOnly = true;
    stage = "prove queued nutrition absent from server";
    await waitForNutritionCount(account, localContext.date, localContext.timeZone, localContext.utcOffsetMinutes, 0);
    offlineState.intentionalOffline = false;
    await page.setOfflineMode(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    stage = "wait for nutrition reconnect queue drainage";
    await page.waitForSelector('[data-testid="health-offline-queue"]', { hidden: true, timeout: 45_000 });
    stage = "prove exactly one reconnected nutrition entry";
    await waitForNutritionCount(account, localContext.date, localContext.timeZone, localContext.utcOffsetMinutes, 1);
    const nutritionReconnectSyncedExactlyOnce = true;
    stage = "reload Health after nutrition sync";
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector('[data-testid="health-page"]', { visible: true, timeout: 60_000 });
    await page.evaluate(() => document.getElementById("health-section-nutrition")?.scrollIntoView({ block: "center" }));
    await page.waitForSelector('[aria-labelledby="nutrition-heading"]', { visible: true, timeout: 60_000 });
    await page.waitForFunction((foodName) => document.querySelector('[aria-labelledby="nutrition-heading"]')?.textContent?.includes(String(foodName)), { timeout: 45_000 }, NUTRITION_FOOD_NAME);
    await waitForNutritionCount(account, localContext.date, localContext.timeZone, localContext.utcOffsetMinutes, 1);
    const reloadRenderedPersistedNutrition = true;

    stage = "audit final Health page";
    const audit = await auditPage(page);
    assert(audit.mainCount === 1 && audit.duplicateIds.length === 0 && audit.invalidLabelReferences.length === 0 && audit.unlabeledControls.length === 0 && audit.horizontalOverflowPx <= 2, `${viewport.name} failed Health semantics or overflow checks.`);
    await acknowledgeBoundedChunkRecovery(page, signals);
    assert(!hasUnexpectedBrowserSignals(signals), `${viewport.name} produced unexpected browser signals: ${JSON.stringify(signals)}.`);
    view = { viewport: viewport.name, quotaFailureLeftFormIntact, quotaFailureCreatedNoQueueItem, offlineRecordRenderedAsDeviceOnly, offlineRecordAbsentFromServer, reconnectSyncedExactlyOnce, reloadRenderedPersistedRecord, offlineMeasurementRenderedAsDeviceOnly, measurementReconnectSyncedExactlyOnce, reloadRenderedPersistedMeasurement, offlineSupplementRenderedAsDeviceOnly, supplementReconnectSyncedExactlyOnce, reloadRenderedPersistedSupplement, offlineRecoveryRenderedAsDeviceOnly, recoveryReconnectSyncedExactlyOnce, reloadRenderedPersistedRecovery, offlineObservationRenderedAsDeviceOnly, observationReconnectSyncedExactlyOnce, reloadRenderedPersistedObservation, offlineSleepSessionRenderedAsDeviceOnly, sleepSessionReconnectSyncedExactlyOnce, reloadRenderedPersistedSleepSession, offlineWorkoutRenderedAsDeviceOnly, workoutReconnectSyncedExactlyOnce, reloadRenderedPersistedWorkout, offlineNutritionRenderedAsDeviceOnly, nutritionReconnectSyncedExactlyOnce, reloadRenderedPersistedNutrition, queueDrained, audit, signals };
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

  const passed = views.length === SELECTED_VIEWPORTS.length && views.every((view) => view.quotaFailureLeftFormIntact && view.quotaFailureCreatedNoQueueItem && view.offlineRecordRenderedAsDeviceOnly && view.offlineRecordAbsentFromServer && view.reconnectSyncedExactlyOnce && view.reloadRenderedPersistedRecord && view.offlineMeasurementRenderedAsDeviceOnly && view.measurementReconnectSyncedExactlyOnce && view.reloadRenderedPersistedMeasurement && view.offlineSupplementRenderedAsDeviceOnly && view.supplementReconnectSyncedExactlyOnce && view.reloadRenderedPersistedSupplement && view.offlineRecoveryRenderedAsDeviceOnly && view.recoveryReconnectSyncedExactlyOnce && view.reloadRenderedPersistedRecovery && view.offlineObservationRenderedAsDeviceOnly && view.observationReconnectSyncedExactlyOnce && view.reloadRenderedPersistedObservation && view.offlineSleepSessionRenderedAsDeviceOnly && view.sleepSessionReconnectSyncedExactlyOnce && view.reloadRenderedPersistedSleepSession && view.offlineWorkoutRenderedAsDeviceOnly && view.workoutReconnectSyncedExactlyOnce && view.reloadRenderedPersistedWorkout && view.offlineNutritionRenderedAsDeviceOnly && view.nutritionReconnectSyncedExactlyOnce && view.reloadRenderedPersistedNutrition && view.queueDrained && !hasUnexpectedBrowserSignals(view.signals)) && cleanup.every((item) => item.accountErased);
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
