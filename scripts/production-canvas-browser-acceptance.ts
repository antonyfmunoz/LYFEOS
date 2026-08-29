import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer, { type Browser, type BrowserContext, type Page, type Viewport } from "puppeteer-core";

type ApiResult = { status: number; body: any; cookie: string };
type Account = { id: number; email: string; displayName: string; cookie: string };
type Signals = { consoleErrors: string[]; pageErrors: string[]; failedRequests: string[]; serverErrors: string[] };
type PageAudit = { mainCount: number; duplicateIds: string[]; invalidLabelReferences: string[]; unlabeledControls: string[]; horizontalOverflowPx: number };
type Cleanup = { viewport: string; accountErased: boolean; sessionInvalidated: boolean; emailReleased: boolean; displayNameReleased: boolean; otherAccountErased: boolean };
type ViewResult = {
  viewport: string;
  catalogAndEditorRendered: boolean;
  governedTemplateReviewed: boolean;
  nodeAndConnectionEditingReconciled: boolean;
  undoRedoReconciled: boolean;
  viewportControlsReconciled: boolean;
  localImportReviewedAndPersisted: boolean;
  immutableCreationRevisionReconciled: boolean;
  crossOwnerIsolationReconciled: boolean;
  staleSaveStoppedAsConflict: boolean;
  maximumDocumentRendered: boolean;
  renderedNodeCountAtLimit: number;
  reconciledSaveCreatedNewRevision: boolean;
  restoreCreatedNewImmutableRevision: boolean;
  catalogPersistenceRendered: boolean;
  editorAudit: PageAudit;
  catalogAudit: PageAudit;
  signals: Signals;
};

const BASE_URL = new URL(process.env.LYFEOS_TEST_API_URL || "https://lyfeos.net");
const SOURCE = process.env.LYFEOS_ACCEPTANCE_SOURCE || "";
const HARNESS_SOURCE = process.env.LYFEOS_ACCEPTANCE_HARNESS_SOURCE || process.env.GITHUB_SHA || "";
const OUTPUT_DIR = path.resolve(process.env.LYFEOS_CANVAS_OUTPUT_DIR || path.join(os.tmpdir(), "lyfeos-production-canvas"));
const OUTPUT_FILE = path.join(OUTPUT_DIR, "canvas-report.json");
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
    .replace(/canvas_(owner|other)_[a-z0-9_]+/gi, "[redacted fixture]")
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
    try { await access(candidate); return candidate; } catch { /* Continue through bounded locations. */ }
  }
  throw new Error("No Chromium executable found for production Canvas acceptance.");
}

function cookieParts(cookie: string): { name: string; value: string } {
  const separator = cookie.indexOf("=");
  assert(separator > 0, "Registration did not return a usable session cookie.");
  return { name: cookie.slice(0, separator), value: cookie.slice(separator + 1) };
}

function captureSignals(page: Page): Signals {
  const signals: Signals = { consoleErrors: [], pageErrors: [], failedRequests: [], serverErrors: [] };
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

function acknowledgeReconciledConflict(signals: Signals): void {
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

async function selectNode(page: Page, testId: string): Promise<void> {
  const selector = `[data-testid="canvas-node-${testId}"]`;
  await page.waitForSelector(selector, { timeout: 30_000 });
  await page.$eval(selector, (node) => node.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

async function waitForCanvas(account: Account, canvasId: number, predicate: (canvas: any) => boolean, label: string): Promise<any> {
  const deadline = Date.now() + 45_000;
  let latest: ApiResult | null = null;
  while (Date.now() < deadline) {
    latest = await request("GET", `/api/canvases/${canvasId}`, undefined, account.cookie);
    if (latest.status === 200 && predicate(latest.body.canvas)) return latest.body.canvas;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`${label} did not reconcile; latest=${JSON.stringify(latest?.body || {}).slice(0, 1_000)}.`);
}

async function auditPage(page: Page, scopeSelector: string): Promise<PageAudit> {
  return page.evaluate((selector) => {
    const ids = new Map<string, number>();
    for (const element of document.querySelectorAll<HTMLElement>("[id]")) ids.set(element.id, (ids.get(element.id) || 0) + 1);
    const scope = document.querySelector<HTMLElement>(selector);
    if (!scope) throw new Error(`Canvas acceptance scope ${selector} is not rendered.`);
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

function importedDocument(): any {
  return {
    version: 1,
    viewport: { x: 40, y: 60, zoom: 1 },
    nodes: [
      { id: "import_focus", type: "heading", x: 80, y: 80, width: 260, height: 100, title: "Imported focus", body: "Reviewed locally", color: "cyan", completed: false, url: null },
      { id: "import_action", type: "task", x: 420, y: 260, width: 240, height: 140, title: "Imported action", body: "Persist after review", color: "emerald", completed: false, url: null },
    ],
    edges: [{ id: "import_edge", sourceId: "import_focus", targetId: "import_action", label: "enables", style: "dashed" }],
  };
}

function maximumDocument(): any {
  return {
    version: 1,
    viewport: { x: 0, y: 0, zoom: 0.25 },
    nodes: Array.from({ length: 300 }, (_, index) => ({
      id: `limit_${index + 1}`,
      type: index % 5 === 0 ? "task" : "note",
      x: (index % 20) * 360,
      y: Math.floor(index / 20) * 220,
      width: 220,
      height: 120,
      title: `Bounded node ${index + 1}`,
      body: "Maximum-document rendering fixture",
      color: index % 5 === 0 ? "emerald" : "slate",
      completed: false,
      url: null,
    })),
    edges: [],
  };
}

function assertCleanAudit(audit: PageAudit, label: string): void {
  assert(audit.mainCount === 1, `${label} did not expose exactly one main landmark.`);
  assert(audit.duplicateIds.length === 0, `${label} rendered duplicate IDs.`);
  assert(audit.invalidLabelReferences.length === 0, `${label} rendered invalid label references.`);
  assert(audit.unlabeledControls.length === 0, `${label} rendered unlabeled controls: ${audit.unlabeledControls.join(", ")}.`);
  assert(audit.horizontalOverflowPx <= 2, `${label} overflowed horizontally by ${audit.horizontalOverflowPx}px.`);
}

async function runViewport(browser: Browser, viewport: { name: string; value: Viewport }, ordinal: number): Promise<{ view: ViewResult; cleanup: Cleanup }> {
  const stamp = `${Date.now()}_${ordinal}_${randomUUID().slice(0, 8)}`;
  const owner: Account = { id: 0, email: `canvas_owner_${stamp}@example.com`, displayName: `canvas_owner_${ordinal}_${stamp.slice(-8)}`, cookie: "" };
  const other: Account = { id: 0, email: `canvas_other_${stamp}@example.com`, displayName: `canvas_other_${ordinal}_${stamp.slice(-8)}`, cookie: "" };
  const initialTitle = `Decision canvas ${ordinal}`;
  const serverTitle = `Server canvas ${ordinal}`;
  const reconciledTitle = `Reconciled canvas ${ordinal}`;
  const importPath = path.join(OUTPUT_DIR, `canvas-import-${ordinal}.json`);
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let view: ViewResult | null = null;
  let ownerErased = false;
  let otherErased = false;
  let failure: unknown = null;
  let stage = "register disposable owners";
  try {
    await fs.writeFile(importPath, JSON.stringify(importedDocument()), "utf8");
    const ownerRegistration = await request("POST", "/api/auth/complete-registration", { email: owner.email, password: PASSWORD, displayName: owner.displayName, termsAccepted: true });
    const otherRegistration = await request("POST", "/api/auth/complete-registration", { email: other.email, password: PASSWORD, displayName: other.displayName, termsAccepted: true });
    assert(ownerRegistration.status === 201 && otherRegistration.status === 201, `Disposable owner registration returned ${ownerRegistration.status}/${otherRegistration.status}.`);
    Object.assign(owner, { id: Number(ownerRegistration.body.user?.id), cookie: ownerRegistration.cookie });
    Object.assign(other, { id: Number(otherRegistration.body.user?.id), cookie: otherRegistration.cookie });

    stage = "render Canvas catalog and create through named controls";
    context = await browser.createBrowserContext();
    page = await context.newPage();
    const signals = captureSignals(page);
    const session = cookieParts(owner.cookie);
    await page.setCookie({ ...session, url: BASE_URL.origin, path: "/", httpOnly: true, secure: true, sameSite: "Lax" });
    await page.evaluateOnNewDocument((fixtureUser) => {
      try {
        localStorage.setItem("lyfeos_user", JSON.stringify(fixtureUser));
        localStorage.setItem(`lyfeos-tutorial-done-missions-${fixtureUser.id}`, "true");
      } catch { /* Origin is not ready. */ }
    }, { id: owner.id, displayName: owner.displayName });
    await page.setViewport(viewport.value);
    await page.setCacheEnabled(false);
    await page.goto(new URL("/canvases", BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector('[data-testid="canvas-page"]', { visible: true, timeout: 60_000 });
    await dismissBlockingTutorial(page);
    await activate(page, '[data-testid="canvas-new"]');
    await page.waitForSelector('[data-testid="canvas-editor"]', { visible: true, timeout: 45_000 });
    const catalogAndEditorRendered = true;

    stage = "review template and exercise editing, undo, redo and viewport controls";
    await setValue(page, 'input[aria-label="Canvas title"]', initialTitle);
    await setValue(page, 'input[aria-label="Canvas category"]', "decision");
    await setValue(page, 'textarea[aria-label="Canvas description"]', "Production Canvas acceptance fixture");
    await activate(page, '[data-testid="canvas-templates"]');
    await activate(page, '[data-testid="canvas-template-project-map"]');
    await page.waitForFunction(() => document.body.innerText.includes("applying replaces 0 current nodes"), { timeout: 30_000 });
    await activate(page, '[data-testid="canvas-template-apply"]');
    await page.waitForSelector('[data-testid="canvas-node-project_outcome"]', { timeout: 30_000 });
    const governedTemplateReviewed = true;
    await selectNode(page, "project_outcome");
    await setValue(page, 'input[aria-label="Node title"]', `Qualified outcome ${ordinal}`);
    await page.waitForFunction((title) => document.querySelector('[data-testid="canvas-node-project_outcome"]')?.textContent?.includes(String(title)), { timeout: 30_000 }, `Qualified outcome ${ordinal}`);
    await selectNode(page, "project_outcome");
    const connectionLabel = await page.$('input[aria-label^="Connection label"]');
    assert(connectionLabel, "The selected template node did not expose governed connection editing.");
    await setValue(page, 'input[aria-label^="Connection label"]', `evidence ${ordinal}`);
    const nodeAndConnectionEditingReconciled = await page.$eval('input[aria-label^="Connection label"]', (element) => (element as HTMLInputElement).value.startsWith("evidence"));
    assert(nodeAndConnectionEditingReconciled, "Directed connection editing did not reconcile in the rendered inspector.");
    await activate(page, '[data-testid="canvas-undo"]');
    const undone = await page.$eval('input[aria-label^="Connection label"]', (element) => !(element as HTMLInputElement).value.startsWith("evidence"));
    await activate(page, '[data-testid="canvas-redo"]');
    const redone = await page.$eval('input[aria-label^="Connection label"]', (element) => (element as HTMLInputElement).value.startsWith("evidence"));
    assert(undone && redone, "Canvas local Undo/Redo did not reconcile the connection edit.");
    const undoRedoReconciled = true;
    await activate(page, 'button[aria-label="Zoom in"]');
    await page.waitForFunction(() => document.querySelector('button[aria-label="Reset canvas view to 100 percent"]')?.textContent?.includes("125%"), { timeout: 30_000 });
    await activate(page, 'button[aria-label="Reset canvas view to 100 percent"]');
    await page.waitForFunction(() => document.querySelector('button[aria-label="Reset canvas view to 100 percent"]')?.textContent?.includes("100%"), { timeout: 30_000 });
    const viewportControlsReconciled = true;

    stage = "review a local Canvas JSON import and preserve Undo/Redo";
    const fileInput = await page.$('input[aria-label="Import LyfeOS Canvas JSON"]');
    assert(fileInput, "Local Canvas JSON input is unavailable.");
    await fileInput.uploadFile(importPath);
    await page.waitForSelector('[aria-label="Canvas import review"]', { visible: true, timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector('[aria-label="Canvas import review"]')?.textContent?.includes("2 nodes · 1 connections"), { timeout: 30_000 });
    await activate(page, '[data-testid="canvas-import-confirm"]');
    await page.waitForSelector('[data-testid="canvas-node-import_focus"]', { timeout: 30_000 });
    await activate(page, '[data-testid="canvas-undo"]');
    await page.waitForSelector('[data-testid="canvas-node-project_outcome"]', { timeout: 30_000 });
    await activate(page, '[data-testid="canvas-redo"]');
    await page.waitForSelector('[data-testid="canvas-node-import_focus"]', { timeout: 30_000 });
    const localImportReviewedAndPersisted = true;

    stage = "save immutable creation revision";
    await activate(page, '[data-testid="canvas-save"]');
    await page.waitForFunction(() => /\/canvases\/\d+$/.test(location.pathname), { timeout: 45_000 });
    const canvasId = Number(new URL(page.url()).pathname.split("/").at(-1));
    assert(Number.isInteger(canvasId), "Created Canvas URL did not expose an integer ID.");
    await page.waitForSelector('[data-testid="canvas-history-version-1"]', { timeout: 45_000 });
    const created = await waitForCanvas(owner, canvasId, (canvas) => canvas.revision === 1, "creation revision");
    const immutableCreationRevisionReconciled = created.title === initialTitle
      && created.content?.nodes?.length === 2
      && created.content?.edges?.[0]?.label === "enables";
    assert(immutableCreationRevisionReconciled, "Creation revision did not persist the reviewed import as immutable version one.");
    const revisionsV1 = await request("GET", `/api/canvases/${canvasId}/revisions`, undefined, owner.cookie);
    assert(revisionsV1.status === 200 && revisionsV1.body.revisions?.length === 1 && revisionsV1.body.revisions[0]?.action === "created", "Canvas creation history is not immutable version one.");
    const isolated = await request("GET", `/api/canvases/${canvasId}`, undefined, other.cookie);
    const crossOwnerIsolationReconciled = isolated.status === 403;
    assert(crossOwnerIsolationReconciled, `Cross-owner Canvas read returned ${isolated.status}.`);

    stage = "stop stale save and render the schema maximum";
    const external = await request("PATCH", `/api/canvases/${canvasId}`, { title: serverTitle, content: maximumDocument() }, owner.cookie, { "x-lyfeos-expected-revision": "1" });
    assert(external.status === 200 && external.body.canvas?.revision === 2, `Competing Canvas update returned ${external.status}.`);
    await setValue(page, 'input[aria-label="Canvas title"]', `Stale browser ${ordinal}`);
    await activate(page, '[data-testid="canvas-save"]');
    await page.waitForFunction(() => document.body.innerText.includes("changed after you opened it"), { timeout: 30_000 });
    const conflictState = await waitForCanvas(owner, canvasId, (canvas) => canvas.revision === 2, "conflict state");
    const staleSaveStoppedAsConflict = conflictState.title === serverTitle;
    assert(staleSaveStoppedAsConflict, "Stale rendered save overwrote the competing Canvas revision.");
    acknowledgeReconciledConflict(signals);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector('[data-testid="canvas-editor"]', { visible: true, timeout: 60_000 });
    await page.waitForSelector('[data-testid="canvas-node-limit_300"]', { timeout: 45_000 });
    const renderedNodeCountAtLimit = await page.$$eval('[data-testid="canvas-workspace"] [data-canvas-node]', (nodes) => nodes.length);
    const maximumDocumentRendered = renderedNodeCountAtLimit === 300;
    assert(maximumDocumentRendered, `The 300-node Canvas rendered ${renderedNodeCountAtLimit} nodes.`);

    stage = "reconcile a fresh save and restore version one as a new version";
    await setValue(page, 'input[aria-label="Canvas title"]', reconciledTitle);
    await activate(page, '[data-testid="canvas-save"]');
    await page.waitForSelector('[data-testid="canvas-history-version-3"]', { timeout: 45_000 });
    const revisionThree = await waitForCanvas(owner, canvasId, (canvas) => canvas.revision === 3, "reconciled save");
    const reconciledSaveCreatedNewRevision = revisionThree.title === reconciledTitle;
    assert(reconciledSaveCreatedNewRevision, "Fresh rendered Canvas save did not create revision three.");
    await page.$eval('[data-testid="canvas-history"]', (element) => { (element as HTMLDetailsElement).open = true; });
    await page.waitForSelector('[data-testid="canvas-history-version-1"] button', { visible: true, timeout: 30_000 });
    page.once("dialog", (dialog) => void dialog.accept());
    await activate(page, '[data-testid="canvas-history-version-1"] button');
    await page.waitForSelector('[data-testid="canvas-history-version-4"]', { timeout: 45_000 });
    const restored = await waitForCanvas(owner, canvasId, (canvas) => canvas.revision === 4, "restored revision");
    const revisionsV4 = await request("GET", `/api/canvases/${canvasId}/revisions`, undefined, owner.cookie);
    const restoreCreatedNewImmutableRevision = restored.title === initialTitle
      && restored.content?.nodes?.length === 2
      && revisionsV4.status === 200
      && revisionsV4.body.revisions?.length === 4
      && revisionsV4.body.revisions[0]?.action === "restored"
      && revisionsV4.body.revisions[0]?.sourceRevision === 1;
    assert(restoreCreatedNewImmutableRevision, "Rendered Canvas restore did not create immutable revision four from version one.");
    const editorAudit = await auditPage(page, '[data-testid="canvas-editor"]');
    assertCleanAudit(editorAudit, `${viewport.name} Canvas editor`);

    stage = "render restored catalog state and audit responsive semantics";
    await page.goto(new URL("/canvases", BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector(`[data-testid="canvas-card-${canvasId}"]`, { visible: true, timeout: 45_000 });
    const catalogPersistenceRendered = await page.$eval(`[data-testid="canvas-card-${canvasId}"]`, (element, title) => element.textContent?.includes(String(title)) === true, initialTitle);
    assert(catalogPersistenceRendered, "Restored Canvas did not render in the catalog.");
    const catalogAudit = await auditPage(page, '[data-testid="canvas-page"]');
    assertCleanAudit(catalogAudit, `${viewport.name} Canvas catalog`);
    assert(Object.values(signals).every((items) => items.length === 0), `${viewport.name} Canvas journey produced application errors: ${JSON.stringify(signals)}.`);
    view = { viewport: viewport.name, catalogAndEditorRendered, governedTemplateReviewed, nodeAndConnectionEditingReconciled, undoRedoReconciled, viewportControlsReconciled, localImportReviewedAndPersisted, immutableCreationRevisionReconciled, crossOwnerIsolationReconciled, staleSaveStoppedAsConflict, maximumDocumentRendered, renderedNodeCountAtLimit, reconciledSaveCreatedNewRevision, restoreCreatedNewImmutableRevision, catalogPersistenceRendered, editorAudit, catalogAudit, signals };
  } catch (error) {
    const rendered = page ? await page.evaluate(() => document.body?.innerText.slice(0, 2_000) || "page unavailable").catch(() => "page unavailable") : "page unavailable";
    if (page) await page.screenshot({ path: path.join(OUTPUT_DIR, `canvas-${viewport.name}-failure.png`), fullPage: true }).catch(() => undefined);
    failure = new Error(`${safeError(error)}; rendered=${rendered}`);
  } finally {
    if (context) await context.close().catch(() => undefined);
    ownerErased = await eraseAccount(owner);
    otherErased = await eraseAccount(other);
  }
  const cleanup: Cleanup = { viewport: viewport.name, accountErased: ownerErased, sessionInvalidated: ownerErased, emailReleased: ownerErased, displayNameReleased: ownerErased, otherAccountErased: otherErased };
  if (failure) throw new Error(`stage=${stage}; ${safeError(failure)}; ownerErased=${ownerErased}; otherErased=${otherErased}`);
  assert(view && ownerErased && otherErased, `${viewport.name} did not complete the rendered Canvas journey and verified account erasure.`);
  return { view, cleanup };
}

async function main(): Promise<void> {
  assert(BASE_URL.origin === "https://lyfeos.net", "Production Canvas acceptance may target only https://lyfeos.net.");
  assert(/^[0-9a-f]{40}$/.test(SOURCE), "Production Canvas acceptance requires the exact deployed source revision.");
  assert(/^[0-9a-f]{40}$/.test(HARNESS_SOURCE), "Production Canvas acceptance requires the exact harness source revision.");
  const release = await request("GET", "/api/release");
  assert(release.status === 200 && release.body?.sourceRevision === SOURCE, "Production Canvas runtime does not match the requested immutable source.");
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
      contract: "lyfeos.production-canvas-browser.v1",
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL.origin,
      sourceRevision: SOURCE,
      harnessSource: HARNESS_SOURCE,
      views,
      cleanups,
      summary: { passed, failure },
      boundary: "Disposable production-account Chromium evidence for Canvas. It proves desktop/mobile catalog and editor rendering; explicit built-in template review; node and directed-connection editing; local undo/redo and viewport controls; explicit local LyfeOS Canvas JSON review before persistence; immutable create, update, conflict and restore revisions; cross-owner isolation; complete rendering at the documented 300-node limit; responsive semantics; and verified account/session/identifier erasure. It does not prove physical-device pointer or multi-touch gesture quality, browser file-picker denial recovery, simultaneous multi-tab editing, human assistive-technology comprehension, user-authored template catalogs, arbitrary third-party whiteboard import, collaboration, production-scale rendering latency, or longitudinal usefulness of user-authored maps.",
    };
    await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    if (process.env.GITHUB_STEP_SUMMARY) {
      await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, [
        "## LyfeOS production Canvas acceptance",
        "",
        `- Runtime source: ${SOURCE}`,
        `- Harness source: ${HARNESS_SOURCE}`,
        `- Passed: ${passed}`,
        `- Desktop/mobile views: ${views.length}/${VIEWPORTS.length}`,
        `- Disposable owners erased: ${cleanups.filter((cleanup) => cleanup.accountErased && cleanup.otherAccountErased).length}/${VIEWPORTS.length}`,
        "",
        report.boundary,
        "",
      ].join("\n"), "utf8");
    }
    console.log(JSON.stringify({ contract: report.contract, passed, viewCount: views.length, erasedOwnerPairs: cleanups.filter((cleanup) => cleanup.accountErased && cleanup.otherAccountErased).length }));
    if (!passed && !failure) failure = "Production Canvas acceptance did not satisfy every rendered, concurrency, isolation and cleanup invariant.";
  }
  if (failure) throw new Error(failure);
}

main().catch((error) => {
  console.error(safeError(error));
  process.exitCode = 1;
});
