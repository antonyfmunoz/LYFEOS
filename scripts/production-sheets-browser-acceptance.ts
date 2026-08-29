import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer, { type Browser, type BrowserContext, type Page, type Viewport } from "puppeteer-core";

type ApiResult = { status: number; body: any; cookie: string; retryAfterSeconds: number | null };
type Account = { id: number; email: string; displayName: string; cookie: string };
type Signals = { consoleErrors: string[]; pageErrors: string[]; failedRequests: string[]; serverErrors: string[] };
type PageAudit = { mainCount: number; duplicateIds: string[]; invalidLabelReferences: string[]; unlabeledControls: string[]; horizontalOverflowPx: number };
type Cleanup = { viewport: string; accountErased: boolean; sessionInvalidated: boolean; emailReleased: boolean; displayNameReleased: boolean; otherAccountErased: boolean };
type ViewResult = {
  viewport: string;
  catalogAndEditorRendered: boolean;
  formulasCalculated: boolean;
  undoRedoReconciled: boolean;
  controlledClipboardAdapterRoundTrip: boolean;
  localImportReviewedAndPersisted: boolean;
  immutableCreationRevisionReconciled: boolean;
  crossOwnerIsolationReconciled: boolean;
  staleSaveStoppedAsConflict: boolean;
  largeGridWindowed: boolean;
  renderedCellCountAtLimit: number;
  reconciledSaveCreatedNewRevision: boolean;
  restoreCreatedNewImmutableRevision: boolean;
  catalogPersistenceRendered: boolean;
  audit: PageAudit;
  signals: Signals;
};

const BASE_URL = new URL(process.env.LYFEOS_TEST_API_URL || "https://lyfeos.net");
const SOURCE = process.env.LYFEOS_ACCEPTANCE_SOURCE || "";
const HARNESS_SOURCE = process.env.LYFEOS_ACCEPTANCE_HARNESS_SOURCE || process.env.GITHUB_SHA || "";
const OUTPUT_DIR = path.resolve(process.env.LYFEOS_SHEETS_OUTPUT_DIR || path.join(os.tmpdir(), "lyfeos-production-sheets"));
const OUTPUT_FILE = path.join(OUTPUT_DIR, "sheets-report.json");
const PASSWORD = "TestPass123!";
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
    .replace(/sheets_(owner|other)_[a-z0-9_]+/gi, "[redacted fixture]")
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
    retryAfterSeconds: Number.isFinite(Number(response.headers.get("retry-after"))) ? Number(response.headers.get("retry-after")) : null,
  };
}

async function registerDisposableAccount(account: Account): Promise<ApiResult> {
  let result: ApiResult | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    result = await request("POST", "/api/auth/complete-registration", { email: account.email, password: PASSWORD, displayName: account.displayName, termsAccepted: true });
    if (result.status === 201) {
      Object.assign(account, { id: Number(result.body.user?.id), cookie: result.cookie });
      return result;
    }
    if (result.status !== 429 || attempt === 1) return result;
    const waitSeconds = Math.min(61, Math.max(1, result.retryAfterSeconds || 60));
    await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1_000 + 250));
  }
  return result!;
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
  throw new Error("No Chromium executable found for production Sheets acceptance.");
}

function cookieParts(cookie: string): { name: string; value: string } {
  const separator = cookie.indexOf("=");
  assert(separator > 0, "Registration did not return a usable session cookie.");
  return { name: cookie.slice(0, separator), value: cookie.slice(separator + 1) };
}

function captureSignals(page: Page): Signals {
  const signals: Signals = { consoleErrors: [], pageErrors: [], failedRequests: [], serverErrors: [] };
  page.on("console", (entry) => {
    if (entry.type() === "error") signals.consoleErrors.push(entry.text().slice(0, 500));
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

function acknowledgeReconciledConflict(signals: Signals): void {
  const index = signals.consoleErrors.findIndex((error) => error.includes("409"));
  if (index >= 0) signals.consoleErrors.splice(index, 1);
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

async function selectCellAndEnter(page: Page, address: string, value: string): Promise<void> {
  await activate(page, `[data-sheet-address="${address}"]`);
  await setValue(page, 'input[aria-label="Cell input or formula"]', value);
}

async function waitForSpreadsheet(account: Account, spreadsheetId: number, predicate: (spreadsheet: any) => boolean, label: string): Promise<any> {
  const deadline = Date.now() + 45_000;
  let latest: ApiResult | null = null;
  while (Date.now() < deadline) {
    latest = await request("GET", `/api/spreadsheets/${spreadsheetId}`, undefined, account.cookie);
    if (latest.status === 200 && predicate(latest.body.spreadsheet)) return latest.body.spreadsheet;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`${label} did not reconcile; latest=${JSON.stringify(latest?.body || {}).slice(0, 1_000)}.`);
}

async function auditPage(page: Page): Promise<PageAudit> {
  return page.evaluate(() => {
    const ids = new Map<string, number>();
    for (const element of document.querySelectorAll<HTMLElement>("[id]")) ids.set(element.id, (ids.get(element.id) || 0) + 1);
    const scope = document.querySelector<HTMLElement>('[data-testid="sheets-page"]');
    if (!scope) throw new Error("Sheets catalog acceptance scope is not rendered.");
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
  const owner: Account = { id: 0, email: `sheets_owner_${stamp}@example.com`, displayName: `sheets_owner_${ordinal}_${stamp.slice(-8)}`, cookie: "" };
  const other: Account = { id: 0, email: `sheets_other_${stamp}@example.com`, displayName: `sheets_other_${ordinal}_${stamp.slice(-8)}`, cookie: "" };
  const initialTitle = `Reality tracker ${ordinal}`;
  const serverTitle = `Server revision ${ordinal}`;
  const reconciledTitle = `Reconciled revision ${ordinal}`;
  const importPath = path.join(OUTPUT_DIR, `sheets-import-${ordinal}.csv`);
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let view: ViewResult | null = null;
  let ownerErased = false;
  let otherErased = false;
  let failure: unknown = null;
  let stage = "register disposable owners";
  try {
    await fs.writeFile(importPath, "habit,score\nsleep,8\ntraining,5\n", "utf8");
    const ownerRegistration = await registerDisposableAccount(owner);
    const otherRegistration = await registerDisposableAccount(other);
    assert(ownerRegistration.status === 201 && otherRegistration.status === 201, `Disposable owner registration returned ${ownerRegistration.status}/${otherRegistration.status}.`);

    stage = "render Sheets catalog and create through named controls";
    context = await browser.createBrowserContext();
    page = await context.newPage();
    const signals = captureSignals(page);
    const session = cookieParts(owner.cookie);
    await page.setCookie({ ...session, url: BASE_URL.origin, path: "/", httpOnly: true, secure: true, sameSite: "Lax" });
    await page.evaluateOnNewDocument((fixtureUser) => {
      try {
        localStorage.setItem("lyfeos_user", JSON.stringify(fixtureUser));
        localStorage.setItem(`lyfeos-tutorial-done-missions-${fixtureUser.id}`, "true");
      } catch { /* Origin is not ready. */ }
    }, { id: owner.id, displayName: owner.displayName });
    await page.setViewport(viewport.value);
    await page.setCacheEnabled(false);
    await page.goto(new URL("/spreadsheets", BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector('[data-testid="sheets-page"]', { visible: true, timeout: 60_000 });
    await dismissBlockingTutorial(page);
    await activate(page, '[data-testid="sheets-new"]');
    await page.waitForSelector('[data-testid="sheet-editor"]', { visible: true, timeout: 45_000 });
    await page.evaluate(`(() => {
      let value = "";
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (nextValue) => { value = String(nextValue); },
          readText: async () => value,
        },
      });
    })()`);
    const catalogAndEditorRendered = true;

    stage = "exercise formulas, undo/redo, clipboard and reviewed local import";
    await setValue(page, 'input[aria-label="Sheet title"]', initialTitle);
    await setValue(page, 'input[aria-label="Sheet category"]', "progression");
    await setValue(page, 'textarea[aria-label="Sheet description"]', "Production Sheets acceptance fixture");
    await selectCellAndEnter(page, "A1", "2");
    await selectCellAndEnter(page, "A2", "3");
    await selectCellAndEnter(page, "A3", "=SUM(A1:A2)");
    await page.waitForFunction(() => document.querySelector('[data-sheet-address="A3"]')?.getAttribute("aria-label") === "A3: 5", { timeout: 30_000 });
    const formulasCalculated = true;
    await selectCellAndEnter(page, "A1", "9");
    await activate(page, 'button[aria-label="Undo last unsaved spreadsheet change"]');
    const undone = await page.$eval('input[aria-label="Cell input or formula"]', (element) => (element as HTMLInputElement).value === "2");
    await activate(page, 'button[aria-label="Redo last undone spreadsheet change"]');
    const redone = await page.$eval('input[aria-label="Cell input or formula"]', (element) => (element as HTMLInputElement).value === "9");
    assert(undone && redone, "Rendered undo/redo did not reconcile the selected cell.");
    await setValue(page, 'input[aria-label="Cell input or formula"]', "2");
    await activate(page, 'button[aria-label^="Copy selected range"]');
    await page.waitForFunction(async () => {
      try { return await navigator.clipboard.readText() === "2"; } catch { return false; }
    }, { timeout: 30_000 });
    await activate(page, '[data-sheet-address="B1"]');
    await activate(page, 'button[aria-label^="Paste range starting"]');
    await page.waitForFunction(() => document.querySelector('[data-sheet-address="B1"]')?.getAttribute("aria-label") === "B1: 2", { timeout: 30_000 });
    const controlledClipboardAdapterRoundTrip = true;
    const fileInput = await page.$('input[aria-label="Choose a CSV or TSV file"]');
    assert(fileInput, "Local CSV input is unavailable.");
    await fileInput.uploadFile(importPath);
    await page.waitForSelector("#sheet-import-review-heading", { visible: true, timeout: 30_000 });
    await activate(page, "section[aria-labelledby=\"sheet-import-review-heading\"] button");
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => button.textContent?.trim().startsWith("sheets-import-")), { timeout: 30_000 });
    const localImportReviewedAndPersisted = true;

    stage = "save immutable creation revision";
    await activate(page, '[data-testid="sheet-save"]');
    await page.waitForFunction(() => /\/spreadsheets\/\d+$/.test(location.pathname) && document.querySelector('[data-testid="sheet-revision"]')?.textContent?.includes("version 1"), { timeout: 45_000 });
    const spreadsheetId = Number(new URL(page.url()).pathname.split("/").at(-1));
    assert(Number.isInteger(spreadsheetId), "Created spreadsheet URL did not expose an integer ID.");
    const created = await waitForSpreadsheet(owner, spreadsheetId, (sheet) => sheet.revision === 1, "creation revision");
    const creationSheet = created.content?.sheets?.find((sheet: any) => sheet.cells?.A3?.input === "=SUM(A1:A2)");
    const importSheet = created.content?.sheets?.find((sheet: any) => sheet.name?.startsWith("sheets-import-"));
    const immutableCreationRevisionReconciled = Boolean(creationSheet && importSheet?.cells?.A2?.input === "sleep" && creationSheet.cells?.B1?.input === "2");
    assert(immutableCreationRevisionReconciled, "Creation revision did not persist formula, clipboard and reviewed import state.");
    const revisionsV1 = await request("GET", `/api/spreadsheets/${spreadsheetId}/revisions`, undefined, owner.cookie);
    assert(revisionsV1.status === 200 && revisionsV1.body.revisions?.length === 1 && revisionsV1.body.revisions[0]?.action === "created", "Creation history is not an immutable version one.");
    const isolated = await request("GET", `/api/spreadsheets/${spreadsheetId}`, undefined, other.cookie);
    const crossOwnerIsolationReconciled = isolated.status === 403;
    assert(crossOwnerIsolationReconciled, `Cross-owner spreadsheet read returned ${isolated.status}.`);

    stage = "stop stale save and prove bounded rendering at the documented limit";
    const largeContent = structuredClone(created.content);
    const primarySheet = largeContent.sheets.find((sheet: any) => sheet.cells?.A3?.input === "=SUM(A1:A2)");
    primarySheet.rowCount = 500;
    primarySheet.columnCount = 100;
    primarySheet.cells.CV500 = { input: "limit" };
    largeContent.activeSheetId = primarySheet.id;
    const external = await request("PATCH", `/api/spreadsheets/${spreadsheetId}`, { title: serverTitle, content: largeContent }, owner.cookie, { "x-lyfeos-expected-revision": "1" });
    assert(external.status === 200 && external.body.spreadsheet?.revision === 2, `Competing spreadsheet update returned ${external.status}.`);
    await setValue(page, 'input[aria-label="Sheet title"]', `Stale browser ${ordinal}`);
    await activate(page, '[data-testid="sheet-save"]');
    await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent?.includes("changed after you opened it"), { timeout: 30_000 });
    const conflictState = await waitForSpreadsheet(owner, spreadsheetId, (sheet) => sheet.revision === 2, "conflict state");
    const staleSaveStoppedAsConflict = conflictState.title === serverTitle;
    assert(staleSaveStoppedAsConflict, "Stale rendered save overwrote the competing spreadsheet revision.");
    acknowledgeReconciledConflict(signals);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector('[data-testid="sheet-editor"]', { visible: true, timeout: 60_000 });
    await page.$eval('[data-testid="sheet-grid"]', (element) => {
      element.scrollLeft = element.scrollWidth;
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await page.waitForSelector('[data-sheet-address="CV500"]', { visible: true, timeout: 30_000 });
    const renderedCellCountAtLimit = await page.$$eval('[data-testid="sheet-grid"] [data-sheet-address]', (cells) => cells.length);
    const largeGridWindowed = renderedCellCountAtLimit > 0 && renderedCellCountAtLimit < 500;
    assert(largeGridWindowed, `The 500 by 100 grid rendered ${renderedCellCountAtLimit} cell controls instead of a bounded window.`);

    stage = "reconcile a fresh save and restore version one as a new version";
    await setValue(page, 'input[aria-label="Sheet title"]', reconciledTitle);
    await activate(page, '[data-testid="sheet-save"]');
    await page.waitForFunction(() => document.querySelector('[data-testid="sheet-revision"]')?.textContent?.includes("version 3"), { timeout: 45_000 });
    const revisionThree = await waitForSpreadsheet(owner, spreadsheetId, (sheet) => sheet.revision === 3, "reconciled save");
    const reconciledSaveCreatedNewRevision = revisionThree.title === reconciledTitle;
    assert(reconciledSaveCreatedNewRevision, "Fresh rendered save did not create revision three.");
    await page.$eval('[data-testid="sheet-history"]', (element) => { (element as HTMLDetailsElement).open = true; });
    await page.waitForSelector('[data-testid="sheet-history-version-1"] button', { visible: true, timeout: 30_000 });
    page.once("dialog", (dialog) => void dialog.accept());
    await activate(page, '[data-testid="sheet-history-version-1"] button');
    await page.waitForFunction(() => document.querySelector('[data-testid="sheet-revision"]')?.textContent?.includes("version 4"), { timeout: 45_000 });
    const restored = await waitForSpreadsheet(owner, spreadsheetId, (sheet) => sheet.revision === 4, "restored revision");
    const revisionsV4 = await request("GET", `/api/spreadsheets/${spreadsheetId}/revisions`, undefined, owner.cookie);
    const restoreCreatedNewImmutableRevision = restored.title === initialTitle
      && revisionsV4.status === 200
      && revisionsV4.body.revisions?.length === 4
      && revisionsV4.body.revisions[0]?.action === "restored"
      && revisionsV4.body.revisions[0]?.sourceRevision === 1;
    assert(restoreCreatedNewImmutableRevision, "Rendered restore did not preserve history and create immutable revision four from version one.");

    stage = "render restored catalog state and audit responsive semantics";
    await page.goto(new URL("/spreadsheets", BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector(`[data-testid="sheet-card-${spreadsheetId}"]`, { visible: true, timeout: 45_000 });
    const catalogPersistenceRendered = await page.$eval(`[data-testid="sheet-card-${spreadsheetId}"]`, (element, title) => element.textContent?.includes(String(title)) === true, initialTitle);
    assert(catalogPersistenceRendered, "Restored spreadsheet did not render in the catalog.");
    const audit = await auditPage(page);
    assert(audit.mainCount === 1 && audit.duplicateIds.length === 0 && audit.invalidLabelReferences.length === 0 && audit.unlabeledControls.length === 0 && audit.horizontalOverflowPx <= 2, `${viewport.name} Sheets failed semantics or overflow checks.`);
    assert(Object.values(signals).every((items) => items.length === 0), `${viewport.name} Sheets journey produced application errors: ${JSON.stringify(signals)}.`);
    view = { viewport: viewport.name, catalogAndEditorRendered, formulasCalculated, undoRedoReconciled: true, controlledClipboardAdapterRoundTrip, localImportReviewedAndPersisted, immutableCreationRevisionReconciled, crossOwnerIsolationReconciled, staleSaveStoppedAsConflict, largeGridWindowed, renderedCellCountAtLimit, reconciledSaveCreatedNewRevision, restoreCreatedNewImmutableRevision, catalogPersistenceRendered, audit, signals };
  } catch (error) {
    const rendered = page ? await page.evaluate(() => document.body?.innerText.slice(0, 2_000) || "page unavailable").catch(() => "page unavailable") : "page unavailable";
    if (page) await page.screenshot({ path: path.join(OUTPUT_DIR, `sheets-${viewport.name}-failure.png`), fullPage: true }).catch(() => undefined);
    failure = new Error(`${safeError(error)}; rendered=${rendered}`);
  } finally {
    if (context) await context.close().catch(() => undefined);
    ownerErased = await eraseAccount(owner);
    otherErased = await eraseAccount(other);
  }
  const cleanup: Cleanup = { viewport: viewport.name, accountErased: ownerErased, sessionInvalidated: ownerErased, emailReleased: ownerErased, displayNameReleased: ownerErased, otherAccountErased: otherErased };
  if (failure) throw new Error(`stage=${stage}; ${safeError(failure)}; ownerErased=${ownerErased}; otherErased=${otherErased}`);
  assert(view && ownerErased && otherErased, `${viewport.name} did not complete the rendered Sheets journey and verified account erasure.`);
  return { view, cleanup };
}

async function main(): Promise<void> {
  assert(BASE_URL.origin === "https://lyfeos.net", "Production Sheets acceptance may target only https://lyfeos.net.");
  assert(/^[0-9a-f]{40}$/.test(SOURCE), "Production Sheets acceptance requires the exact deployed source revision.");
  assert(/^[0-9a-f]{40}$/.test(HARNESS_SOURCE), "Production Sheets acceptance requires the exact harness source revision.");
  const release = await request("GET", "/api/release");
  assert(release.status === 200 && release.body?.sourceRevision === SOURCE, "Production Sheets runtime does not match the requested immutable source.");
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
    const passed = failure === null && views.length === VIEWPORTS.length && cleanups.length === VIEWPORTS.length && cleanups.every((cleanup) => cleanup.accountErased && cleanup.otherAccountErased);
    const report = {
      contract: "lyfeos.production-sheets-browser.v1",
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL.origin,
      sourceRevision: SOURCE,
      harnessSource: HARNESS_SOURCE,
      views,
      cleanups,
      summary: { passed, failure },
      boundary: "Disposable production-account Chromium evidence for Sheets. It proves desktop/mobile catalog and editor rendering; raw-value and formula persistence; calculated formula display; local undo/redo; copy/paste through a controlled in-page Clipboard API adapter; explicit local CSV review before persistence; immutable create, update, conflict and restore revisions; cross-owner isolation; bounded rendering at the documented 500-row by 100-column limit; responsive semantics; and verified account/session/identifier erasure. It does not prove native spreadsheet-file import, charting, OS clipboard permissions, real-device clipboard or file-picker behavior, browser permission denial recovery, simultaneous multi-tab editing, full Excel or Google Sheets formula compatibility, human assistive-technology comprehension, or longitudinal calculation correctness for user-authored models.",
    };
    await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    if (process.env.GITHUB_STEP_SUMMARY) {
      await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, [
        "## LyfeOS production Sheets acceptance",
        "",
        `- Runtime source: ${SOURCE}`,
        `- Harness source: ${HARNESS_SOURCE}`,
        `- Passed: ${passed}`,
        `- Desktop/mobile views: ${views.length}/${VIEWPORTS.length}`,
        `- Disposable owners erased: ${cleanups.filter((cleanup) => cleanup.accountErased && cleanup.otherAccountErased).length}/${VIEWPORTS.length}`,
        "",
        report.boundary,
        "",
      ].join("\n"), "utf8");
    }
    console.log(JSON.stringify({ contract: report.contract, passed, viewCount: views.length, erasedOwnerPairs: cleanups.filter((cleanup) => cleanup.accountErased && cleanup.otherAccountErased).length }));
    if (!passed && !failure) failure = "Production Sheets acceptance did not satisfy every rendered, concurrency, isolation and cleanup invariant.";
  }
  if (failure) throw new Error(failure);
}

main().catch((error) => {
  console.error(safeError(error));
  process.exitCode = 1;
});
