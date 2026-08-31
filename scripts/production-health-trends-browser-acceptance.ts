import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer, { type Browser, type BrowserContext, type Page, type Viewport } from "puppeteer-core";
import { acknowledgeBoundedChunkRecovery, hasUnexpectedBrowserSignals, installFixtureUserStorageSeed, type BrowserSignals } from "./lib/production-browser-signals";

type ApiResult = { status: number; body: any; cookie: string; retryAfterSeconds: number | null };
type Account = { id: number; email: string; displayName: string; cookie: string };
type Audit = { mainCount: number; duplicateIds: string[]; invalidLabelReferences: string[]; unlabeledControls: string[]; horizontalOverflowPx: number };
type ViewResult = {
  viewport: string;
  chartRendered: boolean;
  coverageRendered: boolean;
  missingStayedMissing: boolean;
  recordedZeroStayedZero: boolean;
  apiAndTableReconciled: boolean;
  savedThreeSeriesPanelRendered: boolean;
  savedPanelMissingStayedMissing: boolean;
  csvReconciled: boolean;
  audit: Audit;
  signals: BrowserSignals;
  screenshot: string;
};

const BASE_URL = new URL(process.env.LYFEOS_TEST_API_URL || "https://lyfeos.net");
const MODE = process.env.LYFEOS_HEALTH_TRENDS_ACCEPTANCE_MODE || "production";
const SOURCE = process.env.LYFEOS_ACCEPTANCE_SOURCE || "";
const HARNESS_SOURCE = process.env.LYFEOS_ACCEPTANCE_HARNESS_SOURCE || process.env.GITHUB_SHA || "";
const OUTPUT_DIR = path.resolve(process.env.LYFEOS_HEALTH_TRENDS_OUTPUT_DIR || path.join(os.tmpdir(), "lyfeos-production-health-trends"));
const OUTPUT_FILE = path.join(OUTPUT_DIR, "health-trends-report.json");
const PASSWORD = "TestPass123!";
const TIME_ZONE = "UTC";
const UTC_OFFSET_MINUTES = 0;
const OBSERVATION_OPTION = "observation|acceptance_focus|points|manual";
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
    .replace(/health_trends_(owner|production)_[a-z0-9_]+/gi, "[redacted fixture]")
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
      "x-lyfeos-time-zone": TIME_ZONE,
      "x-lyfeos-utc-offset-minutes": String(UTC_OFFSET_MINUTES),
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
  throw new Error("No Chromium executable found for Health trends acceptance.");
}

function cookieParts(cookie: string): { name: string; value: string } {
  const separator = cookie.indexOf("=");
  assert(separator > 0, "Registration did not return a usable session cookie.");
  return { name: cookie.slice(0, separator), value: cookie.slice(separator + 1) };
}

function captureSignals(page: Page): BrowserSignals {
  const signals: BrowserSignals = { consoleErrors: [], pageErrors: [], failedRequests: [], serverErrors: [], recoveredChunkLoads: [] };
  page.on("console", (entry) => {
    if (entry.type() !== "error") return;
    const source = entry.location().url;
    signals.consoleErrors.push(`${entry.text().slice(0, 500)}${source ? ` @ ${source}` : ""}`);
  });
  page.on("pageerror", (error) => signals.pageErrors.push(error.message.slice(0, 500)));
  page.on("requestfailed", (failed) => {
    const method = failed.method();
    const detail = `${method} ${new URL(failed.url()).pathname}: ${failed.failure()?.errorText || "failed"}`;
    if (["GET", "HEAD"].includes(method) && detail.includes("ERR_ABORTED")) return;
    if (failed.url().startsWith(BASE_URL.origin)) signals.failedRequests.push(detail.slice(0, 500));
  });
  page.on("response", (response) => {
    if (response.url().startsWith(BASE_URL.origin) && response.status() >= 500) signals.serverErrors.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  return signals;
}

function dateOffset(daysAgo: number): string {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString();
}

async function registerDisposableAccount(account: Account): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await request("POST", "/api/auth/complete-registration", { email: account.email, password: PASSWORD, displayName: account.displayName, termsAccepted: true });
    if (result.status === 201) {
      account.id = Number(result.body.user?.id);
      account.cookie = result.cookie;
      assert(Number.isInteger(account.id) && account.id > 0 && account.cookie, "Registration did not create a disposable owner and session.");
      const onboarding = await request("PATCH", "/api/profile", { onboardingCompleted: true }, account.cookie);
      assert(onboarding.status === 200, `Onboarding setup returned ${onboarding.status}.`);
      return;
    }
    if (result.status !== 429 || attempt === 2) throw new Error(`Registration returned ${result.status}.`);
    await new Promise((resolve) => setTimeout(resolve, Math.min(61, Math.max(1, result.retryAfterSeconds || 60)) * 1_000 + 250));
  }
}

async function seedRecords(account: Account): Promise<{ earliestDate: string; middleDate: string; latestDate: string }> {
  const earliest = dateOffset(4);
  const middle = dateOffset(2);
  const latest = dateOffset(0);
  const hydration = [
    { occurredAt: earliest, volumeMl: 200 },
    { occurredAt: earliest, volumeMl: 300 },
    { occurredAt: latest, volumeMl: 750 },
  ];
  for (const [index, body] of hydration.entries()) {
    const result = await request("POST", "/api/health-fitness/hydration", body, account.cookie, { "x-lyfeos-mutation-id": randomUUID() });
    assert(result.status === 201, `Hydration seed ${index + 1} returned ${result.status}.`);
  }
  const observations = [
    { observedAt: earliest, value: 0 },
    { observedAt: middle, value: 7 },
  ];
  for (const [index, item] of observations.entries()) {
    const result = await request("POST", "/api/health-observations", {
      category: "other", metricKey: "acceptance_focus", displayName: "Acceptance focus", value: item.value,
      unit: "points", source: "manual", observedAt: item.observedAt, note: "Synthetic browser acceptance record",
    }, account.cookie, { "x-lyfeos-mutation-id": randomUUID() });
    assert(result.status === 201, `Observation seed ${index + 1} returned ${result.status}.`);
  }
  return { earliestDate: earliest.slice(0, 10), middleDate: middle.slice(0, 10), latestDate: latest.slice(0, 10) };
}

async function scrollToTrendWorkbench(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const heading = await page.$("#health-trends-heading");
    if (heading) { await heading.evaluate((element) => element.scrollIntoView({ block: "center" })); return; }
    const targeted = await page.evaluate(() => {
      const target = document.querySelector<HTMLElement>("#health-section-trends")
        || [...document.querySelectorAll<HTMLElement>(".scroll-mt-6")][16];
      target?.scrollIntoView({ block: "center" });
      return Boolean(target);
    });
    assert(targeted, "The Health trends deferred-section anchor is missing.");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  await page.waitForSelector("#health-trends-heading", { visible: true, timeout: 30_000 });
}

async function clickSummary(page: Page, label: string): Promise<void> {
  await page.waitForFunction((text) => [...document.querySelectorAll("summary")].some((element) => element.textContent?.trim() === text), { timeout: 30_000 }, label);
  await page.evaluate((text) => [...document.querySelectorAll<HTMLElement>("summary")].find((element) => element.textContent?.trim() === text)?.click(), label);
}

async function setInput(page: Page, ariaLabel: string, value: string): Promise<void> {
  await page.$eval(`[aria-label="${ariaLabel}"]`, (element, next) => {
    const input = element as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, next);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function auditPage(page: Page): Promise<Audit> {
  return page.evaluate(() => {
    const scope = document.querySelector<HTMLElement>('[data-testid="health-page"]');
    if (!scope) throw new Error("Health acceptance scope is not rendered.");
    const ids = new Map<string, number>();
    for (const element of document.querySelectorAll<HTMLElement>("[id]")) ids.set(element.id, (ids.get(element.id) || 0) + 1);
    const invalidLabelReferences = [...scope.querySelectorAll<HTMLElement>("[aria-labelledby]")]
      .filter((element) => (element.getAttribute("aria-labelledby") || "").split(/\s+/).some((id) => id && !document.getElementById(id)))
      .map((element) => element.tagName.toLowerCase());
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
      .map((element) => element.tagName.toLowerCase()).slice(0, 20);
    const width = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0);
    return { mainCount: document.querySelectorAll("main").length, duplicateIds: [...ids.entries()].filter(([, count]) => count > 1).map(([id]) => id).sort(), invalidLabelReferences, unlabeledControls, horizontalOverflowPx: Math.max(0, width - window.innerWidth) };
  });
}

async function eraseAccount(account: Account): Promise<boolean> {
  if (!account.cookie) return true;
  await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, account.cookie).catch(() => null);
  const session = await request("GET", "/api/auth/me", undefined, account.cookie).catch(() => null);
  const email = await request("GET", `/api/auth/check-email?email=${encodeURIComponent(account.email)}`).catch(() => null);
  const displayName = await request("GET", `/api/auth/check-display-name?displayName=${encodeURIComponent(account.displayName)}`).catch(() => null);
  return session?.status === 401 && email?.body?.available === true && displayName?.body?.available === true;
}

async function runViewport(browser: Browser, viewport: { name: string; value: Viewport }, ordinal: number): Promise<{ view: ViewResult; accountErased: boolean }> {
  const stamp = `${Date.now()}_${ordinal}_${randomUUID().slice(0, 8)}`;
  const account: Account = { id: 0, email: `health_trends_production_${stamp}@example.com`, displayName: `health_trends_owner_${ordinal}_${stamp.slice(-8)}`, cookie: "" };
  let context: BrowserContext | null = null;
  let view: ViewResult | null = null;
  let failure: unknown = null;
  let accountErased = false;
  let stage = "register disposable account";
  try {
    await registerDisposableAccount(account);
    stage = "seed truthful trend fixtures";
    const dates = await seedRecords(account);
    const trendApi = await request("GET", `/api/health-insights/trends?left=hydration_ml&right=${encodeURIComponent(OBSERVATION_OPTION)}&days=30`, undefined, account.cookie);
    assert(trendApi.status === 200, `Trend API returned ${trendApi.status}.`);
    const hydrationPoints = new Map(trendApi.body.left.points.map((point: any) => [point.date, point]));
    const observationPoints = new Map(trendApi.body.right.points.map((point: any) => [point.date, point]));
    assert(hydrationPoints.get(dates.earliestDate)?.value === 500 && hydrationPoints.get(dates.earliestDate)?.records === 2, "Hydration aggregation did not preserve its two-record provenance.");
    assert(observationPoints.get(dates.earliestDate)?.value === 0, "Recorded observation zero was not preserved by the trend API.");
    assert(!hydrationPoints.has(dates.middleDate) && !observationPoints.has(dates.latestDate), "Missing dates were unexpectedly materialized by the trend API.");

    context = await browser.createBrowserContext();
    const page = await context.newPage();
    const signals = captureSignals(page);
    await page.emulateTimezone(TIME_ZONE);
    await page.setViewport(viewport.value);
    await page.setCacheEnabled(false);
    const session = cookieParts(account.cookie);
    await page.setCookie({ ...session, url: BASE_URL.origin, path: "/", httpOnly: true, secure: true, sameSite: "Lax" });
    await installFixtureUserStorageSeed(page, { id: account.id, displayName: account.displayName });
    stage = "navigate to Health";
    await page.goto(new URL("/health", BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector('[data-testid="health-page"]', { visible: true, timeout: 60_000 });
    await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.getAttribute("aria-label") === "Skip this tutorial" || button.textContent?.trim() === "Skip tour")?.click());
    stage = "load Health trend workbench";
    await scrollToTrendWorkbench(page);
    await page.waitForSelector('[aria-label="Second health trend"]', { visible: true, timeout: 45_000 });
    await page.waitForFunction((value) => [...document.querySelectorAll<HTMLOptionElement>('[aria-label="Second health trend"] option')].some((option) => option.value === value), { timeout: 45_000 }, OBSERVATION_OPTION);
    stage = "select synthetic comparison series";
    await page.select('[aria-label="Second health trend"]', OBSERVATION_OPTION);
    await page.waitForFunction(() => document.querySelector('[aria-label="Trend evidence coverage"]')?.textContent?.includes("Acceptance focus"), { timeout: 45_000 });
    const chartRendered = Boolean(await page.$('[role="img"][aria-label*="Hydration and Acceptance focus"]'));
    const coverageRendered = await page.$eval('[aria-label="Trend evidence coverage"]', (element) => element.textContent?.includes("2 of 30 days") && element.textContent?.includes("28 missing"));

    stage = "reconcile accessible trend table";
    await clickSummary(page, "View accessible trend data table");
    const table = await page.evaluate((targetDates) => {
      const caption = [...document.querySelectorAll("caption")].find((item) => item.textContent?.includes("Recorded health trend values"));
      const root = caption?.closest("table");
      const rows = [...(root?.querySelectorAll("tbody tr") || [])].map((row) => [...row.querySelectorAll("th,td")].map((cell) => cell.textContent?.trim() || ""));
      return Object.fromEntries(rows.filter((row) => targetDates.includes(row[0])).map((row) => [row[0], row.slice(1)]));
    }, [dates.earliestDate, dates.middleDate, dates.latestDate]) as Record<string, string[]>;
    const recordedZeroStayedZero = table[dates.earliestDate]?.[1] === "0";
    const missingStayedMissing = table[dates.middleDate]?.[0] === "Not recorded" && table[dates.latestDate]?.[1] === "Not recorded";
    const apiAndTableReconciled = table[dates.earliestDate]?.[0] === "500" && table[dates.middleDate]?.[1] === "7" && table[dates.latestDate]?.[0] === "750";
    assert(chartRendered && coverageRendered && recordedZeroStayedZero && missingStayedMissing && apiAndTableReconciled, "Rendered Health trend evidence did not reconcile with its owner-scoped API facts.");

    stage = "save and reopen a three-series panel";
    await clickSummary(page, "Saved metric panels (0)");
    await page.select('[aria-label="Optional third saved-panel trend"]', "sleep_minutes");
    await setInput(page, "Metric panel name", "Acceptance evidence panel");
    const saveButton = await page.waitForFunction(() => [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Save current panel") && !button.disabled), { timeout: 30_000 });
    await (saveButton.asElement() as any).click();
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => button.textContent?.trim() === "Acceptance evidence panel"), { timeout: 30_000 });
    await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === "Acceptance evidence panel")?.click());
    await page.waitForSelector('[aria-label="Acceptance evidence panel saved metric panel"]', { visible: true, timeout: 30_000 });
    const savedThreeSeriesPanelRendered = (await page.$$('[aria-label="Acceptance evidence panel saved metric panel"] [role="img"]')).length === 3;
    await clickSummary(page, "View saved-panel data table");
    const savedPanelMissingStayedMissing = await page.$eval('[aria-label="Acceptance evidence panel saved metric panel"]', (element, targetDate) => {
      const rows = [...element.querySelectorAll("tbody tr")];
      const row = rows.find((candidate) => candidate.querySelector("th")?.textContent?.trim() === targetDate);
      return Boolean(row && [...row.querySelectorAll("td")].some((cell) => cell.textContent?.trim() === "Not recorded"));
    }, dates.middleDate);
    assert(savedThreeSeriesPanelRendered && savedPanelMissingStayedMissing, "Saved three-series panel did not preserve independent series and missing values.");

    stage = "reconcile CSV export";
    const csvResponse = await fetch(new URL(`/api/health-insights/trends?left=hydration_ml&right=${encodeURIComponent(OBSERVATION_OPTION)}&days=30&format=csv`, BASE_URL), { headers: { Cookie: account.cookie, "x-lyfeos-time-zone": TIME_ZONE, "x-lyfeos-utc-offset-minutes": "0" } });
    const csv = await csvResponse.text();
    const csvReconciled = csvResponse.status === 200 && csv.includes(`${dates.earliestDate},500,2,0,1`) && csv.includes(`${dates.middleDate},,,7,1`) && csv.includes(`${dates.latestDate},750,1,,`);
    assert(csvReconciled, "CSV export did not reconcile with the rendered trend facts and explicit gaps.");

    stage = "audit and capture final workbench";
    const audit = await auditPage(page);
    assert(audit.mainCount === 1 && audit.duplicateIds.length === 0 && audit.invalidLabelReferences.length === 0 && audit.unlabeledControls.length === 0 && audit.horizontalOverflowPx <= 2, `${viewport.name} failed Health trend semantics or overflow checks.`);
    await acknowledgeBoundedChunkRecovery(page, signals);
    assert(!hasUnexpectedBrowserSignals(signals), `${viewport.name} produced unexpected browser signals: ${JSON.stringify(signals)}.`);
    const screenshot = `health-trends-${viewport.name}.png`;
    await page.screenshot({ path: path.join(OUTPUT_DIR, screenshot), fullPage: true });
    view = { viewport: viewport.name, chartRendered, coverageRendered, missingStayedMissing, recordedZeroStayedZero, apiAndTableReconciled, savedThreeSeriesPanelRendered, savedPanelMissingStayedMissing, csvReconciled, audit, signals, screenshot };
  } catch (error) {
    failure = new Error(`${stage}: ${safeError(error)}`);
  } finally {
    if (context) await context.close().catch(() => undefined);
    if (account.cookie) accountErased = await eraseAccount(account);
  }
  if (failure) throw new Error(`${safeError(failure)}; accountErased=${accountErased}`);
  assert(view && accountErased, `${viewport.name} did not complete Health trend qualification and verified account erasure.`);
  return { view, accountErased };
}

async function main(): Promise<void> {
  if (MODE === "production") assert(BASE_URL.origin === "https://lyfeos.net", "Production Health trends acceptance may target only https://lyfeos.net.");
  assert(/^[0-9a-f]{40}$/.test(SOURCE), "Health trends acceptance requires the exact deployed source revision.");
  assert(/^[0-9a-f]{40}$/.test(HARNESS_SOURCE), "Health trends acceptance requires the exact harness source revision.");
  const release = await request("GET", "/api/release");
  assert(release.status === 200 && release.body?.sourceRevision === SOURCE, "Health trends runtime does not match the requested immutable source.");
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: await findChromium(), headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] });
  const views: ViewResult[] = [];
  const cleanup: Array<{ viewport: string; accountErased: boolean }> = [];
  try {
    for (const [ordinal, viewport] of VIEWPORTS.entries()) {
      const result = await runViewport(browser, viewport, ordinal);
      views.push(result.view);
      cleanup.push({ viewport: viewport.name, accountErased: result.accountErased });
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
  const passed = views.length === VIEWPORTS.length && views.every((view) => view.chartRendered && view.coverageRendered && view.missingStayedMissing && view.recordedZeroStayedZero && view.apiAndTableReconciled && view.savedThreeSeriesPanelRendered && view.savedPanelMissingStayedMissing && view.csvReconciled && !hasUnexpectedBrowserSignals(view.signals)) && cleanup.every((item) => item.accountErased);
  const report = {
    contract: "lyfeos.production-health-trends-browser.v1",
    generatedAt: new Date().toISOString(),
    targetOrigin: BASE_URL.origin,
    sourceRevision: SOURCE,
    harnessSource: HARNESS_SOURCE,
    evidenceBoundary: "Automated Chromium proves owner-scoped desktop/mobile rendering, API-table-CSV reconciliation, recorded-zero versus missing semantics, independent-unit charting, saved three-series panels, basic page semantics, overflow and disposable-account cleanup. It does not prove human comprehension, physical-device or assistive-technology behavior, medical validity, causal meaning, longitudinal usefulness or field performance.",
    views,
    cleanup,
    passed,
  };
  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  assert(passed, `Health trends acceptance failed; report=${OUTPUT_FILE}`);
  console.log(JSON.stringify({ contract: report.contract, passed, viewCount: views.length, accountErased: cleanup.every((item) => item.accountErased) }));
}

main().catch(async (error) => {
  await fs.mkdir(OUTPUT_DIR, { recursive: true }).catch(() => undefined);
  await fs.writeFile(path.join(OUTPUT_DIR, "health-trends-failure.json"), `${JSON.stringify({ contract: "lyfeos.production-health-trends-browser.failure.v1", generatedAt: new Date().toISOString(), sourceRevision: SOURCE, harnessSource: HARNESS_SOURCE, error: safeError(error) }, null, 2)}\n`, "utf8").catch(() => undefined);
  console.error(safeError(error));
  process.exitCode = 1;
});
