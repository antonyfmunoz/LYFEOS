import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { access } from "node:fs/promises";
import puppeteer, { type Browser, type Page, type Viewport } from "puppeteer-core";

type RouteKind = "public" | "authenticated";

type RouteResult = {
  kind: RouteKind;
  route: string;
  viewport: string;
  finalPath: string;
  title: string;
  timings: {
    domContentLoadedMs: number | null;
    loadMs: number | null;
    firstContentfulPaintMs: number | null;
    largestContentfulPaintMs: number | null;
    cumulativeLayoutShift: number | null;
  };
  accessibility: {
    duplicateIds: string[];
    unlabeledControls: string[];
    mainCount: number;
    headingCount: number;
    tabbableCount: number;
    firstTabReachedControl: boolean;
  };
  horizontalOverflowPx: number;
  failedRequests: string[];
  serverErrors: string[];
  consoleErrors: string[];
  failures: string[];
};

type AcceptanceReport = {
  contract: "lyfeos.production-browser-acceptance.v1";
  generatedAt: string;
  baseUrl: string;
  source: string | null;
  authenticatedRequested: boolean;
  authenticatedExecuted: boolean;
  thresholds: typeof THRESHOLDS;
  results: RouteResult[];
  summary: {
    routes: number;
    passed: number;
    failed: number;
  };
};

const BASE_URL = new URL(process.env.LYFEOS_ACCEPTANCE_BASE_URL || "https://lyfeos.net");
const REQUIRE_AUTHENTICATED = process.env.LYFEOS_ACCEPTANCE_REQUIRE_AUTHENTICATED === "true";
const EMAIL = process.env.LYFEOS_ACCEPTANCE_EMAIL?.trim() || "";
const PASSWORD = process.env.LYFEOS_ACCEPTANCE_PASSWORD || "";
const SOURCE = process.env.LYFEOS_ACCEPTANCE_SOURCE?.trim() || null;
const OUTPUT_DIR = path.resolve(process.env.LYFEOS_ACCEPTANCE_OUTPUT_DIR || path.join(os.tmpdir(), "lyfeos-browser-acceptance"));
const OUTPUT_FILE = path.join(OUTPUT_DIR, "report.json");

const THRESHOLDS = {
  domContentLoadedMs: Number(process.env.LYFEOS_ACCEPTANCE_MAX_DCL_MS || 5_000),
  loadMs: Number(process.env.LYFEOS_ACCEPTANCE_MAX_LOAD_MS || 8_000),
  firstContentfulPaintMs: Number(process.env.LYFEOS_ACCEPTANCE_MAX_FCP_MS || 3_000),
  largestContentfulPaintMs: Number(process.env.LYFEOS_ACCEPTANCE_MAX_LCP_MS || 4_000),
  cumulativeLayoutShift: Number(process.env.LYFEOS_ACCEPTANCE_MAX_CLS || 0.1),
  horizontalOverflowPx: Number(process.env.LYFEOS_ACCEPTANCE_MAX_OVERFLOW_PX || 2),
} as const;

const PUBLIC_ROUTES = ["/", "/login", "/register", "/forgot-password"] as const;
const AUTHENTICATED_ROUTES = [
  "/dashboard",
  "/missions",
  "/calendar",
  "/ai",
  "/health",
  "/profile",
  "/messages",
  "/projects",
  "/automations",
  "/spreadsheets",
  "/canvases",
  "/databases",
  "/search",
  "/finance",
] as const;

const VIEWPORTS: Array<{ name: string; value: Viewport; mobile: boolean }> = [
  { name: "desktop-1440x900", value: { width: 1440, height: 900, deviceScaleFactor: 1 }, mobile: false },
  { name: "mobile-390x844", value: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, mobile: true },
];

const APP_ERROR_PATTERNS = [
  /LyfeOS encountered an unexpected error/i,
  /Something went wrong/i,
  /404\s+Page Not Found/i,
  /Cannot read properties of undefined/i,
];

function sameOrigin(candidate: string): boolean {
  try {
    return new URL(candidate).origin === BASE_URL.origin;
  } catch {
    return false;
  }
}

function finiteMetric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

async function findChromium(): Promise<string> {
  const configured = process.env.LYFEOS_CHROMIUM_PATH || process.env.CHROME_PATH || process.env.CHROMIUM_PATH;
  const candidates = [
    configured,
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
      // Try the next explicit, bounded location.
    }
  }
  throw new Error("No Chromium executable found. Set LYFEOS_CHROMIUM_PATH to the browser executable used for qualification.");
}

async function installPerformanceObservers(page: Page): Promise<void> {
  await page.evaluateOnNewDocument(() => {
    const state = { cls: 0, lcp: null as number | null };
    Object.defineProperty(window, "__lyfeosAcceptanceVitals", { value: state, configurable: true });
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Array<PerformanceEntry & { hadRecentInput?: boolean; value?: number }>) {
          if (!entry.hadRecentInput && typeof entry.value === "number") state.cls += entry.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    } catch {
      // Older browser builds may not expose layout-shift entries.
    }
    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) state.lcp = last.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      // Older browser builds may not expose LCP entries.
    }
  });
}

async function login(page: Page): Promise<void> {
  if (!EMAIL || !PASSWORD) {
    throw new Error("Authenticated acceptance requires LYFEOS_ACCEPTANCE_EMAIL and LYFEOS_ACCEPTANCE_PASSWORD.");
  }

  await page.goto(new URL("/login", BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector("#identifier", { visible: true, timeout: 30_000 });
  await page.type("#identifier", EMAIL);
  await page.type("#password", PASSWORD);
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForFunction(
      () => !window.location.pathname.startsWith("/login") && !document.body.innerText.includes("Logging in..."),
      { timeout: 60_000 },
    ),
  ]);

  const accountState = await page.evaluate(async () => {
    const [sessionResponse, profileResponse] = await Promise.all([
      fetch("/api/auth/me", { credentials: "include", cache: "no-store" }),
      fetch("/api/profile", { credentials: "include", cache: "no-store" }),
    ]);
    const profile = profileResponse.ok ? await profileResponse.json() as { onboardingCompleted?: boolean } : null;
    return {
      session: { ok: sessionResponse.ok, status: sessionResponse.status },
      profile: { ok: profileResponse.ok, status: profileResponse.status, onboardingCompleted: profile?.onboardingCompleted === true },
    };
  });
  if (!accountState.session.ok) throw new Error(`Login completed without an authenticated LyfeOS session (${accountState.session.status}).`);
  if (!accountState.profile.ok) throw new Error(`Login completed without an accessible LyfeOS profile (${accountState.profile.status}).`);
  if (!accountState.profile.onboardingCompleted) {
    throw new Error("The acceptance account has not completed onboarding; use a dedicated completed production test account.");
  }

  const pathName = new URL(page.url()).pathname;
  if (pathName.startsWith("/onboarding")) {
    throw new Error("The acceptance account has not completed onboarding; use a dedicated completed production test account.");
  }
  // Returning users normally pass through /login-success and a once-daily welcome
  // ceremony. That transition is not unfinished onboarding, so enter the protected
  // product only after the authoritative profile check above succeeds.
  if (pathName.startsWith("/login-success") || pathName.startsWith("/ceremony")) {
    await page.goto(new URL("/dashboard", BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
  }
}

function sanitizedFailureMessage(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error);
  if (EMAIL) message = message.replaceAll(EMAIL, "[redacted acceptance account]");
  if (PASSWORD) message = message.replaceAll(PASSWORD, "[redacted acceptance credential]");
  return message.slice(0, 1_000);
}

async function writeFatalEvidence(message: string): Promise<void> {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const failure = {
    contract: "lyfeos.production-browser-acceptance.failure.v1",
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL.origin,
    source: SOURCE,
    authenticatedRequested: REQUIRE_AUTHENTICATED,
    message,
  } as const;
  await fs.writeFile(path.join(OUTPUT_DIR, "failure.json"), `${JSON.stringify(failure, null, 2)}\n`, "utf8");
  if (process.env.GITHUB_STEP_SUMMARY) {
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `## LyfeOS production browser acceptance\n\n- Source: ${SOURCE || "not supplied"}\n- Fatal setup failure: ${message}\n`, "utf8");
  }
}

async function auditRoute(page: Page, route: string, kind: RouteKind, viewportName: string): Promise<RouteResult> {
  const failedRequests: string[] = [];
  const serverErrors: string[] = [];
  const consoleErrors: string[] = [];

  const requestFailed = (request: import("puppeteer-core").HTTPRequest) => {
    if (!sameOrigin(request.url())) return;
    const reason = request.failure()?.errorText || "unknown";
    if (reason === "net::ERR_ABORTED") return;
    failedRequests.push(`${request.method()} ${request.url()} (${reason})`);
  };
  const responseReceived = (response: import("puppeteer-core").HTTPResponse) => {
    if (sameOrigin(response.url()) && response.status() >= 500) {
      serverErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  };
  const consoleReceived = (message: import("puppeteer-core").ConsoleMessage) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/posthog|sentry.*transport|favicon/i.test(text)) return;
    const locationUrl = message.location().url;
    if (
      kind === "public"
      && /Failed to load resource: the server responded with a status of 401/i.test(text)
      && locationUrl
      && new URL(locationUrl).pathname === "/api/auth/me"
    ) return;
    consoleErrors.push(text.slice(0, 500));
  };

  page.on("requestfailed", requestFailed);
  page.on("response", responseReceived);
  page.on("console", consoleReceived);

  try {
    await page.goto(new URL(route, BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForFunction(
      () => {
        const text = document.body?.innerText || "";
        return text.length > 20 && !text.includes("Loading LyfeOS…") && !text.includes("Signing you in...");
      },
      { timeout: 30_000 },
    );
    await new Promise((resolve) => setTimeout(resolve, 1_000));

    const dom = await page.evaluate(() => {
      const bodyText = document.body?.innerText || "";
      const ids = new Map<string, number>();
      for (const element of document.querySelectorAll<HTMLElement>("[id]")) {
        if (element.id) ids.set(element.id, (ids.get(element.id) || 0) + 1);
      }
      const duplicateIds = [...ids.entries()].filter(([, count]) => count > 1).map(([id]) => id).sort();

      const unlabeledControls = [...document.querySelectorAll<HTMLElement>("button,input,select,textarea")]
        .filter((element) => {
          if (element.getAttribute("aria-hidden") === "true") return false;
          if (element instanceof HTMLInputElement && element.type === "hidden") return false;
          const id = element.id;
          const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
          const name = element.getAttribute("aria-label") || element.getAttribute("aria-labelledby") || element.getAttribute("title") || element.textContent?.trim();
          return !label && !name;
        })
        .slice(0, 20)
        .map((element) => `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${element.getAttribute("data-testid") ? `[data-testid=${element.getAttribute("data-testid")}]` : ""}`);

      const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const fcp = performance.getEntriesByName("first-contentful-paint")[0];
      const vitals = (window as typeof window & { __lyfeosAcceptanceVitals?: { cls: number; lcp: number | null } }).__lyfeosAcceptanceVitals;
      const documentWidth = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0);

      return {
        bodyText,
        title: document.title,
        duplicateIds,
        unlabeledControls,
        mainCount: document.querySelectorAll("main,[role=main]").length,
        headingCount: document.querySelectorAll("h1,h2,h3,h4,h5,h6,[role=heading]").length,
        tabbableCount: document.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])').length,
        horizontalOverflowPx: Math.max(0, documentWidth - window.innerWidth),
        timings: {
          domContentLoadedMs: navigation?.domContentLoadedEventEnd ?? null,
          loadMs: navigation?.loadEventEnd ?? null,
          firstContentfulPaintMs: fcp?.startTime ?? null,
          largestContentfulPaintMs: vitals?.lcp ?? null,
          cumulativeLayoutShift: vitals?.cls ?? null,
        },
      };
    });

    await page.keyboard.press("Tab");
    const firstTabReachedControl = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      if (!active || active === document.body) return false;
      const rect = active.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });

    const finalPath = new URL(page.url()).pathname;
    const failures: string[] = [];
    if (kind === "authenticated" && (finalPath.startsWith("/login") || finalPath.startsWith("/onboarding") || finalPath.startsWith("/ceremony"))) {
      failures.push(`protected route redirected to ${finalPath}`);
    }
    if (kind === "public" && route !== "/" && finalPath !== route) failures.push(`expected ${route}, landed on ${finalPath}`);
    for (const pattern of APP_ERROR_PATTERNS) {
      if (pattern.test(dom.bodyText)) failures.push(`page rendered application error matching ${pattern}`);
    }
    if (!dom.title.trim()) failures.push("document title is empty");
    if (dom.mainCount === 0) failures.push("no main landmark");
    if (dom.headingCount === 0) failures.push("no heading");
    if (dom.tabbableCount > 0 && !firstTabReachedControl) failures.push("Tab did not reach a visible control");
    if (dom.duplicateIds.length) failures.push(`duplicate IDs: ${dom.duplicateIds.join(", ")}`);
    if (dom.unlabeledControls.length) failures.push(`unlabelled controls: ${dom.unlabeledControls.join(", ")}`);
    if (dom.horizontalOverflowPx > THRESHOLDS.horizontalOverflowPx) failures.push(`horizontal overflow ${dom.horizontalOverflowPx}px`);
    if (failedRequests.length) failures.push(`${failedRequests.length} same-origin request failure(s)`);
    if (serverErrors.length) failures.push(`${serverErrors.length} same-origin server error response(s)`);
    if (consoleErrors.length) failures.push(`${consoleErrors.length} console error(s)`);

    const metrics = {
      domContentLoadedMs: finiteMetric(dom.timings.domContentLoadedMs),
      loadMs: finiteMetric(dom.timings.loadMs),
      firstContentfulPaintMs: finiteMetric(dom.timings.firstContentfulPaintMs),
      largestContentfulPaintMs: finiteMetric(dom.timings.largestContentfulPaintMs),
      cumulativeLayoutShift: finiteMetric(dom.timings.cumulativeLayoutShift),
    };
    for (const [metric, threshold] of Object.entries(THRESHOLDS)) {
      if (!(metric in metrics)) continue;
      const value = metrics[metric as keyof typeof metrics];
      if (value !== null && value > threshold) failures.push(`${metric} ${value} exceeded ${threshold}`);
    }

    const result: RouteResult = {
      kind,
      route,
      viewport: viewportName,
      finalPath,
      title: dom.title,
      timings: metrics,
      accessibility: {
        duplicateIds: dom.duplicateIds,
        unlabeledControls: dom.unlabeledControls,
        mainCount: dom.mainCount,
        headingCount: dom.headingCount,
        tabbableCount: dom.tabbableCount,
        firstTabReachedControl,
      },
      horizontalOverflowPx: dom.horizontalOverflowPx,
      failedRequests: [...new Set(failedRequests)],
      serverErrors: [...new Set(serverErrors)],
      consoleErrors: [...new Set(consoleErrors)],
      failures,
    };

    if (failures.length) {
      const safeRoute = route === "/" ? "root" : route.slice(1).replace(/[^a-z0-9_-]+/gi, "-");
      await page.screenshot({ path: path.join(OUTPUT_DIR, `${viewportName}-${safeRoute}.png`), fullPage: true });
    }
    return result;
  } finally {
    page.off("requestfailed", requestFailed);
    page.off("response", responseReceived);
    page.off("console", consoleReceived);
  }
}

async function auditRouteWithEvidence(page: Page, route: string, kind: RouteKind, viewportName: string): Promise<RouteResult> {
  try {
    return await auditRoute(page, route, kind, viewportName);
  } catch (error) {
    const message = sanitizedFailureMessage(error);
    const safeRoute = route === "/" ? "root" : route.slice(1).replace(/[^a-z0-9_-]+/gi, "-");
    try {
      await page.screenshot({ path: path.join(OUTPUT_DIR, `${viewportName}-${safeRoute}-audit-error.png`), fullPage: true });
    } catch {
      // The structured route result remains useful even if Chromium cannot capture the page.
    }
    return {
      kind,
      route,
      viewport: viewportName,
      finalPath: (() => {
        try {
          return new URL(page.url()).pathname;
        } catch {
          return "";
        }
      })(),
      title: "",
      timings: {
        domContentLoadedMs: null,
        loadMs: null,
        firstContentfulPaintMs: null,
        largestContentfulPaintMs: null,
        cumulativeLayoutShift: null,
      },
      accessibility: {
        duplicateIds: [],
        unlabeledControls: [],
        mainCount: 0,
        headingCount: 0,
        tabbableCount: 0,
        firstTabReachedControl: false,
      },
      horizontalOverflowPx: 0,
      failedRequests: [],
      serverErrors: [],
      consoleErrors: [],
      failures: [`route audit failed: ${message}`],
    };
  }
}

async function newPage(browser: Browser, viewport: Viewport, mobile: boolean): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  if (mobile) {
    await page.setUserAgent("Mozilla/5.0 (Linux; Android 14; LyfeOS acceptance) AppleWebKit/537.36 Chrome/125 Mobile Safari/537.36");
  }
  await page.setCacheEnabled(false);
  await installPerformanceObservers(page);
  return page;
}

async function writeSummary(report: AcceptanceReport): Promise<void> {
  const lines = [
    "## LyfeOS production browser acceptance",
    "",
    `- Source: ${report.source || "not supplied"}`,
    `- Base URL: ${report.baseUrl}`,
    `- Routes: ${report.summary.routes}`,
    `- Passed: ${report.summary.passed}`,
    `- Failed: ${report.summary.failed}`,
    `- Authenticated suite executed: ${report.authenticatedExecuted}`,
    "",
    "| Viewport | Route | Result | LCP | CLS |",
    "| --- | --- | --- | ---: | ---: |",
    ...report.results.map((result) => `| ${result.viewport} | ${result.route} | ${result.failures.length ? `FAIL: ${result.failures.join("; ")}` : "PASS"} | ${result.timings.largestContentfulPaintMs ?? "n/a"} | ${result.timings.cumulativeLayoutShift ?? "n/a"} |`),
    "",
    "This is automated lab evidence. It does not substitute for human screen-reader comprehension, real-field Core Web Vitals, or provider authorization evidence.",
  ];
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) await fs.appendFile(summaryPath, `${lines.join("\n")}\n`, "utf8");
}

async function main(): Promise<void> {
  if (BASE_URL.protocol !== "https:" && BASE_URL.hostname !== "127.0.0.1" && BASE_URL.hostname !== "localhost") {
    throw new Error("Acceptance base URL must use HTTPS except for an explicit localhost qualification target.");
  }
  if (REQUIRE_AUTHENTICATED && (!EMAIL || !PASSWORD)) {
    throw new Error("Authenticated acceptance was required but its email/password secrets were not configured.");
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: await findChromium(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  const results: RouteResult[] = [];
  let authenticatedExecuted = false;
  try {
    // Qualify every signed-out surface before creating a session so a shared
    // browser context cannot turn public-route checks into authenticated redirects.
    for (const viewport of VIEWPORTS) {
      const publicPage = await newPage(browser, viewport.value, viewport.mobile);
      for (const route of PUBLIC_ROUTES) results.push(await auditRouteWithEvidence(publicPage, route, "public", viewport.name));
      await publicPage.close();
    }

    if (EMAIL && PASSWORD) {
      const desktop = VIEWPORTS[0];
      const authenticatedPage = await newPage(browser, desktop.value, desktop.mobile);
      try {
        // Authenticate once. Reusing the verified session across responsive
        // viewports avoids a second artificial login and exercises the same
        // session continuity expected when a real user resizes or rotates a device.
        try {
          await login(authenticatedPage);
        } catch (error) {
          throw new Error(`authenticated login (${desktop.name}) failed: ${sanitizedFailureMessage(error)}`);
        }
        authenticatedExecuted = true;
        for (const viewport of VIEWPORTS) {
          await authenticatedPage.setViewport(viewport.value);
          if (viewport.mobile) {
            await authenticatedPage.setUserAgent("Mozilla/5.0 (Linux; Android 14; LyfeOS acceptance) AppleWebKit/537.36 Chrome/125 Mobile Safari/537.36");
          }
          for (const route of AUTHENTICATED_ROUTES) {
            results.push(await auditRouteWithEvidence(authenticatedPage, route, "authenticated", viewport.name));
          }
        }
      } finally {
        await authenticatedPage.close();
      }
    }
  } finally {
    await browser.close();
  }

  const report: AcceptanceReport = {
    contract: "lyfeos.production-browser-acceptance.v1",
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL.origin,
    source: SOURCE,
    authenticatedRequested: REQUIRE_AUTHENTICATED,
    authenticatedExecuted,
    thresholds: THRESHOLDS,
    results,
    summary: {
      routes: results.length,
      passed: results.filter((result) => result.failures.length === 0).length,
      failed: results.filter((result) => result.failures.length > 0).length,
    },
  };

  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeSummary(report);
  console.log(`Wrote ${OUTPUT_FILE}`);
  console.log(`${report.summary.passed}/${report.summary.routes} route/viewport checks passed.`);

  if (REQUIRE_AUTHENTICATED && !authenticatedExecuted) throw new Error("Authenticated acceptance did not execute.");
  if (report.summary.failed > 0) process.exitCode = 1;
}

main().catch(async (error) => {
  const message = sanitizedFailureMessage(error);
  try {
    await writeFatalEvidence(message);
  } catch (evidenceError) {
    console.error(`Could not preserve fatal acceptance evidence: ${sanitizedFailureMessage(evidenceError)}`);
  }
  console.error(message);
  process.exitCode = 1;
});
