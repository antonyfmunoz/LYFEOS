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
  status: string;
  actionAttempts: number[];
  repairLabel: string | null;
  duplicateIds: string[];
  unlabeledControls: string[];
  horizontalOverflowPx: number;
};

const BASE_URL = new URL(process.env.LYFEOS_TEST_API_URL || "http://127.0.0.1:5099");
const DATABASE_URL = process.env.DATABASE_URL?.trim() || "";
const OUTPUT_DIR = path.resolve(process.env.LYFEOS_AUTOMATION_RECOVERY_OUTPUT_DIR || path.join(os.tmpdir(), "lyfeos-automation-recovery-browser"));
const OUTPUT_FILE = path.join(OUTPUT_DIR, "report.json");
const FIXTURE_ID = randomUUID();
const FIXTURE_LABEL = FIXTURE_ID.slice(0, 8);
const EMAIL = `automation_browser_${FIXTURE_LABEL}@example.com`;
const PASSWORD = "TestPass123!";
const DISPLAY_NAME = `automation_browser_${FIXTURE_LABEL}`;
const MISSION_TITLE = `[AUTOMATED ACCEPTANCE] Recovery ${FIXTURE_LABEL}`;
const MISSION_SECRET = `private-description-${FIXTURE_ID}`;
const FOLLOW_UP_TITLE = `[AUTOMATED ACCEPTANCE] Recovery follow-up ${FIXTURE_LABEL}`;
const AUTOMATION_NAME = `[AUTOMATED ACCEPTANCE] Recovery rule ${FIXTURE_LABEL}`;
const VIEWPORTS: Array<{ name: string; value: Viewport }> = [
  { name: "desktop-1440x900", value: { width: 1440, height: 900, deviceScaleFactor: 1 } },
  { name: "mobile-390x844", value: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replaceAll(EMAIL, "[redacted fixture]").replaceAll(FIXTURE_ID, "[redacted fixture]").slice(0, 1_000);
}

async function request(method: string, pathname: string, body?: unknown, cookie = ""): Promise<ApiResult> {
  const response = await fetch(new URL(pathname, BASE_URL), {
    method,
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
  throw new Error("No Chromium executable found for isolated automation recovery acceptance.");
}

function cookieParts(cookie: string): { name: string; value: string } {
  const separator = cookie.indexOf("=");
  assert(separator > 0, "Registration did not return a usable session cookie.");
  return { name: cookie.slice(0, separator), value: cookie.slice(separator + 1) };
}

async function inspectRun(page: Page, runId: number, viewport: string): Promise<ViewResult> {
  return page.evaluate(({ id, viewportName, privateDescription }) => {
    const run = document.querySelector<HTMLElement>(`[data-testid="automation-run-${id}"]`);
    if (!run) throw new Error(`Run ${id} was not rendered.`);
    const bodyText = document.body.innerText;
    if (bodyText.includes(privateDescription)) throw new Error("A private Mission description was copied into the rendered automation surface.");
    const ids = new Map<string, number>();
    for (const element of document.querySelectorAll<HTMLElement>("[id]")) ids.set(element.id, (ids.get(element.id) || 0) + 1);
    const duplicateIds = [...ids.entries()].filter(([, count]) => count > 1).map(([elementId]) => elementId).sort();
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
    const actionAttempts = [...run.querySelectorAll<HTMLElement>(`[data-testid^="automation-run-${id}-action-"]`)].map((action) => {
      const match = action.innerText.match(/(\d+) attempt/);
      return match ? Number(match[1]) : 0;
    });
    const repair = run.querySelector<HTMLButtonElement>(`[data-testid="automation-run-repair-${id}"]`);
    const documentWidth = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0);
    return {
      viewport: viewportName,
      status: run.innerText,
      actionAttempts,
      repairLabel: repair?.getAttribute("aria-label") || null,
      duplicateIds,
      unlabeledControls,
      horizontalOverflowPx: Math.max(0, documentWidth - window.innerWidth),
    };
  }, { id: runId, viewportName: viewport, privateDescription: MISSION_SECRET });
}

async function main(): Promise<void> {
  assert(process.env.LYFEOS_TEST_ENV === "isolated", "Rendered recovery acceptance is restricted to an explicit isolated environment.");
  assert(["127.0.0.1", "localhost"].includes(BASE_URL.hostname), "Rendered recovery acceptance may target only localhost.");
  assert(DATABASE_URL.length > 0, "Rendered recovery acceptance requires disposable PostgreSQL.");
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  let browser: Browser | null = null;
  let cookie = "";
  let userId = 0;
  let missionId = 0;
  let automationId = 0;
  let runId = 0;
  let followUpId = 0;
  const views: ViewResult[] = [];
  let repaired = false;
  let followUpCount = 0;
  let accountErased = false;
  let failure: string | null = null;

  try {
    const registration = await request("POST", "/api/auth/complete-registration", {
      email: EMAIL,
      password: PASSWORD,
      displayName: DISPLAY_NAME,
      termsAccepted: true,
    });
    assert(registration.status === 201, `Registration returned ${registration.status}.`);
    cookie = registration.cookie;
    userId = Number(registration.body.user?.id);
    assert(Number.isInteger(userId) && userId > 0 && cookie, "Registration did not create the isolated owner and session.");
    const onboarding = await request("PATCH", "/api/profile", { onboardingCompleted: true }, cookie);
    assert(onboarding.status === 200 && onboarding.body?.onboardingCompleted === true, `Onboarding fixture setup returned ${onboarding.status}.`);

    const mission = await request("POST", "/api/quests", {
      userId,
      title: MISSION_TITLE,
      description: MISSION_SECRET,
      category: "general",
      completed: false,
    }, cookie);
    assert(mission.status === 201, `Mission creation returned ${mission.status}.`);
    missionId = Number(mission.body.quest?.id);

    const definition = {
      version: 1,
      trigger: { type: "manual" },
      conditions: {},
      actions: [
        { type: "set_mission_category", category: "growth" },
        { type: "schedule_follow_up", title: FOLLOW_UP_TITLE, description: "", category: "general", delayDays: 1 },
      ],
      stopOnError: true,
    };
    const created = await request("POST", "/api/automations", { name: AUTOMATION_NAME, description: "Disposable recovery rendering", definition }, cookie);
    assert(created.status === 201, `Automation creation returned ${created.status}.`);
    automationId = Number(created.body.automation?.id);
    const enabled = await request("PATCH", `/api/automations/${automationId}`, { enabled: true }, cookie);
    assert(enabled.status === 200, `Automation enable returned ${enabled.status}.`);
    const executed = await request("POST", `/api/automations/${automationId}/run`, { questId: missionId, mutationId: randomUUID() }, cookie);
    assert(executed.status === 200 && executed.body.result?.status === "succeeded", `Automation execution returned ${executed.status}/${executed.body.result?.status}.`);
    runId = Number(executed.body.result?.runId);
    const followUpResult = executed.body.result?.actionResults?.find((result: any) => result.actionIndex === 1);
    followUpId = Number(followUpResult?.targetQuestId);
    assert(Number.isInteger(runId) && runId > 0 && Number.isInteger(followUpId) && followUpId > 0, "Execution did not expose bounded run and target Mission IDs.");

    const partialResults = [
      { actionIndex: 0, type: "set_mission_category", status: "succeeded", targetQuestId: missionId, attemptCount: 1 },
      { actionIndex: 1, type: "schedule_follow_up", status: "failed", targetQuestId: followUpId, attemptCount: 1, errorCode: "ACTION_FAILED" },
    ];
    await pool.query("UPDATE workflow_automation_action_receipts SET status = 'failed', last_error_code = 'ACTION_FAILED', completed_at = now(), updated_at = now() WHERE user_id = $1 AND run_id = $2 AND action_index = 1", [userId, runId]);
    await pool.query("UPDATE workflow_automation_runs SET status = 'partial', action_results = $1::jsonb, error_code = 'ACTION_FAILED', completed_at = now() WHERE user_id = $2 AND id = $3", [JSON.stringify(partialResults), userId, runId]);

    const detail = await request("GET", `/api/automations/${automationId}`, undefined, cookie);
    const publicRun = detail.body.runs?.find((candidate: any) => candidate.id === runId);
    assert(detail.status === 200 && publicRun?.status === "partial", "Owner detail did not expose the bounded partial receipt.");
    assert(!Object.hasOwn(publicRun, "definitionSnapshot") && !Object.hasOwn(publicRun, "idempotencyKey"), "Owner detail exposed private execution fields.");

    browser = await puppeteer.launch({
      executablePath: await findChromium(),
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--no-proxy-server"],
    });
    const page = await browser.newPage();
    const session = cookieParts(cookie);
    await page.setCookie({ ...session, url: BASE_URL.origin, path: "/", httpOnly: true, secure: false, sameSite: "Lax" });
    await page.evaluateOnNewDocument((fixtureUser) => {
      localStorage.setItem("lyfeos_user", JSON.stringify(fixtureUser));
    }, { id: userId, displayName: DISPLAY_NAME });
    await page.setCacheEnabled(false);

    for (const viewport of VIEWPORTS) {
      await page.setViewport(viewport.value);
      await page.goto(new URL("/automations", BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForSelector(`[data-testid="automation-run-${runId}"]`, { visible: true, timeout: 30_000 });
      const view = await inspectRun(page, runId, viewport.name);
      views.push(view);
      assert(view.status.includes("Partial") && view.status.includes(`Run #${runId}`), `${viewport.name} did not render the partial run identity.`);
      assert(view.status.includes("Action 1: Set Mission category") && view.status.includes("Action 2: Create follow-up Mission"), `${viewport.name} did not render ordered action types.`);
      assert(view.status.includes("Succeeded") && view.status.includes("Failed") && view.status.includes("Action Failed") && view.actionAttempts.join(",") === "1,1", `${viewport.name} did not render action outcomes, attempts and safe failure code.`);
      assert(view.status.includes(`Mission #${missionId}`) && view.status.includes(`Mission #${followUpId}`), `${viewport.name} did not render bounded record identifiers.`);
      assert(view.repairLabel === `Retry unfinished actions for run ${runId}`, `${viewport.name} did not expose the explicit repair name.`);
      assert(view.duplicateIds.length === 0 && view.unlabeledControls.length === 0 && view.horizontalOverflowPx <= 2, `${viewport.name} failed rendered accessibility or overflow checks.`);
    }

    const repairResponse = page.waitForResponse((response) => response.url().endsWith(`/api/automations/${automationId}/runs/${runId}/repair`) && response.request().method() === "POST", { timeout: 30_000 });
    await page.$eval(`[data-testid="automation-run-repair-${runId}"]`, (button) => (button as HTMLButtonElement).click());
    assert((await repairResponse).status() === 200, "Rendered Repair did not return success.");
    await page.waitForFunction((id) => {
      const run = document.querySelector<HTMLElement>(`[data-testid="automation-run-${id}"]`);
      return Boolean(run?.innerText.includes("Succeeded") && run.innerText.includes("2 attempts") && !run.querySelector(`[data-testid="automation-run-repair-${id}"]`));
    }, { timeout: 30_000 }, runId);
    repaired = true;

    const repairedView = await inspectRun(page, runId, "mobile-390x844-after-repair");
    assert(repairedView.status.includes("Succeeded") && repairedView.actionAttempts.join(",") === "1,2" && repairedView.repairLabel === null, "Rendered receipt did not converge after repair.");
    views.push(repairedView);
    const missions = await request("GET", "/api/automations/missions", undefined, cookie);
    followUpCount = missions.body.missions?.filter((row: any) => row.title === FOLLOW_UP_TITLE).length || 0;
    assert(followUpCount === 1, "Repair duplicated the lifecycle-keyed follow-up Mission.");
  } catch (error) {
    failure = safeError(error);
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (cookie) {
      const deleted = await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, cookie).catch(() => null);
      if (deleted?.status === 200 && userId > 0) {
        const residual = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM users WHERE id = $1", [userId]);
        accountErased = residual.rows[0]?.count === "0";
      }
    }
    await pool.end();
    const report = {
      contract: "lyfeos.isolated-automation-recovery-browser.v1",
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL.origin,
      fixture: { missionId, automationId, runId, followUpId },
      views,
      repaired,
      actionAttemptsAfterRepair: views.at(-1)?.actionAttempts || [],
      followUpCount,
      accountErased,
      summary: { passed: failure === null && repaired && followUpCount === 1 && accountErased, failure },
      boundary: "Disposable isolated Chromium evidence for partial-run rendering and explicit unfinished-action repair. It is not production execution, a human assistive-technology review, or provider-alert evidence.",
    };
    await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ contract: report.contract, passed: report.summary.passed, viewCount: views.length, repaired, followUpCount, accountErased }));
  }

  if (failure) throw new Error(failure);
  assert(repaired && followUpCount === 1 && accountErased, "Rendered recovery acceptance did not complete its repair and cleanup invariants.");
}

main().catch((error) => {
  console.error(safeError(error));
  process.exitCode = 1;
});
