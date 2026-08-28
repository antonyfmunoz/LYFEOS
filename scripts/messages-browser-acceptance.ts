import { access } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import puppeteer, { type Browser, type BrowserContext, type Page, type Viewport } from "puppeteer-core";

type ApiResult = { status: number; body: any; cookie: string };
type FixtureAccount = { id: number; displayName: string; email: string; password: string; cookie: string };
type BrowserSignals = { consoleErrors: string[]; pageErrors: string[]; failedRequests: string[]; serverErrors: string[] };
type ViewResult = {
  account: "sender" | "recipient";
  viewport: string;
  mainCount: number;
  duplicateIds: string[];
  unlabeledControls: string[];
  horizontalOverflowPx: number;
  renderedMessageCount: number;
};

const BASE_URL = new URL(process.env.LYFEOS_TEST_API_URL || "http://127.0.0.1:5099");
const DATABASE_URL = process.env.DATABASE_URL?.trim() || "";
const OUTPUT_DIR = path.resolve(process.env.LYFEOS_MESSAGES_OUTPUT_DIR || path.join(os.tmpdir(), "lyfeos-messages-browser"));
const OUTPUT_FILE = path.join(OUTPUT_DIR, "report.json");
const FIXTURE_ID = randomUUID();
const LABEL = FIXTURE_ID.slice(0, 8);
const PASSWORD = "TestPass123!";
const INITIAL_MESSAGE = `[AUTOMATED ACCEPTANCE] Rendered message ${LABEL}`;
const EDITED_MESSAGE = `[AUTOMATED ACCEPTANCE] Edited message ${LABEL}`;
const REPLY_MESSAGE = `[AUTOMATED ACCEPTANCE] Rendered reply ${LABEL}`;
const PRIVATE_NOTE = `[AUTOMATED ACCEPTANCE] Private note ${LABEL}`;
const VIEWPORTS: Array<{ name: string; value: Viewport }> = [
  { name: "desktop-1440x900", value: { width: 1440, height: 900, deviceScaleFactor: 1 } },
  { name: "mobile-390x844", value: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function safeError(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error);
  for (const value of [FIXTURE_ID, INITIAL_MESSAGE, EDITED_MESSAGE, REPLY_MESSAGE, PRIVATE_NOTE]) message = message.replaceAll(value, "[redacted fixture]");
  return message.slice(0, 1_000);
}

async function request(method: string, pathname: string, body?: unknown, cookie = ""): Promise<ApiResult> {
  const response = await fetch(new URL(pathname, BASE_URL), {
    method,
    headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https", ...(cookie ? { Cookie: cookie } : {}) },
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
  throw new Error("No Chromium executable found for isolated Messages acceptance.");
}

function cookieParts(cookie: string): { name: string; value: string } {
  const separator = cookie.indexOf("=");
  assert(separator > 0, "Registration did not return a usable session cookie.");
  return { name: cookie.slice(0, separator), value: cookie.slice(separator + 1) };
}

async function poll<T>(read: () => Promise<T>, accept: (value: T) => boolean, message: string, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T;
  while (Date.now() < deadline) {
    last = await read();
    if (accept(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(message);
}

async function waitForText(page: Page, text: string, timeout = 30_000): Promise<void> {
  await page.waitForFunction((expected) => document.body?.innerText.includes(expected), { timeout }, text);
}

async function clickText(page: Page, selector: string, text: string): Promise<void> {
  await page.waitForFunction(
    (candidateSelector, expected) => [...document.querySelectorAll<HTMLElement>(candidateSelector)].some((element) => element.innerText.trim() === expected),
    { timeout: 30_000 },
    selector,
    text,
  );
  await page.evaluate((candidateSelector, expected) => {
    const element = [...document.querySelectorAll<HTMLElement>(candidateSelector)].find((candidate) => candidate.innerText.trim() === expected);
    if (!element) throw new Error(`Rendered control ${expected} disappeared.`);
    element.click();
  }, selector, text);
}

async function clickSelector(page: Page, selector: string): Promise<void> {
  await page.waitForSelector(selector, { timeout: 30_000 });
  await page.$eval(selector, (element) => (element as HTMLElement).click());
}

async function replaceInput(page: Page, selector: string, value: string): Promise<void> {
  await page.waitForSelector(selector, { visible: true, timeout: 30_000 });
  await page.click(selector);
  await page.keyboard.down("Control");
  await page.keyboard.press("A");
  await page.keyboard.up("Control");
  await page.keyboard.type(value);
}

function captureBrowserSignals(page: Page): BrowserSignals {
  const signals: BrowserSignals = { consoleErrors: [], pageErrors: [], failedRequests: [], serverErrors: [] };
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

async function createAccount(label: string): Promise<FixtureAccount> {
  const account: FixtureAccount = {
    id: 0,
    displayName: `msg_browser_${label}_${LABEL}`,
    email: `msg_browser_${label}_${LABEL}@example.com`,
    password: PASSWORD,
    cookie: "",
  };
  const registration = await request("POST", "/api/auth/complete-registration", {
    email: account.email,
    password: account.password,
    displayName: account.displayName,
    termsAccepted: true,
  });
  assert(registration.status === 201, `${label} registration returned ${registration.status}.`);
  account.id = Number(registration.body.user?.id);
  account.cookie = registration.cookie;
  assert(Number.isInteger(account.id) && account.id > 0 && account.cookie, `${label} registration did not create an isolated owner and session.`);
  const onboarding = await request("PATCH", "/api/profile", { onboardingCompleted: true }, account.cookie);
  assert(onboarding.status === 200 && onboarding.body?.onboardingCompleted === true, `${label} onboarding setup returned ${onboarding.status}.`);
  return account;
}

async function createPage(browser: Browser, account: FixtureAccount): Promise<{ context: BrowserContext; page: Page; signals: BrowserSignals }> {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const signals = captureBrowserSignals(page);
  const session = cookieParts(account.cookie);
  await page.setCookie({ ...session, url: BASE_URL.origin, path: "/", httpOnly: true, secure: false, sameSite: "Lax" });
  await page.evaluateOnNewDocument((fixtureUser) => localStorage.setItem("lyfeos_user", JSON.stringify(fixtureUser)), { id: account.id, displayName: account.displayName });
  await page.setCacheEnabled(false);
  return { context, page, signals };
}

async function openMessages(page: Page): Promise<void> {
  await page.goto(new URL("/messages", BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitForText(page, "Native private communication");
}

async function inspectView(page: Page, account: "sender" | "recipient", viewport: string): Promise<ViewResult> {
  return page.evaluate(({ accountName, viewportName }) => {
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
      account: accountName,
      viewport: viewportName,
      mainCount: document.querySelectorAll("main").length,
      duplicateIds,
      unlabeledControls,
      horizontalOverflowPx: Math.max(0, documentWidth - window.innerWidth),
      renderedMessageCount: document.querySelectorAll("[data-message-id]").length,
    };
  }, { accountName: account, viewportName: viewport });
}

async function main(): Promise<void> {
  assert(process.env.LYFEOS_TEST_ENV === "isolated", "Rendered Messages acceptance is restricted to an explicit isolated environment.");
  assert(["127.0.0.1", "localhost"].includes(BASE_URL.hostname), "Rendered Messages acceptance may target only localhost.");
  assert(DATABASE_URL.length > 0, "Rendered Messages acceptance requires disposable PostgreSQL.");
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const accounts: FixtureAccount[] = [];
  let browser: Browser | null = null;
  let senderContext: BrowserContext | null = null;
  let recipientContext: BrowserContext | null = null;
  let conversationId = "";
  let initialMessageId = "";
  let replyMessageId = "";
  let readReceiptRendered = false;
  let reactionRendered = false;
  let replyRendered = false;
  let editRendered = false;
  let privateNoteOwnerOnly = false;
  let blockLifecycleRendered = false;
  let accountErased = false;
  let residualCounts = { users: -1, conversations: -1, participants: -1, messages: -1, notes: -1, reactions: -1, receipts: -1 };
  const views: ViewResult[] = [];
  const signals: BrowserSignals[] = [];
  let failure: string | null = null;

  try {
    const sender = await createAccount("sender");
    const recipient = await createAccount("recipient");
    accounts.push(sender, recipient);

    browser = await puppeteer.launch({
      executablePath: await findChromium(),
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--no-proxy-server"],
    });
    const senderBrowser = await createPage(browser, sender);
    senderContext = senderBrowser.context;
    signals.push(senderBrowser.signals);
    const senderPage = senderBrowser.page;
    await senderPage.setViewport(VIEWPORTS[0].value);
    await openMessages(senderPage);

    await replaceInput(senderPage, '[aria-label="Find a LyfeOS user"]', recipient.displayName);
    await clickText(senderPage, "button", `+ ${recipient.displayName}`);
    await clickText(senderPage, "button", "New");
    const listAfterCreate = await poll(
      () => request("GET", "/api/message-hub/conversations?status=open", undefined, sender.cookie),
      (result) => result.status === 200 && result.body.conversations?.some((conversation: any) => conversation.participants?.some((participant: any) => participant.id === recipient.id)),
      "Rendered conversation creation did not converge in the owner API.",
    );
    conversationId = listAfterCreate.body.conversations.find((conversation: any) => conversation.participants.some((participant: any) => participant.id === recipient.id)).id;
    await senderPage.waitForSelector(`[data-testid="messages-conversation-${conversationId}"]`, { timeout: 30_000 });

    await replaceInput(senderPage, '[data-testid="native-message-composer"]', INITIAL_MESSAGE);
    await clickSelector(senderPage, '[aria-label="Send message"]');
    const initialDetail = await poll(
      () => request("GET", `/api/message-hub/conversations/${conversationId}`, undefined, sender.cookie),
      (result) => result.status === 200 && result.body.conversation?.messages?.some((message: any) => message.body === INITIAL_MESSAGE),
      "Rendered initial send did not converge in the owner API.",
    );
    initialMessageId = initialDetail.body.conversation.messages.find((message: any) => message.body === INITIAL_MESSAGE).id;
    await senderPage.waitForSelector(`[data-testid="native-message-${initialMessageId}"]`, { timeout: 30_000 });

    const recipientBrowser = await createPage(browser, recipient);
    recipientContext = recipientBrowser.context;
    signals.push(recipientBrowser.signals);
    const recipientPage = recipientBrowser.page;
    await recipientPage.setViewport(VIEWPORTS[0].value);
    await openMessages(recipientPage);
    await recipientPage.waitForSelector(`[data-testid="messages-conversation-${conversationId}"]`, { timeout: 30_000 });
    await recipientPage.waitForSelector(`[data-testid="native-message-${initialMessageId}"]`, { timeout: 30_000 });
    await poll(
      () => request("GET", `/api/message-hub/conversations/${conversationId}`, undefined, sender.cookie),
      (result) => result.body.conversation?.messages?.some((message: any) => message.id === initialMessageId && message.status === "read"),
      "Opening the rendered recipient conversation did not create read evidence.",
    );
    await senderPage.reload({ waitUntil: "domcontentloaded" });
    await senderPage.waitForSelector(`[data-testid="native-message-${initialMessageId}"]`, { timeout: 30_000 });
    readReceiptRendered = (await senderPage.$eval(`[data-testid="native-message-${initialMessageId}"]`, (element) => (element as HTMLElement).innerText)).includes("read");
    assert(readReceiptRendered, "The sender UI did not render the recipient read state.");

    await clickSelector(recipientPage, `[data-testid="native-message-react-${initialMessageId}-❤️"]`);
    await recipientPage.waitForSelector(`[aria-label="❤️ reaction, 1"]`, { timeout: 30_000 });
    reactionRendered = true;

    await clickSelector(recipientPage, `[data-testid="native-message-reply-${initialMessageId}"]`);
    await waitForText(recipientPage, "Replying to:");
    await replaceInput(recipientPage, '[data-testid="native-message-composer"]', REPLY_MESSAGE);
    await clickSelector(recipientPage, '[aria-label="Send message"]');
    const recipientDetail = await poll(
      () => request("GET", `/api/message-hub/conversations/${conversationId}`, undefined, recipient.cookie),
      (result) => result.body.conversation?.messages?.some((message: any) => message.body === REPLY_MESSAGE && message.replyToMessageId === initialMessageId),
      "Rendered reply did not preserve its reference.",
    );
    replyMessageId = recipientDetail.body.conversation.messages.find((message: any) => message.body === REPLY_MESSAGE).id;
    await recipientPage.waitForSelector(`[data-testid="native-message-${replyMessageId}"]`, { timeout: 30_000 });
    replyRendered = (await recipientPage.$eval(`[data-testid="native-message-${replyMessageId}"]`, (element) => (element as HTMLElement).innerText)).includes("Reply");
    assert(replyRendered, "The recipient UI did not render the reply reference.");

    await senderPage.reload({ waitUntil: "domcontentloaded" });
    await senderPage.waitForSelector(`[data-testid="native-message-${replyMessageId}"]`, { timeout: 30_000 });
    await clickSelector(senderPage, `[data-testid="native-message-edit-${initialMessageId}"]`);
    await replaceInput(senderPage, `[data-testid="native-message-edit-input-${initialMessageId}"]`, EDITED_MESSAGE);
    await clickSelector(senderPage, `[data-testid="native-message-edit-save-${initialMessageId}"]`);
    await poll(
      () => request("GET", `/api/message-hub/conversations/${conversationId}`, undefined, sender.cookie),
      (result) => result.body.conversation?.messages?.some((message: any) => message.id === initialMessageId && message.body === EDITED_MESSAGE && message.editedAt),
      "Rendered edit did not converge with versioned edit evidence.",
    );
    await waitForText(senderPage, EDITED_MESSAGE);
    editRendered = (await senderPage.$eval(`[data-testid="native-message-${initialMessageId}"]`, (element) => (element as HTMLElement).innerText)).includes("edited");
    assert(editRendered, "The sender UI did not render the edited marker.");

    await clickText(senderPage, "button", "Private note");
    await replaceInput(senderPage, '[data-testid="native-message-composer"]', PRIVATE_NOTE);
    await clickSelector(senderPage, '[aria-label="Save private note"]');
    await waitForText(senderPage, PRIVATE_NOTE);
    const ownerWithNote = await request("GET", `/api/message-hub/conversations/${conversationId}`, undefined, sender.cookie);
    const recipientWithoutNote = await request("GET", `/api/message-hub/conversations/${conversationId}`, undefined, recipient.cookie);
    await recipientPage.reload({ waitUntil: "domcontentloaded" });
    await recipientPage.waitForSelector(`[data-testid="native-message-${initialMessageId}"]`, { timeout: 30_000 });
    privateNoteOwnerOnly = ownerWithNote.body.conversation?.notes?.some((note: any) => note.body === PRIVATE_NOTE)
      && recipientWithoutNote.body.conversation?.notes?.length === 0
      && !(await recipientPage.$eval("body", (element) => (element as HTMLElement).innerText)).includes(PRIVATE_NOTE);
    assert(privateNoteOwnerOnly, "The private note was not confined to its author.");

    await clickText(recipientPage, "button", "Block");
    await waitForText(recipientPage, "Unblock");
    await clickText(recipientPage, "button", "Unblock");
    await waitForText(recipientPage, "Block");
    const unblocked = await request("GET", `/api/message-hub/conversations/${conversationId}`, undefined, recipient.cookie);
    blockLifecycleRendered = unblocked.status === 200 && unblocked.body.conversation?.participantStatus === "active" && unblocked.body.conversation?.status === "open";
    assert(blockLifecycleRendered, "The rendered block/unblock lifecycle did not restore the active conversation.");

    for (const viewport of VIEWPORTS) {
      for (const entry of [
        { page: senderPage, account: "sender" as const, expectedMessage: EDITED_MESSAGE },
        { page: recipientPage, account: "recipient" as const, expectedMessage: EDITED_MESSAGE },
      ]) {
        await entry.page.setViewport(viewport.value);
        await entry.page.reload({ waitUntil: "domcontentloaded" });
        await entry.page.waitForSelector(`[data-testid="messages-conversation-${conversationId}"]`, { timeout: 30_000 });
        await waitForText(entry.page, entry.expectedMessage);
        const view = await inspectView(entry.page, entry.account, viewport.name);
        views.push(view);
        assert(view.mainCount === 1, `${entry.account} ${viewport.name} rendered ${view.mainCount} main landmarks.`);
        assert(view.duplicateIds.length === 0 && view.unlabeledControls.length === 0 && view.horizontalOverflowPx <= 2, `${entry.account} ${viewport.name} failed populated Messages accessibility or overflow checks.`);
        assert(view.renderedMessageCount >= 2, `${entry.account} ${viewport.name} did not render both conversation messages.`);
      }
    }
  } catch (error) {
    failure = safeError(error);
  } finally {
    if (senderContext) await senderContext.close().catch(() => undefined);
    if (recipientContext) await recipientContext.close().catch(() => undefined);
    if (browser) await browser.close().catch(() => undefined);
    for (const account of [...accounts].reverse()) {
      if (account.cookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, account.cookie).catch(() => null);
    }
    if (accounts.length && conversationId) {
      const ids = accounts.map((account) => account.id);
      const residual = await pool.query<{
        users: string; conversations: string; participants: string; messages: string; notes: string; reactions: string; receipts: string;
      }>(
        `SELECT
          (SELECT count(*)::text FROM users WHERE id = ANY($1::int[])) AS users,
          (SELECT count(*)::text FROM message_conversations WHERE id = $2::uuid) AS conversations,
          (SELECT count(*)::text FROM message_conversation_participants WHERE conversation_id = $2::uuid OR user_id = ANY($1::int[])) AS participants,
          (SELECT count(*)::text FROM conversation_messages WHERE conversation_id = $2::uuid OR sender_user_id = ANY($1::int[])) AS messages,
          (SELECT count(*)::text FROM message_internal_notes WHERE conversation_id = $2::uuid OR author_user_id = ANY($1::int[])) AS notes,
          (SELECT count(*)::text FROM message_reactions WHERE user_id = ANY($1::int[]) OR message_id IN (SELECT id FROM conversation_messages WHERE conversation_id = $2::uuid)) AS reactions,
          (SELECT count(*)::text FROM message_delivery_receipts WHERE recipient_user_id = ANY($1::int[]) OR message_id IN (SELECT id FROM conversation_messages WHERE conversation_id = $2::uuid)) AS receipts`,
        [ids, conversationId],
      );
      residualCounts = Object.fromEntries(Object.entries(residual.rows[0] || {}).map(([key, value]) => [key, Number(value)])) as typeof residualCounts;
      accountErased = Object.values(residualCounts).every((count) => count === 0);
    }
    await pool.end();

    const allSignals = signals.reduce<BrowserSignals>((combined, current) => ({
      consoleErrors: [...combined.consoleErrors, ...current.consoleErrors],
      pageErrors: [...combined.pageErrors, ...current.pageErrors],
      failedRequests: [...combined.failedRequests, ...current.failedRequests],
      serverErrors: [...combined.serverErrors, ...current.serverErrors],
    }), { consoleErrors: [], pageErrors: [], failedRequests: [], serverErrors: [] });
    const browserClean = Object.values(allSignals).every((items) => items.length === 0);
    const passed = failure === null
      && readReceiptRendered
      && reactionRendered
      && replyRendered
      && editRendered
      && privateNoteOwnerOnly
      && blockLifecycleRendered
      && views.length === 4
      && browserClean
      && accountErased;
    const report = {
      contract: "lyfeos.isolated-messages-browser.v1",
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL.origin,
      fixture: { conversationId, initialMessageId, replyMessageId, accountCount: accounts.length },
      lifecycle: { readReceiptRendered, reactionRendered, replyRendered, editRendered, privateNoteOwnerOnly, blockLifecycleRendered },
      views,
      browserSignals: allSignals,
      cleanup: { accountErased, residualCounts },
      summary: { passed, failure },
      boundary: "Disposable isolated PostgreSQL plus Chromium evidence for the native LyfeOS Messages UI. It proves rendered two-account delivery, read evidence, reaction, reply, edit, author-only note, block/unblock, responsive semantics and complete fixture erasure. It is not external-provider delivery, a production-account journey, or human assistive-technology comprehension.",
    };
    await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ contract: report.contract, passed, viewCount: views.length, lifecycle: report.lifecycle, accountErased }));
    if (!passed && !failure) failure = "Rendered Messages acceptance did not satisfy every lifecycle, browser and cleanup invariant.";
  }

  if (failure) throw new Error(failure);
}

main().catch((error) => {
  console.error(safeError(error));
  process.exitCode = 1;
});
