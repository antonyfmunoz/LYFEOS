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
  firstThreadStatus: string;
  successorThreadStatus: string;
  durableReviewedExperience: number;
  successorThreadExperience: number;
  focusCount: number;
  renderedFirstFocus: string;
  renderedSuccessorFocus: string;
  duplicateIds: string[];
  unlabeledControls: string[];
  horizontalOverflowPx: number;
  failedRequests: string[];
  consoleErrors: string[];
  isolatedProviderResourceErrors: string[];
  erased: boolean;
};

const BASE_URL = new URL(process.env.LYFEOS_TEST_API_URL || "http://127.0.0.1:5099");
const DATABASE_URL = process.env.DATABASE_URL?.trim() || "";
const OUTPUT_DIR = path.resolve(process.env.LYFEOS_THREAD_SUCCESSOR_OUTPUT_DIR || path.join(os.tmpdir(), "lyfeos-thread-successor-browser"));
const OUTPUT_FILE = path.join(OUTPUT_DIR, "report.json");
const PASSWORD = "TestPass123!";
const ONBOARDING_MISSIONS = Array.from({ length: 8 }, (_, id) => id);
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
  throw new Error("No Chromium executable found for isolated successor-focus acceptance.");
}

function cookieParts(cookie: string): { name: string; value: string } {
  const separator = cookie.indexOf("=");
  assert(separator > 0, "Registration did not return a usable session cookie.");
  return { name: cookie.slice(0, separator), value: cookie.slice(separator + 1) };
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
  await page.evaluate((tutorialSelector) => {
    const button = document.querySelector<HTMLButtonElement>(tutorialSelector);
    if (!button) throw new Error("Tutorial skip control disappeared before dismissal.");
    button.click();
  }, selector);
  await page.waitForSelector(selector, { hidden: true, timeout: 10_000 });
  return true;
}

async function auditRenderedPage(page: Page) {
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

async function createCompletedFocus(pool: pg.Pool, cookie: string, userId: number, fixtureId: string) {
  const profile = await request("PATCH", "/api/profile", {
    onboardingCompleted: true,
    completedOnboardingMissions: ONBOARDING_MISSIONS,
    primaryCraft: "Evidence-based facilitation",
    desiredTrait: "Deliberate communication",
    lockedHabit: "Weekly reflection",
    weeklyCapacity: { hours: 6 },
  }, cookie);
  assert(profile.status === 200, `Onboarding setup returned ${profile.status}.`);

  const initialized = await request("POST", "/api/transformation-thread/initialize", {}, cookie);
  assert(initialized.status === 201, `Initial Thread creation returned ${initialized.status}.`);
  const firstThreadId = Number(initialized.body.thread?.id);
  const capabilityId = Number(initialized.body.thread?.primaryCapabilityId);
  assert(Number.isInteger(firstThreadId) && Number.isInteger(capabilityId), "Initial Thread omitted its durable capability identity.");

  const activated = await request("POST", `/api/transformation-thread/${firstThreadId}/activate`, {}, cookie);
  assert(activated.status === 200 && activated.body.createdMissions === 3, `Initial Thread activation returned ${activated.status} with ${activated.body.createdMissions} starter Missions.`);
  const missionRows = await pool.query<{ id: number }>(
    `SELECT id FROM quests WHERE user_id = $1 AND transformation_thread_id = $2 ORDER BY id`,
    [userId, firstThreadId],
  );
  assert(missionRows.rows.length === 3, `Initial Thread created ${missionRows.rows.length} starter Missions instead of 3.`);

  for (const [index, mission] of missionRows.rows.entries()) {
    const contract = await request("GET", `/api/quests/${mission.id}/contract`, undefined, cookie);
    assert(contract.status === 200, `Starter Mission ${index + 1} contract returned ${contract.status}.`);
    const criteria = Array.isArray(contract.body.contract?.rubricDefinition) ? contract.body.contract.rubricDefinition : [];
    assert(criteria.length > 0, `Starter Mission ${index + 1} omitted its proof rubric.`);
    const evidence = await request("POST", `/api/quests/${mission.id}/evidence`, {
      sourceType: "artifact",
      sourceReference: `urn:lyfeos:successor-focus:${fixtureId}:${index + 1}`,
      summary: `Synthetic bounded artifact ${index + 1} demonstrates the declared starter-Mission output.`,
      confidence: "medium",
    }, cookie);
    assert(evidence.status === 201, `Starter Mission ${index + 1} evidence returned ${evidence.status}.`);
    const completed = await request("POST", `/api/quests/${mission.id}/toggle`, undefined, cookie);
    assert(completed.status === 200 && completed.body.quest?.completed === true, `Starter Mission ${index + 1} completion returned ${completed.status}.`);
    const reviewed = await request("POST", `/api/quests/${mission.id}/reviews`, {
      decision: "meets_evidence",
      summary: `Synthetic review ${index + 1} accepts only the declared bounded evidence.`,
      rubric: {
        evidenceChecks: criteria.map((criterion: { id: string; requirement: string }) => ({
          criterionId: criterion.id,
          requirement: criterion.requirement,
          met: true,
        })),
      },
    }, cookie);
    assert(reviewed.status === 201 && reviewed.body.progression?.applied === true, `Starter Mission ${index + 1} review did not apply reviewed practice.`);
  }

  for (const ordinal of [1, 2]) {
    const review = await request("POST", `/api/transformation-thread/${firstThreadId}/review`, {
      reflection: `Synthetic weekly review ${ordinal} records bounded practice evidence for successor-focus qualification.`,
    }, cookie);
    assert(review.status === 201, `Thread review ${ordinal} returned ${review.status}.`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  await pool.query(
    `UPDATE transformation_threads SET activated_at = now() - interval '29 days', updated_at = now() WHERE id = $1 AND user_id = $2`,
    [firstThreadId, userId],
  );
  const completedFocus = await request("POST", `/api/transformation-thread/${firstThreadId}/complete`, {
    reflection: "Synthetic closing reflection confirms three reviewed Missions and two bounded weekly reviews.",
  }, cookie);
  assert(completedFocus.status === 200 && completedFocus.body.thread?.status === "completed", `Thread completion returned ${completedFocus.status}.`);

  const history = await request("GET", `/api/capabilities/${capabilityId}/history`, undefined, cookie);
  const durableReviewedExperience = Number(history.body.capability?.experience);
  assert(history.status === 200 && durableReviewedExperience > 0, "Completed focus did not retain positive reviewed capability XP.");
  return { firstThreadId, capabilityId, durableReviewedExperience };
}

async function runViewport(browser: Browser, pool: pg.Pool, viewport: { name: string; value: Viewport }, ordinal: number): Promise<ViewResult> {
  const fixtureId = `${Date.now()}_${ordinal}_${randomUUID().slice(0, 8)}`;
  const email = `thread_successor_${fixtureId}@example.com`;
  const displayName = `thread_successor_${ordinal}_${fixtureId.slice(-8)}`;
  let cookie = "";
  let userId = 0;
  let erased = false;
  const failedRequests: string[] = [];
  const consoleErrors: string[] = [];
  const isolatedProviderResourceErrors: string[] = [];
  const page = await browser.newPage();
  let stage = "register isolated owner";
  try {
    const registration = await request("POST", "/api/auth/complete-registration", { email, password: PASSWORD, displayName, termsAccepted: true });
    assert(registration.status === 201, `Registration returned ${registration.status}.`);
    cookie = registration.cookie;
    userId = Number(registration.body.user?.id);
    assert(Number.isInteger(userId) && userId > 0 && cookie, "Registration did not create the isolated owner and session.");
    stage = "complete the first evidence-reviewed focus";
    const first = await createCompletedFocus(pool, cookie, userId, fixtureId);

    stage = "open the no-current-Thread dashboard";
    const session = cookieParts(cookie);
    await page.setCookie({ ...session, url: BASE_URL.origin, path: "/", httpOnly: true, secure: false, sameSite: "Lax" });
    await page.evaluateOnNewDocument((fixtureUser) => localStorage.setItem("lyfeos_user", JSON.stringify(fixtureUser)), { id: userId, displayName });
    await page.setViewport(viewport.value);
    await page.setCacheEnabled(false);
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const source = message.location().url;
      const detail = `${message.text().slice(0, 240)}${source ? ` @ ${source}` : ""}`;
      if (message.text().includes("net::ERR_NAME_NOT_RESOLVED") && source.startsWith("https://local.lyfeos.dev/npm/@clerk/clerk-js@5/")) isolatedProviderResourceErrors.push(detail);
      else consoleErrors.push(detail);
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message.slice(0, 300)));
    page.on("response", (response) => {
      if (response.status() >= 500 && new URL(response.url()).origin === BASE_URL.origin) failedRequests.push(`${response.status()} ${new URL(response.url()).pathname}`);
    });

    await page.goto(new URL("/dashboard", BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector('[data-testid="transformation-thread-initialization"]', { visible: true, timeout: 60_000 });
    await page.waitForSelector('[data-testid="next-capability-focus"]', { visible: true, timeout: 30_000 });
    await dismissBlockingTutorial(page);
    stage = "wait for the durable capability option";
    await page.waitForFunction((capabilityId) => [...(document.querySelector<HTMLSelectElement>('[data-testid="next-capability-focus"]')?.options || [])]
      .some((option) => option.value === String(capabilityId)), { timeout: 30_000 }, first.capabilityId);
    const optionText = await page.$eval('[data-testid="next-capability-focus"]', (select, capabilityId) => {
      const option = [...(select as HTMLSelectElement).options].find((candidate) => candidate.value === String(capabilityId));
      return option?.textContent?.trim() || "";
    }, first.capabilityId);
    assert(optionText.includes(`${first.durableReviewedExperience} XP`), `Rendered successor selector omitted durable reviewed XP: ${optionText}.`);
    stage = "initialize the successor through rendered controls";
    await page.select('[data-testid="next-capability-focus"]', String(first.capabilityId));
    const [initializeResponse] = await Promise.all([
      page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/transformation-thread/initialize", { timeout: 30_000 }),
      page.click('[data-testid="prepare-thread-focus"]'),
    ]);
    assert(initializeResponse.status() === 201, `Rendered successor initialization returned ${initializeResponse.status()}.`);
    const initializeBody = await initializeResponse.json() as { thread?: { id?: number; primaryCapabilityId?: number } };
    const successorThreadId = Number(initializeBody.thread?.id);
    assert(Number.isInteger(successorThreadId) && successorThreadId !== first.firstThreadId && initializeBody.thread?.primaryCapabilityId === first.capabilityId, "Rendered successor initialization did not create a distinct Thread over the same capability.");

    stage = "activate the successor through rendered controls";
    await page.waitForSelector('[data-testid="activate-thread-plan"]', { visible: true, timeout: 30_000 });
    const [activateResponse] = await Promise.all([
      page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/transformation-thread/${successorThreadId}/activate`, { timeout: 30_000 }),
      page.click('[data-testid="activate-thread-plan"]'),
    ]);
    assert(activateResponse.status() === 200, `Rendered successor activation returned ${activateResponse.status()}.`);
    const activateBody = await activateResponse.json() as { createdMissions?: number };
    assert(activateBody.createdMissions === 3, `Rendered successor activation created ${activateBody.createdMissions} starter Missions.`);

    stage = "verify durable and Thread-local progression separation";
    const current = await request("GET", "/api/transformation-thread", undefined, cookie);
    const primary = current.body.thread?.skills?.find((skill: { kind?: string }) => skill.kind === "primary");
    const graphPrimary = current.body.thread?.skillGraph?.nodes?.find((skill: { kind?: string }) => skill.kind === "primary");
    assert(current.status === 200 && current.body.thread?.id === successorThreadId && current.body.thread?.status === "active", "Activated successor was not the current active Thread.");
    assert(Number.isInteger(primary?.id), "Activated successor omitted its rendered primary skill identity.");
    assert(primary?.capabilityId === first.capabilityId && Number(primary?.experience) === 0, "Successor primary skill did not begin with zero Thread-local XP over the same durable capability.");
    assert(Number(graphPrimary?.experience) === first.durableReviewedExperience && Number(graphPrimary?.threadExperience) === 0, "Successor graph did not separate durable reviewed XP from zero Thread-local XP.");

    stage = "render both capability focus periods";
    await page.waitForSelector(`[data-testid="capability-history-toggle-${primary.id}"]`, { visible: true, timeout: 30_000 });
    await page.click(`[data-testid="capability-history-toggle-${primary.id}"]`);
    await page.waitForSelector(`[data-testid="capability-focus-${successorThreadId}"]`, { visible: true, timeout: 30_000 });
    await page.waitForSelector(`[data-testid="capability-focus-${first.firstThreadId}"]`, { visible: true, timeout: 30_000 });
    const renderedSuccessorFocus = await page.$eval(`[data-testid="capability-focus-${successorThreadId}"]`, (element) => element.textContent?.trim() || "");
    const renderedFirstFocus = await page.$eval(`[data-testid="capability-focus-${first.firstThreadId}"]`, (element) => element.textContent?.trim() || "");
    assert(renderedSuccessorFocus.includes("active") && renderedSuccessorFocus.includes("0 XP recorded in this Thread"), `Rendered successor focus was not truthful: ${renderedSuccessorFocus}.`);
    assert(renderedFirstFocus.includes("completed") && renderedFirstFocus.includes(`${first.durableReviewedExperience} XP recorded in this Thread`), `Rendered completed focus was not truthful: ${renderedFirstFocus}.`);

    const capabilities = await request("GET", "/api/capabilities", undefined, cookie);
    const capability = capabilities.body.capabilities?.find((item: { id?: number }) => item.id === first.capabilityId);
    assert(capability?.focusCount === 2 && capability?.experience === first.durableReviewedExperience, "Capability summary did not preserve one durable total across two focus periods.");
    stage = "audit the rendered successor dashboard";
    const rendered = await auditRenderedPage(page);
    assert(rendered.duplicateIds.length === 0, `Rendered ${viewport.name} dashboard has duplicate IDs: ${rendered.duplicateIds.join(", ")}.`);
    assert(rendered.unlabeledControls.length === 0, `Rendered ${viewport.name} dashboard has unlabeled controls: ${rendered.unlabeledControls.join(", ")}.`);
    assert(rendered.horizontalOverflowPx <= 2, `Rendered ${viewport.name} dashboard overflows horizontally by ${rendered.horizontalOverflowPx}px.`);
    assert(failedRequests.length === 0, `Rendered ${viewport.name} journey received server failures: ${failedRequests.join(", ")}.`);
    assert(consoleErrors.length === 0, `Rendered ${viewport.name} journey logged errors: ${consoleErrors.join(" | ")}.`);
    await page.screenshot({ path: path.join(OUTPUT_DIR, `${viewport.name}.png`), fullPage: true });
    await page.close();

    stage = "erase the isolated owner and verify zero residue";
    const deletion = await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, cookie);
    assert(deletion.status === 200, `Account erasure returned ${deletion.status}.`);
    erased = true;
    const residue = await pool.query(
      `SELECT
        (SELECT count(*)::int FROM users WHERE id = $1) AS users,
        (SELECT count(*)::int FROM transformation_threads WHERE user_id = $1) AS threads,
        (SELECT count(*)::int FROM transformation_thread_evidence WHERE user_id = $1) AS thread_evidence,
        (SELECT count(*)::int FROM personal_capabilities WHERE user_id = $1) AS capabilities,
        (SELECT count(*)::int FROM skill_nodes WHERE user_id = $1) AS skills,
        (SELECT count(*)::int FROM skill_edges WHERE user_id = $1) AS skill_edges,
        (SELECT count(*)::int FROM quest_skill_contributions WHERE user_id = $1) AS mission_skill_links,
        (SELECT count(*)::int FROM skill_progression_events WHERE user_id = $1) AS progression_events,
        (SELECT count(*)::int FROM quests WHERE user_id = $1) AS missions,
        (SELECT count(*)::int FROM mission_contracts WHERE user_id = $1) AS contracts,
        (SELECT count(*)::int FROM mission_evidence WHERE user_id = $1) AS evidence,
        (SELECT count(*)::int FROM mission_reviews WHERE user_id = $1) AS reviews,
        (SELECT count(*)::int FROM widget_states WHERE user_id = $1) AS widget_states`,
      [userId],
    );
    assert(Object.values(residue.rows[0]).every((count) => count === 0), `Account erasure left successor-focus residue: ${JSON.stringify(residue.rows[0])}.`);

    return {
      viewport: viewport.name,
      firstThreadStatus: "completed",
      successorThreadStatus: "active",
      durableReviewedExperience: first.durableReviewedExperience,
      successorThreadExperience: Number(graphPrimary.threadExperience),
      focusCount: capability.focusCount,
      renderedFirstFocus,
      renderedSuccessorFocus,
      ...rendered,
      failedRequests,
      consoleErrors,
      isolatedProviderResourceErrors,
      erased,
    };
  } catch (error) {
    if (!page.isClosed()) await page.screenshot({ path: path.join(OUTPUT_DIR, `${viewport.name}-failure.png`), fullPage: true }).catch(() => undefined);
    throw new Error(`${viewport.name} failed while attempting to ${stage}: ${safeError(error)}`);
  } finally {
    if (!page.isClosed()) await page.close().catch(() => undefined);
    if (cookie && !erased) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, cookie).catch(() => undefined);
  }
}

async function main() {
  assert(DATABASE_URL, "DATABASE_URL is required for isolated successor-focus acceptance.");
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const executablePath = await findChromium();
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const views: ViewResult[] = [];
    for (const [index, viewport] of VIEWPORTS.entries()) views.push(await runViewport(browser, pool, viewport, index));
    const report = {
      schema: "lyfeos.isolated-thread-successor-browser.v1",
      generatedAt: new Date().toISOString(),
      sourceRevision: process.env.GITHUB_SHA || process.env.LYFEOS_RELEASE || "local",
      passed: views.every((view) => view.erased && view.focusCount === 2 && view.successorThreadExperience === 0 && view.durableReviewedExperience > 0),
      views,
      boundary: "This isolated journey backdates only the first Thread activation timestamp so the real 28-day completion rule can be exercised without waiting. It completes three canonical Missions with declared evidence and positive rubric reviews, records two Thread reviews, completes the first focus through the real API, then creates and activates the successor through rendered desktop/mobile controls. It proves durable reviewed capability XP survives while the successor starts at zero Thread-local XP. It does not prove longitudinal usefulness, external certification, authority, or a production user's comprehension.",
    };
    assert(report.passed, "Successor-focus report did not satisfy its declared boundary.");
    await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`Isolated successor-focus browser acceptance passed: ${OUTPUT_FILE}`);
  } catch (error) {
    await fs.writeFile(OUTPUT_FILE, `${JSON.stringify({ schema: "lyfeos.isolated-thread-successor-browser.v1", generatedAt: new Date().toISOString(), passed: false, error: safeError(error) }, null, 2)}\n`, "utf8");
    throw error;
  } finally {
    await browser.close();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(safeError(error));
  process.exitCode = 1;
});
