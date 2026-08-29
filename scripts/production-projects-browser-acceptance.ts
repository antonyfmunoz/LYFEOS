import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer, { type Browser, type BrowserContext, type Page, type Viewport } from "puppeteer-core";
import { acknowledgeBoundedChunkRecovery, hasUnexpectedBrowserSignals, type BrowserSignals } from "./lib/production-browser-signals";

type ApiResult = { status: number; body: any; cookie: string; retryAfterSeconds: number | null };
type Account = { id: number; email: string; displayName: string; cookie: string };
type Signals = BrowserSignals & { isolatedProviderErrors: string[] };
type PageAudit = { mainCount: number; duplicateIds: string[]; invalidLabelReferences: string[]; unlabeledControls: string[]; horizontalOverflowPx: number };
type Cleanup = { viewport: string; ownerErased: boolean; otherErased: boolean };
type ViewResult = {
  viewport: string;
  catalogAndDetailRendered: boolean;
  declaredOutcomeAndDatesPersisted: boolean;
  canonicalMissionCreatedAtomically: boolean;
  prematureCompletionBlocked: boolean;
  unlinkPreservedCanonicalMission: boolean;
  completionAndReopenReconciled: boolean;
  existingMissionRelinked: boolean;
  staleSaveStoppedAsConflict: boolean;
  recoverableRemovalAndRestoreReconciled: boolean;
  deepLinkPersisted: boolean;
  crossOwnerIsolationReconciled: boolean;
  appendOnlyHistoryReconciled: boolean;
  audit: PageAudit;
  signals: Signals;
};

const BASE_URL = new URL(process.env.LYFEOS_TEST_API_URL || "https://lyfeos.net");
const MODE = process.env.LYFEOS_PROJECTS_ACCEPTANCE_MODE || "production";
const SOURCE = process.env.LYFEOS_ACCEPTANCE_SOURCE || "";
const HARNESS_SOURCE = process.env.LYFEOS_ACCEPTANCE_HARNESS_SOURCE || process.env.GITHUB_SHA || "";
const OUTPUT_DIR = path.resolve(process.env.LYFEOS_PROJECTS_OUTPUT_DIR || path.join(os.tmpdir(), "lyfeos-production-projects"));
const OUTPUT_FILE = path.join(OUTPUT_DIR, "projects-report.json");
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
    .replace(/projects_(owner|other)_[a-z0-9_]+/gi, "[redacted fixture]")
    .slice(0, 1_500);
}

async function request(method: string, pathname: string, body?: unknown, cookie = ""): Promise<ApiResult> {
  const response = await fetch(new URL(pathname, BASE_URL), {
    method,
    signal: AbortSignal.timeout(30_000),
    headers: { "Content-Type": "application/json", ...(MODE === "isolated" ? { "X-Forwarded-Proto": "https" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
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
  throw new Error("No Chromium executable found for production Projects acceptance.");
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

function acknowledgeExpectedConflict(signals: Signals): void {
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

async function selectValue(page: Page, selector: string, value: string): Promise<void> {
  await page.waitForSelector(selector, { visible: true, timeout: 30_000 });
  const selected = await page.select(selector, value);
  assert(selected.includes(value), `${selector} did not accept ${value}.`);
}

async function waitForProject(account: Account, projectId: number, predicate: (body: any) => boolean, label: string): Promise<any> {
  const deadline = Date.now() + 45_000;
  let latest: ApiResult | null = null;
  while (Date.now() < deadline) {
    latest = await request("GET", `/api/projects/${projectId}`, undefined, account.cookie);
    if (latest.status === 200 && predicate(latest.body)) return latest.body;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`${label} did not reconcile; status=${latest?.status}; body=${JSON.stringify(latest?.body || {}).slice(0, 1_000)}.`);
}

async function auditPage(page: Page): Promise<PageAudit> {
  return page.evaluate(() => {
    const ids = new Map<string, number>();
    for (const element of document.querySelectorAll<HTMLElement>("[id]")) ids.set(element.id, (ids.get(element.id) || 0) + 1);
    const scope = document.querySelector<HTMLElement>('[data-testid="projects-page"]');
    if (!scope) throw new Error("Projects acceptance scope is not rendered.");
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
  const owner: Account = { id: 0, email: `projects_owner_${stamp}@example.com`, displayName: `projects_owner_${ordinal}_${stamp.slice(-8)}`, cookie: "" };
  const other: Account = { id: 0, email: `projects_other_${stamp}@example.com`, displayName: `projects_other_${ordinal}_${stamp.slice(-8)}`, cookie: "" };
  const initialTitle = `Qualified Project ${ordinal}`;
  const serverTitle = `Server Project ${ordinal}`;
  const missionTitle = `Canonical Project Mission ${ordinal}`;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let view: ViewResult | null = null;
  let failure: unknown = null;
  let ownerErased = false, otherErased = false;
  let stage = "register disposable owners";
  try {
    const ownerRegistration = await registerDisposableAccount(owner);
    assert(ownerRegistration.status === 201 && owner.id > 0 && owner.cookie, `Owner registration returned ${ownerRegistration.status}.`);
    const otherRegistration = await registerDisposableAccount(other);
    assert(otherRegistration.status === 201 && other.id > 0 && other.cookie, `Other-owner registration returned ${otherRegistration.status}.`);
    for (const account of [owner, other]) {
      const onboarding = await request("PATCH", "/api/profile", { onboardingCompleted: true }, account.cookie);
      assert(onboarding.status === 200, `Onboarding setup returned ${onboarding.status}.`);
    }

    stage = "render the empty Projects catalog";
    context = await browser.createBrowserContext();
    page = await context.newPage();
    const signals = captureSignals(page);
    const session = cookieParts(owner.cookie);
    await page.setCookie({ ...session, url: BASE_URL.origin, path: "/", httpOnly: true, secure: BASE_URL.protocol === "https:", sameSite: "Lax" });
    await page.evaluateOnNewDocument((fixtureUser) => {
      try { localStorage.setItem("lyfeos_user", JSON.stringify(fixtureUser)); } catch { /* Origin not ready. */ }
    }, { id: owner.id, displayName: owner.displayName });
    await page.setViewport(viewport.value);
    await page.setCacheEnabled(false);
    await page.goto(new URL("/projects", BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector('[data-testid="projects-page"]', { visible: true, timeout: 60_000 });
    await dismissBlockingTutorial(page);
    await page.waitForSelector('[data-testid="project-create-form"]', { visible: true, timeout: 30_000 });
    const emptyCatalog = await page.$eval('[data-testid="project-catalog"]', (element) => element.textContent?.includes("No projects yet.") === true);
    assert(emptyCatalog, "The empty Projects catalog did not render truthfully.");

    stage = "create a declared-outcome Project through the rendered form";
    await setValue(page, '[aria-label="New project title"]', initialTitle);
    await setValue(page, '[aria-label="New project outcome"]', `Initial outcome ${ordinal}`);
    await activate(page, '[data-testid="project-create"]');
    await page.waitForFunction(() => /^\d+$/.test(new URL(location.href).searchParams.get("project") || ""), { timeout: 45_000 });
    const projectId = Number(new URL(page.url()).searchParams.get("project"));
    assert(Number.isInteger(projectId) && projectId > 0, "Created Project did not establish a deep-linkable ID.");
    await page.waitForSelector(`[data-testid="project-card-${projectId}"]`, { visible: true, timeout: 30_000 });
    await page.waitForSelector('[data-testid="project-detail"]', { visible: true, timeout: 30_000 });
    let detail = await waitForProject(owner, projectId, (body) => body.project?.revision === 1 && body.missions?.length === 0, "Project creation");
    const catalogAndDetailRendered = detail.project.title === initialTitle;
    const deepLinkPersisted = new URL(page.url()).searchParams.get("project") === String(projectId);
    assert(catalogAndDetailRendered && deepLinkPersisted, "Created Project did not reconcile across catalog, detail and URL.");

    stage = "persist the Project contract through rendered controls";
    await setValue(page, '[aria-label="Project outcome"]', `Observable outcome ${ordinal}`);
    await setValue(page, '[aria-label="Project description"]', `Bounded delivery context ${ordinal}`);
    await setValue(page, '[aria-label="Project start date"]', "2026-08-29");
    await setValue(page, '[aria-label="Project due date"]', "2026-09-30");
    await activate(page, '[data-testid="project-save"]');
    detail = await waitForProject(owner, projectId, (body) => body.project?.revision === 2, "Project contract save");
    const declaredOutcomeAndDatesPersisted = detail.project.outcome === `Observable outcome ${ordinal}`
      && detail.project.description === `Bounded delivery context ${ordinal}`
      && detail.project.startDate === "2026-08-29"
      && detail.project.dueDate === "2026-09-30";
    assert(declaredOutcomeAndDatesPersisted, "Rendered Project contract fields did not persist exactly.");

    stage = "activate the Project and create one canonical Mission atomically";
    await selectValue(page, '[data-testid="project-state"]', "active");
    await activate(page, '[data-testid="project-change-state"]');
    await waitForProject(owner, projectId, (body) => body.project?.state === "active" && body.project?.revision === 3, "Project activation");
    await setValue(page, '[aria-label="New Project Mission title"]', missionTitle);
    await activate(page, '[data-testid="project-create-mission"]');
    detail = await waitForProject(owner, projectId, (body) => body.project?.revision === 4 && body.missions?.length === 1, "atomic Project Mission creation");
    const mission = detail.missions[0];
    await page.waitForSelector(`[data-testid="project-mission-${mission.id}"]`, { visible: true, timeout: 30_000 });
    const canonicalMissionCreatedAtomically = mission.title === missionTitle && mission.projectId === projectId && mission.completed === false;
    assert(canonicalMissionCreatedAtomically, "Rendered Project Mission did not become one canonical linked Mission.");

    stage = "block premature completion while an open Mission remains";
    await selectValue(page, '[data-testid="project-state"]', "completed");
    await activate(page, '[data-testid="project-change-state"]');
    await page.waitForFunction(() => document.body.innerText.includes("Complete or unlink every open mission"), { timeout: 30_000 });
    detail = await waitForProject(owner, projectId, (body) => body.project?.state === "active" && body.project?.revision === 4 && body.missions?.length === 1, "blocked Project completion");
    const prematureCompletionBlocked = detail.project.completedAt === null;
    assert(prematureCompletionBlocked, "Project completed while an open canonical Mission remained.");
    acknowledgeExpectedConflict(signals);

    stage = "unlink without deleting the canonical Mission";
    await activate(page, `[aria-label="Unlink ${missionTitle}"]`);
    detail = await waitForProject(owner, projectId, (body) => body.project?.revision === 5 && body.missions?.length === 0, "Mission unlink");
    const ownerMissions = await request("GET", `/api/users/${owner.id}/quests`, undefined, owner.cookie);
    const preservedMission = ownerMissions.body.quests?.find((item: any) => item.id === mission.id);
    const unlinkPreservedCanonicalMission = ownerMissions.status === 200 && preservedMission?.projectId === null && preservedMission?.title === missionTitle;
    assert(unlinkPreservedCanonicalMission, "Unlinking removed or duplicated the canonical Mission.");

    stage = "complete and deliberately reopen the Project";
    await selectValue(page, '[data-testid="project-state"]', "completed");
    await activate(page, '[data-testid="project-change-state"]');
    await waitForProject(owner, projectId, (body) => body.project?.state === "completed" && body.project?.revision === 6 && Boolean(body.project?.completedAt), "Project completion");
    await selectValue(page, '[data-testid="project-state"]', "active");
    await activate(page, '[data-testid="project-change-state"]');
    detail = await waitForProject(owner, projectId, (body) => body.project?.state === "active" && body.project?.revision === 7 && body.project?.completedAt === null, "Project reopen");
    const completionAndReopenReconciled = detail.project.state === "active" && detail.project.completedAt === null;
    assert(completionAndReopenReconciled, "Completion and reopen state did not reconcile.");

    stage = "relink the existing Mission through the rendered selector";
    await page.waitForFunction((id) => [...document.querySelectorAll('select[aria-label="Link existing mission"] option')].some((option) => (option as HTMLOptionElement).value === String(id)), { timeout: 30_000 }, mission.id);
    await selectValue(page, '[aria-label="Link existing mission"]', String(mission.id));
    await activate(page, '[data-testid="project-link-mission"]');
    detail = await waitForProject(owner, projectId, (body) => body.project?.revision === 8 && body.missions?.[0]?.id === mission.id, "existing Mission relink");
    const existingMissionRelinked = detail.missions.length === 1 && detail.missions[0].title === missionTitle;
    assert(existingMissionRelinked, "Existing canonical Mission did not relink through the rendered selector.");
    const isolated = await request("GET", `/api/projects/${projectId}`, undefined, other.cookie);
    const crossOwnerIsolationReconciled = isolated.status === 404;
    assert(crossOwnerIsolationReconciled, `Cross-owner Project read returned ${isolated.status}.`);

    stage = "stop a stale rendered save after a competing Project edit";
    const competing = await request("PATCH", `/api/projects/${projectId}`, { title: serverTitle, expectedRevision: 8 }, owner.cookie);
    assert(competing.status === 200 && competing.body.project?.revision === 9, `Competing Project edit returned ${competing.status}.`);
    await setValue(page, '[aria-label="Project title"]', `Stale Project ${ordinal}`);
    await activate(page, '[data-testid="project-save"]');
    await page.waitForFunction(() => document.body.innerText.includes("Project changed in another session"), { timeout: 30_000 });
    detail = await waitForProject(owner, projectId, (body) => body.project?.revision === 9, "stale Project save refusal");
    const staleSaveStoppedAsConflict = detail.project.title === serverTitle;
    assert(staleSaveStoppedAsConflict, "A stale rendered save overwrote the competing Project revision.");
    acknowledgeExpectedConflict(signals);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector('[data-testid="project-detail"]', { visible: true, timeout: 60_000 });
    await page.waitForFunction((title) => (document.querySelector('[aria-label="Project title"]') as HTMLInputElement | null)?.value === title, { timeout: 30_000 }, serverTitle);

    stage = "archive, recoverably remove and restore the Project";
    await activate(page, `[aria-label="Unlink ${missionTitle}"]`);
    await waitForProject(owner, projectId, (body) => body.project?.revision === 10 && body.missions?.length === 0, "final Mission unlink");
    await selectValue(page, '[data-testid="project-state"]', "archived");
    await activate(page, '[data-testid="project-change-state"]');
    await waitForProject(owner, projectId, (body) => body.project?.state === "archived" && body.project?.revision === 11, "Project archive");
    page.once("dialog", (dialog) => void dialog.accept(serverTitle));
    await activate(page, '[data-testid="project-remove"]');
    await page.waitForSelector(`[data-testid="project-removed-${projectId}"]`, { visible: true, timeout: 45_000 });
    const removedRead = await request("GET", `/api/projects/${projectId}`, undefined, owner.cookie);
    assert(removedRead.status === 404, "Removed Project remained available through the active detail API.");
    await activate(page, `[aria-label="Restore ${serverTitle}"]`);
    detail = await waitForProject(owner, projectId, (body) => body.project?.state === "archived" && body.project?.revision === 13 && body.project?.deletedAt === null, "Project restore");
    await page.waitForSelector(`[data-testid="project-card-${projectId}"]`, { visible: true, timeout: 45_000 });
    await page.waitForSelector('[data-testid="project-detail"]', { visible: true, timeout: 45_000 });
    const recoverableRemovalAndRestoreReconciled = detail.project.state === "archived" && detail.project.deletedAt === null;
    assert(recoverableRemovalAndRestoreReconciled, "Recoverable Project removal/restore did not preserve archived state.");

    const eventTypes = detail.history.map((event: any) => event.eventType);
    const expectedEvents = ["ProjectCreated.v1", "ProjectUpdated.v1", "ProjectStateChanged.v1", "ProjectTaskLinked.v1", "ProjectTaskUnlinked.v1", "ProjectCompleted.v1", "ProjectRemoved.v1", "ProjectRestored.v1"];
    const appendOnlyHistoryReconciled = expectedEvents.every((eventType) => eventTypes.includes(eventType));
    assert(appendOnlyHistoryReconciled, `Project history is incomplete: ${JSON.stringify(eventTypes)}.`);
    const restoredDeepLink = new URL(page.url()).searchParams.get("project") === String(projectId);
    assert(restoredDeepLink, "Restored Project did not retain its deep-linkable selection.");
    const audit = await auditPage(page);
    assert(audit.mainCount === 1 && audit.duplicateIds.length === 0 && audit.invalidLabelReferences.length === 0
      && audit.unlabeledControls.length === 0 && audit.horizontalOverflowPx <= 2, `${viewport.name} failed Projects semantics or overflow checks: ${JSON.stringify(audit)}.`);
    await acknowledgeBoundedChunkRecovery(page, signals);
    assert(!hasUnexpectedBrowserSignals(signals), `${viewport.name} Projects journey produced application errors: ${JSON.stringify(signals)}.`);
    view = { viewport: viewport.name, catalogAndDetailRendered, declaredOutcomeAndDatesPersisted, canonicalMissionCreatedAtomically, prematureCompletionBlocked, unlinkPreservedCanonicalMission, completionAndReopenReconciled, existingMissionRelinked, staleSaveStoppedAsConflict, recoverableRemovalAndRestoreReconciled, deepLinkPersisted: deepLinkPersisted && restoredDeepLink, crossOwnerIsolationReconciled, appendOnlyHistoryReconciled, audit, signals };
  } catch (error) {
    const rendered = page ? await page.evaluate(() => document.body?.innerText.slice(0, 2_000) || "page unavailable").catch(() => "page unavailable") : "page unavailable";
    if (page) await page.screenshot({ path: path.join(OUTPUT_DIR, `projects-${viewport.name}-failure.png`), fullPage: true }).catch(() => undefined);
    failure = new Error(`${safeError(error)}; rendered=${rendered}`);
  } finally {
    if (context) await context.close().catch(() => undefined);
    ownerErased = await eraseAccount(owner);
    otherErased = await eraseAccount(other);
  }
  const cleanup: Cleanup = { viewport: viewport.name, ownerErased, otherErased };
  if (failure) throw new Error(`stage=${stage}; ${safeError(failure)}; ownerErased=${ownerErased}; otherErased=${otherErased}`);
  assert(view && ownerErased && otherErased, `${viewport.name} did not complete the rendered Projects journey and verified account erasure.`);
  return { view, cleanup };
}

async function main(): Promise<void> {
  assert(MODE === "production" || MODE === "isolated", "Projects acceptance mode must be production or isolated.");
  if (MODE === "production") {
    assert(BASE_URL.origin === "https://lyfeos.net", "Production Projects acceptance may target only https://lyfeos.net.");
    assert(/^[0-9a-f]{40}$/.test(SOURCE), "Production Projects acceptance requires the exact deployed source revision.");
    assert(/^[0-9a-f]{40}$/.test(HARNESS_SOURCE), "Production Projects acceptance requires the exact harness source revision.");
    const release = await request("GET", "/api/release");
    assert(release.status === 200 && release.body?.sourceRevision === SOURCE, "Production Projects runtime does not match the requested immutable source.");
  } else {
    assert(process.env.LYFEOS_TEST_ENV === "isolated", "Isolated Projects acceptance requires the explicit isolated test environment.");
    assert(["127.0.0.1", "localhost"].includes(BASE_URL.hostname), "Isolated Projects acceptance may target only a local server.");
  }
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
    const passed = failure === null && views.length === VIEWPORTS.length && cleanups.length === VIEWPORTS.length && cleanups.every((cleanup) => cleanup.ownerErased && cleanup.otherErased);
    const report = {
      contract: MODE === "production" ? "lyfeos.production-projects-browser.v1" : "lyfeos.isolated-projects-browser.v1",
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL.origin,
      sourceRevision: SOURCE,
      harnessSource: HARNESS_SOURCE,
      views,
      cleanups,
      summary: { passed, failure },
      boundary: `Disposable ${MODE === "production" ? "production-account" : "isolated-account"} Chromium evidence for Projects as outcome coordination over canonical Missions. It proves desktop/mobile catalog and detail rendering; declared outcome and dates; atomic canonical Mission creation; blocked premature completion; non-destructive unlink and relink; deliberate completion/reopen; optimistic stale-save refusal; owner isolation; recoverable removal/restore; deep-link persistence; append-only history; responsive semantics; and verified account/session/identifier erasure. It does not prove human assistive-technology comprehension, physical-device behavior, simultaneous multi-tab editing, longitudinal portfolio usefulness, shared cross-product milestones/dependencies, or organization-owned Projects.`,
    };
    await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    if (process.env.GITHUB_STEP_SUMMARY) {
      await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, [
        "## LyfeOS production Projects acceptance",
        "",
        `- Runtime source: ${SOURCE}`,
        `- Harness source: ${HARNESS_SOURCE}`,
        `- Passed: ${passed}`,
        `- Desktop/mobile views: ${views.length}/${VIEWPORTS.length}`,
        `- Disposable owner pairs erased: ${cleanups.filter((cleanup) => cleanup.ownerErased && cleanup.otherErased).length}/${VIEWPORTS.length}`,
        "",
        report.boundary,
        "",
      ].join("\n"), "utf8");
    }
    console.log(JSON.stringify({ contract: report.contract, passed, viewCount: views.length, erasedOwnerPairs: cleanups.filter((cleanup) => cleanup.ownerErased && cleanup.otherErased).length }));
    if (!passed && !failure) failure = "Production Projects acceptance did not satisfy every rendered, lifecycle, concurrency, isolation and cleanup invariant.";
  }
  if (failure) throw new Error(failure);
}

main().catch((error) => {
  console.error(safeError(error));
  process.exitCode = 1;
});
