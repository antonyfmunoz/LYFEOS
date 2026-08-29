import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer, { type Browser, type BrowserContext, type Page, type Viewport } from "puppeteer-core";

type ApiResult = { status: number; body: any; cookie: string };
type Account = { id: number; email: string; displayName: string; cookie: string };
type Signals = { consoleErrors: string[]; pageErrors: string[]; failedRequests: string[]; serverErrors: string[] };
type PageAudit = { mainCount: number; duplicateIds: string[]; invalidLabelReferences: string[]; unlabeledControls: string[]; horizontalOverflowPx: number };
type Cleanup = { viewport: string; accountErased: boolean; sessionInvalidated: boolean; emailReleased: boolean; displayNameReleased: boolean };
type ViewResult = {
  viewport: string;
  canonicalProjectionRendered: boolean;
  rangeNavigationRendered: boolean;
  offlineCreateQueued: boolean;
  reconnectCreateConverged: boolean;
  staleEditStoppedAsConflict: boolean;
  explicitConflictApplyConverged: boolean;
  queueDrained: boolean;
  audit: PageAudit;
  signals: Signals;
};

const BASE_URL = new URL(process.env.LYFEOS_TEST_API_URL || "https://lyfeos.net");
const SOURCE = process.env.LYFEOS_ACCEPTANCE_SOURCE || "";
const HARNESS_SOURCE = process.env.LYFEOS_ACCEPTANCE_HARNESS_SOURCE || process.env.GITHUB_SHA || "";
const OUTPUT_DIR = path.resolve(process.env.LYFEOS_CALENDAR_OUTPUT_DIR || path.join(os.tmpdir(), "lyfeos-production-calendar"));
const OUTPUT_FILE = path.join(OUTPUT_DIR, "calendar-report.json");
const PASSWORD = "TestPass123!";
const CALENDAR_TIME_ZONE = "America/Los_Angeles";
const VIEWPORTS: Array<{ name: string; value: Viewport }> = [
  { name: "desktop-1440x900", value: { width: 1440, height: 900, deviceScaleFactor: 1 } },
  { name: "mobile-390x844", value: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function calendarDateInZone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/[a-z0-9._%+-]+@example\.com/gi, "[redacted fixture]")
    .replace(/calendar_owner_[a-z0-9_]+/gi, "[redacted fixture]")
    .slice(0, 1_500);
}

async function request(method: string, pathname: string, body?: unknown, cookie = "", headers: Record<string, string> = {}): Promise<ApiResult> {
  const response = await fetch(new URL(pathname, BASE_URL), {
    method,
    signal: AbortSignal.timeout(30_000),
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...headers },
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
    try { await access(candidate); return candidate; } catch { /* Continue through bounded locations. */ }
  }
  throw new Error("No Chromium executable found for production Calendar acceptance.");
}

function cookieParts(cookie: string): { name: string; value: string } {
  const separator = cookie.indexOf("=");
  assert(separator > 0, "Registration did not return a usable session cookie.");
  return { name: cookie.slice(0, separator), value: cookie.slice(separator + 1) };
}

function captureSignals(page: Page, intentionallyOffline: () => boolean): Signals {
  const signals: Signals = { consoleErrors: [], pageErrors: [], failedRequests: [], serverErrors: [] };
  page.on("console", (entry) => {
    if (entry.type() !== "error" || intentionallyOffline()) return;
    signals.consoleErrors.push(entry.text().slice(0, 500));
  });
  page.on("pageerror", (error) => signals.pageErrors.push(error.message.slice(0, 500)));
  page.on("requestfailed", (failed) => {
    if (intentionallyOffline()) return;
    const method = failed.method();
    const errorText = failed.failure()?.errorText || "failed";
    if (["GET", "HEAD"].includes(method) && errorText.includes("ERR_ABORTED")) return;
    if (failed.url().startsWith(BASE_URL.origin)) signals.failedRequests.push(`${method} ${new URL(failed.url()).pathname}: ${errorText}`);
  });
  page.on("response", (response) => {
    if (!intentionallyOffline() && response.url().startsWith(BASE_URL.origin) && response.status() >= 500) signals.serverErrors.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  return signals;
}

function acknowledgeReconciledConflict(signals: Signals): void {
  const index = signals.consoleErrors.findIndex((error) => error === "Failed to load resource: the server responded with a status of 409 ()");
  if (index >= 0) signals.consoleErrors.splice(index, 1);
}

async function dismissBlockingTutorial(page: Page): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll<HTMLButtonElement>("button")];
      const control = buttons.find((button) => {
        const label = button.getAttribute("aria-label") || "";
        const text = button.textContent?.trim() || "";
        return (label === "Skip this tutorial" || text === "Skip tour") && button.getClientRects().length > 0;
      });
      if (control) { control.click(); return "dismissed"; }
      return document.body?.textContent?.includes("TUTORIAL 1/") ? "blocked" : "clear";
    });
    if (state === "dismissed") {
      await page.waitForFunction(() => !document.body?.textContent?.includes("TUTORIAL 1/"), { timeout: 10_000 });
      return;
    }
    if (state === "clear") {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const stillClear = await page.evaluate(() => !document.body?.textContent?.includes("TUTORIAL 1/"));
      if (stillClear) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("The rendered Missions tutorial could not be dismissed through its named control.");
}

async function setValue(page: Page, selector: string, value: string): Promise<void> {
  await page.waitForSelector(selector, { visible: true, timeout: 30_000 });
  await page.$eval(selector, (element, nextValue) => {
    const input = element as HTMLInputElement | HTMLTextAreaElement;
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(input, nextValue);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function activate(page: Page, selector: string): Promise<void> {
  await page.waitForSelector(selector, { visible: true, timeout: 30_000 });
  await page.$eval(selector, (control) => control.scrollIntoView({ block: "center", inline: "center" }));
  await page.waitForFunction((targetSelector) => {
    const control = document.querySelector<HTMLElement>(targetSelector);
    if (!control || (control as HTMLButtonElement).disabled) return false;
    const rect = control.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return rect.width > 0 && rect.height > 0 && (hit === control || (hit !== null && control.contains(hit)));
  }, { timeout: 30_000 }, selector);
  await page.click(selector);
}

async function waitForMission(account: Account, date: string, predicate: (mission: any) => boolean, label: string): Promise<any> {
  const deadline = Date.now() + 45_000;
  let latest: ApiResult | null = null;
  while (Date.now() < deadline) {
    latest = await request("GET", `/api/users/${account.id}/calendar-missions?from=${date}&to=${date}&tz=UTC&limit=250`, undefined, account.cookie);
    const mission = latest.status === 200 ? latest.body.quests?.find(predicate) : null;
    if (mission) return mission;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`${label} did not reconcile; latest=${JSON.stringify(latest?.body || {}).slice(0, 1_000)}.`);
}

async function auditPage(page: Page): Promise<PageAudit> {
  return page.evaluate(() => {
    const ids = new Map<string, number>();
    for (const element of document.querySelectorAll<HTMLElement>("[id]")) ids.set(element.id, (ids.get(element.id) || 0) + 1);
    const scope = document.querySelector<HTMLElement>('[data-testid="calendar-page"]');
    if (!scope) throw new Error("Calendar acceptance scope is not rendered.");
    const invalidLabelReferences = [...scope.querySelectorAll<HTMLElement>("[aria-labelledby]")]
      .filter((element) => (element.getAttribute("aria-labelledby") || "").split(/\s+/).some((id) => id && !document.getElementById(id)))
      .map((element) => element.getAttribute("data-testid") || element.tagName.toLowerCase());
    const unlabeledControls = [...scope.querySelectorAll<HTMLElement>("button,input,select,textarea")]
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
  return session?.status === 401 && email?.status === 200 && email.body?.available === true && displayName?.status === 200 && displayName.body?.available === true;
}

async function runViewport(browser: Browser, viewport: { name: string; value: Viewport }, ordinal: number): Promise<{ view: ViewResult; cleanup: Cleanup }> {
  const stamp = `${Date.now()}_${ordinal}_${randomUUID().slice(0, 8)}`;
  const account: Account = { id: 0, email: `calendar_owner_${stamp}@example.com`, displayName: `calendar_owner_${ordinal}_${stamp.slice(-8)}`, cookie: "" };
  const date = calendarDateInZone(CALENDAR_TIME_ZONE);
  const offlineTitle = `Offline create ${ordinal}`;
  const conflictTitle = `Conflict base ${ordinal}`;
  const queuedTitle = `Queued edit ${ordinal}`;
  const serverTitle = `Server edit ${ordinal}`;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let intentionallyOffline = false;
  let view: ViewResult | null = null;
  let erased = false;
  let failure: unknown = null;
  let stage = "register disposable owner";
  try {
    const registration = await request("POST", "/api/auth/complete-registration", { email: account.email, password: PASSWORD, displayName: account.displayName, termsAccepted: true });
    assert(registration.status === 201, `Disposable owner registration returned ${registration.status}.`);
    Object.assign(account, { id: Number(registration.body.user?.id), cookie: registration.cookie });
    const seeded = await request("POST", "/api/quests", { userId: account.id, title: conflictTitle, description: "Production conflict fixture", category: "general", completed: false, startDate: date, endDate: date, startTime: "10:00", endTime: "10:30" }, account.cookie, { "x-lyfeos-mutation-id": `calendar-seed-${stamp}` });
    assert(seeded.status === 201 && seeded.body.quest?.revision === 1, `Conflict fixture creation returned ${seeded.status}.`);
    const missionId = Number(seeded.body.quest.id);

    stage = "render canonical Calendar projection";
    context = await browser.createBrowserContext();
    page = await context.newPage();
    const signals = captureSignals(page, () => intentionallyOffline);
    const session = cookieParts(account.cookie);
    await page.setCookie({ ...session, url: BASE_URL.origin, path: "/", httpOnly: true, secure: true, sameSite: "Lax" });
    await page.evaluateOnNewDocument((fixtureUser) => {
      try { localStorage.setItem("lyfeos_user", JSON.stringify(fixtureUser)); } catch { /* Origin is not ready. */ }
    }, { id: account.id, displayName: account.displayName });
    await page.setViewport(viewport.value);
    await page.emulateTimezone(CALENDAR_TIME_ZONE);
    await page.setCacheEnabled(false);
    await page.goto(new URL("/calendar", BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector('[data-testid="calendar-page"]', { visible: true, timeout: 60_000 });
    await dismissBlockingTutorial(page);
    await page.waitForSelector(`[aria-label="Edit mission ${conflictTitle} at 10:00"]`, { visible: true, timeout: 45_000 });
    const canonicalProjectionRendered = await page.$eval('[data-testid="calendar-page"]', (element) => element.textContent?.includes("canonical Missions") === true);
    await activate(page, '[aria-label="Show year calendar"]');
    await activate(page, '[aria-label="Show month calendar"]');
    await activate(page, '[aria-label="Show week calendar"]');
    await activate(page, '[aria-label="Show day calendar"]');
    const rangeNavigationRendered = await page.$eval('[data-testid="calendar-title"]', (element) => Boolean(element.textContent?.trim()));

    stage = "queue and reconcile offline create";
    await activate(page, `[aria-label^="Create mission on "][aria-label$=" at 9 AM"]`);
    await setValue(page, "#create-title", offlineTitle);
    intentionallyOffline = true;
    await page.setOfflineMode(true);
    await activate(page, '[data-testid="mission-create-submit"]');
    await page.waitForFunction((title) => {
      const text = document.querySelector('[data-testid="calendar-offline-queue"]')?.textContent || "";
      return text.includes(String(title)) && text.includes("Waiting for a connection");
    }, { timeout: 45_000 }, offlineTitle);
    const offlineCreateQueued = true;
    intentionallyOffline = false;
    await page.setOfflineMode(false);
    const created = await waitForMission(account, date, (mission) => mission.title === offlineTitle, "offline create reconnect");
    const reconnectCreateConverged = created.revision === 1;
    assert(reconnectCreateConverged, "Offline Calendar create did not converge as revision one.");
    await page.waitForFunction((title) => !document.querySelector('[data-testid="calendar-offline-queue"]')?.textContent?.includes(String(title)), { timeout: 45_000 }, offlineTitle);

    stage = "stop stale edit and require explicit conflict choice";
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector('[data-testid="calendar-page"]', { visible: true, timeout: 60_000 });
    await dismissBlockingTutorial(page);
    await activate(page, '[aria-label="Show day calendar"]');
    await activate(page, `[aria-label="Edit mission ${conflictTitle} at 10:00"]`);
    await setValue(page, "#edit-title", queuedTitle);
    intentionallyOffline = true;
    await page.setOfflineMode(true);
    await activate(page, '[data-testid="mission-update-submit"]');
    await page.waitForFunction((title) => document.querySelector('[data-testid="calendar-offline-queue"]')?.textContent?.includes(String(title)), { timeout: 30_000 }, queuedTitle);
    const serverChange = await request("PATCH", `/api/quests/${missionId}`, { title: serverTitle }, account.cookie, { "x-lyfeos-mutation-id": `calendar-server-${stamp}`, "x-lyfeos-expected-revision": "1" });
    assert(serverChange.status === 200 && serverChange.body.quest?.revision === 2, `Competing server edit returned ${serverChange.status}.`);
    intentionallyOffline = false;
    await page.setOfflineMode(false);
    await page.waitForFunction((title) => {
      const text = document.querySelector('[data-testid="calendar-offline-queue"]')?.textContent || "";
      return text.includes(String(title)) && text.includes("Current server version") && text.includes("v2");
    }, { timeout: 45_000 }, serverTitle);
    const conflicted = await waitForMission(account, date, (mission) => Number(mission.id) === missionId, "server-side conflict state");
    const staleEditStoppedAsConflict = conflicted.title === serverTitle && conflicted.revision === 2;
    assert(staleEditStoppedAsConflict, "Stale Calendar edit overwrote the newer server mission.");
    acknowledgeReconciledConflict(signals);
    page.once("dialog", (dialog) => void dialog.accept());
    await activate(page, '[data-testid="calendar-offline-queue"] button');
    const applied = await waitForMission(account, date, (mission) => Number(mission.id) === missionId && mission.title === queuedTitle, "explicit conflict apply");
    const explicitConflictApplyConverged = applied.revision === 3;
    assert(explicitConflictApplyConverged, "Explicit Calendar conflict apply did not create revision three.");
    await page.waitForSelector('[data-testid="calendar-offline-queue"]', { hidden: true, timeout: 45_000 });
    const queueDrained = await page.$('[data-testid="calendar-offline-queue"]') === null;
    assert(queueDrained, "Calendar queue remained after the accepted reconnect and conflict resolution.");
    const audit = await auditPage(page);
    assert(audit.mainCount === 1 && audit.duplicateIds.length === 0 && audit.invalidLabelReferences.length === 0 && audit.unlabeledControls.length === 0 && audit.horizontalOverflowPx <= 2, `${viewport.name} Calendar failed semantics or overflow checks.`);
    assert(Object.values(signals).every((items) => items.length === 0), `${viewport.name} Calendar journey produced application errors: ${JSON.stringify(signals)}.`);
    view = { viewport: viewport.name, canonicalProjectionRendered, rangeNavigationRendered, offlineCreateQueued, reconnectCreateConverged, staleEditStoppedAsConflict, explicitConflictApplyConverged, queueDrained, audit, signals };
  } catch (error) {
    const rendered = page ? await page.evaluate(() => document.body?.innerText.slice(0, 2_000) || "page unavailable").catch(() => "page unavailable") : "page unavailable";
    if (page) await page.screenshot({ path: path.join(OUTPUT_DIR, `calendar-${viewport.name}-failure.png`), fullPage: true }).catch(() => undefined);
    failure = new Error(`${safeError(error)}; rendered=${rendered}`);
  } finally {
    if (page && intentionallyOffline) await page.setOfflineMode(false).catch(() => undefined);
    if (context) await context.close().catch(() => undefined);
    erased = await eraseAccount(account);
  }
  const cleanup: Cleanup = { viewport: viewport.name, accountErased: erased, sessionInvalidated: erased, emailReleased: erased, displayNameReleased: erased };
  if (failure) throw new Error(`stage=${stage}; ${safeError(failure)}; accountErased=${erased}`);
  assert(view && erased, `${viewport.name} did not complete the rendered Calendar journey and verified account erasure.`);
  return { view, cleanup };
}

async function main(): Promise<void> {
  assert(BASE_URL.origin === "https://lyfeos.net", "Production Calendar acceptance may target only https://lyfeos.net.");
  assert(/^[0-9a-f]{40}$/.test(SOURCE), "Production Calendar acceptance requires the exact deployed source revision.");
  assert(/^[0-9a-f]{40}$/.test(HARNESS_SOURCE), "Production Calendar acceptance requires the exact harness source revision.");
  const release = await request("GET", "/api/release");
  assert(release.status === 200 && release.body?.sourceRevision === SOURCE, "Production Calendar runtime does not match the requested immutable source.");
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
      contract: "lyfeos.production-calendar-browser.v1",
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL.origin,
      sourceRevision: SOURCE,
      harnessSource: HARNESS_SOURCE,
      views,
      cleanups,
      summary: { passed, failure },
      boundary: "Disposable production-account Chromium evidence for Calendar as a projection over canonical Missions. It proves desktop/mobile Calendar rendering; year/month/week/day navigation; an IndexedDB-backed offline create; reconnect convergence; a competing canonical edit stopping a stale queued write; explicit apply-over-current conflict resolution; responsive semantics; queue drainage; and verified account/session/identifier erasure. It does not prove service-worker cold-start offline navigation, storage eviction recovery, real-device or human assistive-technology behavior, simultaneous multi-tab editing, live Google OAuth/scope/token/revoke/reconnect behavior, provider rate limits, or longitudinal scheduling outcomes.",
    };
    await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    if (process.env.GITHUB_STEP_SUMMARY) {
      await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, [
        "## LyfeOS production Calendar acceptance",
        "",
        `- Runtime source: ${SOURCE}`,
        `- Harness source: ${HARNESS_SOURCE}`,
        `- Passed: ${passed}`,
        `- Desktop/mobile views: ${views.length}/${VIEWPORTS.length}`,
        `- Disposable owners erased: ${cleanups.filter((cleanup) => cleanup.accountErased).length}/${VIEWPORTS.length}`,
        "",
        report.boundary,
        "",
      ].join("\n"), "utf8");
    }
    console.log(JSON.stringify({ contract: report.contract, passed, viewCount: views.length, erasedOwners: cleanups.filter((cleanup) => cleanup.accountErased).length }));
    if (!passed && !failure) failure = "Production Calendar acceptance did not satisfy every rendered, concurrency and cleanup invariant.";
  }
  if (failure) throw new Error(failure);
}

main().catch((error) => {
  console.error(safeError(error));
  process.exitCode = 1;
});
