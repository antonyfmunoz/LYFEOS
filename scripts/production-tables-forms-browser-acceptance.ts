import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer, { type Browser, type BrowserContext, type Page, type Viewport } from "puppeteer-core";

type ApiResult = { status: number; body: any; cookie: string; retryAfterSeconds: number | null };
type Account = { id: number; email: string; displayName: string; cookie: string };
type Signals = { consoleErrors: string[]; pageErrors: string[]; failedRequests: string[]; serverErrors: string[] };
type Cleanup = { viewport: string; accountErased: boolean; sessionInvalidated: boolean; emailReleased: boolean; displayNameReleased: boolean; otherAccountErased: boolean };
type PageAudit = { mainCount: number; duplicateIds: string[]; invalidLabelReferences: string[]; unlabeledControls: string[]; horizontalOverflowPx: number };
type ViewResult = {
  viewport: string;
  tutorialDismissed: boolean;
  catalogRendered: boolean;
  tableRendered: boolean;
  namedViewAndFilterReconciled: boolean;
  ownerRowLifecycleReconciled: boolean;
  immutableHistoryReconciled: boolean;
  authenticatedFormSubmissionReconciled: boolean;
  governedShareGrantReconciled: boolean;
  anonymousBrowserSubmissionReconciled: boolean;
  crossOwnerIsolationReconciled: boolean;
  revokedTokenRejected: boolean;
  deletionReconciled: boolean;
  privateAudit: PageAudit;
  publicAudit: PageAudit;
  signals: Signals;
  publicSignals: Signals;
};

const BASE_URL = new URL(process.env.LYFEOS_TEST_API_URL || "https://lyfeos.net");
const SOURCE = process.env.LYFEOS_ACCEPTANCE_SOURCE || "";
const HARNESS_SOURCE = process.env.LYFEOS_ACCEPTANCE_HARNESS_SOURCE || process.env.GITHUB_SHA || "";
const OUTPUT_DIR = path.resolve(process.env.LYFEOS_TABLES_FORMS_OUTPUT_DIR || path.join(os.tmpdir(), "lyfeos-production-tables-forms"));
const OUTPUT_FILE = path.join(OUTPUT_DIR, "tables-forms-report.json");
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
    .replace(/tables_(owner|other)_[a-z0-9_]+/gi, "[redacted fixture]")
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
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue through bounded executable locations.
    }
  }
  throw new Error("No Chromium executable found for production Tables and Forms acceptance.");
}

function cookieParts(cookie: string): { name: string; value: string } {
  const separator = cookie.indexOf("=");
  assert(separator > 0, "Registration did not return a usable session cookie.");
  return { name: cookie.slice(0, separator), value: cookie.slice(separator + 1) };
}

function captureSignals(page: Page, allowAnonymousAuthBoundary = false): Signals {
  const signals: Signals = { consoleErrors: [], pageErrors: [], failedRequests: [], serverErrors: [] };
  page.on("console", (entry) => {
    if (entry.type() !== "error") return;
    const source = entry.location().url;
    if (allowAnonymousAuthBoundary && source === new URL("/api/auth/me", BASE_URL).toString() && entry.text().includes("401")) return;
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

function acknowledgeReconciledBodylessMutation(signals: Signals, method: string, pathname: string): void {
  const expected = `${method} ${pathname}: net::ERR_ABORTED`;
  signals.failedRequests = signals.failedRequests.filter((signal) => signal !== expected);
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

async function activateHitTestedControl(page: Page, selector: string): Promise<void> {
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

async function activateButtonByText(page: Page, label: string): Promise<void> {
  await page.waitForFunction((text) => [...document.querySelectorAll<HTMLButtonElement>("button")].some((button) => !button.disabled && button.textContent?.trim() === text && button.getClientRects().length > 0), { timeout: 30_000 }, label);
  const activated = await page.evaluate((text) => {
    const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find((candidate) => !candidate.disabled && candidate.textContent?.trim() === text && candidate.getClientRects().length > 0);
    button?.scrollIntoView({ block: "center", inline: "center" });
    button?.click();
    return Boolean(button);
  }, label);
  assert(activated, `Visible enabled button “${label}” was unavailable.`);
}

async function waitForDatabase(account: Account, databaseId: number, predicate: (body: any) => boolean, label: string): Promise<any> {
  const deadline = Date.now() + 45_000;
  let latest: ApiResult | null = null;
  while (Date.now() < deadline) {
    latest = await request("GET", `/api/databases/${databaseId}`, undefined, account.cookie);
    if (latest.status === 200 && predicate(latest.body)) return latest.body;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`${label} did not reconcile; latest=${JSON.stringify(latest?.body || {}).slice(0, 1_000)}.`);
}

async function waitForGrants(account: Account, formId: number, predicate: (body: any) => boolean, label: string): Promise<any> {
  const deadline = Date.now() + 45_000;
  let latest: ApiResult | null = null;
  while (Date.now() < deadline) {
    latest = await request("GET", `/api/forms/${formId}/access-grants`, undefined, account.cookie);
    if (latest.status === 200 && predicate(latest.body)) return latest.body;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`${label} did not reconcile; latest=${JSON.stringify(latest?.body || {}).slice(0, 1_000)}.`);
}

async function auditPage(page: Page, scopeSelector: string): Promise<PageAudit> {
  return page.evaluate((selector) => {
    const ids = new Map<string, number>();
    for (const element of document.querySelectorAll<HTMLElement>("[id]")) ids.set(element.id, (ids.get(element.id) || 0) + 1);
    const scope = document.querySelector<HTMLElement>(selector);
    if (!scope) throw new Error(`Acceptance scope ${selector} is not rendered.`);
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
    const documentWidth = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0);
    return {
      mainCount: document.querySelectorAll("main").length,
      duplicateIds: [...ids.entries()].filter(([, count]) => count > 1).map(([id]) => id).sort(),
      invalidLabelReferences,
      unlabeledControls,
      horizontalOverflowPx: Math.max(0, documentWidth - window.innerWidth),
    };
  }, scopeSelector);
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
  const owner: Account = { id: 0, email: `tables_owner_${stamp}@example.com`, displayName: `tables_owner_${ordinal}_${stamp.slice(-8)}`, cookie: "" };
  const other: Account = { id: 0, email: `tables_other_${stamp}@example.com`, displayName: `tables_other_${ordinal}_${stamp.slice(-8)}`, cookie: "" };
  let context: BrowserContext | null = null;
  let publicContext: BrowserContext | null = null;
  let page: Page | null = null;
  let publicPage: Page | null = null;
  let view: ViewResult | null = null;
  let ownerErased = false;
  let otherErased = false;
  let failure: unknown = null;
  let stage = "register disposable owners";
  try {
    const ownerRegistration = await registerDisposableAccount(owner);
    const otherRegistration = await registerDisposableAccount(other);
    assert(ownerRegistration.status === 201 && otherRegistration.status === 201, `Disposable owner registration returned ${ownerRegistration.status}/${otherRegistration.status}.`);
    assert(owner.id > 0 && owner.cookie && other.id > 0 && other.cookie, "Disposable registrations did not return both owners and sessions.");
    assert((await request("PATCH", "/api/profile", { onboardingCompleted: true }, owner.cookie)).status === 200, "Owner onboarding setup failed.");

    stage = "seed canonical table, rows, view and form";
    const title = `Qualification ${ordinal}`;
    const definition = { version: 1, columns: [
      { id: "name", name: "Name", type: "text", required: true, options: [] },
      { id: "state", name: "State", type: "select", required: false, options: ["Open", "Done"] },
      { id: "score", name: "Score", type: "number", required: false, options: [] },
    ] };
    const created = await request("POST", "/api/databases", { title, description: "Production qualification fixture", category: "acceptance", favorite: false, definition }, owner.cookie);
    assert(created.status === 201, `Table creation returned ${created.status}.`);
    const databaseId = Number(created.body.database?.id);
    const alpha = await request("POST", `/api/databases/${databaseId}/rows`, { values: { name: "Alpha", state: "Open", score: 10 } }, owner.cookie);
    const beta = await request("POST", `/api/databases/${databaseId}/rows`, { values: { name: "Beta", state: "Done", score: 20 } }, owner.cookie);
    assert(alpha.status === 201 && beta.status === 201, `Seed row creation returned ${alpha.status}/${beta.status}.`);
    const namedView = await request("POST", `/api/databases/${databaseId}/views`, { name: "Alpha only", definition: { version: 1, filterQuery: "Alpha", sortColumnId: "score", sortDirection: "desc", groupColumnId: null } }, owner.cookie);
    assert(namedView.status === 201, `Named view creation returned ${namedView.status}.`);
    const formDefinition = { version: 1, sections: [
      { id: "identity", title: "Identity", description: null, fieldIds: ["name", "state"] },
      { id: "details", title: "Details", description: null, fieldIds: ["score"] },
    ], conditions: [{ id: "score_when_open", sourceFieldId: "state", targetFieldId: "score", operator: "equals", value: "Open" }] };
    const formCreated = await request("POST", "/api/forms", { databaseId, title: `${title} Form`, description: "Purpose-bound qualification", fieldIds: ["name", "state", "score"], definition: formDefinition, confirmationText: "Qualification response saved.", active: true }, owner.cookie);
    assert(formCreated.status === 201, `Form creation returned ${formCreated.status}.`);
    const formId = Number(formCreated.body.form?.id);
    const crossOwnerRead = await request("GET", `/api/databases/${databaseId}`, undefined, other.cookie);
    const crossOwnerIsolationReconciled = crossOwnerRead.status === 404;
    assert(crossOwnerIsolationReconciled, `Cross-owner table read returned ${crossOwnerRead.status}.`);

    stage = "render catalog and table editor";
    context = await browser.createBrowserContext();
    page = await context.newPage();
    const signals = captureSignals(page);
    const session = cookieParts(owner.cookie);
    await page.setCookie({ ...session, url: BASE_URL.origin, path: "/", httpOnly: true, secure: true, sameSite: "Lax" });
    await page.evaluateOnNewDocument((fixtureUser) => {
      try { localStorage.setItem("lyfeos_user", JSON.stringify(fixtureUser)); } catch { /* origin not ready */ }
    }, { id: owner.id, displayName: owner.displayName });
    await page.setViewport(viewport.value);
    await page.setCacheEnabled(false);
    await page.goto(new URL("/databases", BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector('[data-testid="tables-page"]', { visible: true, timeout: 60_000 });
    const tutorialDismissed = await dismissBlockingTutorial(page);
    await page.waitForSelector(`[data-testid="table-card-${databaseId}"]`, { visible: true, timeout: 30_000 });
    const catalogRendered = await page.$eval(`[data-testid="table-card-${databaseId}"]`, (element, expected) => element.textContent?.includes(String(expected)) === true, title);
    await activateHitTestedControl(page, `[data-testid="table-card-${databaseId}"] button`);
    await page.waitForSelector('[data-testid="table-editor"]', { visible: true, timeout: 45_000 });
    const tableRendered = await page.$eval('[data-testid="table-title"]', (element, expected) => (element as HTMLInputElement).value === expected, title);
    assert(catalogRendered && tableRendered, "Catalog card or table editor did not render the canonical table.");

    stage = "exercise named view and local filter";
    await page.select('[aria-label="Saved table view"]', String(namedView.body.view.id));
    await page.waitForFunction(() => document.querySelector('[aria-label="Table records"]')?.textContent?.includes("1 visible"), { timeout: 30_000 });
    const namedViewRows = {
      alpha: await page.$(`[aria-label="Edit row ${alpha.body.row.id}"]`) !== null,
      beta: await page.$(`[aria-label="Edit row ${beta.body.row.id}"]`) !== null,
    };
    await page.select('[aria-label="Saved table view"]', "");
    await setValue(page, '[aria-label="Filter table rows"]', "Beta");
    await page.waitForFunction(() => document.querySelector('[aria-label="Table records"]')?.textContent?.includes("1 visible"), { timeout: 30_000 });
    const filteredRows = {
      alpha: await page.$(`[aria-label="Edit row ${alpha.body.row.id}"]`) !== null,
      beta: await page.$(`[aria-label="Edit row ${beta.body.row.id}"]`) !== null,
    };
    const namedViewAndFilterReconciled = namedViewRows.alpha && !namedViewRows.beta && !filteredRows.alpha && filteredRows.beta;
    assert(namedViewAndFilterReconciled, "Named view and live filter did not reconcile visible rows.");
    await setValue(page, '[aria-label="Filter table rows"]', "");

    stage = "add and revise a row through rendered controls";
    await setValue(page, '[aria-label="Name"]', "Gamma");
    await page.select('[aria-label="State"]', "Open");
    await setValue(page, '[aria-label="Score"]', "30");
    await activateButtonByText(page, "Add row");
    let table = await waitForDatabase(owner, databaseId, (body) => body.rows?.some((row: any) => row.values?.name === "Gamma"), "rendered row creation");
    const gamma = table.rows.find((row: any) => row.values?.name === "Gamma");
    await activateHitTestedControl(page, `[aria-label="Edit row ${gamma.id}"]`);
    await page.waitForSelector(`[aria-label="Save row ${gamma.id}"]`, { visible: true, timeout: 30_000 });
    await page.$eval(`[aria-label="Save row ${gamma.id}"]`, (button, nextValue) => {
      const row = button.closest("tr");
      const input = row?.querySelector<HTMLTextAreaElement>('[aria-label="Name"]');
      if (!input) throw new Error("Editable Name field is unavailable.");
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(input, nextValue);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, "Gamma revised");
    await activateHitTestedControl(page, `[aria-label="Save row ${gamma.id}"]`);
    table = await waitForDatabase(owner, databaseId, (body) => body.rows?.some((row: any) => row.id === gamma.id && row.revision === 2 && row.values?.name === "Gamma revised"), "rendered row revision");
    const revisions = await request("GET", `/api/databases/${databaseId}/rows/${gamma.id}/revisions`, undefined, owner.cookie);
    const ownerRowLifecycleReconciled = table.rows.length === 3 && table.rows.find((row: any) => row.id === gamma.id)?.values?.score === 30;
    const immutableHistoryReconciled = revisions.status === 200 && revisions.body.revisions?.map((revision: any) => revision.revisionNumber).join(",") === "2,1";
    assert(ownerRowLifecycleReconciled && immutableHistoryReconciled, "Row values or immutable row history did not reconcile.");

    stage = "submit authenticated form and create governed link";
    await page.goto(new URL(`/forms/${formId}`, BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForFunction((expected) => document.querySelector("h1")?.textContent === expected, { timeout: 45_000 }, `${title} Form`);
    await setValue(page, '[aria-label="Name"]', "Owner response");
    await page.select('[aria-label="State"]', "Open");
    await page.waitForSelector('[aria-label="Score"]', { visible: true, timeout: 30_000 });
    await setValue(page, '[aria-label="Score"]', "40");
    await activateButtonByText(page, "Submit");
    table = await waitForDatabase(owner, databaseId, (body) => body.rows?.some((row: any) => row.values?.name === "Owner response" && row.values?.score === 40), "authenticated Form submission");
    const authenticatedFormSubmissionReconciled = table.rows.length === 4;
    await setValue(page, '[aria-label="Access link purpose"]', "Production respondent");
    await setValue(page, '[aria-label="Maximum submissions"]', "2");
    await activateButtonByText(page, "Create access link");
    await page.waitForSelector('input[readonly]', { visible: true, timeout: 30_000 });
    const shareUrl = await page.$eval('input[readonly]', (element) => (element as HTMLInputElement).value);
    const share = new URL(shareUrl);
    const token = new URLSearchParams(share.hash.slice(1)).get("token") || "";
    const publicId = share.pathname.split("/").at(-1) || "";
    assert(share.origin === BASE_URL.origin && token.length === 43 && publicId, "Rendered governed link did not preserve its public ID and fragment secret boundary.");
    const grants = await waitForGrants(owner, formId, (body) => body.grants?.some((grant: any) => grant.publicId === publicId), "governed grant creation");
    const grant = grants.grants.find((candidate: any) => candidate.publicId === publicId);
    const governedShareGrantReconciled = grant?.label === "Production respondent" && grant?.maxSubmissions === 2 && !JSON.stringify(grants).includes("tokenHash");
    assert(governedShareGrantReconciled, "Governed access grant metadata or secret non-disclosure did not reconcile.");

    stage = "submit shared form in anonymous rendered context";
    publicContext = await browser.createBrowserContext();
    publicPage = await publicContext.newPage();
    const publicSignals = captureSignals(publicPage, true);
    await publicPage.setViewport(viewport.value);
    await publicPage.setCacheEnabled(false);
    await publicPage.goto(shareUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await publicPage.waitForFunction((expected) => document.querySelector("h1")?.textContent === expected, { timeout: 45_000 }, `${title} Form`);
    await setValue(publicPage, '[aria-label="Name"]', "Public response");
    await publicPage.select('[aria-label="State"]', "Done");
    await publicPage.waitForSelector('[aria-label="Score"]', { hidden: true, timeout: 30_000 });
    await activateButtonByText(publicPage, "Submit");
    await publicPage.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes("Qualification response saved."), { timeout: 45_000 });
    table = await waitForDatabase(owner, databaseId, (body) => body.rows?.some((row: any) => row.values?.name === "Public response" && row.values?.state === "Done" && row.values?.score === undefined), "anonymous browser Form submission");
    const anonymousBrowserSubmissionReconciled = table.rows.length === 5;
    const publicAudit = await auditPage(publicPage, "main");
    assert(publicAudit.mainCount === 1 && publicAudit.duplicateIds.length === 0 && publicAudit.invalidLabelReferences.length === 0 && publicAudit.unlabeledControls.length === 0 && publicAudit.horizontalOverflowPx <= 2, `${viewport.name} shared Form failed semantics or overflow checks.`);
    assert(Object.values(publicSignals).every((items) => items.length === 0), `${viewport.name} shared Form produced application errors: ${JSON.stringify(publicSignals)}.`);
    await publicContext.close();
    publicContext = null;
    publicPage = null;

    stage = "revoke shared access and delete table";
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => button.textContent?.trim() === "Revoke"), { timeout: 45_000 });
    await activateButtonByText(page, "Revoke");
    await waitForGrants(owner, formId, (body) => body.grants?.some((candidate: any) => candidate.id === grant.id && candidate.revokedAt), "grant revocation");
    const rejected = await request("GET", `/api/public/forms/${publicId}`, undefined, "", { Authorization: `Bearer ${token}` });
    const revokedTokenRejected = rejected.status === 404;
    assert(revokedTokenRejected, `Revoked public token returned ${rejected.status}.`);
    await page.goto(new URL(`/databases/${databaseId}`, BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector('[data-testid="table-editor"]', { visible: true, timeout: 45_000 });
    const privateAudit = await auditPage(page, '[data-testid="table-editor"]');
    assert(privateAudit.mainCount === 1 && privateAudit.duplicateIds.length === 0 && privateAudit.invalidLabelReferences.length === 0 && privateAudit.unlabeledControls.length === 0 && privateAudit.horizontalOverflowPx <= 2, `${viewport.name} Table editor failed semantics or overflow checks.`);
    // Chromium may emit requestfailed for a successful 204 mutation only when the
    // following navigation aborts its bodyless response. Reconcile that exact
    // signal only after the persisted revocation, rejected token, and completed
    // owner navigation independently prove that the mutation succeeded.
    acknowledgeReconciledBodylessMutation(signals, "POST", `/api/forms/${formId}/access-grants/${grant.id}/revoke`);
    assert(Object.values(signals).every((items) => items.length === 0), `${viewport.name} private Table/Form journey produced application errors: ${JSON.stringify(signals)}.`);
    await page.goto(new URL("/databases", BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector(`[data-testid="table-card-${databaseId}"]`, { visible: true, timeout: 45_000 });
    page.once("dialog", (dialog) => void dialog.accept());
    await activateHitTestedControl(page, `[data-testid="table-card-${databaseId}"] [aria-label="Delete table"]`);
    const deadline = Date.now() + 45_000;
    let deleted = false;
    while (Date.now() < deadline) {
      const current = await request("GET", `/api/databases/${databaseId}`, undefined, owner.cookie);
      if (current.status === 404) { deleted = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    assert(deleted, "Rendered table deletion did not remove the owned Table graph.");
    acknowledgeReconciledBodylessMutation(signals, "DELETE", `/api/databases/${databaseId}`);
    await page.waitForSelector(`[data-testid="table-card-${databaseId}"]`, { hidden: true, timeout: 30_000 });
    const deletionReconciled = await page.$(`[data-testid="table-card-${databaseId}"]`) === null;
    assert(deletionReconciled, "Deleted Table remained in the rendered catalog.");
    view = {
      viewport: viewport.name,
      tutorialDismissed,
      catalogRendered,
      tableRendered,
      namedViewAndFilterReconciled,
      ownerRowLifecycleReconciled,
      immutableHistoryReconciled,
      authenticatedFormSubmissionReconciled,
      governedShareGrantReconciled,
      anonymousBrowserSubmissionReconciled,
      crossOwnerIsolationReconciled,
      revokedTokenRejected,
      deletionReconciled,
      privateAudit,
      publicAudit,
      signals,
      publicSignals,
    };
  } catch (error) {
    const rendered = page ? await page.evaluate(() => document.body?.innerText.slice(0, 2_000) || "page unavailable").catch(() => "page unavailable") : "page unavailable";
    if (page) await page.screenshot({ path: path.join(OUTPUT_DIR, `tables-forms-${viewport.name}-failure.png`), fullPage: true }).catch(() => undefined);
    if (publicPage) await publicPage.screenshot({ path: path.join(OUTPUT_DIR, `tables-forms-public-${viewport.name}-failure.png`), fullPage: true }).catch(() => undefined);
    failure = new Error(`${safeError(error)}; rendered=${rendered}`);
  } finally {
    if (publicContext) await publicContext.close().catch(() => undefined);
    if (context) await context.close().catch(() => undefined);
    ownerErased = await eraseAccount(owner);
    otherErased = await eraseAccount(other);
  }
  const cleanup: Cleanup = { viewport: viewport.name, accountErased: ownerErased, sessionInvalidated: ownerErased, emailReleased: ownerErased, displayNameReleased: ownerErased, otherAccountErased: otherErased };
  if (failure) throw new Error(`stage=${stage}; ${safeError(failure)}; ownerErased=${ownerErased}; otherErased=${otherErased}`);
  assert(view && ownerErased && otherErased, `${viewport.name} did not complete the rendered journey and verified account erasure.`);
  return { view, cleanup };
}

async function main(): Promise<void> {
  assert(BASE_URL.origin === "https://lyfeos.net", "Production Tables and Forms acceptance may target only https://lyfeos.net.");
  assert(/^[0-9a-f]{40}$/.test(SOURCE), "Production Tables and Forms acceptance requires the exact deployed source revision.");
  assert(/^[0-9a-f]{40}$/.test(HARNESS_SOURCE), "Production Tables and Forms acceptance requires the exact harness source revision.");
  const release = await request("GET", "/api/release");
  assert(release.status === 200 && release.body?.sourceRevision === SOURCE, "Production Tables and Forms runtime does not match the requested immutable source.");
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
      contract: "lyfeos.production-tables-forms-browser.v1",
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL.origin,
      sourceRevision: SOURCE,
      harnessSource: HARNESS_SOURCE,
      views,
      cleanups,
      summary: { passed, failure },
      boundary: "Disposable production-account Chromium evidence for private Tables and governed Forms. It proves desktop/mobile catalog and editor rendering; named views and filtering; validated owner row creation and revision; immutable row history; authenticated and fragment-secret anonymous Form submissions; owner isolation; purpose-labelled grant creation and revocation; responsive semantics; Table graph deletion; and verified account/session/identifier erasure. It does not prove human assistive-technology comprehension, native-device behavior, large-grid performance, offline operation, concurrent-writer conflict UX, arbitrary production data migration, or longitudinal user outcomes.",
    };
    await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    if (process.env.GITHUB_STEP_SUMMARY) {
      await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, [
        "## LyfeOS production Tables and Forms acceptance",
        "",
        `- Runtime source: ${SOURCE}`,
        `- Harness source: ${HARNESS_SOURCE}`,
        `- Passed: ${passed}`,
        `- Desktop/mobile views: ${views.length}/${VIEWPORTS.length}`,
        `- Disposable owners erased: ${cleanups.filter((cleanup) => cleanup.accountErased).length}/${VIEWPORTS.length}`,
        `- Isolation accounts erased: ${cleanups.filter((cleanup) => cleanup.otherAccountErased).length}/${VIEWPORTS.length}`,
        "",
        report.boundary,
        "",
      ].join("\n"), "utf8");
    }
    console.log(JSON.stringify({ contract: report.contract, passed, viewCount: views.length, erasedOwners: cleanups.filter((cleanup) => cleanup.accountErased).length, erasedIsolationAccounts: cleanups.filter((cleanup) => cleanup.otherAccountErased).length }));
    if (!passed && !failure) failure = "Production Tables and Forms acceptance did not satisfy every rendered, governance and cleanup invariant.";
  }
  if (failure) throw new Error(failure);
}

main().catch((error) => {
  console.error(safeError(error));
  process.exitCode = 1;
});
