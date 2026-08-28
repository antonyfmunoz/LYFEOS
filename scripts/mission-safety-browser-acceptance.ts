import { access } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import puppeteer, { type Browser, type BrowserContext, type Page, type Viewport } from "puppeteer-core";

type ApiResult = { status: number; body: any; cookie: string };
type FixtureAccount = { id: number; displayName: string; email: string; cookie: string };
type BrowserSignals = { consoleErrors: string[]; pageErrors: string[]; failedRequests: string[]; serverErrors: string[]; isolatedProviderErrors: string[] };
type ViewResult = {
  viewport: string;
  mainCount: number;
  duplicateIds: string[];
  unlabeledControls: string[];
  horizontalOverflowPx: number;
  renderedRevision: number;
  acceptedStateRendered: boolean;
  prerequisiteCompleteRendered: boolean;
  noAuthorityBoundaryRendered: boolean;
};

const BASE_URL = new URL(process.env.LYFEOS_TEST_API_URL || "http://127.0.0.1:5099");
const DATABASE_URL = process.env.DATABASE_URL?.trim() || "";
const OUTPUT_DIR = path.resolve(process.env.LYFEOS_MISSION_SAFETY_OUTPUT_DIR || path.join(os.tmpdir(), "lyfeos-mission-safety-browser"));
const OUTPUT_FILE = path.join(OUTPUT_DIR, "report.json");
const FIXTURE_ID = randomUUID();
const LABEL = FIXTURE_ID.slice(0, 8);
const PASSWORD = "TestPass123!";
const MISSION_TITLE = `[AUTOMATED ACCEPTANCE] Consequential plan ${LABEL}`;
const PREREQUISITE_TITLE = `[AUTOMATED ACCEPTANCE] Prerequisite ${LABEL}`;
const PURPOSE = "Make one consequential commitment only after an explicit downside review.";
const INITIAL_OUTPUT = "A reviewed commitment with a bounded scope and written decision receipt.";
const REVISED_OUTPUT = "A narrower commitment with a separate limit and fresh decision receipt.";
const REQUIRED_EVIDENCE = "A written decision receipt that matches the accepted revision.";
const VIEWPORTS: Array<{ name: string; value: Viewport }> = [
  { name: "desktop-1440x900", value: { width: 1440, height: 900, deviceScaleFactor: 1 } },
  { name: "mobile-390x844", value: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function safeError(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error);
  for (const value of [FIXTURE_ID, LABEL, MISSION_TITLE, PREREQUISITE_TITLE, PURPOSE, INITIAL_OUTPUT, REVISED_OUTPUT, REQUIRED_EVIDENCE]) {
    message = message.replaceAll(value, "[redacted fixture]");
  }
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
  throw new Error("No Chromium executable found for isolated Mission-safety acceptance.");
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
  try {
    await page.waitForFunction((expected) => document.body?.innerText.toLocaleLowerCase().includes(expected.toLocaleLowerCase()), { timeout }, text);
  } catch (error) {
    const rendered = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
    const markers = rendered.split(/\r?\n/).map((line) => line.trim()).filter((line) => /consequence|contract revision|required before acceptance|decision recorded|expected proof|risk:/i.test(line)).slice(0, 30).join(" | ");
    throw new Error(`${error instanceof Error ? error.message : String(error)}; expected ${text}; markers ${safeError(markers)}; rendered ${safeError(rendered.slice(0, 2_000))}`);
  }
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

async function replaceInput(page: Page, selector: string, value: string): Promise<void> {
  await page.waitForSelector(selector, { visible: true, timeout: 30_000 });
  await page.$eval(selector, (element, nextValue) => {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (!setter) throw new Error("Rendered text control has no native value setter.");
    setter.call(element, nextValue);
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: nextValue }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function selectValue(page: Page, selector: string, value: string): Promise<void> {
  await page.waitForSelector(selector, { visible: true, timeout: 30_000 });
  await page.select(selector, value);
}

async function ensureChecked(page: Page, selector: string): Promise<void> {
  await page.waitForSelector(selector, { visible: true, timeout: 30_000 });
  const checked = await page.$eval(selector, (element) => (element as HTMLInputElement).checked);
  if (!checked) {
    await page.evaluate((controlSelector) => {
      const control = document.querySelector<HTMLInputElement>(controlSelector);
      if (!control) throw new Error(`Rendered checkbox is unavailable: ${controlSelector}`);
      control.scrollIntoView({ block: "center", inline: "nearest" });
      control.click();
    }, selector);
  }
  await page.waitForFunction((controlSelector) => document.querySelector<HTMLInputElement>(controlSelector)?.checked === true, { timeout: 10_000 }, selector);
}

async function activateRenderedControl(page: Page, selector: string): Promise<void> {
  await page.waitForSelector(selector, { visible: true, timeout: 30_000 });
  await page.evaluate((controlSelector) => {
    const control = document.querySelector<HTMLButtonElement>(controlSelector);
    if (!control || control.disabled) throw new Error(`Rendered control is unavailable: ${controlSelector}`);
    control.scrollIntoView({ block: "center", inline: "nearest" });
    control.click();
  }, selector);
}

function captureBrowserSignals(page: Page): BrowserSignals {
  const signals: BrowserSignals = { consoleErrors: [], pageErrors: [], failedRequests: [], serverErrors: [], isolatedProviderErrors: [] };
  page.on("console", (entry) => {
    if (entry.type() !== "error") return;
    const source = entry.location().url;
    const detail = `${entry.text().slice(0, 500)}${source ? ` @ ${source}` : ""}`;
    if (entry.text().includes("Failed to load Clerk") || (entry.text().includes("ERR_NAME_NOT_RESOLVED") && source.startsWith("https://local.lyfeos.dev/npm/@clerk/clerk-js@5/"))) signals.isolatedProviderErrors.push(detail);
    else signals.consoleErrors.push(detail);
  });
  page.on("pageerror", (error) => {
    const detail = error.message.slice(0, 500);
    if (detail.includes("Clerk: Failed to load Clerk") && detail.includes("https://local.lyfeos.dev/")) signals.isolatedProviderErrors.push(detail);
    else signals.pageErrors.push(detail);
  });
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

async function createAccount(): Promise<FixtureAccount> {
  const account: FixtureAccount = {
    id: 0,
    displayName: `mission_safety_${LABEL}`,
    email: `mission_safety_${LABEL}@example.com`,
    cookie: "",
  };
  const registration = await request("POST", "/api/auth/complete-registration", {
    email: account.email,
    password: PASSWORD,
    displayName: account.displayName,
    termsAccepted: true,
  });
  assert(registration.status === 201, `Registration returned ${registration.status}.`);
  account.id = Number(registration.body.user?.id);
  account.cookie = registration.cookie;
  assert(Number.isInteger(account.id) && account.id > 0 && account.cookie, "Registration did not create an isolated owner and session.");
  const onboarding = await request("PATCH", "/api/profile", { onboardingCompleted: true }, account.cookie);
  assert(onboarding.status === 200 && onboarding.body?.onboardingCompleted === true, `Onboarding setup returned ${onboarding.status}.`);
  return account;
}

async function createMission(account: FixtureAccount, title: string, description: string): Promise<number> {
  const result = await request("POST", "/api/quests", {
    userId: account.id,
    title,
    description,
    category: "work",
    difficulty: "C",
    experienceReward: 10,
    completed: false,
  }, account.cookie);
  assert(result.status === 201, `Mission fixture creation returned ${result.status}.`);
  const id = Number(result.body.quest?.id);
  assert(Number.isInteger(id) && id > 0, "Mission fixture creation did not return an identifier.");
  return id;
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

async function openMission(page: Page, missionId: number): Promise<void> {
  await page.goto(new URL(`/mission/${missionId}`, BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitForText(page, MISSION_TITLE);
  await waitForText(page, "PROOF PLAN");
}

async function fillProofPlan(page: Page, expectedOutput: string): Promise<void> {
  await replaceInput(page, '[aria-label="Mission purpose"]', PURPOSE);
  await replaceInput(page, '[aria-label="Expected mission output"]', expectedOutput);
  await replaceInput(page, '[aria-label="Mission method steps"]', "Review the bounded commitment.\nStop when an early warning signal appears.");
  await replaceInput(page, '[aria-label="Mission tools and references"]', "Written terms\nQualified review when needed");
  await replaceInput(page, '[aria-label="Required mission evidence"]', REQUIRED_EVIDENCE);
  await selectValue(page, '[aria-label="Mission risk level"]', "high");
  await selectValue(page, '[aria-label="Evidence review method"]', "self");
  await replaceInput(page, '[aria-label="Mission stop condition"]', "Stop before acting if the downside cannot be contained.");
  await replaceInput(page, '[aria-label="Mission escalation path"]', "Pause and consult a qualified advisor before an external commitment.");
  await clickText(page, "button", "Save proof plan");
}

async function recordPreflight(page: Page, missionId: number, decision: "revise" | "proceed", revision: number, cookie: string): Promise<ApiResult> {
  const summary = "Record a new decision for this revision";
  const open = await page.evaluate((expected) => [...document.querySelectorAll("details")].find((item) => item.querySelector("summary")?.textContent?.trim() === expected)?.open || false, summary);
  if (!open) await clickText(page, "summary", summary);
  await replaceInput(page, '[aria-label="Material assumptions"]', "The written scope is current and complete.");
  await replaceInput(page, '[aria-label="Affected people or systems"]', "The account owner\nThe external counterparty");
  await replaceInput(page, '[aria-label="Expected scenario outcome"]', "The bounded commitment produces the declared output without expanding scope.");
  await replaceInput(page, '[aria-label="Expected scenario early signal"]', "Terms stay bounded");
  await replaceInput(page, '[aria-label="Upside scenario outcome"]', "A useful follow-on opportunity appears without changing this commitment.");
  await replaceInput(page, '[aria-label="Upside scenario early signal"]', "Separate discussion requested");
  await replaceInput(page, '[aria-label="Downside scenario outcome"]', "Ambiguous terms create financial or reputation exposure beyond the intended scope.");
  await replaceInput(page, '[aria-label="Downside scenario early warning"]', "Scope begins expanding");
  await selectValue(page, '[aria-label="Plan reversibility"]', "partly_reversible");
  await selectValue(page, '[aria-label="Preflight decision"]', decision);
  await replaceInput(page, '[aria-label="Mitigation and escalation plan"]', "Pause before acceptance, preserve the written record, and escalate every scope change.");
  await replaceInput(page, '[aria-label="Remaining uncertainty"]', "LyfeOS cannot verify the counterparty, legal effect, or future outcome.");
  await replaceInput(page, '[aria-label="Preflight decision rationale"]', decision === "proceed"
    ? "The bounded revision now has explicit stop signals and a contained escalation path."
    : "The current revision needs a narrower limit before it should be accepted.");
  await ensureChecked(page, '[data-testid="mission-preflight-acknowledgement"]');
  await page.waitForSelector('[data-testid="mission-preflight-record"]:not([disabled])', { visible: true, timeout: 10_000 });
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "POST" && url.origin === BASE_URL.origin && url.pathname === `/api/quests/${missionId}/contract/preflights`;
  }, { timeout: 10_000 });
  await activateRenderedControl(page, '[data-testid="mission-preflight-record"]');
  const renderedResponse = await responsePromise;
  const renderedBody = await renderedResponse.json().catch(() => ({}));
  assert(renderedResponse.status() === 201, `Rendered ${decision} preflight returned ${renderedResponse.status()}: ${String(renderedBody?.error || "unknown error")}.`);
  const result = await poll(
    () => request("GET", `/api/quests/${missionId}/contract`, undefined, cookie),
    (response) => response.status === 200 && response.body.contract?.contractRevision === revision && response.body.preflights?.[0]?.decision === decision,
    `Rendered ${decision} preflight did not converge for revision ${revision}.`,
  );
  await waitForText(page, `Latest decision: ${decision}`);
  return result;
}

async function inspectView(page: Page, viewport: string): Promise<ViewResult> {
  return page.evaluate(({ viewportName, prerequisiteTitle }) => {
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
    const text = document.body?.innerText || "";
    const revisionMatch = text.match(/Consequence preflight · contract revision (\d+)/i);
    const documentWidth = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0);
    return {
      viewport: viewportName,
      mainCount: document.querySelectorAll("main").length,
      duplicateIds,
      unlabeledControls,
      horizontalOverflowPx: Math.max(0, documentWidth - window.innerWidth),
      renderedRevision: Number(revisionMatch?.[1] || 0),
      acceptedStateRendered: text.includes("PROOF PLAN") && text.includes("accepted") && text.includes("decision recorded"),
      prerequisiteCompleteRendered: text.includes(`✓ ${prerequisiteTitle}`),
      noAuthorityBoundaryRendered: text.includes("does not predict safety") && text.includes("grant authority") && text.includes("replace professional advice"),
    };
  }, { viewportName: viewport, prerequisiteTitle: PREREQUISITE_TITLE });
}

async function main(): Promise<void> {
  assert(process.env.LYFEOS_TEST_ENV === "isolated", "Rendered Mission-safety acceptance is restricted to an explicit isolated environment.");
  assert(["127.0.0.1", "localhost"].includes(BASE_URL.hostname), "Rendered Mission-safety acceptance may target only localhost.");
  assert(DATABASE_URL.length > 0, "Rendered Mission-safety acceptance requires disposable PostgreSQL.");
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  let account: FixtureAccount | null = null;
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let signals: BrowserSignals = { consoleErrors: [], pageErrors: [], failedRequests: [], serverErrors: [], isolatedProviderErrors: [] };
  let missionId = 0;
  let prerequisiteId = 0;
  let initialCompletionBlocked = false;
  let reviseDecisionWithheldAcceptance = false;
  let prerequisiteBlockedCompletion = false;
  let materialRevisionInvalidatedDecision = false;
  let acceptedExactRevision = false;
  let completedAfterAllGates = false;
  let accountErased = false;
  let residualCounts = { users: -1, missions: -1, contracts: -1, preflights: -1, dependencies: -1 };
  const views: ViewResult[] = [];
  let stage = "initialize isolated Mission-safety journey";
  let failure: string | null = null;

  try {
    stage = "register disposable owner and seed two canonical Missions";
    account = await createAccount();
    prerequisiteId = await createMission(account, PREREQUISITE_TITLE, "Complete the bounded preparation before the consequential commitment.");
    missionId = await createMission(account, MISSION_TITLE, "Prove exact-revision consequence review and prerequisite ordering.");

    browser = await puppeteer.launch({
      executablePath: await findChromium(),
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--no-proxy-server"],
    });
    const browserPage = await createPage(browser, account);
    context = browserPage.context;
    signals = browserPage.signals;
    const page = browserPage.page;
    await page.setViewport(VIEWPORTS[0].value);
    stage = "open the canonical Mission detail surface";
    await openMission(page, missionId);

    stage = "author a high-risk proof plan through rendered controls";
    await fillProofPlan(page, INITIAL_OUTPUT);
    const draft = await poll(
      () => request("GET", `/api/quests/${missionId}/contract`, undefined, account.cookie),
      (result) => result.status === 200 && result.body.contract?.riskLevel === "high" && result.body.contract?.state === "draft" && result.body.contract?.contractRevision === 1,
      "Rendered proof-plan save did not produce a revision-one high-risk draft.",
    );
    assert(draft.body.preflightRequirement?.required === true && draft.body.preflightRequirement?.satisfied === false, "The high-risk plan did not require an exact-revision preflight.");
    await waitForText(page, "required before acceptance");
    const blockedBeforeDecision = await request("POST", `/api/quests/${missionId}/toggle`, undefined, account.cookie);
    initialCompletionBlocked = blockedBeforeDecision.status === 409;
    assert(initialCompletionBlocked, `High-risk completion before a decision returned ${blockedBeforeDecision.status}.`);

    stage = "add the prerequisite through rendered controls";
    await selectValue(page, '[aria-label="Prerequisite mission"]', String(prerequisiteId));
    await clickText(page, "button", "Add prerequisite");
    await waitForText(page, `○ ${PREREQUISITE_TITLE}`);

    stage = "record a revise decision and prove acceptance stays withheld";
    const revise = await recordPreflight(page, missionId, "revise", 1, account.cookie);
    assert(revise.body.preflightRequirement?.satisfied === false, "A revise decision incorrectly satisfied the preflight gate.");
    const rejectReviseAcceptance = await request("POST", `/api/quests/${missionId}/contract/accept`, { contractRevision: 1 }, account.cookie);
    reviseDecisionWithheldAcceptance = rejectReviseAcceptance.status === 409;
    assert(reviseDecisionWithheldAcceptance, `Acceptance after a revise decision returned ${rejectReviseAcceptance.status}.`);

    stage = "record proceed and accept the exact rendered revision";
    const proceed = await recordPreflight(page, missionId, "proceed", 1, account.cookie);
    assert(proceed.body.preflightRequirement?.satisfied === true && proceed.body.contract?.state === "draft", "Proceed did not satisfy only the decision gate while keeping acceptance explicit.");
    await activateRenderedControl(page, '[data-testid="mission-preflight-accept"]');
    const accepted = await poll(
      () => request("GET", `/api/quests/${missionId}/contract`, undefined, account.cookie),
      (result) => result.body.contract?.contractRevision === 1 && result.body.contract?.state === "accepted",
      "Rendered acceptance did not bind to revision one.",
    );
    acceptedExactRevision = accepted.body.preflightRequirement?.satisfied === true;
    assert(acceptedExactRevision, "The accepted revision lost its exact proceed decision.");

    stage = "prove prerequisite ordering remains authoritative";
    const blockedByPrerequisite = await request("POST", `/api/quests/${missionId}/toggle`, undefined, account.cookie);
    prerequisiteBlockedCompletion = blockedByPrerequisite.status === 409 && String(blockedByPrerequisite.body?.error || "").includes("prerequisite");
    assert(prerequisiteBlockedCompletion, "The accepted high-risk Mission bypassed its incomplete prerequisite.");
    const completePrerequisite = await request("POST", `/api/quests/${prerequisiteId}/toggle`, undefined, account.cookie);
    assert(completePrerequisite.status === 200 && completePrerequisite.body.quest?.completed === true, `Prerequisite completion returned ${completePrerequisite.status}.`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForText(page, `✓ ${PREREQUISITE_TITLE}`);

    stage = "materially revise the accepted plan and prove decision invalidation";
    await clickText(page, "button", "Revise proof plan");
    await fillProofPlan(page, REVISED_OUTPUT);
    const revised = await poll(
      () => request("GET", `/api/quests/${missionId}/contract`, undefined, account.cookie),
      (result) => result.body.contract?.contractRevision === 2 && result.body.contract?.state === "draft",
      "Material rendered edit did not create revision two.",
    );
    materialRevisionInvalidatedDecision = revised.body.preflightRequirement?.satisfied === false && revised.body.preflightRequirement?.currentPreflightId === null;
    assert(materialRevisionInvalidatedDecision, "The prior consequence decision leaked across a material contract revision.");
    await page.reload({ waitUntil: "domcontentloaded" });
    stage = "render the invalidated revision-two consequence boundary";
    await waitForText(page, "Consequence preflight · contract revision 2");
    stage = "render the revision-two acceptance gate";
    await waitForText(page, "required before acceptance");

    stage = "record and accept a fresh decision for revision two";
    await recordPreflight(page, missionId, "proceed", 2, account.cookie);
    await activateRenderedControl(page, '[data-testid="mission-preflight-accept"]');
    await poll(
      () => request("GET", `/api/quests/${missionId}/contract`, undefined, account.cookie),
      (result) => result.body.contract?.contractRevision === 2 && result.body.contract?.state === "accepted" && result.body.preflightRequirement?.satisfied === true,
      "Rendered acceptance did not bind to revision two.",
    );

    stage = "complete only after every gate and audit responsive semantics";
    const completed = await request("POST", `/api/quests/${missionId}/toggle`, undefined, account.cookie);
    completedAfterAllGates = completed.status === 200 && completed.body.quest?.completed === true;
    assert(completedAfterAllGates, `Completion after all gates returned ${completed.status}.`);
    for (const viewport of VIEWPORTS) {
      await page.setViewport(viewport.value);
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForText(page, REVISED_OUTPUT);
      const view = await inspectView(page, viewport.name);
      views.push(view);
      assert(view.mainCount === 1, `${viewport.name} rendered ${view.mainCount} main landmarks.`);
      assert(view.duplicateIds.length === 0 && view.unlabeledControls.length === 0 && view.horizontalOverflowPx <= 2, `${viewport.name} failed Mission-safety accessibility or overflow checks.`);
      assert(view.renderedRevision === 2 && view.acceptedStateRendered && view.prerequisiteCompleteRendered && view.noAuthorityBoundaryRendered, `${viewport.name} did not render the accepted exact-revision safety boundary.`);
    }
  } catch (error) {
    failure = `${stage}: ${safeError(error)}`;
  } finally {
    if (context) await context.close().catch(() => undefined);
    if (browser) await browser.close().catch(() => undefined);
    if (account?.cookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, account.cookie).catch(() => null);
    if (account && missionId && prerequisiteId) {
      const residual = await pool.query<{ users: string; missions: string; contracts: string; preflights: string; dependencies: string }>(
        `SELECT
          (SELECT count(*)::text FROM users WHERE id = $1) AS users,
          (SELECT count(*)::text FROM quests WHERE id = ANY($2::int[]) OR user_id = $1) AS missions,
          (SELECT count(*)::text FROM mission_contracts WHERE quest_id = ANY($2::int[])) AS contracts,
          (SELECT count(*)::text FROM mission_consequence_preflights WHERE user_id = $1) AS preflights,
          (SELECT count(*)::text FROM mission_dependencies WHERE dependent_quest_id = ANY($2::int[]) OR prerequisite_quest_id = ANY($2::int[])) AS dependencies`,
        [account.id, [missionId, prerequisiteId]],
      );
      residualCounts = Object.fromEntries(Object.entries(residual.rows[0] || {}).map(([key, value]) => [key, Number(value)])) as typeof residualCounts;
      accountErased = Object.values(residualCounts).every((count) => count === 0);
    }
    await pool.end();

    const browserClean = [signals.consoleErrors, signals.pageErrors, signals.failedRequests, signals.serverErrors].every((items) => items.length === 0);
    const passed = failure === null
      && initialCompletionBlocked
      && reviseDecisionWithheldAcceptance
      && prerequisiteBlockedCompletion
      && materialRevisionInvalidatedDecision
      && acceptedExactRevision
      && completedAfterAllGates
      && views.length === 2
      && browserClean
      && accountErased;
    const report = {
      contract: "lyfeos.isolated-mission-safety-browser.v1",
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL.origin,
      sourceRevision: process.env.GITHUB_SHA || process.env.LYFEOS_RELEASE || "local",
      fixture: { missionId, prerequisiteId, accountCount: account ? 1 : 0 },
      lifecycle: { initialCompletionBlocked, reviseDecisionWithheldAcceptance, prerequisiteBlockedCompletion, materialRevisionInvalidatedDecision, acceptedExactRevision, completedAfterAllGates },
      views,
      browserSignals: signals,
      cleanup: { accountErased, residualCounts },
      summary: { passed, failure },
      boundary: "Disposable isolated PostgreSQL plus Chromium evidence for the canonical LyfeOS Mission safety UI. It proves rendered high-risk proof-plan authoring, explicit revise/proceed decisions, exact-revision acceptance, material-revision invalidation, prerequisite completion blocking, responsive semantics and complete fixture erasure. It does not validate the user's assumptions, predict safety, grant external authority, replace professional advice, prove a production-account journey, or establish human assistive-technology comprehension.",
    };
    await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ contract: report.contract, passed, viewCount: views.length, lifecycle: report.lifecycle, accountErased }));
    if (!passed && !failure) failure = "Rendered Mission-safety acceptance did not satisfy every lifecycle, browser and cleanup invariant.";
  }

  if (failure) throw new Error(failure);
}

main().catch((error) => {
  console.error(safeError(error));
  process.exitCode = 1;
});
