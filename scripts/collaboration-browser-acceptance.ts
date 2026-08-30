import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import puppeteer, { type Browser, type BrowserContext, type HTTPResponse, type Page, type Viewport } from "puppeteer-core";
import {
  acknowledgeBoundedChunkRecovery,
  hasUnexpectedBrowserSignals,
  isExternalProviderTransportError,
  isIsolatedClerkBootstrapError,
  type BrowserSignals,
} from "./lib/production-browser-signals";

type ApiResult = { status: number; body: any; cookie: string; retryAfter: number };
type Account = { id: number; email: string; displayName: string; cookie: string };
type CollaborationBrowserSignals = BrowserSignals & { externalProviderErrors: string[] };
type PageState = { context: BrowserContext; page: Page; signals: CollaborationBrowserSignals };
type Cleanup = { accountErased: boolean; sessionInvalidated: boolean; emailReleased: boolean; displayNameReleased: boolean };
type ViewAudit = {
  label: string;
  mainCount: number;
  duplicateIds: string[];
  invalidLabelReferences: string[];
  unlabeledControls: string[];
  horizontalOverflowPx: number;
};
type Journey = {
  viewport: string;
  invitationAccepted: boolean;
  noRecordAccessBeforeGrant: boolean;
  boundedProjectionRendered: boolean;
  privateDescriptionExcluded: boolean;
  outsiderIsolated: boolean;
  grantRevocationImmediate: boolean;
  memberRevocationRetiredGrant: boolean;
  selfLeaveCompleted: boolean;
  audits: ViewAudit[];
  signals: CollaborationBrowserSignals[];
  cleanup: Cleanup[];
};

const BASE_URL = new URL(process.env.LYFEOS_TEST_API_URL || "http://127.0.0.1:5099");
const DATABASE_URL = process.env.DATABASE_URL?.trim() || "";
const MODE = process.env.LYFEOS_COLLABORATION_ACCEPTANCE_MODE?.trim() || "isolated";
const ISOLATED = MODE === "isolated";
const SOURCE = process.env.LYFEOS_ACCEPTANCE_SOURCE || process.env.GITHUB_SHA || process.env.LYFEOS_RELEASE || "local";
const HARNESS_SOURCE = process.env.LYFEOS_ACCEPTANCE_HARNESS_SOURCE || process.env.GITHUB_SHA || "local";
const OUTPUT_DIR = path.resolve(process.env.LYFEOS_COLLABORATION_OUTPUT_DIR || path.join(os.tmpdir(), "lyfeos-collaboration-browser"));
const OUTPUT_FILE = path.join(OUTPUT_DIR, ISOLATED ? "report.json" : "collaboration-report.json");
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
    .replace(/collaboration_(owner|coach|outsider)_[a-z0-9_]+/gi, "[redacted fixture]")
    .replace(/\[AUTOMATED ACCEPTANCE\][^.;]*/gi, "[redacted fixture]")
    .slice(0, 1_000);
}

async function request(method: string, pathname: string, body?: unknown, cookie = ""): Promise<ApiResult> {
  const response = await fetch(new URL(pathname, BASE_URL), {
    method,
    signal: AbortSignal.timeout(30_000),
    headers: {
      "Content-Type": "application/json",
      ...(ISOLATED ? { "X-Forwarded-Proto": "https" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  return {
    status: response.status,
    body: await response.json().catch(() => ({})),
    cookie: (response.headers.get("set-cookie") || "").split(";", 1)[0],
    retryAfter: Number(response.headers.get("retry-after") || 0),
  };
}

async function poll<T>(read: () => Promise<T>, accept: (value: T) => boolean, message: string, timeoutMs = 30_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let latest: T;
  while (Date.now() < deadline) {
    latest = await read();
    if (accept(latest)) return latest;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(message);
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
  throw new Error("No Chromium executable found for collaboration acceptance.");
}

function cookieParts(cookie: string): { name: string; value: string } {
  const separator = cookie.indexOf("=");
  assert(separator > 0, "Registration did not return a usable session cookie.");
  return { name: cookie.slice(0, separator), value: cookie.slice(separator + 1) };
}

function captureSignals(page: Page): CollaborationBrowserSignals {
  const signals: CollaborationBrowserSignals = {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    serverErrors: [],
    recoveredChunkLoads: [],
    externalProviderErrors: [],
  };
  let exactIsolatedClerkResourceFailureObserved = false;
  page.on("console", (entry) => {
    if (entry.type() !== "error") return;
    const source = entry.location().url;
    const text = entry.text();
    if (ISOLATED && isIsolatedClerkBootstrapError(text, source, exactIsolatedClerkResourceFailureObserved)) {
      exactIsolatedClerkResourceFailureObserved = true;
      return;
    }
    const detail = `${text.slice(0, 500)}${source ? ` @ ${source}` : ""}`;
    if (isExternalProviderTransportError(text, source)) {
      signals.externalProviderErrors.push(detail);
      return;
    }
    signals.consoleErrors.push(detail);
  });
  page.on("pageerror", (error) => {
    if (ISOLATED && isIsolatedClerkBootstrapError(error.message, "", exactIsolatedClerkResourceFailureObserved)) {
      exactIsolatedClerkResourceFailureObserved = true;
      return;
    }
    signals.pageErrors.push(error.message.slice(0, 500));
  });
  page.on("requestfailed", (failed) => {
    const errorText = failed.failure()?.errorText || "failed";
    if (["GET", "HEAD"].includes(failed.method()) && errorText.includes("ERR_ABORTED")) return;
    if (failed.url().startsWith(BASE_URL.origin)) signals.failedRequests.push(`${failed.method()} ${new URL(failed.url()).pathname}: ${errorText}`);
  });
  page.on("response", (response) => {
    if (response.url().startsWith(BASE_URL.origin) && response.status() >= 500) signals.serverErrors.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  return signals;
}

async function registerAccount(label: string, stamp: string): Promise<Account> {
  const account: Account = {
    id: 0,
    email: `${label}_${stamp}@example.com`,
    displayName: `${label}_${stamp}`,
    cookie: "",
  };
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const result = await request("POST", "/api/auth/complete-registration", {
      email: account.email,
      password: PASSWORD,
      displayName: account.displayName,
      termsAccepted: true,
    });
    if (result.status === 201) {
      account.id = Number(result.body.user?.id);
      account.cookie = result.cookie;
      assert(Number.isInteger(account.id) && account.id > 0 && account.cookie, "Registration did not create an owner and session.");
      const onboarding = await request("PATCH", "/api/profile", { onboardingCompleted: true }, account.cookie);
      assert(onboarding.status === 200, `Onboarding setup returned ${onboarding.status}.`);
      return account;
    }
    if (result.status !== 429 || attempt === 5) throw new Error(`Registration returned ${result.status}.`);
    await new Promise((resolve) => setTimeout(resolve, Math.max(1, result.retryAfter) * 1_000));
  }
  throw new Error("Registration retry budget exhausted.");
}

async function createPage(browser: Browser, account: Account, viewport: Viewport): Promise<PageState> {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const signals = captureSignals(page);
  const session = cookieParts(account.cookie);
  await page.setCookie({ ...session, url: BASE_URL.origin, path: "/", httpOnly: true, secure: BASE_URL.protocol === "https:", sameSite: "Lax" });
  await page.evaluateOnNewDocument((fixtureUser) => {
    try { localStorage.setItem("lyfeos_user", JSON.stringify(fixtureUser)); } catch { /* origin not ready */ }
  }, { id: account.id, displayName: account.displayName });
  await page.setViewport(viewport);
  await page.setCacheEnabled(false);
  return { context, page, signals };
}

async function dismissTutorial(page: Page): Promise<void> {
  const selector = 'button[aria-label="Skip this tutorial"]';
  const button = await page.$(selector);
  if (!button) return;
  const visible = await button.evaluate((element) => getComputedStyle(element).display !== "none" && element.getClientRects().length > 0);
  if (!visible) return;
  await page.click(selector);
  await page.waitForSelector(selector, { hidden: true, timeout: 10_000 });
}

async function openProfile(page: Page): Promise<void> {
  await page.goto(new URL("/profile", BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
  await dismissTutorial(page);
  await page.waitForSelector('[data-testid="collaboration-settings"]', { visible: true, timeout: 60_000 });
}

async function setValue(page: Page, selector: string, value: string): Promise<void> {
  await page.waitForSelector(selector, { visible: true, timeout: 30_000 });
  await page.$eval(selector, (element, nextValue) => {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (!setter) throw new Error("Rendered control has no native value setter.");
    setter.call(element, nextValue);
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: nextValue }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function ensureDetailsOpen(page: Page, selector: string): Promise<void> {
  await page.waitForSelector(selector, { visible: true, timeout: 30_000 });
  const open = await page.$eval(selector, (element) => (element as HTMLDetailsElement).open);
  if (!open) await page.$eval(`${selector} > summary`, (element) => (element as HTMLElement).click());
  await page.waitForFunction((target) => (document.querySelector(target) as HTMLDetailsElement | null)?.open === true, { timeout: 10_000 }, selector);
}

async function activate(page: Page, selector: string): Promise<void> {
  await page.waitForSelector(`${selector}:not([disabled])`, { visible: true, timeout: 30_000 });
  await page.$eval(selector, (element) => {
    const control = element as HTMLElement;
    control.scrollIntoView({ block: "center", inline: "nearest" });
    control.click();
  });
}

async function clickExactButton(page: Page, text: string): Promise<void> {
  await page.waitForFunction((expected) => [...document.querySelectorAll<HTMLButtonElement>("button")].some((button) => button.innerText.trim() === expected && !button.disabled), { timeout: 30_000 }, text);
  await page.evaluate((expected) => {
    const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find((candidate) => candidate.innerText.trim() === expected && !candidate.disabled);
    if (!button) throw new Error(`Button ${expected} is unavailable.`);
    button.scrollIntoView({ block: "center", inline: "nearest" });
    button.click();
  }, text);
}

async function performAndWaitForResponse(
  page: Page,
  predicate: (response: HTTPResponse) => boolean,
  action: () => Promise<void>,
): Promise<HTTPResponse> {
  const pending = page.waitForResponse(predicate, { timeout: 30_000 }).then(
    (response) => ({ response, error: null as unknown }),
    (error) => ({ response: null, error }),
  );
  try {
    await action();
  } catch (error) {
    void pending;
    throw error;
  }
  const settled = await pending;
  if (settled.error) throw settled.error;
  assert(settled.response, "Expected browser response was not captured.");
  return settled.response;
}

async function auditPage(page: Page, label: string): Promise<ViewAudit> {
  return page.evaluate((auditLabel) => {
    const scope = document.querySelector<HTMLElement>('[data-testid="collaboration-settings"]');
    if (!scope) throw new Error("Collaboration settings are not rendered.");
    const ids = new Map<string, number>();
    for (const element of document.querySelectorAll<HTMLElement>("[id]")) ids.set(element.id, (ids.get(element.id) || 0) + 1);
    const duplicateIds = [...ids.entries()].filter(([, count]) => count > 1).map(([id]) => id).sort();
    const invalidLabelReferences = [...scope.querySelectorAll<HTMLElement>("[aria-labelledby]")]
      .filter((element) => (element.getAttribute("aria-labelledby") || "").split(/\s+/).some((id) => id && !document.getElementById(id)))
      .map((element) => element.getAttribute("data-testid") || element.tagName.toLowerCase());
    const unlabeledControls = [...scope.querySelectorAll<HTMLElement>("button,input,select,textarea")]
      .filter((element) => {
        if (element.getAttribute("aria-hidden") === "true") return false;
        if (element instanceof HTMLInputElement && element.type === "hidden") return false;
        const style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden" || element.getClientRects().length === 0) return false;
        const labelElement = element.id ? scope.querySelector(`label[for="${CSS.escape(element.id)}"]`) : null;
        const name = element.getAttribute("aria-label") || element.getAttribute("aria-labelledby") || element.getAttribute("title") || element.textContent?.trim();
        return !labelElement && !element.closest("label") && !name;
      })
      .map((element) => element.getAttribute("data-testid") || element.tagName.toLowerCase())
      .slice(0, 20);
    const width = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0);
    return {
      label: auditLabel,
      mainCount: document.querySelectorAll("main").length,
      duplicateIds,
      invalidLabelReferences,
      unlabeledControls,
      horizontalOverflowPx: Math.max(0, width - window.innerWidth),
    };
  }, label);
}

async function cleanupAccount(account: Account): Promise<Cleanup> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const deletion = await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, account.cookie).catch(() => null);
    if (deletion && deletion.status >= 200 && deletion.status < 300) break;
    const session = await request("GET", "/api/auth/me", undefined, account.cookie).catch(() => null);
    if (session?.status === 401) break;
  }
  const session = await request("GET", "/api/auth/me", undefined, account.cookie).catch(() => null);
  if (ISOLATED) return { accountErased: session?.status === 401, sessionInvalidated: session?.status === 401, emailReleased: true, displayNameReleased: true };
  const email = await request("GET", `/api/auth/check-email?email=${encodeURIComponent(account.email)}`).catch(() => null);
  const displayName = await request("GET", `/api/auth/check-display-name?displayName=${encodeURIComponent(account.displayName)}`).catch(() => null);
  const cleanup = {
    sessionInvalidated: session?.status === 401,
    emailReleased: email?.status === 200 && email.body?.available === true,
    displayNameReleased: displayName?.status === 200 && displayName.body?.available === true,
    accountErased: false,
  };
  cleanup.accountErased = cleanup.sessionInvalidated && cleanup.emailReleased && cleanup.displayNameReleased;
  return cleanup;
}

async function runViewport(browser: Browser, viewport: { name: string; value: Viewport }, ordinal: number): Promise<{ journey: Journey; accountIds: number[]; missionId: number; workspaceIds: string[]; failure: string | null }> {
  const stamp = `${Date.now()}_${ordinal}_${randomUUID().slice(0, 7)}`;
  const workspaceName = `[AUTOMATED ACCEPTANCE] Circle ${stamp.slice(-7)}`;
  const workspacePurpose = "Coordinate one bounded accountability review without opening private records.";
  const invitationPurpose = "Review one selected commitment during this acceptance journey.";
  const grantPurpose = "Review the selected Mission summary and status only.";
  const missionTitle = `[AUTOMATED ACCEPTANCE] Shared Mission ${stamp.slice(-7)}`;
  const privateDescription = `[AUTOMATED ACCEPTANCE] PRIVATE DESCRIPTION ${stamp}`;
  const accounts: Account[] = [];
  const pages: PageState[] = [];
  const workspaceIds: string[] = [];
  let missionId = 0;
  const journey: Journey = {
    viewport: viewport.name,
    invitationAccepted: false,
    noRecordAccessBeforeGrant: false,
    boundedProjectionRendered: false,
    privateDescriptionExcluded: false,
    outsiderIsolated: false,
    grantRevocationImmediate: false,
    memberRevocationRetiredGrant: false,
    selfLeaveCompleted: false,
    audits: [],
    signals: [],
    cleanup: [],
  };
  let failure: unknown = null;
  let stage = "register collaboration accounts";

  try {
    const owner = await registerAccount("collaboration_owner", stamp);
    const coach = await registerAccount("collaboration_coach", stamp);
    const outsider = await registerAccount("collaboration_outsider", stamp);
    accounts.push(owner, coach, outsider);
    const mission = await request("POST", "/api/quests", {
      userId: owner.id,
      title: missionTitle,
      description: privateDescription,
      category: "personal",
      experienceReward: 10,
      completed: false,
    }, owner.cookie);
    assert(mission.status === 201, `Mission creation returned ${mission.status}.`);
    missionId = Number(mission.body.quest?.id);
    assert(Number.isInteger(missionId) && missionId > 0, "Mission creation did not return an identifier.");

    const ownerPage = await createPage(browser, owner, viewport.value);
    const coachPage = await createPage(browser, coach, viewport.value);
    const outsiderPage = await createPage(browser, outsider, viewport.value);
    pages.push(ownerPage, coachPage, outsiderPage);

    stage = "create a workspace through Profile";
    await openProfile(ownerPage.page);
    await ensureDetailsOpen(ownerPage.page, '[data-testid="collaboration-create-workspace-details"]');
    await setValue(ownerPage.page, '[aria-label="Workspace name"]', workspaceName);
    await setValue(ownerPage.page, '[aria-label="Purpose of working together"]', workspacePurpose);
    const workspaceResponse = await performAndWaitForResponse(
      ownerPage.page,
      (response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/collaboration/workspaces",
      () => activate(ownerPage.page, '[data-testid="collaboration-create-workspace"]'),
    );
    assert(workspaceResponse.status() === 201, `Workspace creation returned ${workspaceResponse.status()}.`);
    const workspaceBody = await workspaceResponse.json();
    const workspaceId = String(workspaceBody.workspace?.id || "");
    assert(workspaceId.length > 20, "Workspace creation did not return an identifier.");
    workspaceIds.push(workspaceId);
    await ownerPage.page.waitForSelector('[data-testid="collaboration-workspace-summary"]', { visible: true, timeout: 30_000 });

    stage = "invite a coach through bounded username discovery";
    await ensureDetailsOpen(ownerPage.page, '[data-testid="collaboration-invite-details"]');
    await setValue(ownerPage.page, '[aria-label="Search LyfeOS username to invite"]', coach.displayName);
    await clickExactButton(ownerPage.page, coach.displayName);
    await setValue(ownerPage.page, '[aria-label="Collaboration invitation purpose"]', invitationPurpose);
    const invitationResponse = await performAndWaitForResponse(
      ownerPage.page,
      (response) => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/collaboration/workspaces/${workspaceId}/invitations`,
      () => activate(ownerPage.page, '[data-testid="collaboration-send-invitation"]'),
    );
    assert(invitationResponse.status() === 201, `Invitation returned ${invitationResponse.status()}.`);
    const invitationBody = await invitationResponse.json();
    const membershipId = Number(invitationBody.membership?.id);
    assert(Number.isInteger(membershipId) && membershipId > 0, "Invitation did not return a membership identifier.");

    stage = "accept without receiving any personal record";
    await openProfile(coachPage.page);
    await coachPage.page.waitForSelector('[data-testid="collaboration-pending-invitation"]', { visible: true, timeout: 30_000 });
    const beforeGrant = await request("GET", "/api/collaboration/shared-with-me", undefined, coach.cookie);
    const coachTextBefore = await coachPage.page.$eval('[data-testid="collaboration-settings"]', (element) => element.textContent || "");
    journey.noRecordAccessBeforeGrant = beforeGrant.status === 200 && beforeGrant.body.items?.length === 0 && !coachTextBefore.includes(missionTitle) && !coachTextBefore.includes(privateDescription);
    assert(journey.noRecordAccessBeforeGrant, "Membership invitation exposed a personal record before consented sharing.");
    const acceptResponse = await performAndWaitForResponse(
      coachPage.page,
      (response) => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/collaboration/memberships/${membershipId}/decision`,
      () => activate(coachPage.page, '[data-testid="collaboration-invitation-accept"]'),
    );
    assert(acceptResponse.status() === 200, `Invitation acceptance returned ${acceptResponse.status()}.`);
    const activeMembership = await poll(
      () => request("GET", "/api/collaboration", undefined, coach.cookie),
      (result) => result.status === 200 && result.body.workspaces?.some((workspace: any) => workspace.id === workspaceId && workspace.myMembership?.status === "active"),
      "Accepted membership did not become active.",
    );
    journey.invitationAccepted = activeMembership.body.authorityBoundary === "membership_grants_no_personal_record_access";
    assert(journey.invitationAccepted, "Accepted membership lost the no-personal-record authority boundary.");

    stage = "share one bounded Mission projection";
    await openProfile(ownerPage.page);
    await ownerPage.page.waitForSelector('[data-testid="collaboration-share-details"]', { visible: true, timeout: 30_000 });
    await ensureDetailsOpen(ownerPage.page, '[data-testid="collaboration-share-details"]');
    await ownerPage.page.waitForFunction((coachId, selectedMissionId) => {
      const recipients = document.querySelector<HTMLSelectElement>('[aria-label="Shared view recipient"]');
      const subjects = document.querySelector<HTMLSelectElement>('[aria-label="Mission or Thread to share"]');
      return [...(recipients?.options || [])].some((option) => option.value === String(coachId)) && [...(subjects?.options || [])].some((option) => option.value === String(selectedMissionId));
    }, { timeout: 30_000 }, coach.id, missionId);
    await ownerPage.page.select('[aria-label="Shared view recipient"]', String(coach.id));
    await ownerPage.page.select('[aria-label="Mission or Thread to share"]', String(missionId));
    await setValue(ownerPage.page, '[aria-label="Shared view purpose"]', grantPurpose);
    const expiry = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    await setValue(ownerPage.page, '[aria-label="Shared view expiry"]', expiry);
    const grantResponse = await performAndWaitForResponse(
      ownerPage.page,
      (response) => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/collaboration/workspaces/${workspaceId}/grants`,
      () => activate(ownerPage.page, '[data-testid="collaboration-share-view"]'),
    );
    assert(grantResponse.status() === 201, `Bounded share returned ${grantResponse.status()}.`);
    const grantBody = await grantResponse.json();
    const grantId = String(grantBody.grant?.id || "");
    assert(grantId.length > 20, "Bounded share did not return a grant identifier.");

    stage = "render only the bounded recipient projection";
    await openProfile(coachPage.page);
    await coachPage.page.waitForSelector('[data-testid="collaboration-received-views"]', { visible: true, timeout: 30_000 });
    const received = await request("GET", "/api/collaboration/shared-with-me", undefined, coach.cookie);
    const coachText = await coachPage.page.$eval('[data-testid="collaboration-settings"]', (element) => element.textContent || "");
    const projection = received.body.items?.find((item: any) => item.grant?.id === grantId)?.projection;
    journey.boundedProjectionRendered = received.status === 200 && coachText.includes(missionTitle) && projection?.title === missionTitle && projection?.id === missionId;
    journey.privateDescriptionExcluded = !coachText.includes(privateDescription) && !JSON.stringify(received.body).includes(privateDescription) && projection && !Object.prototype.hasOwnProperty.call(projection, "description");
    assert(journey.boundedProjectionRendered && journey.privateDescriptionExcluded, "Recipient rendering widened beyond the bounded Mission projection.");
    journey.audits.push(await auditPage(ownerPage.page, `${viewport.name}-owner-shared`));
    journey.audits.push(await auditPage(coachPage.page, `${viewport.name}-coach-received`));

    stage = "prove outsider isolation";
    await openProfile(outsiderPage.page);
    const outsiderState = await request("GET", "/api/collaboration/shared-with-me", undefined, outsider.cookie);
    const outsiderText = await outsiderPage.page.$eval('[data-testid="collaboration-settings"]', (element) => element.textContent || "");
    journey.outsiderIsolated = outsiderState.status === 200 && outsiderState.body.items?.length === 0 && !outsiderText.includes(missionTitle) && !outsiderText.includes(privateDescription);
    assert(journey.outsiderIsolated, "An unrelated account received collaboration content.");
    journey.audits.push(await auditPage(outsiderPage.page, `${viewport.name}-outsider`));

    stage = "revoke the bounded view through Profile";
    await openProfile(ownerPage.page);
    await ownerPage.page.waitForSelector('[aria-label="Revoke shared view"]', { visible: true, timeout: 30_000 });
    const revokeResponse = await performAndWaitForResponse(
      ownerPage.page,
      (response) => response.request().method() === "DELETE" && new URL(response.url()).pathname === `/api/collaboration/grants/${grantId}`,
      () => activate(ownerPage.page, '[aria-label="Revoke shared view"]'),
    );
    assert(revokeResponse.status() === 200, `Shared-view revocation returned ${revokeResponse.status()}.`);
    const revoked = await poll(() => request("GET", "/api/collaboration/shared-with-me", undefined, coach.cookie), (result) => result.status === 200 && result.body.items?.length === 0, "Revoked view remained available.");
    journey.grantRevocationImmediate = revoked.body.items.length === 0;

    stage = "re-share and remove the member through Profile";
    await openProfile(ownerPage.page);
    await ensureDetailsOpen(ownerPage.page, '[data-testid="collaboration-share-details"]');
    await ownerPage.page.waitForFunction((coachId, selectedMissionId) => {
      const recipients = document.querySelector<HTMLSelectElement>('[aria-label="Shared view recipient"]');
      const subjects = document.querySelector<HTMLSelectElement>('[aria-label="Mission or Thread to share"]');
      return [...(recipients?.options || [])].some((option) => option.value === String(coachId)) && [...(subjects?.options || [])].some((option) => option.value === String(selectedMissionId));
    }, { timeout: 30_000 }, coach.id, missionId);
    await ownerPage.page.select('[aria-label="Shared view recipient"]', String(coach.id));
    await ownerPage.page.select('[aria-label="Mission or Thread to share"]', String(missionId));
    await setValue(ownerPage.page, '[aria-label="Shared view purpose"]', `${grantPurpose} Member-revocation proof.`);
    const regrantResponse = await performAndWaitForResponse(
      ownerPage.page,
      (response) => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/collaboration/workspaces/${workspaceId}/grants`,
      () => activate(ownerPage.page, '[data-testid="collaboration-share-view"]'),
    );
    assert(regrantResponse.status() === 201, "Re-share before member revocation failed.");
    const removeSelector = `[aria-label="Remove ${coach.displayName} from workspace"]`;
    const removeResponse = await performAndWaitForResponse(
      ownerPage.page,
      (response) => response.request().method() === "DELETE" && new URL(response.url()).pathname === `/api/collaboration/memberships/${membershipId}`,
      () => activate(ownerPage.page, removeSelector),
    );
    assert(removeResponse.status() === 200, "Member revocation failed.");
    const afterMemberRemoval = await poll(() => request("GET", "/api/collaboration/shared-with-me", undefined, coach.cookie), (result) => result.status === 200 && result.body.items?.length === 0, "Member revocation did not retire the active grant.");
    const coachAfterRemoval = await request("GET", "/api/collaboration", undefined, coach.cookie);
    journey.memberRevocationRetiredGrant = afterMemberRemoval.body.items.length === 0 && !coachAfterRemoval.body.workspaces?.some((workspace: any) => workspace.id === workspaceId);
    assert(journey.memberRevocationRetiredGrant, "Member revocation left workspace or grant access active.");

    stage = "reinvite, accept, and leave through the member Profile";
    await openProfile(ownerPage.page);
    await ensureDetailsOpen(ownerPage.page, '[data-testid="collaboration-invite-details"]');
    await setValue(ownerPage.page, '[aria-label="Search LyfeOS username to invite"]', coach.displayName);
    await clickExactButton(ownerPage.page, coach.displayName);
    await setValue(ownerPage.page, '[aria-label="Collaboration invitation purpose"]', `${invitationPurpose} Self-leave proof.`);
    const reinviteResponse = await performAndWaitForResponse(
      ownerPage.page,
      (response) => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/collaboration/workspaces/${workspaceId}/invitations`,
      () => activate(ownerPage.page, '[data-testid="collaboration-send-invitation"]'),
    );
    assert(reinviteResponse.status() === 201, `Reinvitation returned ${reinviteResponse.status()}.`);
    const reinviteBody = await reinviteResponse.json();
    const renewedMembershipId = Number(reinviteBody.membership?.id);
    assert(renewedMembershipId === membershipId, "Reinvitation did not converge on the existing membership identity.");
    await openProfile(coachPage.page);
    const reacceptResponse = await performAndWaitForResponse(
      coachPage.page,
      (response) => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/collaboration/memberships/${membershipId}/decision`,
      () => activate(coachPage.page, '[data-testid="collaboration-invitation-accept"]'),
    );
    assert(reacceptResponse.status() === 200, "Reinvitation acceptance failed.");
    await coachPage.page.waitForSelector('[data-testid="collaboration-leave-workspace"]', { visible: true, timeout: 30_000 });
    const leaveResponse = await performAndWaitForResponse(
      coachPage.page,
      (response) => response.request().method() === "DELETE" && new URL(response.url()).pathname === `/api/collaboration/memberships/${membershipId}`,
      () => activate(coachPage.page, '[data-testid="collaboration-leave-workspace"]'),
    );
    assert(leaveResponse.status() === 200, "Member self-leave failed.");
    const afterLeave = await poll(() => request("GET", "/api/collaboration", undefined, coach.cookie), (result) => result.status === 200 && !result.body.workspaces?.some((workspace: any) => workspace.id === workspaceId), "Self-leave did not remove active workspace access.");
    journey.selfLeaveCompleted = !afterLeave.body.workspaces.some((workspace: any) => workspace.id === workspaceId);
    assert(journey.selfLeaveCompleted, "Self-leave did not converge.");
    await openProfile(coachPage.page);
    journey.audits.push(await auditPage(coachPage.page, `${viewport.name}-coach-left`));

    for (const pageState of pages) {
      await acknowledgeBoundedChunkRecovery(pageState.page, pageState.signals);
      journey.signals.push(pageState.signals);
    }
    for (const audit of journey.audits) {
      assert(audit.mainCount === 1, `${audit.label} rendered ${audit.mainCount} main landmarks.`);
      assert(audit.duplicateIds.length === 0 && audit.invalidLabelReferences.length === 0 && audit.unlabeledControls.length === 0 && audit.horizontalOverflowPx <= 2, `${audit.label} failed collaboration semantics or overflow checks.`);
    }
    const unexpectedSignals = journey.signals.filter((signals) => hasUnexpectedBrowserSignals(signals));
    assert(unexpectedSignals.length === 0, `${viewport.name} recorded unexpected browser signals: ${JSON.stringify(unexpectedSignals)}.`);
  } catch (error) {
    failure = `${stage}: ${safeError(error)}`;
  } finally {
    for (const pageState of pages) {
      if (journey.signals.includes(pageState.signals)) continue;
      await acknowledgeBoundedChunkRecovery(pageState.page, pageState.signals).catch((error) => {
        pageState.signals.pageErrors.push(`Signal reconciliation failed: ${safeError(error)}`.slice(0, 500));
      });
      journey.signals.push(pageState.signals);
    }
    for (const pageState of pages) await pageState.context.close().catch(() => undefined);
    for (const account of accounts) journey.cleanup.push(await cleanupAccount(account));
  }

  if (!failure && !(journey.cleanup.length === 3 && journey.cleanup.every((cleanup) => cleanup.accountErased))) {
    failure = `${viewport.name} did not erase every disposable account.`;
  }
  return { journey, accountIds: accounts.map((account) => account.id), missionId, workspaceIds, failure };
}

async function main(): Promise<void> {
  if (ISOLATED) {
    assert(process.env.LYFEOS_TEST_ENV === "isolated", "Isolated collaboration acceptance requires an explicit isolated environment.");
    assert(["127.0.0.1", "localhost"].includes(BASE_URL.hostname), "Isolated collaboration acceptance may target only localhost.");
    assert(DATABASE_URL.length > 0, "Isolated collaboration acceptance requires disposable PostgreSQL.");
  } else {
    assert(MODE === "production", "Collaboration acceptance mode must be isolated or production.");
    assert(BASE_URL.origin === "https://lyfeos.net", "Production collaboration acceptance may target only https://lyfeos.net.");
    assert(/^[0-9a-f]{40}$/.test(SOURCE), "Production collaboration acceptance requires the exact deployed source revision.");
    assert(/^[0-9a-f]{40}$/.test(HARNESS_SOURCE), "Production collaboration acceptance requires the exact harness source revision.");
    const release = await request("GET", "/api/release");
    assert(release.status === 200 && release.body?.sourceRevision === SOURCE, "Production collaboration runtime does not match the requested immutable source.");
  }
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: await findChromium(), headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--no-proxy-server"] });
  const pool = ISOLATED ? new pg.Pool({ connectionString: DATABASE_URL }) : null;
  const journeys: Journey[] = [];
  const accountIds: number[] = [];
  const missionIds: number[] = [];
  const workspaceIds: string[] = [];
  let failure: string | null = null;
  let residualCounts: Record<string, number> | null = null;
  try {
    for (const [index, viewport] of VIEWPORTS.entries()) {
      const result = await runViewport(browser, viewport, index + 1);
      journeys.push(result.journey);
      accountIds.push(...result.accountIds);
      missionIds.push(result.missionId);
      workspaceIds.push(...result.workspaceIds);
      if (result.failure) {
        failure = result.failure;
        break;
      }
    }
  } catch (error) {
    failure = safeError(error);
  } finally {
    await browser.close().catch(() => undefined);
    if (pool && accountIds.length) {
      const result = await pool.query(
        `SELECT
          (SELECT count(*)::int FROM users WHERE id = ANY($1::int[])) AS users,
          (SELECT count(*)::int FROM quests WHERE id = ANY($2::int[]) OR user_id = ANY($1::int[])) AS missions,
          (SELECT count(*)::int FROM collaboration_workspaces WHERE id = ANY($3::uuid[]) OR owner_user_id = ANY($1::int[])) AS workspaces,
          (SELECT count(*)::int FROM collaboration_memberships WHERE user_id = ANY($1::int[]) OR workspace_id = ANY($3::uuid[])) AS memberships,
          (SELECT count(*)::int FROM collaboration_visibility_grants WHERE owner_user_id = ANY($1::int[]) OR grantee_user_id = ANY($1::int[]) OR workspace_id = ANY($3::uuid[])) AS grants,
          (SELECT count(*)::int FROM collaboration_audit_events WHERE workspace_id = ANY($3::uuid[])) AS audits`,
        [accountIds, missionIds, workspaceIds],
      );
      residualCounts = result.rows[0] || null;
      if (residualCounts && Object.values(residualCounts).some((count) => Number(count) !== 0) && !failure) failure = `Isolated collaboration cleanup left residue: ${JSON.stringify(residualCounts)}.`;
    }
    await pool?.end();
  }

  const passed = failure === null
    && journeys.length === VIEWPORTS.length
    && journeys.every((journey) => journey.invitationAccepted
      && journey.noRecordAccessBeforeGrant
      && journey.boundedProjectionRendered
      && journey.privateDescriptionExcluded
      && journey.outsiderIsolated
      && journey.grantRevocationImmediate
      && journey.memberRevocationRetiredGrant
      && journey.selfLeaveCompleted
      && journey.cleanup.every((cleanup) => cleanup.accountErased));
  const report = {
    contract: ISOLATED ? "lyfeos.isolated-collaboration-browser.v1" : "lyfeos.production-collaboration-browser.v1",
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL.origin,
    sourceRevision: SOURCE,
    harnessSource: HARNESS_SOURCE,
    journeys,
    cleanup: { residualCounts, accountCount: accountIds.length },
    summary: { passed, failure },
    boundary: ISOLATED
      ? "Disposable isolated PostgreSQL plus Chromium evidence for consent-bound LyfeOS collaboration. It proves rendered workspace creation, bounded username invitation, explicit acceptance, zero personal-record access from membership alone, one summary/status Mission projection, private-description and outsider isolation, immediate grant revocation, member removal with grant retirement, self-leave, desktop/mobile semantics and exact database erasure. It does not prove enterprise identity, organization authority, provider messaging, human assistive-technology comprehension, physical devices, employment administration or longitudinal coaching outcomes."
      : "Disposable production-account Chromium evidence for consent-bound LyfeOS collaboration. It proves the deployed immutable source rendered workspace creation, bounded username invitation, explicit acceptance, zero personal-record access from membership alone, one summary/status Mission projection, private-description and outsider isolation, immediate grant revocation, member removal with grant retirement, self-leave, desktop/mobile semantics, session invalidation and identifier release. It does not prove enterprise identity, organization authority, provider messaging, human assistive-technology comprehension, physical devices, employment administration or longitudinal coaching outcomes.",
  };
  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (process.env.GITHUB_STEP_SUMMARY) {
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, [
      `## LyfeOS ${ISOLATED ? "isolated" : "production"} collaboration acceptance`,
      "",
      `- Runtime source: ${SOURCE}`,
      `- Harness source: ${HARNESS_SOURCE}`,
      `- Passed: ${passed}`,
      `- Desktop/mobile journeys: ${journeys.length}/${VIEWPORTS.length}`,
      `- Disposable accounts erased: ${journeys.flatMap((journey) => journey.cleanup).filter((cleanup) => cleanup.accountErased).length}/${accountIds.length}`,
      "",
      report.boundary,
      "",
    ].join("\n"), "utf8");
  }
  console.log(JSON.stringify({ contract: report.contract, passed, journeyCount: journeys.length, accountCount: accountIds.length, lifecycle: journeys.map((journey) => ({ invitationAccepted: journey.invitationAccepted, noRecordAccessBeforeGrant: journey.noRecordAccessBeforeGrant, boundedProjectionRendered: journey.boundedProjectionRendered, privateDescriptionExcluded: journey.privateDescriptionExcluded, outsiderIsolated: journey.outsiderIsolated, grantRevocationImmediate: journey.grantRevocationImmediate, memberRevocationRetiredGrant: journey.memberRevocationRetiredGrant, selfLeaveCompleted: journey.selfLeaveCompleted })) }));
  if (!passed) throw new Error(failure || "Collaboration acceptance did not satisfy every lifecycle, browser and cleanup invariant.");
}

main().catch((error) => {
  console.error(safeError(error));
  process.exitCode = 1;
});
