import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import puppeteer, { type Browser, type BrowserContext, type Page, type Viewport } from "puppeteer-core";
import { acknowledgeBoundedChunkRecovery, hasUnexpectedBrowserSignals, type BrowserSignals } from "./lib/production-browser-signals";

type ApiResult = { status: number; body: any; cookie: string; retryAfterSeconds: number | null };
type Account = { id: number; email: string; displayName: string; cookie: string };
type Signals = BrowserSignals;
type PageAudit = { mainCount: number; duplicateIds: string[]; invalidLabelReferences: string[]; unlabeledControls: string[]; horizontalOverflowPx: number };
type Cleanup = { viewport: string; accountErased: boolean; sessionInvalidated: boolean; emailReleased: boolean; displayNameReleased: boolean; otherAccountErased: boolean };
class ViewportAcceptanceFailure extends Error {
  constructor(message: string, readonly cleanup: Cleanup) { super(message); }
}
type ViewResult = {
  viewport: string;
  catalogAndEditorRendered: boolean;
  formulasCalculated: boolean;
  extendedFormulaCompatibility: boolean;
  absoluteReferencesReconciled: boolean;
  crossSheetReferencesReconciled: boolean;
  undoRedoReconciled: boolean;
  controlledClipboardAdapterRoundTrip: boolean;
  chartFamiliesRenderedFromCanonicalRanges: boolean;
  dualAxisCombinationReconciled: boolean;
  explicitSeriesRolesReconciled: boolean;
  chartDefinitionsPersisted: boolean;
  chartFamiliesReloadedAndRestored: boolean;
  localImportReviewedAndPersisted: boolean;
  xlsxWorkbookReviewedAndPersisted: boolean;
  xlsxWorkbookExportGenerated: boolean;
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

function xlsxAcceptanceFixture(): Uint8Array {
  const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  return zipSync({
    "[Content_Types].xml": strToU8(`${declaration}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`),
    "_rels/.rels": strToU8(`${declaration}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`${declaration}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet 1" sheetId="1" r:id="rId1"/><sheet name="Imported Summary" sheetId="2" state="hidden" r:id="rId2"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`${declaration}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet2.xml"/></Relationships>`),
    "xl/worksheets/sheet1.xml": strToU8(`${declaration}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Sleep score</t></is></c></row><row r="2"><c r="A2"><v>8</v></c><c r="B2"><f>A2*2</f><v>16</v></c></row></sheetData></worksheet>`),
    "xl/worksheets/sheet2.xml": strToU8(`${declaration}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><f>'Sheet 1'!B2</f><v>16</v></c></row></sheetData></worksheet>`),
  }, { level: 1 });
}

async function captureXlsxExport(page: Page): Promise<Uint8Array> {
  await page.evaluate(() => {
    const originalCreateObjectUrl = URL.createObjectURL.bind(URL);
    (window as any).__lyfeosXlsxExport = null;
    URL.createObjectURL = (object: Blob | MediaSource) => {
      if (object instanceof Blob && object.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
        const reader = new FileReader();
        reader.onload = () => { (window as any).__lyfeosXlsxExport = String(reader.result || "").split(",", 2)[1] || ""; };
        reader.readAsDataURL(object);
      }
      return originalCreateObjectUrl(object);
    };
  });
  await activate(page, '[data-testid="sheet-export-xlsx"]');
  await page.waitForFunction(() => typeof (window as any).__lyfeosXlsxExport === "string" && (window as any).__lyfeosXlsxExport.length > 0, { timeout: 30_000 });
  const encoded = await page.evaluate(() => (window as any).__lyfeosXlsxExport as string);
  return new Uint8Array(Buffer.from(encoded, "base64"));
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
  const signals: Signals = { consoleErrors: [], pageErrors: [], failedRequests: [], serverErrors: [], recoveredChunkLoads: [] };
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

async function createChartFromRange(page: Page, startAddress: string, endAddress: string, kind: "line" | "bar" | "stacked_bar" | "area" | "combo" | "pie" | "scatter", expectedCount: number): Promise<void> {
  await activate(page, `[data-sheet-address="${startAddress}"]`);
  await page.$eval(`[data-sheet-address="${endAddress}"]`, (element) => element.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true })));
  await activate(page, '[data-testid="sheet-chart-create"]');
  await page.waitForFunction((count) => document.querySelectorAll('[data-testid^="sheet-chart-chart_"]').length === count, { timeout: 30_000 }, expectedCount);
  if (kind !== "line") {
    const cards = await page.$$('[data-testid^="sheet-chart-chart_"]');
    const card = cards.at(-1);
    assert(card, `Chart ${expectedCount} was not rendered.`);
    const cardTestId = await card.evaluate((element) => element.getAttribute("data-testid"));
    assert(cardTestId, `Chart ${expectedCount} has no stable test identifier.`);
    const triggerSelector = `[data-testid="${cardTestId}"] [aria-label="Chart type"]`;
    await activate(page, triggerSelector);
    await page.waitForSelector('[role="option"]', { visible: true, timeout: 10_000 });
    const optionLabel = kind === "stacked_bar" ? "stacked bar" : kind === "combo" ? "combination" : kind;
    const selected = await page.evaluate((expected) => {
      const option = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find((candidate) => candidate.innerText.trim().toLocaleLowerCase() === expected);
      option?.click();
      return Boolean(option);
    }, optionLabel);
    assert(selected, `Could not select the ${kind} chart type.`);
    await page.waitForFunction(({ count, expectedKind }) => {
      const charts = document.querySelectorAll<HTMLElement>('[data-testid^="sheet-chart-chart_"]');
      return charts.length === count && charts[count - 1]?.dataset.chartKind === expectedKind;
    }, { timeout: 30_000 }, { count: expectedCount, expectedKind: kind });
  }
}

async function selectDualAxesForCombinationChart(page: Page): Promise<void> {
  const cardTestId = await page.evaluate(() => {
    const combo = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="sheet-chart-chart_"]')).find((chart) => chart.dataset.chartKind === "combo");
    return combo?.dataset.testid || null;
  });
  assert(cardTestId, "Combination chart has no stable test identifier.");
  await activate(page, `[data-testid="${cardTestId}"] [aria-label="Combination chart axes"]`);
  await page.waitForSelector('[role="option"]', { visible: true, timeout: 10_000 });
  const selected = await page.evaluate(() => {
    const option = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find((candidate) => candidate.innerText.trim().toLocaleLowerCase() === "dual axes");
    option?.click();
    return Boolean(option);
  });
  assert(selected, "Could not select dual axes for the combination chart.");
  await page.waitForFunction((testId) => {
    const chart = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
    const text = chart?.textContent || "";
    return chart?.dataset.axisMode === "dual"
      && text.includes("independently scaled right axis")
      && text.includes("Dual axes can exaggerate visual relationships");
  }, { timeout: 30_000 }, cardTestId);
}

async function reverseCombinationSeriesRoles(page: Page): Promise<void> {
  const cardTestId = await page.evaluate(() => {
    const combo = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="sheet-chart-chart_"]')).find((chart) => chart.dataset.chartKind === "combo");
    const details = combo?.querySelector<HTMLDetailsElement>('details[data-testid^="sheet-chart-series-roles-"]');
    if (details) details.open = true;
    return combo?.dataset.testid || null;
  });
  assert(cardTestId, "Combination chart has no stable test identifier.");
  await activate(page, `[data-testid="${cardTestId}"] [aria-label="Series role: Calls"]`);
  await page.waitForSelector('[role="option"]', { visible: true, timeout: 10_000 });
  const selected = await page.evaluate(() => {
    const option = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find((candidate) => candidate.innerText.trim().toLocaleLowerCase() === "line");
    option?.click();
    return Boolean(option);
  });
  assert(selected, "Could not assign Calls to the line role.");
  await page.waitForFunction((testId) => {
    const chart = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
    const text = chart?.textContent || "";
    return chart?.dataset.seriesRoles === "line,bar"
      && text.includes("Calls (line, right axis)")
      && text.includes("Sales (bar, left axis)");
  }, { timeout: 30_000 }, cardTestId);
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
  const xlsxImportPath = path.join(OUTPUT_DIR, `sheets-import-${ordinal}.xlsx`);
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let view: ViewResult | null = null;
  let ownerErased = false;
  let otherErased = false;
  let failure: unknown = null;
  let stage = "register disposable owners";
  try {
    await fs.writeFile(importPath, "habit,score\nsleep,8\ntraining,5\n", "utf8");
    await fs.writeFile(xlsxImportPath, xlsxAcceptanceFixture());
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

    stage = "exercise formulas, undo/redo, clipboard, live charts and reviewed local import";
    await setValue(page, 'input[aria-label="Sheet title"]', initialTitle);
    await setValue(page, 'input[aria-label="Sheet category"]', "progression");
    await setValue(page, 'textarea[aria-label="Sheet description"]', "Production Sheets acceptance fixture");
    await selectCellAndEnter(page, "A1", "2");
    await selectCellAndEnter(page, "A2", "3");
    await selectCellAndEnter(page, "A3", "=SUM(A1:A2)");
    await page.waitForFunction(() => document.querySelector('[data-sheet-address="A3"]')?.getAttribute("aria-label") === "A3: 5", { timeout: 30_000 });
    const formulasCalculated = true;
    await selectCellAndEnter(page, "B4", "=IF(A1<A2,ROUND(A2/A1,1),1/0)");
    await page.waitForFunction(() => document.querySelector('[data-sheet-address="B4"]')?.getAttribute("aria-label") === "B4: 1.5", { timeout: 30_000 });
    await selectCellAndEnter(page, "B5", "=COUNT(A1:A3)");
    await page.waitForFunction(() => document.querySelector('[data-sheet-address="B5"]')?.getAttribute("aria-label") === "B5: 3", { timeout: 30_000 });
    await selectCellAndEnter(page, "B6", "=COUNTA(A1:A3)");
    await page.waitForFunction(() => document.querySelector('[data-sheet-address="B6"]')?.getAttribute("aria-label") === "B6: 3", { timeout: 30_000 });
    await selectCellAndEnter(page, "B7", "=ABS(-2.345)");
    await page.waitForFunction(() => document.querySelector('[data-sheet-address="B7"]')?.getAttribute("aria-label") === "B7: 2.345", { timeout: 30_000 });
    await selectCellAndEnter(page, "B8", "=A1<A2");
    await page.waitForFunction(() => document.querySelector('[data-sheet-address="B8"]')?.getAttribute("aria-label") === "B8: TRUE", { timeout: 30_000 });
    const extendedFormulaCompatibility = true;
    await selectCellAndEnter(page, "B9", '=IF($A$1=2,"$A$1 stays text",$A$2)');
    await page.waitForFunction(() => document.querySelector('[data-sheet-address="B9"]')?.getAttribute("aria-label") === "B9: $A$1 stays text", { timeout: 30_000 });
    const absoluteReferencesReconciled = true;
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
    await selectCellAndEnter(page, "C1", "Week");
    await selectCellAndEnter(page, "D1", "Calls");
    await selectCellAndEnter(page, "E1", "Sales");
    await selectCellAndEnter(page, "C2", "One");
    await selectCellAndEnter(page, "D2", "4");
    await selectCellAndEnter(page, "E2", "=D2/2");
    await selectCellAndEnter(page, "C3", "Two");
    await selectCellAndEnter(page, "E3", "not measured");
    await selectCellAndEnter(page, "C4", "Three");
    await selectCellAndEnter(page, "D4", "0");
    await selectCellAndEnter(page, "E4", "=D4+3");
    await createChartFromRange(page, "C1", "E4", "line", 1);
    const primaryChartRendered = await page.$eval('[data-testid^="sheet-chart-chart_"]', (element) => {
      const text = element.textContent || "";
      const details = element.querySelector("details");
      if (details) details.open = true;
      return text.includes("Sheet 1!C1:E4")
        && text.includes("4 numeric values plotted")
        && text.includes("2 blank, text, or error values not plotted")
        && text.includes("Missing values are never converted to zero");
    });
    assert(primaryChartRendered, "Rendered line chart did not reconcile the canonical range, formulas and missing-value boundary.");
    await page.waitForFunction(() => {
      const text = document.querySelector('[data-testid^="sheet-chart-chart_"] table')?.textContent || "";
      return text.includes("Calls") && text.includes("Sales") && text.includes("One") && text.includes("Three") && text.includes("Not recorded");
    }, { timeout: 30_000 });
    await createChartFromRange(page, "C1", "E4", "bar", 2);
    await createChartFromRange(page, "C1", "E4", "area", 3);
    await createChartFromRange(page, "C1", "E4", "stacked_bar", 4);
    await createChartFromRange(page, "C1", "E4", "combo", 5);
    await selectDualAxesForCombinationChart(page);
    await reverseCombinationSeriesRoles(page);
    await createChartFromRange(page, "C1", "D4", "pie", 6);
    await createChartFromRange(page, "C1", "E4", "scatter", 7);
    const chartFamiliesRenderedFromCanonicalRanges = await page.evaluate(() => {
      const charts = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="sheet-chart-chart_"]'));
      const kinds = charts.map((chart) => chart.dataset.chartKind);
      const pie = charts.find((chart) => chart.dataset.chartKind === "pie");
      const scatter = charts.find((chart) => chart.dataset.chartKind === "scatter");
      const stacked = charts.find((chart) => chart.dataset.chartKind === "stacked_bar");
      const combo = charts.find((chart) => chart.dataset.chartKind === "combo");
      return charts.length === 7
        && ["line", "bar", "stacked_bar", "area", "combo", "pie", "scatter"].every((kind) => kinds.includes(kind))
        && pie?.dataset.sourceRange === "C1:D4"
        && scatter?.dataset.sourceRange === "C1:E4"
        && (scatter.textContent || "").includes("2 complete numeric pairs plotted")
        && (scatter.textContent || "").includes("1 observation without a complete numeric pair not plotted")
        && (pie?.textContent || "").includes("Pie charts require one label column and one value column")
        && (stacked?.textContent || "").includes("missing segments stay missing")
        && combo?.dataset.axisMode === "dual"
        && combo?.dataset.seriesRoles === "line,bar"
        && (combo?.textContent || "").includes("Dual axes can exaggerate visual relationships");
    });
    assert(chartFamiliesRenderedFromCanonicalRanges, "Rendered trend, proportion, or correlation chart semantics did not reconcile their canonical ranges.");
    const dualAxisCombinationReconciled = await page.evaluate(() => {
      const combo = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="sheet-chart-chart_"]')).find((chart) => chart.dataset.chartKind === "combo");
      return combo?.dataset.axisMode === "dual" && (combo.textContent || "").includes("canonical raw-value table");
    });
    assert(dualAxisCombinationReconciled, "Combination chart did not retain its explicit dual-axis disclosure.");
    const explicitSeriesRolesReconciled = await page.evaluate(() => {
      const combo = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="sheet-chart-chart_"]')).find((chart) => chart.dataset.chartKind === "combo");
      return combo?.dataset.seriesRoles === "line,bar" && (combo.textContent || "").includes("Every source series has one explicit rendering role");
    });
    assert(explicitSeriesRolesReconciled, "Combination chart did not retain the explicitly assigned series roles.");
    const fileInput = await page.$('input[aria-label="Choose a CSV, TSV, or XLSX file"]');
    assert(fileInput, "Local CSV input is unavailable.");
    await fileInput.uploadFile(importPath);
    await page.waitForSelector("#sheet-import-review-heading", { visible: true, timeout: 30_000 });
    await activate(page, "section[aria-labelledby=\"sheet-import-review-heading\"] button");
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => button.textContent?.trim().startsWith("sheets-import-")), { timeout: 30_000 });
    const localImportReviewedAndPersisted = true;
    const importedSheetName = await page.$eval('button[aria-pressed="true"][aria-label^="Open sheet tab "]', (element) => element.textContent?.trim() || "");
    assert(importedSheetName.startsWith("sheets-import-"), "Reviewed import did not become the active governed sheet tab.");
    await selectCellAndEnter(page, "C1", "='Sheet 1'!$A$3+B2");
    await page.waitForFunction(() => document.querySelector('[data-sheet-address="C1"]')?.getAttribute("aria-label") === "C1: 13", { timeout: 30_000 });

    stage = "review a bounded multi-tab XLSX import and generate an XLSX export";
    await fileInput.uploadFile(xlsxImportPath);
    await page.waitForFunction(() => {
      const review = document.querySelector<HTMLElement>('section[aria-labelledby="sheet-import-review-heading"]');
      const text = review?.textContent || "";
      return text.includes("2 workbook tabs") && text.includes("Detected but omitted: hidden sheet state") && text.includes("nothing changes until you add these tabs");
    }, { timeout: 30_000 });
    await activate(page, 'section[aria-labelledby="sheet-import-review-heading"] button');
    await page.waitForSelector('button[aria-label="Open sheet tab Sheet 1 (2)"][aria-pressed="true"]', { visible: true, timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector('[data-sheet-address="B2"]')?.getAttribute("aria-label") === "B2: 16", { timeout: 30_000 });
    await activate(page, 'button[aria-label="Open sheet tab Imported Summary"]');
    await page.waitForFunction(() => document.querySelector('[data-sheet-address="A1"]')?.getAttribute("aria-label") === "A1: 16", { timeout: 30_000 });
    const xlsxWorkbookReviewedAndPersisted = true;
    const exportedBytes = await captureXlsxExport(page);
    await fs.writeFile(path.join(OUTPUT_DIR, `sheets-export-${ordinal}.xlsx`), exportedBytes);
    const exportedFiles = unzipSync(exportedBytes);
    const exportedWorkbook = strFromU8(exportedFiles["xl/workbook.xml"] || new Uint8Array());
    const exportedImportedSummary = strFromU8(exportedFiles["xl/worksheets/sheet4.xml"] || new Uint8Array());
    const exportChecks = {
      bytesPresent: exportedBytes.length > 0,
      dataTabNamed: exportedWorkbook.includes('name="Sheet 1 (2)"'),
      summaryTabNamed: exportedWorkbook.includes('name="Imported Summary"'),
      hiddenStateOmitted: !exportedWorkbook.includes('state="hidden"'),
      rewrittenFormulaPresent: exportedImportedSummary.includes("<f>&apos;Sheet 1 (2)&apos;!B2</f>"),
      worksheetParts: Object.keys(exportedFiles).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort(),
    };
    const xlsxWorkbookExportGenerated = Object.entries(exportChecks).every(([key, value]) => key === "worksheetParts" || value === true);
    assert(xlsxWorkbookExportGenerated, `Rendered XLSX export did not preserve the reviewed workbook tabs and rewritten cross-tab formula: ${JSON.stringify(exportChecks)}.`);

    await activate(page, `button[aria-label="Open sheet tab ${importedSheetName}"]`);
    await activate(page, 'button[aria-label="Open sheet tab Sheet 1"]');
    await setValue(page, 'input[aria-label="Active sheet name"]', "Reality");
    await activate(page, 'button[aria-label="Rename active sheet"]');
    await page.waitForSelector('button[aria-label="Open sheet tab Reality"][aria-pressed="true"]', { visible: true, timeout: 30_000 });
    await activate(page, `button[aria-label="Open sheet tab ${importedSheetName}"]`);
    await page.waitForFunction(() => document.querySelector('[data-sheet-address="C1"]')?.getAttribute("aria-label") === "C1: 13", { timeout: 30_000 });
    await activate(page, '[data-sheet-address="C1"]');
    const rewrittenCrossSheetFormula = await page.$eval('input[aria-label="Cell input or formula"]', (element) => (element as HTMLInputElement).value);
    assert(rewrittenCrossSheetFormula === "='Reality'!$A$3+B2", `Tab rename did not preserve the cross-sheet formula: ${rewrittenCrossSheetFormula}.`);
    const crossSheetReferencesReconciled = true;

    stage = "save immutable creation revision";
    await activate(page, '[data-testid="sheet-save"]');
    await page.waitForFunction(() => /\/spreadsheets\/\d+$/.test(location.pathname) && document.querySelector('[data-testid="sheet-revision"]')?.textContent?.includes("version 1"), { timeout: 45_000 });
    const spreadsheetId = Number(new URL(page.url()).pathname.split("/").at(-1));
    assert(Number.isInteger(spreadsheetId), "Created spreadsheet URL did not expose an integer ID.");
    const created = await waitForSpreadsheet(owner, spreadsheetId, (sheet) => sheet.revision === 1, "creation revision");
    const creationSheet = created.content?.sheets?.find((sheet: any) => sheet.cells?.A3?.input === "=SUM(A1:A2)");
    const importSheet = created.content?.sheets?.find((sheet: any) => sheet.name?.startsWith("sheets-import-"));
    const xlsxDataSheet = created.content?.sheets?.find((sheet: any) => sheet.name === "Sheet 1 (2)");
    const xlsxSummarySheet = created.content?.sheets?.find((sheet: any) => sheet.name === "Imported Summary");
    const creationCharts = created.content?.charts || [];
    const hasChart = (kind: string, endColumn: number, axisMode?: "shared" | "dual") => creationCharts.some((chart: any) => chart?.sheetId === creationSheet?.id
      && chart?.kind === kind
      && (axisMode === undefined || chart?.axisMode === axisMode)
      && chart?.range?.startRow === 0
      && chart?.range?.endRow === 3
      && chart?.range?.startColumn === 2
      && chart?.range?.endColumn === endColumn);
    const chartDefinitionsPersisted = creationCharts.length === 7
      && hasChart("line", 4)
      && hasChart("bar", 4)
      && hasChart("area", 4)
      && hasChart("stacked_bar", 4)
      && hasChart("combo", 4, "dual")
      && creationCharts.some((chart: any) => chart?.kind === "combo" && JSON.stringify(chart?.seriesRoles) === JSON.stringify(["line", "bar"]))
      && hasChart("pie", 3)
      && hasChart("scatter", 4);
    assert(chartDefinitionsPersisted, `Creation revision did not persist every governed chart definition over canonical cells; observed=${JSON.stringify({ creationSheetId: creationSheet?.id, creationCharts })}.`);
    const immutableCreationRevisionReconciled = Boolean(creationSheet
      && creationSheet.name === "Reality"
      && importSheet?.cells?.A2?.input === "sleep"
      && importSheet?.cells?.C1?.input === "='Reality'!$A$3+B2"
      && xlsxDataSheet?.cells?.A1?.input === "Sleep score"
      && xlsxDataSheet?.cells?.B2?.input === "=A2*2"
      && xlsxSummarySheet?.cells?.A1?.input === "='Sheet 1 (2)'!B2"
      && creationSheet.cells?.B1?.input === "2"
      && creationSheet.cells?.B4?.input === "=IF(A1<A2,ROUND(A2/A1,1),1/0)"
      && creationSheet.cells?.B8?.input === "=A1<A2"
      && creationSheet.cells?.B9?.input === '=IF($A$1=2,"$A$1 stays text",$A$2)');
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
    await page.waitForSelector('[data-testid^="sheet-chart-chart_"]', { visible: true, timeout: 30_000 });
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
    await page.waitForSelector('[data-testid^="sheet-chart-chart_"]', { visible: true, timeout: 30_000 });
    const chartFamiliesReloadedAndRestored = restored.content?.charts?.length === 7
      && await page.evaluate(() => {
        const charts = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="sheet-chart-chart_"]'));
        const kinds = charts.map((chart) => chart.dataset.chartKind);
        const combo = charts.find((chart) => chart.dataset.chartKind === "combo");
        return charts.length === 7 && ["line", "bar", "stacked_bar", "area", "combo", "pie", "scatter"].every((kind) => kinds.includes(kind)) && combo?.dataset.axisMode === "dual" && combo?.dataset.seriesRoles === "line,bar";
      });
    assert(chartFamiliesReloadedAndRestored, "The governed chart family did not survive reload and immutable restore.");

    stage = "render restored catalog state and audit responsive semantics";
    await page.goto(new URL("/spreadsheets", BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector(`[data-testid="sheet-card-${spreadsheetId}"]`, { visible: true, timeout: 45_000 });
    const catalogPersistenceRendered = await page.$eval(`[data-testid="sheet-card-${spreadsheetId}"]`, (element, title) => element.textContent?.includes(String(title)) === true, initialTitle);
    assert(catalogPersistenceRendered, "Restored spreadsheet did not render in the catalog.");
    const audit = await auditPage(page);
    assert(audit.mainCount === 1 && audit.duplicateIds.length === 0 && audit.invalidLabelReferences.length === 0 && audit.unlabeledControls.length === 0 && audit.horizontalOverflowPx <= 2, `${viewport.name} Sheets failed semantics or overflow checks.`);
    await acknowledgeBoundedChunkRecovery(page, signals);
    assert(!hasUnexpectedBrowserSignals(signals), `${viewport.name} Sheets journey produced application errors: ${JSON.stringify(signals)}.`);
    view = { viewport: viewport.name, catalogAndEditorRendered, formulasCalculated, extendedFormulaCompatibility, absoluteReferencesReconciled, crossSheetReferencesReconciled, undoRedoReconciled: true, controlledClipboardAdapterRoundTrip, chartFamiliesRenderedFromCanonicalRanges, dualAxisCombinationReconciled, explicitSeriesRolesReconciled, chartDefinitionsPersisted, chartFamiliesReloadedAndRestored, localImportReviewedAndPersisted, xlsxWorkbookReviewedAndPersisted, xlsxWorkbookExportGenerated, immutableCreationRevisionReconciled, crossOwnerIsolationReconciled, staleSaveStoppedAsConflict, largeGridWindowed, renderedCellCountAtLimit, reconciledSaveCreatedNewRevision, restoreCreatedNewImmutableRevision, catalogPersistenceRendered, audit, signals };
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
  if (failure) throw new ViewportAcceptanceFailure(`stage=${stage}; ownerErased=${ownerErased}; otherErased=${otherErased}; ${safeError(failure)}`, cleanup);
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
    if (error instanceof ViewportAcceptanceFailure) cleanups.push(error.cleanup);
    failure = safeError(error);
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    const passed = failure === null && views.length === VIEWPORTS.length && cleanups.length === VIEWPORTS.length && cleanups.every((cleanup) => cleanup.accountErased && cleanup.otherAccountErased);
    const report = {
      contract: "lyfeos.production-sheets-browser.v10",
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL.origin,
      sourceRevision: SOURCE,
      harnessSource: HARNESS_SOURCE,
      views,
      cleanups,
      summary: { passed, failure },
      boundary: "Disposable production-account Chromium evidence for Sheets. It proves desktop/mobile catalog and editor rendering; raw-value and formula persistence; calculated formula display; safe relative, $A$1-style absolute and quoted-name cross-sheet references; reference preservation across tab rename; safe arithmetic, comparisons, quoted text, booleans, SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, ROUND, ABS and lazy IF behavior; local undo/redo; persisted live line, bar, stacked bar, area, combination, pie and scatter definitions over canonical cells; explicit per-series bar/line assignment for combination charts with deterministic legacy defaults and safe last-role swapping; an explicit shared-versus-dual combination-axis choice with bar values on the left, line values on the independently scaled right, a visual-risk disclosure and unchanged canonical raw-value table; formula-derived chart values; explicit missing-value and complete-pair handling with accessible source tables; chart-family reload and immutable restore; copy/paste through a controlled in-page Clipboard API adapter; explicit local CSV review; bounded two-tab XLSX review with detected hidden-state disclosure, collision-safe cross-tab formula rewriting, persistence and browser-generated OOXML export; immutable create, update, conflict and restore revisions; cross-owner isolation; bounded rendering at the documented 500-row by 100-column limit; responsive semantics; and verified account/session/identifier erasure. It does not prove OS-native file-picker or download behavior, ODS or legacy XLS transfer, advanced OOXML presentation or formulas, real-device clipboard/file behavior, browser permission denial recovery, simultaneous multi-tab editing, full Excel or Google Sheets compatibility, human assistive-technology comprehension, statistical causality, or longitudinal calculation correctness for user-authored models.",
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
