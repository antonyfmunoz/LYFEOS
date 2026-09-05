import { randomUUID } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer, { type Browser, type BrowserContext, type Page, type Viewport } from "puppeteer-core";
import { hasUnexpectedBrowserSignals, type BrowserSignals } from "./lib/production-browser-signals";

type ApiResult = { status: number; body: any; cookie: string; retryAfterSeconds: number | null };
type Account = { id: number; email: string; displayName: string; cookie: string };
type Audit = { mainCount: number; duplicateIds: string[]; invalidLabelReferences: string[]; unlabeledControls: string[]; horizontalOverflowPx: number };
type ViewResult = { viewport: string; preferencesSaved: boolean; exportedRecordedHealth: boolean; exportIncludedNoCredentialReferences: boolean; deletedHealthDomain: boolean; rightsReceiptRetained: boolean; audit: Audit; signals: BrowserSignals };

const BASE_URL = new URL(process.env.LYFEOS_TEST_API_URL || "https://lyfeos.net");
const MODE = process.env.LYFEOS_HEALTH_DATA_RIGHTS_ACCEPTANCE_MODE || "production";
const SOURCE = process.env.LYFEOS_ACCEPTANCE_SOURCE || "";
const HARNESS_SOURCE = process.env.LYFEOS_ACCEPTANCE_HARNESS_SOURCE || process.env.GITHUB_SHA || "";
const OUTPUT_DIR = path.resolve(process.env.LYFEOS_HEALTH_DATA_RIGHTS_OUTPUT_DIR || path.join(os.tmpdir(), "lyfeos-production-health-data-rights"));
const OUTPUT_FILE = path.join(OUTPUT_DIR, "health-data-rights-report.json");
const PASSWORD = "TestPass123!";
const VIEWPORTS: Array<{ name: string; value: Viewport }> = [
  { name: "desktop-1440x900", value: { width: 1440, height: 900, deviceScaleFactor: 1 } },
  { name: "mobile-390x844", value: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
];

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function safeError(error: unknown): string { return (error instanceof Error ? error.message : String(error)).replace(/[a-z0-9._%+-]+@example\.com/gi, "[redacted fixture]").replace(/health_rights_(owner|production)_[a-z0-9_]+/gi, "[redacted fixture]").slice(0, 1_500); }

async function request(method: string, pathname: string, body?: unknown, cookie = "", headers: Record<string, string> = {}): Promise<ApiResult> {
  const response = await fetch(new URL(pathname, BASE_URL), { method, signal: AbortSignal.timeout(30_000), headers: { "Content-Type": "application/json", ...(MODE === "isolated" ? { "X-Forwarded-Proto": "https" } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
  return { status: response.status, body: await response.json().catch(() => ({})), cookie: (response.headers.get("set-cookie") || "").split(";", 1)[0], retryAfterSeconds: Number.isFinite(Number(response.headers.get("retry-after"))) ? Number(response.headers.get("retry-after")) : null };
}

async function register(account: Account): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await request("POST", "/api/auth/complete-registration", { email: account.email, password: PASSWORD, displayName: account.displayName, termsAccepted: true });
    if (result.status === 201) { account.id = Number(result.body.user?.id); account.cookie = result.cookie; assert(Number.isInteger(account.id) && account.id > 0 && account.cookie, "Registration did not create a disposable owner and session."); return; }
    if (result.status !== 429 || attempt === 2) throw new Error(`Registration returned ${result.status}.`);
    await new Promise((resolve) => setTimeout(resolve, Math.min(61, Math.max(1, result.retryAfterSeconds || 60)) * 1_000 + 250));
  }
}

async function findChromium(): Promise<string> {
  const candidates = [process.env.LYFEOS_CHROMIUM_PATH, process.env.CHROME_PATH, process.env.CHROMIUM_PATH, process.platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : undefined, process.platform === "win32" ? "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe" : undefined, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) { try { await access(candidate); return candidate; } catch { /* Check the next standard location. */ } }
  throw new Error("No Chromium executable found for Health data-rights acceptance.");
}

function cookieParts(cookie: string): { name: string; value: string } { const separator = cookie.indexOf("="); assert(separator > 0, "Registration did not return a usable session cookie."); return { name: cookie.slice(0, separator), value: cookie.slice(separator + 1) }; }

function captureSignals(page: Page): BrowserSignals {
  const signals: BrowserSignals = { consoleErrors: [], pageErrors: [], failedRequests: [], serverErrors: [], recoveredChunkLoads: [] };
  page.on("console", (entry) => { if (entry.type() === "error") signals.consoleErrors.push(`${entry.text()}${entry.location().url ? ` @ ${entry.location().url}` : ""}`.slice(0, 500)); });
  page.on("pageerror", (error) => signals.pageErrors.push(error.message.slice(0, 500)));
  page.on("requestfailed", (failed) => { if (failed.url().startsWith(BASE_URL.origin)) signals.failedRequests.push(`${failed.method()} ${new URL(failed.url()).pathname}: ${failed.failure()?.errorText || "failed"}`.slice(0, 500)); });
  page.on("response", (response) => { if (response.url().startsWith(BASE_URL.origin) && response.status() >= 500) signals.serverErrors.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  return signals;
}

async function setValue(page: Page, selector: string, value: string): Promise<void> {
  await page.waitForSelector(selector, { visible: true, timeout: 45_000 });
  await page.$eval(selector, (element, nextValue) => { const input = element as HTMLInputElement; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, nextValue); input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); }, value);
}

async function clickReady(page: Page, selector: string): Promise<void> {
  await page.waitForSelector(selector, { visible: true, timeout: 45_000 });
  await page.waitForFunction((target) => { const button = document.querySelector<HTMLButtonElement>(target); return Boolean(button && !button.disabled && button.getClientRects().length); }, { timeout: 45_000 }, selector);
  await page.click(selector);
}

async function auditPage(page: Page): Promise<Audit> {
  return page.evaluate(() => {
    const scope = document.querySelector<HTMLElement>('[data-testid="health-page"]'); if (!scope) throw new Error("Health acceptance scope is not rendered.");
    const ids = new Map<string, number>(); for (const element of document.querySelectorAll<HTMLElement>("[id]")) ids.set(element.id, (ids.get(element.id) || 0) + 1);
    const invalidLabelReferences = [...scope.querySelectorAll<HTMLElement>("[aria-labelledby]")].filter((element) => (element.getAttribute("aria-labelledby") || "").split(/\s+/).some((id) => id && !document.getElementById(id))).map((element) => element.getAttribute("data-testid") || element.tagName.toLowerCase());
    const unlabeledControls = [...scope.querySelectorAll<HTMLElement>("button,input,select,textarea,[role=button]")].filter((element) => { if (element.getAttribute("aria-hidden") === "true" || (element instanceof HTMLInputElement && element.type === "hidden")) return false; const style = getComputedStyle(element); if (style.display === "none" || style.visibility === "hidden" || element.getClientRects().length === 0) return false; const label = element.id ? scope.querySelector(`label[for="${CSS.escape(element.id)}"]`) : null; const name = element.getAttribute("aria-label") || element.getAttribute("aria-labelledby") || element.getAttribute("title") || element.textContent?.trim(); return !label && !element.closest("label") && !name; }).map((element) => element.getAttribute("data-testid") || element.tagName.toLowerCase()).slice(0, 20);
    const width = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0);
    return { mainCount: document.querySelectorAll("main").length, duplicateIds: [...ids.entries()].filter(([, count]) => count > 1).map(([id]) => id).sort(), invalidLabelReferences, unlabeledControls, horizontalOverflowPx: Math.max(0, width - window.innerWidth) };
  });
}

async function eraseAccount(account: Account): Promise<boolean> {
  if (!account.cookie) return true;
  for (let attempt = 0; attempt < 3; attempt += 1) { const deletion = await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, account.cookie).catch(() => null); if (deletion && deletion.status >= 200 && deletion.status < 300) break; if ((await request("GET", "/api/auth/me", undefined, account.cookie).catch(() => null))?.status === 401) break; }
  const session = await request("GET", "/api/auth/me", undefined, account.cookie).catch(() => null); const email = await request("GET", `/api/auth/check-email?email=${encodeURIComponent(account.email)}`).catch(() => null); const displayName = await request("GET", `/api/auth/check-display-name?displayName=${encodeURIComponent(account.displayName)}`).catch(() => null);
  return session?.status === 401 && email?.status === 200 && email.body?.available === true && displayName?.status === 200 && displayName.body?.available === true;
}

async function runViewport(browser: Browser, viewport: { name: string; value: Viewport }, ordinal: number): Promise<{ view: ViewResult; accountErased: boolean }> {
  const stamp = `${Date.now()}_${ordinal}_${randomUUID().slice(0, 8)}`; const account: Account = { id: 0, email: `health_rights_production_${stamp}@example.com`, displayName: `health_rights_owner_${ordinal}_${stamp.slice(-8)}`, cookie: "" };
  let context: BrowserContext | null = null; let view: ViewResult | null = null; let accountErased = false; let stage = "register disposable account";
  try {
    await register(account); stage = "complete onboarding fixture";
    const onboarding = await request("PATCH", "/api/profile", { onboardingCompleted: true }, account.cookie); assert(onboarding.status === 200, `Onboarding setup returned ${onboarding.status}.`);
    stage = "create a disposable private health record";
    const hydration = await request("POST", "/api/health-fitness/hydration", { quantity: 321.5, inputUnit: "ml", occurredAt: new Date().toISOString(), note: "rights acceptance fixture" }, account.cookie, { "x-lyfeos-mutation-id": randomUUID() }); assert(hydration.status === 201, `Fixture hydration returned ${hydration.status}.`);
    context = await browser.createBrowserContext(); const page = await context.newPage(); const signals = captureSignals(page); const session = cookieParts(account.cookie);
    await page.setCookie({ ...session, url: BASE_URL.origin, path: "/", httpOnly: true, secure: true, sameSite: "Lax" }); await page.setViewport(viewport.value); await page.setCacheEnabled(false);
    stage = "navigate to Health"; await page.goto(new URL("/health", BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 }); await page.waitForSelector('[data-testid="health-page"]', { visible: true, timeout: 60_000 });
    stage = "load Health data controls"; await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForSelector('[data-testid="health-data-rights"]', { visible: true, timeout: 60_000 });
    stage = "save explicit Health data permissions"; await clickReady(page, '[data-testid="health-ai-context-enabled"]'); await clickReady(page, '[data-testid="health-planning-context-enabled"]'); await clickReady(page, '[data-testid="health-data-rights-save"]'); await page.waitForSelector('[data-testid="health-data-rights-saved"]', { visible: true, timeout: 30_000 });
    const savedRights = await request("GET", "/api/health-data/rights", undefined, account.cookie); const preferencesSaved = savedRights.status === 200 && savedRights.body?.preferences?.aiContextEnabled === true && savedRights.body?.preferences?.planningContextEnabled === true; assert(preferencesSaved, "Health permission settings did not persist through the UI.");
    stage = "download Health export from the UI"; const exportResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/health-data/export" && response.request().method() === "GET", { timeout: 30_000 }); await clickReady(page, '[data-testid="health-data-export"]'); const exportBody = JSON.parse(await (await exportResponse).text());
    const serializedExport = JSON.stringify(exportBody); const exportedRecordedHealth = Array.isArray(exportBody?.tables?.hydration_entries) && exportBody.tables.hydration_entries.some((entry: any) => Number(entry.volume_ml) === 322); const exportIncludedNoCredentialReferences = !serializedExport.includes("credentialRef") && !serializedExport.includes("credential_ref"); assert(exportedRecordedHealth && exportIncludedNoCredentialReferences, "The UI-triggered export did not preserve the factual record or exposed credential custody.");
    stage = "delete only the Health domain through the UI"; await page.$eval('[data-testid="health-data-delete"]', (element) => element.closest("details")?.setAttribute("open", "")); await setValue(page, '[data-testid="health-data-deletion-confirmation"]', "DELETE MY HEALTH DATA"); await clickReady(page, '[data-testid="health-data-delete"]'); await page.waitForSelector('[data-testid="health-data-deletion-complete"]', { visible: true, timeout: 45_000 });
    const postDeleteExport = await request("GET", "/api/health-data/export", undefined, account.cookie); const postDeleteRights = await request("GET", "/api/health-data/rights", undefined, account.cookie); const deletedHealthDomain = postDeleteExport.status === 200 && Array.isArray(postDeleteExport.body?.tables?.hydration_entries) && postDeleteExport.body.tables.hydration_entries.length === 0; const rightsReceiptRetained = postDeleteRights.status === 200 && Number(postDeleteRights.body?.recordCounts?.health_data_rights_audit || 0) >= 3; assert(deletedHealthDomain && rightsReceiptRetained, "Health-domain deletion did not remove the health record while retaining minimal rights receipts.");
    await page.evaluate(() => window.scrollTo(0, 0)); const audit = await auditPage(page); assert(audit.mainCount === 1 && !audit.duplicateIds.length && !audit.invalidLabelReferences.length && !audit.unlabeledControls.length && audit.horizontalOverflowPx <= 1, `Health data-rights accessibility/layout audit failed: ${JSON.stringify(audit)}.`); assert(!hasUnexpectedBrowserSignals(signals), `Unexpected browser signals: ${JSON.stringify(signals)}.`);
    view = { viewport: viewport.name, preferencesSaved, exportedRecordedHealth, exportIncludedNoCredentialReferences, deletedHealthDomain, rightsReceiptRetained, audit, signals };
  } catch (error) { throw new Error(`Health data-rights ${viewport.name} failed during ${stage}: ${safeError(error)}`); } finally { if (context) await context.close().catch(() => undefined); accountErased = await eraseAccount(account).catch(() => false); }
  assert(view && accountErased, `${viewport.name} did not complete Health data-rights acceptance and verified account erasure.`); return { view, accountErased };
}

async function main(): Promise<void> {
  if (MODE === "production") assert(BASE_URL.origin === "https://lyfeos.net", "Production Health data-rights acceptance may target only https://lyfeos.net."); assert(/^[0-9a-f]{40}$/.test(SOURCE), "Health data-rights acceptance requires the exact deployed source revision."); assert(/^[0-9a-f]{40}$/.test(HARNESS_SOURCE), "Health data-rights acceptance requires the exact harness source revision.");
  const release = await request("GET", "/api/release"); assert(release.status === 200 && release.body?.sourceRevision === SOURCE, "Health data-rights runtime does not match the requested immutable source.");
  const executablePath = await findChromium(); const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] }); const views: ViewResult[] = []; const cleanup: boolean[] = [];
  try { for (const [ordinal, viewport] of VIEWPORTS.entries()) { const result = await runViewport(browser, viewport, ordinal + 1); views.push(result.view); cleanup.push(result.accountErased); } } finally { await browser.close(); }
  const passed = views.length === VIEWPORTS.length && views.every((view) => view.preferencesSaved && view.exportedRecordedHealth && view.exportIncludedNoCredentialReferences && view.deletedHealthDomain && view.rightsReceiptRetained && !hasUnexpectedBrowserSignals(view.signals)) && cleanup.every(Boolean);
  await mkdir(OUTPUT_DIR, { recursive: true }); await writeFile(OUTPUT_FILE, `${JSON.stringify({ contract: "lyfeos.production-health-data-rights-browser.v1", generatedAt: new Date().toISOString(), mode: MODE, baseUrl: BASE_URL.origin, sourceRevision: SOURCE, harnessSource: HARNESS_SOURCE, passed, evidenceBoundary: "Automated Chromium proves an authenticated person can save explicit Health permissions, trigger a private Health JSON export, and exactly-confirmation-delete the Health domain while retaining only minimal rights receipts, across desktop and mobile layouts. It does not prove a human file-save destination, legal retention-policy approval, provider-token revoke, physical-device behavior, human assistive-technology comprehension, or regulated privacy compliance.", views, cleanup: cleanup.map((accountErased, index) => ({ viewport: VIEWPORTS[index]?.name, accountErased })) }, null, 2)}\n`, "utf8");
  assert(passed, `Health data-rights acceptance failed; report=${OUTPUT_FILE}`);
}

main().catch(async (error) => { await mkdir(OUTPUT_DIR, { recursive: true }); await writeFile(path.join(OUTPUT_DIR, "health-data-rights-failure.json"), `${JSON.stringify({ contract: "lyfeos.production-health-data-rights-browser.failure.v1", generatedAt: new Date().toISOString(), sourceRevision: SOURCE, harnessSource: HARNESS_SOURCE, error: safeError(error) }, null, 2)}\n`, "utf8").catch(() => undefined); console.error(safeError(error)); process.exitCode = 1; });
