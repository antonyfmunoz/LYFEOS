import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { access } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import pg from "pg";
import puppeteer, { type Browser, type Page, type Viewport } from "puppeteer-core";

type ApiResult = { status: number; body: any; cookie: string };
type ViewResult = {
  viewport: string;
  initialChatSummary: string;
  initialReceiptSummary: string;
  retainedChatSummary: string;
  retainedReceiptSummary: string;
  finalChatSummary: string;
  finalReceiptSummary: string;
  personaResetName: string;
  activeReceiptDisclosure: boolean;
  duplicateIds: string[];
  unlabeledControls: string[];
  horizontalOverflowPx: number;
  failedRequests: string[];
  consoleErrors: string[];
  isolatedProviderResourceErrors: string[];
};

const BASE_URL = new URL(process.env.LYFEOS_TEST_API_URL || "http://127.0.0.1:5099");
const DATABASE_URL = process.env.DATABASE_URL?.trim() || "";
const OUTPUT_DIR = path.resolve(process.env.LYFEOS_AI_MEMORY_OUTPUT_DIR || path.join(os.tmpdir(), "lyfeos-ai-memory-browser"));
const OUTPUT_FILE = path.join(OUTPUT_DIR, "report.json");
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
    .slice(0, 1_000);
}

async function request(method: string, pathname: string, body?: unknown, cookie = ""): Promise<ApiResult> {
  const response = await fetch(new URL(pathname, BASE_URL), {
    method,
    signal: AbortSignal.timeout(20_000),
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-Proto": "https",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
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
  throw new Error("No Chromium executable found for isolated AI-memory acceptance.");
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

async function waitForBodyText(page: Page, expected: string): Promise<void> {
  await page.waitForFunction((text) => document.body.innerText.includes(text), { timeout: 30_000 }, expected);
}

async function selectPolicy(page: Page, testId: string, value: string): Promise<void> {
  const selector = `[data-testid="${testId}"]`;
  await page.waitForSelector(selector, { visible: true, timeout: 30_000 });
  const [response] = await Promise.all([
    page.waitForResponse((candidate) => candidate.request().method() === "PATCH" && new URL(candidate.url()).pathname === "/api/account/ai-memory-policy", { timeout: 30_000 }),
    page.select(selector, value),
  ]);
  assert(response.status() === 200, `Memory-policy control ${testId} returned ${response.status()}.`);
  try {
    await page.waitForFunction(
      ({ selector, expected }) => (document.querySelector(selector) as HTMLSelectElement | null)?.value === expected,
      { timeout: 30_000 },
      { selector, expected: value },
    );
  } catch {
    const current = await page.$eval(selector, (element) => (element as HTMLSelectElement).value);
    throw new Error(`${testId} did not settle at ${value}; current value is ${current}.`);
  }
}

async function clickMemoryAction(page: Page, testId: string): Promise<void> {
  const [response] = await Promise.all([
    page.waitForResponse((candidate) => candidate.request().method() === "DELETE" && new URL(candidate.url()).pathname === "/api/account/ai-memory", { timeout: 30_000 }),
    page.$eval(`[data-testid="${testId}"]`, (element) => {
      const button = element as HTMLButtonElement;
      if (button.disabled) throw new Error(`${button.dataset.testid || "AI-memory control"} is disabled.`);
      button.click();
    }),
  ]);
  assert(response.status() === 200, `AI-memory control ${testId} returned ${response.status()}.`);
}

async function seedMemory(pool: pg.Pool, userId: number): Promise<number> {
  const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1_000);
  const current = new Date();
  const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1_000);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const oldConversation = await client.query<{ id: number }>(
      `INSERT INTO conversations (user_id, title, created_at) VALUES ($1, $2, $3) RETURNING id`,
      [userId, "Expired fixture", old],
    );
    const currentConversation = await client.query<{ id: number }>(
      `INSERT INTO conversations (user_id, title, created_at) VALUES ($1, $2, $3) RETURNING id`,
      [userId, "Current fixture", current],
    );
    await client.query(
      `INSERT INTO messages (conversation_id, role, content, created_at) VALUES ($1, 'user', $3, $4), ($2, 'assistant', $3, $5)`,
      [oldConversation.rows[0].id, currentConversation.rows[0].id, PRIVATE_MARKER, old, current],
    );
    await client.query(
      `INSERT INTO ai_messages (user_id, sender, content, timestamp) VALUES ($1, 'user', $2, $3), ($1, 'ai', $2, $4)`,
      [userId, PRIVATE_MARKER, old, current],
    );
    await client.query(
      `INSERT INTO ai_voice_sessions (user_id, title, purpose, status, transcript_started_at, ended_at, created_at, updated_at)
       VALUES
         ($1, 'Expired completed voice', 'meeting', 'completed', $2, $2, $2, $2),
         ($1, 'Current completed voice', 'meeting', 'completed', $3, $3, $3, $3),
         ($1, 'Active voice', 'command', 'active', $2, NULL, $2, $2)`,
      [userId, old, current],
    );
    await client.query(
      `INSERT INTO ai_context_receipts (user_id, purpose, sources, disclosure, created_at, expires_at)
       VALUES ($1, 'expired-fixture', '[]'::jsonb, 'Metadata only.', $2, $2), ($1, 'current-fixture', '[]'::jsonb, 'Metadata only.', $3, $4)`,
      [userId, old, current, future],
    );
    const actionRows = await client.query<{ id: number; state: string }>(
      `INSERT INTO ai_action_records (user_id, tool_name, risk, state, input_summary, planning_context_snapshot, created_at, completed_at)
       VALUES
         ($1, 'lookup_knowledge_base', 'read', 'succeeded', '{}'::jsonb, '{}'::jsonb, $2, $2),
         ($1, 'lookup_knowledge_base', 'read', 'started', '{}'::jsonb, '{}'::jsonb, $2, NULL),
         ($1, 'lookup_knowledge_base', 'read', 'succeeded', '{}'::jsonb, '{}'::jsonb, $3, $3)
       RETURNING id, state`,
      [userId, old, current],
    );
    await client.query(
      `UPDATE user_profile SET character_affirmation = $2, ai_personality_profile = '{"fixture":true}'::jsonb, updated_at = now() WHERE user_id = $1`,
      [userId, PRIVATE_MARKER],
    );
    await client.query("COMMIT");
    const active = actionRows.rows.find((row) => row.state === "started");
    assert(active, "The memory fixture did not create an active action receipt.");
    return active.id;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function auditRenderedPage(page: Page): Promise<Pick<ViewResult, "duplicateIds" | "unlabeledControls" | "horizontalOverflowPx">> {
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
    return { duplicateIds, unlabeledControls, horizontalOverflowPx: Math.max(0, documentWidth - window.innerWidth) };
  });
}

async function runViewport(browser: Browser, pool: pg.Pool, viewport: { name: string; value: Viewport }, ordinal: number): Promise<{ view: ViewResult; userId: number; erased: boolean }> {
  const stamp = `${Date.now()}_${ordinal}_${randomUUID().slice(0, 8)}`;
  const email = `ai_memory_browser_${stamp}@example.com`;
  const displayName = `ai_memory_browser_${ordinal}_${stamp.slice(-8)}`;
  let cookie = "";
  let userId = 0;
  let erased = false;
  const failedRequests: string[] = [];
  const consoleErrors: string[] = [];
  const isolatedProviderResourceErrors: string[] = [];
  const page = await browser.newPage();
  try {
    const registration = await request("POST", "/api/auth/complete-registration", { email, password: PASSWORD, displayName, termsAccepted: true });
    assert(registration.status === 201, `Registration returned ${registration.status}.`);
    cookie = registration.cookie;
    userId = Number(registration.body.user?.id);
    assert(Number.isInteger(userId) && userId > 0 && cookie, "Registration did not create the isolated owner and session.");
    const onboarding = await request("PATCH", "/api/profile", { onboardingCompleted: true }, cookie);
    assert(onboarding.status === 200, `Onboarding fixture setup returned ${onboarding.status}.`);

    const persona = await request("GET", "/api/ai/persona", undefined, cookie);
    assert(persona.status === 200, `Persona initialization returned ${persona.status}.`);
    const named = await request("PUT", "/api/ai/persona", {
      name: "Atlas",
      interactionStyle: { tone: "direct" },
      ecosystemSharingEnabled: false,
      allowedDestinations: [],
      expectedRevision: persona.body.persona.revision,
    }, cookie);
    assert(named.status === 200, `Persona naming returned ${named.status}.`);
    const policy = await request("GET", "/api/account/ai-memory-policy", undefined, cookie);
    assert(policy.status === 200 && policy.body.policy.revision === 1, `Memory-policy initialization returned ${policy.status}.`);
    const activeActionId = await seedMemory(pool, userId);

    const session = cookieParts(cookie);
    await page.setCookie({ ...session, url: BASE_URL.origin, path: "/", httpOnly: true, secure: false, sameSite: "Lax" });
    await page.evaluateOnNewDocument((fixtureUser) => {
      localStorage.setItem("lyfeos_user", JSON.stringify(fixtureUser));
    }, { id: userId, displayName });
    await page.setViewport(viewport.value);
    await page.setCacheEnabled(false);
    page.on("console", (message) => {
      if (message.type() === "error") {
        const source = message.location().url;
        const detail = `${message.text().slice(0, 240)}${source ? ` @ ${source}` : ""}`;
        if (message.text().includes("net::ERR_NAME_NOT_RESOLVED") && source.startsWith("https://local.lyfeos.dev/npm/@clerk/clerk-js@5/")) isolatedProviderResourceErrors.push(detail);
        else consoleErrors.push(detail);
      }
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message.slice(0, 300)));
    page.on("response", (response) => {
      if (response.status() >= 500 && new URL(response.url()).origin === BASE_URL.origin) failedRequests.push(`${response.status()} ${new URL(response.url()).pathname}`);
    });

    await page.goto(new URL("/profile", BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector('[data-testid="ai-memory-settings"]', { visible: true, timeout: 60_000 });
    await waitForText(page, "ai-memory-chat-summary", "2 saved text conversations, 3 voice sessions, and 2 legacy messages.");
    await waitForText(page, "ai-memory-receipt-summary", "2 context-source receipts and 3 action receipts.");
    await waitForText(page, "ai-memory-profile-summary", "A generated assistant profile is stored.");
    const initialChatSummary = await textAt(page, "ai-memory-chat-summary");
    const initialReceiptSummary = await textAt(page, "ai-memory-receipt-summary");
    assert(!(await page.$eval('[data-testid="ai-memory-settings"]', (section, marker) => (section as HTMLElement).innerText.includes(marker), PRIVATE_MARKER)), "The AI-memory control surface exposed private memory contents.");

    await selectPolicy(page, "ai-memory-retention-chats", "30");
    await waitForText(page, "ai-memory-chat-summary", "1 saved text conversations, 2 voice sessions, and 1 legacy messages.");
    await waitForText(page, "ai-memory-receipt-summary", "1 context-source receipts and 2 action receipts.");
    await selectPolicy(page, "ai-memory-retention-context", "30");
    await selectPolicy(page, "ai-memory-retention-actions", "90");
    const retainedChatSummary = await textAt(page, "ai-memory-chat-summary");
    const retainedReceiptSummary = await textAt(page, "ai-memory-receipt-summary");

    await clickMemoryAction(page, "ai-memory-clear-chat");
    await waitForText(page, "ai-memory-chat-summary", "0 saved text conversations, 0 voice sessions, and 0 legacy messages.");
    await clickMemoryAction(page, "ai-memory-reset-profile");
    await page.waitForFunction(() => (document.querySelector('[data-testid="ai-memory-persona-name"]') as HTMLInputElement | null)?.value === "NOVA", { timeout: 30_000 });
    await waitForText(page, "ai-memory-profile-summary", "No generated assistant profile is stored.");
    const personaResetName = await page.$eval('[data-testid="ai-memory-persona-name"]', (input) => (input as HTMLInputElement).value);
    await clickMemoryAction(page, "ai-memory-clear-context");
    await waitForText(page, "ai-memory-receipt-summary", "0 context-source receipts and 2 action receipts.");
    await clickMemoryAction(page, "ai-memory-clear-actions");
    await waitForText(page, "ai-memory-receipt-summary", "0 context-source receipts and 1 action receipts.");
    await waitForBodyText(page, "1 active action receipt will remain until execution finishes.");
    const activeReceiptDisclosure = (await page.$eval("body", (body) => body.innerText)).includes("1 active action receipt will remain until execution finishes.");

    await pool.query(`UPDATE ai_action_records SET state = 'failed', completed_at = now() WHERE id = $1 AND user_id = $2`, [activeActionId, userId]);
    await clickMemoryAction(page, "ai-memory-clear-actions");
    await waitForText(page, "ai-memory-receipt-summary", "0 context-source receipts and 0 action receipts.");
    const finalChatSummary = await textAt(page, "ai-memory-chat-summary");
    const finalReceiptSummary = await textAt(page, "ai-memory-receipt-summary");
    const rendered = await auditRenderedPage(page);

    assert(rendered.duplicateIds.length === 0, `Rendered ${viewport.name} Profile has duplicate IDs: ${rendered.duplicateIds.join(", ")}.`);
    assert(rendered.unlabeledControls.length === 0, `Rendered ${viewport.name} Profile has unlabeled controls: ${rendered.unlabeledControls.join(", ")}.`);
    assert(rendered.horizontalOverflowPx <= 2, `Rendered ${viewport.name} Profile overflows horizontally by ${rendered.horizontalOverflowPx}px.`);
    assert(failedRequests.length === 0, `Rendered ${viewport.name} Profile received server failures: ${failedRequests.join(", ")}.`);
    assert(consoleErrors.length === 0, `Rendered ${viewport.name} Profile logged errors: ${consoleErrors.join(" | ")}.`);

    const finalState = await pool.query(
      `SELECT
        (SELECT count(*)::int FROM conversations WHERE user_id = $1) AS conversations,
        (SELECT count(*)::int FROM ai_messages WHERE user_id = $1) AS legacy_messages,
        (SELECT count(*)::int FROM ai_voice_sessions WHERE user_id = $1) AS voice_sessions,
        (SELECT count(*)::int FROM ai_context_receipts WHERE user_id = $1) AS context_receipts,
        (SELECT count(*)::int FROM ai_action_records WHERE user_id = $1) AS action_records,
        (SELECT count(*)::int FROM ai_persona_profiles WHERE user_id = $1 AND name = 'NOVA' AND ecosystem_sharing_enabled = false) AS default_personas,
        (SELECT count(*)::int FROM user_profile WHERE user_id = $1 AND character_affirmation IS NULL AND ai_personality_profile = '{}'::jsonb AND affirmation_auto_generation_enabled = false) AS reset_profiles,
        (SELECT count(*)::int FROM user_stats WHERE user_id = $1 AND ai_assistant_name = 'NOVA') AS reset_stats`,
      [userId],
    );
    assert(JSON.stringify(finalState.rows[0]) === JSON.stringify({ conversations: 0, legacy_messages: 0, voice_sessions: 0, context_receipts: 0, action_records: 0, default_personas: 1, reset_profiles: 1, reset_stats: 1 }), `Final AI-memory state did not match the rendered controls: ${JSON.stringify(finalState.rows[0])}.`);

    await page.close();
    const deletion = await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, cookie);
    assert(deletion.status === 200, `Account erasure returned ${deletion.status}.`);
    erased = true;
    const residues = await pool.query(
      `SELECT
        (SELECT count(*)::int FROM users WHERE id = $1) AS users,
        (SELECT count(*)::int FROM conversations WHERE user_id = $1) AS conversations,
        (SELECT count(*)::int FROM ai_messages WHERE user_id = $1) AS legacy_messages,
        (SELECT count(*)::int FROM ai_voice_sessions WHERE user_id = $1) AS voice_sessions,
        (SELECT count(*)::int FROM ai_context_receipts WHERE user_id = $1) AS context_receipts,
        (SELECT count(*)::int FROM ai_action_records WHERE user_id = $1) AS action_records,
        (SELECT count(*)::int FROM ai_persona_profiles WHERE user_id = $1) AS persona_profiles,
        (SELECT count(*)::int FROM ai_memory_policies WHERE user_id = $1) AS memory_policies`,
      [userId],
    );
    assert(Object.values(residues.rows[0]).every((value) => value === 0), `Account cleanup left AI-memory residue: ${JSON.stringify(residues.rows[0])}.`);

    return {
      userId,
      erased,
      view: {
        viewport: viewport.name,
        initialChatSummary,
        initialReceiptSummary,
        retainedChatSummary,
        retainedReceiptSummary,
        finalChatSummary,
        finalReceiptSummary,
        personaResetName,
        activeReceiptDisclosure,
        ...rendered,
        failedRequests,
        consoleErrors,
        isolatedProviderResourceErrors,
      },
    };
  } finally {
    if (!page.isClosed()) await page.close().catch(() => undefined);
    if (cookie && userId && !erased) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, cookie).catch(() => undefined);
  }
}

async function main(): Promise<void> {
  assert(process.env.LYFEOS_TEST_ENV === "isolated", "Rendered AI-memory acceptance is restricted to an explicit isolated environment.");
  assert(["127.0.0.1", "localhost"].includes(BASE_URL.hostname), "Rendered AI-memory acceptance may target only localhost.");
  assert(DATABASE_URL.length > 0, "Rendered AI-memory acceptance requires disposable PostgreSQL.");
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  let browser: Browser | null = null;
  const views: ViewResult[] = [];
  let failure: string | null = null;
  try {
    browser = await puppeteer.launch({
      executablePath: await findChromium(),
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--no-proxy-server"],
    });
    for (const [index, viewport] of VIEWPORTS.entries()) {
      const result = await runViewport(browser, pool, viewport, index + 1);
      assert(result.erased, `${viewport.name} did not erase its disposable account.`);
      views.push(result.view);
    }
  } catch (error) {
    failure = safeError(error);
    throw error;
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    await pool.end();
    await fs.writeFile(OUTPUT_FILE, JSON.stringify({
      schema: "lyfeos.ai-memory-browser-acceptance.v1",
      createdAt: new Date().toISOString(),
      status: failure ? "failed" : "passed",
      sourceRevision: process.env.GITHUB_SHA || process.env.LYFEOS_RELEASE || "local",
      boundary: "Disposable localhost PostgreSQL and Chromium only. Synthetic AI memory is retained, purged, rendered, reset, erased, and checked for residue without using a model provider or production account.",
      views,
      accountCleanup: failure ? "attempted" : "verified-zero-residue",
      failure,
    }, null, 2));
  }
}

main().catch((error) => {
  console.error(safeError(error));
  process.exitCode = 1;
});
