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
  manualProviderBoundaryRendered: boolean;
  assetLiabilityMathReconciled: boolean;
  balanceHistoryReconciled: boolean;
  cashFlowAndBudgetReconciled: boolean;
  correctionReconciled: boolean;
  accountLifecycleReconciled: boolean;
  goalLifecycleReconciled: boolean;
  deletionAndArchiveReconciled: boolean;
  wealthTokensUnchanged: boolean;
  mainCount: number;
  duplicateIds: string[];
  invalidLabelReferences: string[];
  unlabeledControls: string[];
  horizontalOverflowPx: number;
  signals: Signals;
};

const BASE_URL = new URL(process.env.LYFEOS_TEST_API_URL || "https://lyfeos.net");
const SOURCE = process.env.LYFEOS_ACCEPTANCE_SOURCE || "";
const HARNESS_SOURCE = process.env.LYFEOS_ACCEPTANCE_HARNESS_SOURCE || process.env.GITHUB_SHA || "";
const OUTPUT_DIR = path.resolve(process.env.LYFEOS_FINANCE_OUTPUT_DIR || path.join(os.tmpdir(), "lyfeos-production-personal-finance"));
const OUTPUT_FILE = path.join(OUTPUT_DIR, "personal-finance-report.json");
const PASSWORD = "TestPass123!";
const CHECKING_NAME = "Synthetic checking";
const CREDIT_NAME = "Synthetic card";
const TRANSACTION_NAME = "Synthetic groceries";
const GOAL_NAME = "Synthetic emergency fund";
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
    .replace(/finance_production_[a-z0-9_]+/gi, "[redacted fixture]")
    .slice(0, 1_000);
}

async function request(method: string, pathname: string, body?: unknown, cookie = ""): Promise<ApiResult> {
  const response = await fetch(new URL(pathname, BASE_URL), {
    method,
    signal: AbortSignal.timeout(30_000),
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
  throw new Error("No Chromium executable found for production Personal Finance acceptance.");
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

async function setValue(page: Page, selector: string, value: string): Promise<void> {
  await page.waitForSelector(selector, { visible: true, timeout: 30_000 });
  await page.$eval(selector, (element, nextValue) => {
    const input = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, nextValue);
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
    if (rect.width <= 0 || rect.height <= 0) return false;
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hit === control || (hit !== null && control.contains(hit));
  }, { timeout: 30_000 }, selector);
  await page.click(selector);
}

async function waitForSummary(account: Account, predicate: (body: any) => boolean, label: string): Promise<any> {
  const deadline = Date.now() + 45_000;
  let latest: ApiResult | null = null;
  while (Date.now() < deadline) {
    latest = await request("GET", `/api/finance/summary?month=${new Date().toISOString().slice(0, 7)}`, undefined, account.cookie);
    if (latest.status === 200 && predicate(latest.body)) return latest.body;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`${label} did not reconcile; latest=${JSON.stringify(latest?.body || {}).slice(0, 1_000)}.`);
}

async function auditPage(page: Page): Promise<Pick<ViewResult, "mainCount" | "duplicateIds" | "invalidLabelReferences" | "unlabeledControls" | "horizontalOverflowPx">> {
  return page.evaluate(() => {
    const ids = new Map<string, number>();
    for (const element of document.querySelectorAll<HTMLElement>("[id]")) ids.set(element.id, (ids.get(element.id) || 0) + 1);
    const duplicateIds = [...ids.entries()].filter(([, count]) => count > 1).map(([id]) => id).sort();
    const scope = document.querySelector<HTMLElement>('[data-testid="personal-finance"]');
    if (!scope) throw new Error("Personal Finance is not rendered.");
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
    return { mainCount: document.querySelectorAll("main").length, duplicateIds, invalidLabelReferences, unlabeledControls, horizontalOverflowPx: Math.max(0, documentWidth - window.innerWidth) };
  });
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
  const account: Account = { id: 0, email: `finance_production_${stamp}@example.com`, displayName: `finance_production_${ordinal}_${stamp.slice(-8)}`, cookie: "" };
  let context: BrowserContext | null = null;
  let page: Page | null = null;
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
    assert(onboarding.status === 200, `Onboarding setup returned ${onboarding.status}.`);
    const statsBefore = await request("GET", `/api/users/${account.id}/stats`, undefined, account.cookie);
    assert(statsBefore.status === 200, `Initial Wealth Token read returned ${statsBefore.status}.`);
    assert(statsBefore.body?.stats?.wealthTokens !== undefined, "Initial stats did not expose the separate Wealth Token state.");

    stage = "open rendered Personal Finance";
    context = await browser.createBrowserContext();
    page = await context.newPage();
    const signals = captureSignals(page);
    const session = cookieParts(account.cookie);
    await page.setCookie({ ...session, url: BASE_URL.origin, path: "/", httpOnly: true, secure: true, sameSite: "Lax" });
    await page.evaluateOnNewDocument((fixtureUser) => {
      try { localStorage.setItem("lyfeos_user", JSON.stringify(fixtureUser)); } catch { /* origin not ready */ }
    }, { id: account.id, displayName: account.displayName });
    await page.setViewport(viewport.value);
    await page.setCacheEnabled(false);
    await page.goto(new URL("/finance", BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector('[data-testid="personal-finance"]', { visible: true, timeout: 60_000 });
    const tutorialDismissed = await dismissBlockingTutorial(page);
    await page.waitForSelector('[data-testid="finance-account-form"]', { visible: true, timeout: 45_000 });
    const initial = await waitForSummary(account, (body) => body.contract === "lyfeos.personal-finance.v1" && body.accounts?.length === 0, "initial finance summary");
    const disclosure = await page.$eval('[data-testid="finance-disclosure"]', (element) => element.textContent || "");
    const manualProviderBoundaryRendered = initial.provider?.plaid?.available === false && initial.provider?.plaid?.connected === false
      && disclosure.includes("Bank connection is not yet active") && disclosure.includes("Currency totals stay separate");
    assert(manualProviderBoundaryRendered, "Manual/provider boundary was not rendered truthfully.");

    stage = "create asset and liability accounts";
    const accountForm = '[data-testid="finance-account-form"]';
    await setValue(page, `${accountForm} [aria-label="Account name"]`, CHECKING_NAME);
    await page.select(`${accountForm} [aria-label="Account type"]`, "checking");
    await setValue(page, `${accountForm} [aria-label="Current balance or amount owed"]`, "2500");
    await activateHitTestedControl(page, '[data-testid="finance-add-account"]');
    let summary = await waitForSummary(account, (body) => body.accounts?.length === 1, "checking account creation");
    await page.waitForSelector(`[data-testid="finance-account-${summary.accounts[0].id}"]`, { visible: true, timeout: 30_000 });
    await setValue(page, `${accountForm} [aria-label="Account name"]`, CREDIT_NAME);
    await page.select(`${accountForm} [aria-label="Account type"]`, "credit");
    await setValue(page, `${accountForm} [aria-label="Current balance or amount owed"]`, "500");
    await activateHitTestedControl(page, '[data-testid="finance-add-account"]');
    summary = await waitForSummary(account, (body) => body.accounts?.length === 2, "liability account creation");
    const checking = summary.accounts.find((item: any) => item.name === CHECKING_NAME);
    const credit = summary.accounts.find((item: any) => item.name === CREDIT_NAME);
    await page.waitForSelector(`[data-testid="finance-account-${checking.id}"]`, { visible: true, timeout: 30_000 });
    await page.waitForSelector(`[data-testid="finance-account-${credit.id}"]`, { visible: true, timeout: 30_000 });
    const usd = summary.balanceSummary.find((item: any) => item.currency === "USD");
    const assetLiabilityMathReconciled = checking?.balanceMinor === 250000 && credit?.balanceMinor === 50000
      && usd?.assetsMinor === 250000 && usd?.liabilitiesMinor === 50000 && usd?.netWorthMinor === 200000;
    assert(assetLiabilityMathReconciled, "Asset/liability net-worth math did not reconcile.");

    stage = "update balance and preserve snapshot history";
    await setValue(page, `[aria-label="New balance for ${CHECKING_NAME}"]`, "2750");
    await activateHitTestedControl(page, `[aria-label="Update balance for ${CHECKING_NAME}"]`);
    summary = await waitForSummary(account, (body) => body.accounts?.find((item: any) => item.id === checking.id)?.balanceMinor === 275000, "balance update");
    const balanceHistoryReconciled = summary.balanceSnapshots?.length === 3 && summary.balanceSummary?.[0]?.netWorthMinor === 225000;
    assert(balanceHistoryReconciled, "Append-only balance history or updated net worth did not reconcile.");

    stage = "create expense, budget and goal";
    const transactionForm = '[data-testid="finance-transaction-form"]';
    await page.select(`${transactionForm} [aria-label="Transaction account"]`, String(checking.id));
    await page.select(`${transactionForm} [aria-label="Income or expense"]`, "expense");
    await setValue(page, `${transactionForm} [aria-label="Transaction amount"]`, "75");
    await setValue(page, `${transactionForm} [aria-label="Description"]`, TRANSACTION_NAME);
    await setValue(page, `${transactionForm} [aria-label="Category"]`, "Food");
    await activateHitTestedControl(page, '[data-testid="finance-save-transaction"]');
    summary = await waitForSummary(account, (body) => body.transactions?.length === 1, "expense creation");
    const transactionId = summary.transactions[0].id;
    await page.waitForSelector(`[data-testid="finance-transaction-${transactionId}"]`, { visible: true, timeout: 30_000 });
    const budgetForm = '[data-testid="finance-budget-form"]';
    await setValue(page, `${budgetForm} [aria-label="Budget category"]`, "Food");
    await setValue(page, `${budgetForm} [aria-label="Budget limit"]`, "200");
    await activateHitTestedControl(page, `${budgetForm} button`);
    summary = await waitForSummary(account, (body) => body.budgets?.length === 1, "budget creation");
    const budgetId = summary.budgets[0].id;
    await page.waitForSelector(`[data-testid="finance-budget-${budgetId}"]`, { visible: true, timeout: 30_000 });
    const goalForm = '[data-testid="finance-goal-form"]';
    await setValue(page, `${goalForm} [aria-label="Goal name"]`, GOAL_NAME);
    await page.select(`${goalForm} [aria-label="Goal type"]`, "emergency_fund");
    await setValue(page, `${goalForm} [aria-label="Goal target"]`, "1000");
    await setValue(page, `${goalForm} [aria-label="Goal current progress"]`, "100");
    await activateHitTestedControl(page, `${goalForm} button`);
    summary = await waitForSummary(account, (body) => body.goals?.length === 1, "goal creation");
    const goalId = summary.goals[0].id;
    await page.waitForSelector(`[data-testid="finance-goal-${goalId}"]`, { visible: true, timeout: 30_000 });
    const cashFlowAndBudgetReconciled = summary.cashFlow?.[0]?.spendingMinor === 7500 && summary.budgets[0]?.spentMinor === 7500
      && summary.goals[0]?.targetMinor === 100000 && summary.goals[0]?.currentMinor === 10000;
    assert(cashFlowAndBudgetReconciled, "Cash flow, budget utilization or goal values did not reconcile.");

    stage = "correct manual transaction";
    await activateHitTestedControl(page, `[aria-label="Correct ${TRANSACTION_NAME}"]`);
    await page.waitForFunction((selector) => document.querySelector(selector)?.textContent?.includes("Save correction"), { timeout: 30_000 }, '[data-testid="finance-save-transaction"]');
    await setValue(page, `${transactionForm} [aria-label="Transaction amount"]`, "50");
    await activateHitTestedControl(page, '[data-testid="finance-save-transaction"]');
    summary = await waitForSummary(account, (body) => body.transactions?.[0]?.id === transactionId && body.transactions[0].amountMinor === -5000 && body.transactions[0].version === 2, "transaction correction");
    const correctionReconciled = summary.cashFlow?.[0]?.spendingMinor === 5000 && summary.budgets?.[0]?.spentMinor === 5000;
    assert(correctionReconciled, "Corrected transaction did not update cash flow and budget utilization.");

    stage = "close and reopen account";
    await activateHitTestedControl(page, `[aria-label="Close ${CHECKING_NAME}"]`);
    await waitForSummary(account, (body) => body.accounts?.find((item: any) => item.id === checking.id)?.status === "closed", "account closure");
    await activateHitTestedControl(page, `[aria-label="Reopen ${CHECKING_NAME}"]`);
    summary = await waitForSummary(account, (body) => body.accounts?.find((item: any) => item.id === checking.id)?.status === "active", "account reopen");
    const accountLifecycleReconciled = summary.accounts.find((item: any) => item.id === checking.id)?.version === 4;
    assert(accountLifecycleReconciled, "Account close/reopen versions did not reconcile.");

    stage = "complete and reopen goal";
    await activateHitTestedControl(page, `[aria-label="Complete ${GOAL_NAME}"]`);
    await waitForSummary(account, (body) => body.goals?.find((item: any) => item.id === goalId)?.status === "completed", "goal completion");
    await activateHitTestedControl(page, `[aria-label="Reopen ${GOAL_NAME}"]`);
    summary = await waitForSummary(account, (body) => body.goals?.find((item: any) => item.id === goalId)?.status === "active", "goal reopen");
    const goalLifecycleReconciled = summary.goals.find((item: any) => item.id === goalId)?.currentMinor === 100000
      && summary.goals.find((item: any) => item.id === goalId)?.version === 3;
    assert(goalLifecycleReconciled, "Goal complete/reopen lifecycle did not reconcile.");

    stage = "delete transaction and budget then archive goal";
    page.once("dialog", (dialog) => void dialog.accept());
    await activateHitTestedControl(page, `[aria-label="Delete ${TRANSACTION_NAME}"]`);
    await waitForSummary(account, (body) => body.transactions?.length === 0, "transaction deletion");
    await activateHitTestedControl(page, '[aria-label="Delete food budget"]');
    await waitForSummary(account, (body) => body.budgets?.length === 0, "budget deletion");
    await activateHitTestedControl(page, `[aria-label="Archive ${GOAL_NAME}"]`);
    summary = await waitForSummary(account, (body) => body.goals?.find((item: any) => item.id === goalId)?.status === "archived", "goal archive");
    const deletionAndArchiveReconciled = summary.transactions.length === 0 && summary.budgets.length === 0
      && summary.goals.find((item: any) => item.id === goalId)?.status === "archived";
    assert(deletionAndArchiveReconciled, "Deletion/archive lifecycle did not reconcile.");

    stage = "prove finance remains separate from Wealth Tokens";
    const statsAfter = await request("GET", `/api/users/${account.id}/stats`, undefined, account.cookie);
    const wealthTokensUnchanged = statsAfter.status === 200
      && JSON.stringify(statsAfter.body?.stats?.wealthTokens) === JSON.stringify(statsBefore.body?.stats?.wealthTokens);
    assert(wealthTokensUnchanged, "Personal Finance changed the separate Wealth Token state.");
    const rendered = await auditPage(page);
    assert(rendered.mainCount === 1 && rendered.duplicateIds.length === 0 && rendered.invalidLabelReferences.length === 0
      && rendered.unlabeledControls.length === 0 && rendered.horizontalOverflowPx <= 2, `${viewport.name} failed Personal Finance semantics or overflow checks.`);
    assert(Object.values(signals).every((items) => items.length === 0), `${viewport.name} produced application errors: ${JSON.stringify(signals)}.`);
    view = {
      viewport: viewport.name,
      tutorialDismissed,
      manualProviderBoundaryRendered,
      assetLiabilityMathReconciled,
      balanceHistoryReconciled,
      cashFlowAndBudgetReconciled,
      correctionReconciled,
      accountLifecycleReconciled,
      goalLifecycleReconciled,
      deletionAndArchiveReconciled,
      wealthTokensUnchanged,
      ...rendered,
      signals,
    };
  } catch (error) {
    const rendered = page ? await page.$eval('[data-testid="personal-finance"]', (element) => (element as HTMLElement).innerText.slice(0, 2_000)).catch(() => "finance page unavailable") : "page unavailable";
    if (page) await page.screenshot({ path: path.join(OUTPUT_DIR, `personal-finance-${viewport.name}-failure.png`), fullPage: true }).catch(() => undefined);
    failure = new Error(`${safeError(error)}; rendered=${rendered}`);
  } finally {
    if (context) await context.close().catch(() => undefined);
    if (account.cookie) cleanup = await eraseAccount(account, viewport.name);
  }
  if (failure) throw new Error(`stage=${stage}; ${safeError(failure)}; accountErased=${cleanup.accountErased}`);
  assert(view && cleanup.accountErased, `${viewport.name} did not complete the rendered journey and verified account erasure.`);
  return { view, cleanup };
}

async function main(): Promise<void> {
  assert(BASE_URL.origin === "https://lyfeos.net", "Production Personal Finance acceptance may target only https://lyfeos.net.");
  assert(/^[0-9a-f]{40}$/.test(SOURCE), "Production Personal Finance acceptance requires the exact deployed source revision.");
  assert(/^[0-9a-f]{40}$/.test(HARNESS_SOURCE), "Production Personal Finance acceptance requires the exact harness source revision.");
  const release = await request("GET", "/api/release");
  assert(release.status === 200 && release.body?.sourceRevision === SOURCE, "Production Personal Finance runtime does not match the requested immutable source.");
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
      contract: "lyfeos.production-personal-finance-browser.v1",
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL.origin,
      sourceRevision: SOURCE,
      harnessSource: HARNESS_SOURCE,
      views,
      cleanups,
      summary: { passed, failure },
      boundary: "Disposable production-account Chromium evidence for private manual Personal Finance. It proves truthful bank-provider unavailability; separate-currency asset, liability and net-worth math; append-only balance snapshots; manual transaction correction/deletion; cash flow and budget utilization; account and goal lifecycle; no Wealth Token mutation; responsive semantics; and verified account/session/identifier erasure. It does not prove bank-provider connectivity, reconciliation, financial advice, tax or investment correctness, multi-currency conversion, real-device behavior, human assistive-technology comprehension, or longitudinal financial outcomes.",
    };
    await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    if (process.env.GITHUB_STEP_SUMMARY) {
      await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, [
        "## LyfeOS production Personal Finance acceptance",
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
    if (!passed && !failure) failure = "Production Personal Finance acceptance did not satisfy every rendered, financial and cleanup invariant.";
  }
  if (failure) throw new Error(failure);
}

main().catch((error) => {
  console.error(safeError(error));
  process.exitCode = 1;
});
