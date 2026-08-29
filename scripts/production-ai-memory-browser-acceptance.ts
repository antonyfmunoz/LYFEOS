import { access } from "node:fs/promises";
import { randomUUID } from "node:crypto";
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
  initialChatSummary: string;
  initialReceiptSummary: string;
  retainedChatSummary: string;
  retainedReceiptSummary: string;
  finalChatSummary: string;
  finalReceiptSummary: string;
  personaResetName: string;
  privateContentAbsent: boolean;
  memoryBoundaries: { nativeMessagesIncluded: boolean; externalSendingEnabled: boolean; crossProductMemoryDefault: string; contextReceiptsContainRawValues: boolean };
  mainCount: number;
  duplicateIds: string[];
  unlabeledControls: string[];
  horizontalOverflowPx: number;
  signals: Signals;
};

const BASE_URL = new URL(process.env.LYFEOS_TEST_API_URL || "https://lyfeos.net");
const SOURCE = process.env.LYFEOS_ACCEPTANCE_SOURCE || "";
const HARNESS_SOURCE = process.env.LYFEOS_ACCEPTANCE_HARNESS_SOURCE || process.env.GITHUB_SHA || "";
const OUTPUT_DIR = path.resolve(process.env.LYFEOS_AI_MEMORY_OUTPUT_DIR || path.join(os.tmpdir(), "lyfeos-production-ai-memory"));
const OUTPUT_FILE = path.join(OUTPUT_DIR, "ai-memory-report.json");
const PRIVATE_MARKER = `private-ai-memory-${randomUUID()}`;
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
    .replaceAll(PRIVATE_MARKER, "[redacted fixture]")
    .replace(/[a-z0-9._%+-]+@example\.com/gi, "[redacted fixture]")
    .replace(/ai_memory_production_[a-z0-9_]+/gi, "[redacted fixture]")
    .slice(0, 1_000);
}

async function request(method: string, pathname: string, body?: unknown, cookie = ""): Promise<ApiResult> {
  const response = await fetch(new URL(pathname, BASE_URL), {
    method,
    signal: AbortSignal.timeout(25_000),
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
  throw new Error("No Chromium executable found for production AI-memory acceptance.");
}

function cookieParts(cookie: string): { name: string; value: string } {
  const separator = cookie.indexOf("=");
  assert(separator > 0, "Registration did not return a usable session cookie.");
  return { name: cookie.slice(0, separator), value: cookie.slice(separator + 1) };
}

async function textAt(page: Page, testId: string): Promise<string> {
  return page.$eval(`[data-testid="${testId}"]`, (element) => element.textContent?.trim() || "");
}

async function waitForText(page: Page, testId: string, expected: string): Promise<void> {
  try {
    await page.waitForFunction(
      ({ selector, text }) => document.querySelector(selector)?.textContent?.includes(text) === true,
      { timeout: 30_000 },
      { selector: `[data-testid="${testId}"]`, text: expected },
    );
  } catch {
    throw new Error(`${testId} did not render ${JSON.stringify(expected)}; current text is ${JSON.stringify(await textAt(page, testId))}.`);
  }
}

async function selectPolicy(page: Page, testId: string, value: string): Promise<void> {
  const [response] = await Promise.all([
    page.waitForResponse((candidate) => candidate.request().method() === "PATCH" && new URL(candidate.url()).pathname === "/api/account/ai-memory-policy", { timeout: 30_000 }),
    page.select(`[data-testid="${testId}"]`, value),
  ]);
  assert(response.status() === 200, `Memory-policy control ${testId} returned ${response.status()}.`);
  await page.waitForFunction(
    ({ selector, expected }) => (document.querySelector(selector) as HTMLSelectElement | null)?.value === expected,
    { timeout: 30_000 },
    { selector: `[data-testid="${testId}"]`, expected: value },
  );
}

async function clickMemoryAction(page: Page, testId: string): Promise<void> {
  const selector = `[data-testid="${testId}"]`;
  await page.waitForFunction(
    (candidate) => (document.querySelector(candidate) as HTMLButtonElement | null)?.disabled === false,
    { timeout: 30_000 },
    selector,
  );
  const [response] = await Promise.all([
    page.waitForResponse((candidate) => candidate.request().method() === "DELETE" && new URL(candidate.url()).pathname === "/api/account/ai-memory", { timeout: 30_000 }),
    page.$eval(selector, (element) => {
      const button = element as HTMLButtonElement;
      if (button.disabled) throw new Error(`${button.dataset.testid || "AI-memory control"} is disabled.`);
      button.click();
    }),
  ]);
  assert(response.status() === 200, `AI-memory control ${testId} returned ${response.status()}.`);
  await page.waitForFunction(
    (candidate) => (document.querySelector(candidate) as HTMLButtonElement | null)?.disabled === false,
    { timeout: 30_000 },
    selector,
  );
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

async function auditPage(page: Page): Promise<Pick<ViewResult, "mainCount" | "duplicateIds" | "unlabeledControls" | "horizontalOverflowPx">> {
  return page.evaluate(() => {
    const ids = new Map<string, number>();
    for (const element of document.querySelectorAll<HTMLElement>("[id]")) ids.set(element.id, (ids.get(element.id) || 0) + 1);
    const duplicateIds = [...ids.entries()].filter(([, count]) => count > 1).map(([id]) => id).sort();
    const unlabeledControls = [...document.querySelectorAll<HTMLElement>("button,input,select,textarea")]
      .filter((element) => {
        if (element.getAttribute("aria-hidden") === "true") return false;
        if (element instanceof HTMLInputElement && element.type === "hidden") return false;
        const style = window.getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden" || element.getClientRects().length === 0) return false;
        const label = element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`) : null;
        const name = element.getAttribute("aria-label") || element.getAttribute("aria-labelledby") || element.getAttribute("title") || element.textContent?.trim();
        return !label && !element.closest("label") && !name;
      })
      .map((element) => element.getAttribute("data-testid") || element.tagName.toLowerCase())
      .slice(0, 20);
    const documentWidth = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0);
    return {
      mainCount: document.querySelectorAll("main").length,
      duplicateIds,
      unlabeledControls,
      horizontalOverflowPx: Math.max(0, documentWidth - window.innerWidth),
    };
  });
}

async function seedThroughOwnedApis(account: Account): Promise<void> {
  const persona = await request("GET", "/api/ai/persona", undefined, account.cookie);
  assert(persona.status === 200, `Persona initialization returned ${persona.status}.`);
  const named = await request("PUT", "/api/ai/persona", {
    name: "Atlas",
    interactionStyle: { tone: "direct" },
    ecosystemSharingEnabled: false,
    allowedDestinations: [],
    expectedRevision: persona.body.persona.revision,
  }, account.cookie);
  assert(named.status === 200, `Persona naming returned ${named.status}.`);

  const profile = await request("PATCH", "/api/profile", { aiPersonalityProfile: { fixture: PRIVATE_MARKER } }, account.cookie);
  assert(profile.status === 200, `Assistant-profile fixture returned ${profile.status}.`);
  const conversation = await request("POST", "/api/conversations", { title: "[AUTOMATED ACCEPTANCE] Private memory" }, account.cookie);
  assert(conversation.status === 201 && Number.isInteger(Number(conversation.body?.id)), `Conversation fixture returned ${conversation.status}.`);
  const voice = await request("POST", "/api/ai/voice-sessions", { title: "[AUTOMATED ACCEPTANCE] Private reflection", purpose: "reflection" }, account.cookie);
  assert(voice.status === 201 && voice.body?.session?.id, `Voice fixture returned ${voice.status}.`);
  const segment = await request("POST", `/api/ai/voice-sessions/${voice.body.session.id}/segments`, {
    speaker: "user",
    transcript: PRIVATE_MARKER,
    source: "typed",
    idempotencyKey: randomUUID(),
  }, account.cookie);
  assert(segment.status === 201, `Voice segment fixture returned ${segment.status}.`);
  const completed = await request("POST", `/api/ai/voice-sessions/${voice.body.session.id}/complete`, { expectedVersion: voice.body.session.version }, account.cookie);
  assert(completed.status === 200 && completed.body?.session?.status === "completed", `Voice completion fixture returned ${completed.status}.`);
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
  const account: Account = { id: 0, email: `ai_memory_production_${stamp}@example.com`, displayName: `ai_memory_production_${ordinal}_${stamp.slice(-8)}`, cookie: "" };
  let context: BrowserContext | null = null;
  let view: ViewResult | null = null;
  let cleanup: Cleanup = { viewport: viewport.name, accountErased: false, sessionInvalidated: false, emailReleased: false, displayNameReleased: false };
  let failure: unknown = null;
  try {
    const registration = await request("POST", "/api/auth/complete-registration", { email: account.email, password: PASSWORD, displayName: account.displayName, termsAccepted: true });
    assert(registration.status === 201, `Registration returned ${registration.status}.`);
    account.id = Number(registration.body.user?.id);
    account.cookie = registration.cookie;
    assert(Number.isInteger(account.id) && account.id > 0 && account.cookie, "Registration did not create a disposable owner and session.");
    const onboarding = await request("PATCH", "/api/profile", { onboardingCompleted: true }, account.cookie);
    assert(onboarding.status === 200 && onboarding.body?.onboardingCompleted === true, `Onboarding setup returned ${onboarding.status}.`);
    await seedThroughOwnedApis(account);

    context = await browser.createBrowserContext();
    const page = await context.newPage();
    const signals = captureSignals(page);
    const session = cookieParts(account.cookie);
    await page.setCookie({ ...session, url: BASE_URL.origin, path: "/", httpOnly: true, secure: true, sameSite: "Lax" });
    await page.evaluateOnNewDocument((fixtureUser) => localStorage.setItem("lyfeos_user", JSON.stringify(fixtureUser)), { id: account.id, displayName: account.displayName });
    await page.setViewport(viewport.value);
    await page.setCacheEnabled(false);
    await page.goto(new URL("/profile", BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector('[data-testid="ai-memory-settings"]', { visible: true, timeout: 60_000 });
    await waitForText(page, "ai-memory-chat-summary", "1 saved text conversations, 1 voice sessions, and 0 legacy messages.");
    await waitForText(page, "ai-memory-receipt-summary", "0 context-source receipts and 0 action receipts.");
    await waitForText(page, "ai-memory-profile-summary", "A generated assistant profile is stored.");
    const initialChatSummary = await textAt(page, "ai-memory-chat-summary");
    const initialReceiptSummary = await textAt(page, "ai-memory-receipt-summary");
    const privateContentAbsent = !(await page.$eval('[data-testid="ai-memory-settings"]', (section, marker) => (section as HTMLElement).innerText.includes(marker), PRIVATE_MARKER));
    assert(privateContentAbsent, "The AI-memory control surface exposed private memory contents.");

    await selectPolicy(page, "ai-memory-retention-chats", "30");
    await selectPolicy(page, "ai-memory-retention-context", "30");
    await selectPolicy(page, "ai-memory-retention-actions", "90");
    await waitForText(page, "ai-memory-chat-summary", "1 saved text conversations, 1 voice sessions, and 0 legacy messages.");
    const retainedChatSummary = await textAt(page, "ai-memory-chat-summary");
    const retainedReceiptSummary = await textAt(page, "ai-memory-receipt-summary");

    await clickMemoryAction(page, "ai-memory-clear-chat");
    await waitForText(page, "ai-memory-chat-summary", "0 saved text conversations, 0 voice sessions, and 0 legacy messages.");
    await clickMemoryAction(page, "ai-memory-reset-profile");
    await page.waitForFunction(() => (document.querySelector('[data-testid="ai-memory-persona-name"]') as HTMLInputElement | null)?.value === "NOVA", { timeout: 30_000 });
    await waitForText(page, "ai-memory-profile-summary", "No generated assistant profile is stored.");
    await clickMemoryAction(page, "ai-memory-clear-context");
    await clickMemoryAction(page, "ai-memory-clear-actions");
    await waitForText(page, "ai-memory-receipt-summary", "0 context-source receipts and 0 action receipts.");
    const personaResetName = await page.$eval('[data-testid="ai-memory-persona-name"]', (input) => (input as HTMLInputElement).value);
    const finalChatSummary = await textAt(page, "ai-memory-chat-summary");
    const finalReceiptSummary = await textAt(page, "ai-memory-receipt-summary");
    const rendered = await auditPage(page);
    const memory = await request("GET", "/api/account/ai-memory", undefined, account.cookie);
    assert(memory.status === 200, `Final AI-memory read returned ${memory.status}.`);
    assert(memory.body.conversationCount === 0 && memory.body.voiceSessionCount === 0 && memory.body.legacyMessageCount === 0, "Rendered chat erasure did not reconcile to the owner API.");
    assert(memory.body.contextReceiptCount === 0 && memory.body.actionReceiptCount === 0, "Rendered receipt erasure did not reconcile to the owner API.");
    assert(memory.body.affirmationStored === false && memory.body.profileContextStored === false, "Rendered profile reset did not reconcile to the owner API.");
    assert(memory.body.boundaries?.nativeMessagesIncluded === false && memory.body.boundaries?.externalSendingEnabled === false && memory.body.boundaries?.crossProductMemoryDefault === "off" && memory.body.boundaries?.contextReceiptsContainRawValues === false, "AI-memory privacy boundaries drifted.");
    assert(rendered.mainCount === 1 && rendered.duplicateIds.length === 0 && rendered.unlabeledControls.length === 0 && rendered.horizontalOverflowPx <= 2, `${viewport.name} failed AI-memory semantics or overflow checks.`);
    assert(Object.values(signals).every((items) => items.length === 0), `${viewport.name} produced application errors: ${JSON.stringify(signals)}.`);

    view = {
      viewport: viewport.name,
      initialChatSummary,
      initialReceiptSummary,
      retainedChatSummary,
      retainedReceiptSummary,
      finalChatSummary,
      finalReceiptSummary,
      personaResetName,
      privateContentAbsent,
      memoryBoundaries: memory.body.boundaries,
      ...rendered,
      signals,
    };
  } catch (error) {
    failure = error;
  } finally {
    if (context) await context.close().catch(() => undefined);
    if (account.cookie) cleanup = await eraseAccount(account, viewport.name);
  }
  if (failure) throw new Error(`${safeError(failure)}; accountErased=${cleanup.accountErased}`);
  assert(view && cleanup.accountErased, `${viewport.name} did not complete the rendered journey and verified account erasure.`);
  return { view, cleanup };
}

async function main(): Promise<void> {
  assert(BASE_URL.origin === "https://lyfeos.net", "Production AI-memory acceptance may target only https://lyfeos.net.");
  assert(/^[0-9a-f]{40}$/.test(SOURCE), "Production AI-memory acceptance requires the exact deployed source revision.");
  assert(/^[0-9a-f]{40}$/.test(HARNESS_SOURCE), "Production AI-memory acceptance requires the exact harness source revision.");
  const release = await request("GET", "/api/release");
  assert(release.status === 200 && release.body?.sourceRevision === SOURCE, "Production AI-memory runtime does not match the requested immutable source.");
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
      contract: "lyfeos.production-ai-memory-browser.v1",
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL.origin,
      sourceRevision: SOURCE,
      harnessSource: HARNESS_SOURCE,
      views,
      cleanups,
      summary: { passed, failure },
      boundary: "Disposable production-account Chromium evidence for privacy-bound AI memory. It proves owner-API creation of a conversation, typed voice reflection and generated profile; metadata-only rendered summaries; policy changes; scoped rendered clearing; NOVA identity reset; owner-API reconciliation; responsive semantics; and verified account/session/identifier erasure. It does not exercise model providers, context/action receipts, age-based expiry, native Messages, cross-product memory, human assistive technology, real devices or longitudinal comprehension.",
    };
    await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    if (process.env.GITHUB_STEP_SUMMARY) {
      await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, [
        "## LyfeOS production AI-memory acceptance",
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
    if (!passed && !failure) failure = "Production AI-memory acceptance did not satisfy every rendered, API and cleanup invariant.";
  }
  if (failure) throw new Error(failure);
}

main().catch((error) => {
  console.error(safeError(error));
  process.exitCode = 1;
});
