import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import puppeteer, { type Browser, type BrowserContext, type Page, type Viewport } from "puppeteer-core";
import { acknowledgeBoundedChunkRecovery, hasUnexpectedBrowserSignals, type BrowserSignals } from "./lib/production-browser-signals";

type ApiResult = { status: number; body: any; cookie: string; retryAfterSeconds: number | null };
type Account = { id: number; email: string; displayName: string; cookie: string };
type Signals = BrowserSignals & { isolatedProviderErrors: string[] };
type Audit = { mainCount: number; duplicateIds: string[]; invalidLabelReferences: string[]; unlabeledControls: string[]; horizontalOverflowPx: number };
type SearchView = {
  viewport: string;
  allSixKindsRendered: boolean;
  resultCountsReconciled: boolean;
  filtersReconciled: boolean;
  queryDeepLinkPersisted: boolean;
  reloadReconciled: boolean;
  audit: Audit;
};

const BASE_URL = new URL(process.env.LYFEOS_TEST_API_URL || "https://lyfeos.net");
const MODE = process.env.LYFEOS_SEARCH_ACCEPTANCE_MODE || (["127.0.0.1", "localhost"].includes(BASE_URL.hostname) ? "isolated" : "production");
const SOURCE = process.env.LYFEOS_ACCEPTANCE_SOURCE || "";
const HARNESS_SOURCE = process.env.LYFEOS_ACCEPTANCE_HARNESS_SOURCE || process.env.GITHUB_SHA || "";
const DATABASE_URL = process.env.DATABASE_URL?.trim() || "";
const OUTPUT_DIR = path.resolve(process.env.LYFEOS_SEARCH_OUTPUT_DIR || path.join(os.tmpdir(), "lyfeos-production-search"));
const OUTPUT_FILE = path.join(OUTPUT_DIR, "search-report.json");
const PASSWORD = "TestPass123!";
const KINDS = ["mission", "document", "spreadsheet", "canvas", "database", "relationship"] as const;
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
    .replace(/search_(owner|other)_[a-z0-9_]+/gi, "[redacted fixture]")
    .slice(0, 1_500);
}

async function request(method: string, pathname: string, body?: unknown, cookie = "", headers: Record<string, string> = {}): Promise<ApiResult> {
  const response = await fetch(new URL(pathname, BASE_URL), {
    method,
    signal: AbortSignal.timeout(30_000),
    headers: { "Content-Type": "application/json", ...(MODE === "isolated" ? { "X-Forwarded-Proto": "https" } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
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

async function register(account: Account, label: string): Promise<void> {
  let result: ApiResult | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    result = await request("POST", "/api/auth/complete-registration", { email: account.email, password: PASSWORD, displayName: account.displayName, termsAccepted: true });
    if (result.status === 201 || result.status !== 429 || attempt === 1) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(61, Math.max(1, result!.retryAfterSeconds || 60)) * 1_000 + 250));
  }
  assert(result?.status === 201, `${label} registration returned ${result?.status}.`);
  account.id = Number(result.body.user?.id);
  account.cookie = result.cookie;
  assert(Number.isInteger(account.id) && account.id > 0 && account.cookie, `${label} registration did not return an owner and session.`);
  const onboarding = await request("PATCH", "/api/profile", { onboardingCompleted: true }, account.cookie);
  assert(onboarding.status === 200, `${label} onboarding setup returned ${onboarding.status}.`);
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
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    try { await access(candidate); return candidate; } catch { /* Continue through bounded locations. */ }
  }
  throw new Error("No Chromium executable found for Search acceptance.");
}

function cookieParts(cookie: string): { name: string; value: string } {
  const separator = cookie.indexOf("=");
  assert(separator > 0, "Registration did not return a usable session cookie.");
  return { name: cookie.slice(0, separator), value: cookie.slice(separator + 1) };
}

function captureSignals(page: Page): Signals {
  const signals: Signals = { consoleErrors: [], pageErrors: [], failedRequests: [], serverErrors: [], recoveredChunkLoads: [], isolatedProviderErrors: [] };
  page.on("console", (entry) => {
    if (entry.type() !== "error") return;
    const source = entry.location().url || "";
    const detail = `${entry.text()}${source ? ` @ ${source}` : ""}`.slice(0, 500);
    if (MODE === "isolated" && (entry.text().includes("Failed to load Clerk") || (entry.text().includes("ERR_NAME_NOT_RESOLVED") && source.startsWith("https://local.lyfeos.dev/npm/@clerk/clerk-js@5/")))) signals.isolatedProviderErrors.push(detail);
    else signals.consoleErrors.push(detail);
  });
  page.on("pageerror", (error) => {
    const detail = error.message.slice(0, 500);
    if (MODE === "isolated" && detail.includes("Clerk: Failed to load Clerk") && detail.includes("https://local.lyfeos.dev/")) signals.isolatedProviderErrors.push(detail);
    else signals.pageErrors.push(detail);
  });
  page.on("requestfailed", (failed) => {
    const method = failed.method(), errorText = failed.failure()?.errorText || "failed";
    if (["GET", "HEAD"].includes(method) && errorText.includes("ERR_ABORTED")) return;
    if (failed.url().startsWith(BASE_URL.origin)) signals.failedRequests.push(`${method} ${new URL(failed.url()).pathname}: ${errorText}`);
  });
  page.on("response", (response) => {
    if (response.url().startsWith(BASE_URL.origin) && response.status() >= 500) signals.serverErrors.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  return signals;
}

async function replaceInput(page: Page, selector: string, value: string): Promise<void> {
  await page.waitForSelector(selector, { visible: true, timeout: 30_000 });
  await page.$eval(selector, (element, nextValue) => {
    const input = element as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, nextValue);
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

async function auditPage(page: Page): Promise<Audit> {
  return page.evaluate(() => {
    const scope = document.querySelector<HTMLElement>('[data-testid="search-page"]');
    if (!scope) throw new Error("Search acceptance scope is not rendered.");
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

function spreadsheetDocument(value: string) {
  return { version: 1, activeSheetId: "sheet_main", sheets: [{ id: "sheet_main", name: "Sheet 1", rowCount: 40, columnCount: 10, cells: { A1: { input: value } } }] };
}

function canvasDocument(title: string) {
  return { version: 1, nodes: [{ id: "node_main", type: "note", x: 20, y: 20, width: 220, height: 140, title, body: "", color: "cyan", completed: false, url: null }], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
}

async function seedFixtures(owner: Account, other: Account, token: string, secretToken: string): Promise<Record<string, number>> {
  const mission = await request("POST", "/api/quests", { userId: owner.id, title: `${token} Mission`, description: "Canonical search qualification", category: "general", experienceReward: 10, completed: false }, owner.cookie, { "x-lyfeos-mutation-id": `search-${randomUUID()}` });
  assert(mission.status === 201, `Mission fixture returned ${mission.status}.`);
  const document = await request("POST", "/api/documents", { title: `${token} Document`, content: "Private source-of-truth document", format: "markdown", source: "local" }, owner.cookie);
  assert(document.status === 201, `Document fixture returned ${document.status}.`);
  const spreadsheet = await request("POST", "/api/spreadsheets", { title: `${token} Sheet`, description: "Private calculation", category: "acceptance", favorite: false, content: spreadsheetDocument(token) }, owner.cookie);
  assert(spreadsheet.status === 201, `Spreadsheet fixture returned ${spreadsheet.status}.`);
  const canvas = await request("POST", "/api/canvases", { title: `${token} Canvas`, description: "Private visual map", category: "acceptance", favorite: false, content: canvasDocument(token) }, owner.cookie);
  assert(canvas.status === 201, `Canvas fixture returned ${canvas.status}.`);
  const database = await request("POST", "/api/databases", { title: `${token} Table`, description: "Private structured records", category: "acceptance", favorite: false, definition: { version: 1, columns: [{ id: "name", name: "Name", type: "text", required: true, options: [] }] } }, owner.cookie);
  assert(database.status === 201, `Table fixture returned ${database.status}.`);
  const relationship = await request("POST", "/api/contacts", { name: `${token} Relationship`, category: "personal", relationshipType: "friend", company: "Private circle" }, owner.cookie);
  assert(relationship.status === 201, `Relationship fixture returned ${relationship.status}.`);
  const secret = await request("POST", "/api/contacts", { name: "Private relationship", category: "personal", relationshipType: "friend", email: `${secretToken}@example.com`, notes: `Never disclose ${secretToken}` }, owner.cookie);
  assert(secret.status === 201, `Secret-field fixture returned ${secret.status}.`);
  const foreign = await request("POST", "/api/quests", { userId: other.id, title: `${token} Foreign Mission`, description: "Other owner", category: "general", experienceReward: 10, completed: false }, other.cookie, { "x-lyfeos-mutation-id": `search-${randomUUID()}` });
  assert(foreign.status === 201, `Foreign Mission fixture returned ${foreign.status}.`);
  return {
    mission: Number(mission.body.quest?.id),
    document: Number(document.body.document?.id),
    spreadsheet: Number(spreadsheet.body.spreadsheet?.id),
    canvas: Number(canvas.body.canvas?.id),
    database: Number(database.body.database?.id),
    relationship: Number(relationship.body.contact?.id),
    secret: Number(secret.body.contact?.id),
    foreign: Number(foreign.body.quest?.id),
  };
}

async function renderSearch(page: Page, query: string): Promise<void> {
  await replaceInput(page, '[data-testid="workspace-search-input"]', query);
  await page.waitForFunction((expectedKinds) => {
    const kinds = [...document.querySelectorAll<HTMLElement>("[data-result-kind]")].map((element) => element.dataset.resultKind);
    return expectedKinds.every((kind) => kinds.includes(kind));
  }, { timeout: 30_000 }, [...KINDS]);
}

async function inspectPopulatedView(page: Page, viewport: string, token: string): Promise<SearchView> {
  await page.setViewport(VIEWPORTS.find((candidate) => candidate.name === viewport)!.value);
  await page.goto(new URL(`/search?q=${encodeURIComponent(token)}`, BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector('[data-testid="search-page"]', { visible: true, timeout: 30_000 });
  await dismissBlockingTutorial(page);
  await page.waitForFunction((expectedKinds) => {
    const kinds = [...document.querySelectorAll<HTMLElement>("[data-result-kind]")].map((element) => element.dataset.resultKind);
    return expectedKinds.every((kind) => kinds.includes(kind));
  }, { timeout: 30_000 }, [...KINDS]);
  const resultKinds = await page.$$eval("[data-result-kind]", (elements) => elements.map((element) => (element as HTMLElement).dataset.resultKind || ""));
  const allSixKindsRendered = KINDS.every((kind) => resultKinds.includes(kind));
  const resultCountsReconciled = await page.evaluate((expectedKinds) => expectedKinds.every((kind) => {
    const button = document.querySelector<HTMLElement>(`[data-testid="search-filter-${kind}"]`);
    const count = document.querySelectorAll(`[data-result-kind="${kind}"]`).length;
    return button?.textContent?.trim().endsWith(String(count));
  }), [...KINDS]);
  let filtersReconciled = true;
  for (const kind of KINDS) {
    await activate(page, `[data-testid="search-filter-${kind}"]`);
    try {
      await page.waitForFunction((expectedKind) => {
        const results = [...document.querySelectorAll<HTMLElement>("[data-result-kind]")];
        const filter = document.querySelector(`[data-testid="search-filter-${expectedKind}"]`);
        return results.length >= 1 && results.every((element) => element.dataset.resultKind === expectedKind) && filter?.getAttribute("aria-pressed") === "true";
      }, { timeout: 30_000 }, kind);
    } catch {
      const state = await page.evaluate((expectedKind) => ({
        expectedKind,
        renderedKinds: [...document.querySelectorAll<HTMLElement>("[data-result-kind]")].map((element) => element.dataset.resultKind),
        pressed: document.querySelector(`[data-testid="search-filter-${expectedKind}"]`)?.getAttribute("aria-pressed"),
      }), kind);
      throw new Error(`Search filter ${kind} did not reconcile: ${JSON.stringify(state)}.`);
    }
    const filtered = await page.$$eval("[data-result-kind]", (elements) => elements.map((element) => (element as HTMLElement).dataset.resultKind || ""));
    const pressed = await page.$eval(`[data-testid="search-filter-${kind}"]`, (element) => element.getAttribute("aria-pressed"));
    filtersReconciled = filtersReconciled && filtered.length >= 1 && filtered.every((value) => value === kind) && pressed === "true";
  }
  await activate(page, '[data-testid="search-filter-all"]');
  const queryDeepLinkPersisted = new URL(page.url()).searchParams.get("q") === token;
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction((expectedKinds) => expectedKinds.every((kind) => document.querySelector(`[data-result-kind="${kind}"]`)), { timeout: 30_000 }, [...KINDS]);
  const reloadReconciled = (await page.$$eval("[data-result-kind]", (elements) => new Set(elements.map((element) => (element as HTMLElement).dataset.resultKind)).size)) === KINDS.length;
  const audit = await auditPage(page);
  return { viewport, allSixKindsRendered, resultCountsReconciled, filtersReconciled, queryDeepLinkPersisted, reloadReconciled, audit };
}

async function main(): Promise<void> {
  assert(MODE === "isolated" || MODE === "production", "Search acceptance mode must be isolated or production.");
  if (MODE === "isolated") {
    assert(process.env.LYFEOS_TEST_ENV === "isolated", "Isolated Search acceptance requires an explicit isolated environment.");
    assert(["127.0.0.1", "localhost"].includes(BASE_URL.hostname), "Isolated Search acceptance may target only localhost.");
    assert(DATABASE_URL.length > 0, "Isolated Search acceptance requires disposable PostgreSQL.");
  } else {
    assert(BASE_URL.origin === "https://lyfeos.net", "Production Search acceptance is pinned to https://lyfeos.net.");
    assert(/^[0-9a-f]{40}$/.test(SOURCE), "Production Search acceptance requires an immutable runtime source.");
    assert(/^[0-9a-f]{40}$/.test(HARNESS_SOURCE), "Production Search acceptance requires an immutable harness source.");
    const release = await request("GET", "/api/release");
    assert(release.status === 200 && release.body?.sourceRevision === SOURCE, "Production Search runtime does not match the requested immutable source.");
  }
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const stamp = `${Date.now()}_${randomUUID().slice(0, 8)}`;
  const token = `atlasneedle${stamp.slice(-6)}`;
  const secretToken = `vaultprivate${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const owner: Account = { id: 0, email: `search_owner_${stamp}@example.com`, displayName: `search_owner_${stamp}`, cookie: "" };
  const other: Account = { id: 0, email: `search_other_${stamp}@example.com`, displayName: `search_other_${stamp}`, cookie: "" };
  const accounts = [owner, other];
  const ids: Record<string, number> = {};
  const views: SearchView[] = [];
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let signals: Signals = { consoleErrors: [], pageErrors: [], failedRequests: [], serverErrors: [], recoveredChunkLoads: [], isolatedProviderErrors: [] };
  let shortcutOpenedAndFocused = false;
  let ownerIsolationReconciled = false;
  let secretOnlyFieldsExcluded = false;
  let resultDeepLinkRendered = false;
  let minimumQueryDisclosureRendered = false;
  let emptyStateRendered = false;
  let identifierErasure = { owner: false, other: false };
  let residualCounts: Record<string, number> | null = null;
  let failure: string | null = null;
  let stage = "register disposable owners";
  try {
    await register(owner, "Owner");
    await register(other, "Other owner");
    stage = "seed one canonical record per searchable domain";
    Object.assign(ids, await seedFixtures(owner, other, token, secretToken));
    assert(Object.values(ids).every((id) => Number.isInteger(id) && id > 0), "Search fixtures did not return stable identifiers.");

    stage = "reconcile private search API boundaries";
    const ownerSearch = await request("GET", `/api/search?q=${encodeURIComponent(token)}&limit=12`, undefined, owner.cookie);
    assert(ownerSearch.status === 200, `Owner search returned ${ownerSearch.status}.`);
    assert(KINDS.every((kind) => ownerSearch.body.results?.some((result: any) => result.kind === kind && result.id === ids[kind])), "Owner search did not return all six canonical result kinds.");
    const otherSearch = await request("GET", `/api/search?q=${encodeURIComponent(token)}&limit=12`, undefined, other.cookie);
    ownerIsolationReconciled = otherSearch.status === 200
      && otherSearch.body.results?.some((result: any) => result.kind === "mission" && result.id === ids.foreign)
      && !otherSearch.body.results?.some((result: any) => KINDS.some((kind) => result.id === ids[kind] && result.kind === kind));
    assert(ownerIsolationReconciled, "Cross-owner Search isolation did not reconcile.");
    const secretSearch = await request("GET", `/api/search?q=${encodeURIComponent(secretToken)}&limit=12`, undefined, owner.cookie);
    secretOnlyFieldsExcluded = secretSearch.status === 200 && secretSearch.body.results?.length === 0;
    assert(secretOnlyFieldsExcluded, "Contact email or private notes leaked into Search discovery.");

    stage = "open Search through the global keyboard shortcut";
    browser = await puppeteer.launch({ executablePath: await findChromium(), headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] });
    context = await browser.createBrowserContext();
    const page = await context.newPage();
    signals = captureSignals(page);
    const session = cookieParts(owner.cookie);
    await page.setCookie({ ...session, url: BASE_URL.origin, path: "/", httpOnly: true, secure: BASE_URL.protocol === "https:", sameSite: "Lax" });
    await page.evaluateOnNewDocument((fixtureUser) => localStorage.setItem("lyfeos_user", JSON.stringify(fixtureUser)), { id: owner.id, displayName: owner.displayName });
    await page.setViewport(VIEWPORTS[0].value);
    await page.goto(new URL("/dashboard", BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("main", { visible: true, timeout: 30_000 });
    assert(new URL(page.url()).pathname === "/dashboard", `Authenticated browser opened ${new URL(page.url()).pathname} instead of Dashboard.`);
    await dismissBlockingTutorial(page);
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
    const shortcutHandled = await page.evaluate(() => {
      const event = new KeyboardEvent("keydown", { key: "k", code: "KeyK", ctrlKey: true, bubbles: true, cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    await page.waitForSelector('[data-testid="workspace-search-input"]', { visible: true, timeout: 30_000 });
    shortcutOpenedAndFocused = shortcutHandled && new URL(page.url()).pathname === "/search" && await page.$eval('[data-testid="workspace-search-input"]', (element) => document.activeElement === element);
    assert(shortcutOpenedAndFocused, "Ctrl+K did not open and focus private Search.");

    stage = "render, filter, deep-link and reload all six canonical results";
    await renderSearch(page, token);
    await page.click(`[data-testid="search-result-mission-${ids.mission}"]`);
    await page.waitForFunction((missionId) => location.pathname === `/mission/${missionId}`, { timeout: 30_000 }, ids.mission);
    await page.waitForFunction((title) => document.body.innerText.includes(title), { timeout: 30_000 }, `${token} Mission`);
    resultDeepLinkRendered = true;
    for (const viewport of VIEWPORTS) views.push(await inspectPopulatedView(page, viewport.name, token));

    stage = "render bounded minimum-query and private empty states";
    await replaceInput(page, '[data-testid="workspace-search-input"]', "a");
    await page.waitForSelector('[data-testid="search-minimum-query"]', { visible: true, timeout: 30_000 });
    minimumQueryDisclosureRendered = new URL(page.url()).pathname === "/search" && !new URL(page.url()).searchParams.has("q");
    await replaceInput(page, '[data-testid="workspace-search-input"]', `noresult${randomUUID().replace(/-/g, "").slice(0, 10)}`);
    await page.waitForSelector('[data-testid="search-empty"]', { visible: true, timeout: 30_000 });
    emptyStateRendered = true;
    await acknowledgeBoundedChunkRecovery(page, signals);
  } catch (error) {
    failure = `${stage}: ${safeError(error)}`;
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    identifierErasure = { owner: await eraseAccount(owner), other: await eraseAccount(other) };
    if (MODE === "isolated" && DATABASE_URL && accounts.every((account) => account.id > 0)) {
      const pool = new pg.Pool({ connectionString: DATABASE_URL });
      const userIds = accounts.map((account) => account.id);
      const residue = await pool.query(`SELECT
        (SELECT count(*)::text FROM users WHERE id = ANY($1::int[])) AS users,
        (SELECT count(*)::text FROM quests WHERE user_id = ANY($1::int[])) AS missions,
        (SELECT count(*)::text FROM documents WHERE user_id = ANY($1::int[])) AS documents,
        (SELECT count(*)::text FROM spreadsheets WHERE user_id = ANY($1::int[])) AS spreadsheets,
        (SELECT count(*)::text FROM canvases WHERE user_id = ANY($1::int[])) AS canvases,
        (SELECT count(*)::text FROM workspace_databases WHERE user_id = ANY($1::int[])) AS databases,
        (SELECT count(*)::text FROM contacts WHERE user_id = ANY($1::int[])) AS contacts`, [userIds]);
      residualCounts = Object.fromEntries(Object.entries(residue.rows[0] || {}).map(([key, value]) => [key, Number(value)]));
      await pool.end();
    }
    const browserClean = !hasUnexpectedBrowserSignals(signals);
    const viewsPassed = views.length === VIEWPORTS.length && views.every((view) => view.allSixKindsRendered && view.resultCountsReconciled && view.filtersReconciled && view.queryDeepLinkPersisted && view.reloadReconciled && view.audit.mainCount === 1 && view.audit.duplicateIds.length === 0 && view.audit.invalidLabelReferences.length === 0 && view.audit.unlabeledControls.length === 0 && view.audit.horizontalOverflowPx <= 2);
    const cleanupPassed = identifierErasure.owner && identifierErasure.other && (residualCounts === null || Object.values(residualCounts).every((count) => count === 0));
    const passed = failure === null && shortcutOpenedAndFocused && ownerIsolationReconciled && secretOnlyFieldsExcluded && resultDeepLinkRendered && minimumQueryDisclosureRendered && emptyStateRendered && viewsPassed && browserClean && cleanupPassed;
    const report = {
      contract: MODE === "production" ? "lyfeos.production-search-browser.v1" : "lyfeos.isolated-search-browser.v1",
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL.origin,
      sourceRevision: MODE === "production" ? SOURCE : "",
      harnessSource: MODE === "production" ? HARNESS_SOURCE : "",
      fixture: { accountCount: accounts.filter((account) => account.id > 0).length, resultKinds: [...KINDS], ids },
      lifecycle: { shortcutOpenedAndFocused, ownerIsolationReconciled, secretOnlyFieldsExcluded, resultDeepLinkRendered, minimumQueryDisclosureRendered, emptyStateRendered },
      views,
      browserSignals: signals,
      cleanup: { identifierErasure, residualCounts },
      summary: { passed, failure },
      boundary: `Disposable ${MODE === "production" ? "production-account" : "isolated PostgreSQL"} plus Chromium evidence for private workspace Search. It proves six canonical read-only result kinds, owner isolation, secret-field exclusion, keyboard discovery, filters, deep links, responsive semantics and account/session/identifier erasure. It does not prove consented search telemetry, human assistive-technology comprehension, physical-device behavior, production-scale managed-database latency, or permission to search additional private domains.`,
    };
    await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ contract: report.contract, passed, viewCount: views.length, lifecycle: report.lifecycle, cleanup: report.cleanup }));
    if (!passed && !failure) failure = "Rendered Search acceptance did not satisfy every privacy, discovery, responsive, browser and cleanup invariant.";
  }
  if (failure) throw new Error(failure);
}

main().catch((error) => {
  console.error(safeError(error));
  process.exitCode = 1;
});
