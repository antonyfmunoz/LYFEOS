import type { Page } from "puppeteer-core";

export type BrowserSignals = {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  serverErrors: string[];
  recoveredChunkLoads: string[];
  /**
   * Exact, owner-safe background reads that first hit a transient edge
   * transport reset and then received a successful retry response. This is
   * intentionally optional so existing journeys remain fail-closed unless
   * they explicitly collect and reconcile this evidence.
   */
  recoveredBackgroundReads?: string[];
};

export const CHUNK_RECOVERY_STORAGE_KEY = "lyfeos-chunk-recovery";
export const CHUNK_RECOVERY_EVIDENCE_WINDOW_MS = 120_000;

export type FixtureBrowserUser = {
  id: number;
  displayName: string;
};

// This must track the exact production deadline. The qualification contract
// accepts only this fully structured, marker-backed signal, so a deadline
// change requires an explicit reviewed test update rather than broadening an
// error exception.
const BOUNDED_ROUTE_CHUNK_TIMEOUT = /^ChunkLoadError: Failed to fetch dynamically imported module: route chunk timed out after 60000ms(?: @ https?:\/\/[^\s]+\/assets\/[^\s]+\.js)?$/;
const BOUNDED_ROUTE_CHUNK_SETTLE_MS = 2_000;
const BOUNDED_ROUTE_CHUNK_POLL_MS = 100;
const SENTRY_BROWSER_INGEST = /https:\/\/o\d+\.ingest(?:\.[a-z0-9-]+)?\.sentry\.io\/api\/\d+\/envelope\//i;
const POSTHOG_BROWSER_INGEST = /https:\/\/(?:[a-z0-9-]+\.)?i\.posthog\.com\/(?:e|batch)\//i;
const ISOLATED_CLERK_BOOTSTRAP = /https:\/\/local\.lyfeos\.dev\/npm\/@clerk\/clerk-js@\d+(?:\.\d+){0,2}\/dist\/clerk(?:\.[a-z0-9-]+)*\.browser\.js(?:\?[^\s]*)?/i;
const CLERK_BOOTSTRAP_TIMEOUT = /Clerk: Failed to load Clerk[\s\S]*code=["']failed_to_load_clerk_js_timeout["']/i;
const RECOVERABLE_BACKGROUND_READ_PATHS = [
  /^\/api\/profile$/,
  /^\/api\/product-analytics$/,
  /^\/api\/users\/\d+\/stats$/,
  /^\/api\/computed-stats$/,
  /^\/api\/users\/\d+\/mission-pages$/,
  /^\/api\/users\/\d+\/quests$/,
  /^\/api\/conversations$/,
];
const HTTP2_PROTOCOL_FAILURE = "net::ERR_HTTP2_PROTOCOL_ERROR";

function isRecoverableBackgroundReadPath(pathname: string): boolean {
  return RECOVERABLE_BACKGROUND_READ_PATHS.some((pattern) => pattern.test(pathname));
}

function backgroundFailurePath(entry: string, prefix: string): string | null {
  if (!entry.startsWith(prefix) || !entry.endsWith(HTTP2_PROTOCOL_FAILURE)) return null;
  const rawPath = entry.slice(prefix.length, -HTTP2_PROTOCOL_FAILURE.length).replace(/[:\s]+$/, "");
  return isRecoverableBackgroundReadPath(rawPath) ? rawPath : null;
}

/**
 * Preserve the authenticated fixture hint across target-origin navigations.
 * Puppeteer also runs evaluateOnNewDocument callbacks inside transient,
 * browser-owned documents where Web Storage is intentionally unavailable, so
 * the harness must not turn that setup detail into an application page error.
 * A target-origin storage failure remains observable through the application
 * itself and through the journey's normal assertions.
 */
export async function installFixtureUserStorageSeed(
  page: Page,
  fixtureUser: FixtureBrowserUser,
): Promise<void> {
  await page.evaluateOnNewDocument((user) => {
    try {
      localStorage.setItem("lyfeos_user", JSON.stringify(user));
    } catch {
      // A later target-origin document receives the same callback.
    }
  }, fixtureUser);
}

export function isExternalProviderTransportError(message: string, locationUrl = ""): boolean {
  const evidence = `${message} ${locationUrl}`;
  return SENTRY_BROWSER_INGEST.test(evidence) || POSTHOG_BROWSER_INGEST.test(evidence);
}

/**
 * The isolated browser suite deliberately gives Clerk a non-routable local
 * frontend host so its provider bootstrap cannot become a hidden dependency.
 * Match only that exact asset family, including pinned and headless variants.
 * Callers must still gate this helper on their explicit isolated mode.
 */
export function isIsolatedClerkBootstrapError(
  message: string,
  locationUrl = "",
  exactIsolatedResourceFailureObserved = false,
): boolean {
  if (!/(?:Failed to load Clerk|ERR_NAME_NOT_RESOLVED)/i.test(message)) return false;
  return ISOLATED_CLERK_BOOTSTRAP.test(`${message} ${locationUrl}`)
    || (exactIsolatedResourceFailureObserved && CLERK_BOOTSTRAP_TIMEOUT.test(message));
}

export function reconcileBoundedChunkRecovery(
  signals: BrowserSignals,
  storedAt: string | null,
  now = Date.now(),
): string[] {
  const candidates = signals.consoleErrors.filter((entry) => BOUNDED_ROUTE_CHUNK_TIMEOUT.test(entry));
  const recoveryAt = storedAt === null ? Number.NaN : Number(storedAt);
  const ageMs = now - recoveryAt;

  if (
    candidates.length !== 1
    || signals.recoveredChunkLoads.length > 0
    || !Number.isFinite(recoveryAt)
    || ageMs < 0
    || ageMs > CHUNK_RECOVERY_EVIDENCE_WINDOW_MS
  ) return [];

  const [recovered] = candidates;
  const index = signals.consoleErrors.indexOf(recovered);
  signals.consoleErrors.splice(index, 1);
  signals.recoveredChunkLoads.push(recovered);
  return [recovered];
}

export async function acknowledgeBoundedChunkRecovery(
  page: Page,
  signals: BrowserSignals,
): Promise<string[]> {
  const storedAt = await page.evaluate((key) => sessionStorage.getItem(key), CHUNK_RECOVERY_STORAGE_KEY);
  return reconcileBoundedChunkRecovery(signals, storedAt);
}

/**
 * A small, reviewed set of non-mutating workspace hydration reads uses either
 * `fetchBackgroundRead` or TanStack Query's bounded read retry. Chromium still
 * emits console/request failures for each transient HTTP/2 stream reset before
 * a retry succeeds. Keep those events visible unless every failed endpoint
 * later returned a successful GET in the same document: this proves recovery
 * rather than suppressing a failed read. No mutation, arbitrary endpoint,
 * non-HTTP/2 failure, or missing response can enter this exception.
 */
export function reconcileBoundedBackgroundReadRecovery(
  signals: BrowserSignals,
  successfulReads: ReadonlySet<string>,
): string[] {
  const failedPaths = new Set<string>();
  for (const entry of signals.failedRequests) {
    const path = backgroundFailurePath(entry, "GET ");
    if (!path) return [];
    failedPaths.add(path);
  }
  if (failedPaths.size === 0 || (signals.recoveredBackgroundReads?.length || 0) > 0) return [];

  const consolePaths = new Set<string>();
  for (const entry of signals.consoleErrors) {
    const matched = entry.match(/^Failed to load resource: net::ERR_HTTP2_PROTOCOL_ERROR @ https?:\/\/[^/]+(\/api\/[^\s]+)$/);
    const rawPath = matched?.[1] || null;
    const path = rawPath ? rawPath.split("?", 1)[0] : null;
    if (!path || !failedPaths.has(path)) continue;
    consolePaths.add(path);
  }

  if (consolePaths.size !== failedPaths.size) return [];
  for (const path of failedPaths) {
    if (!successfulReads.has(`GET ${path}`)) return [];
  }

  const recovered = [...failedPaths].sort().map((path) => `GET ${path}`);
  signals.failedRequests = signals.failedRequests.filter((entry) => !failedPaths.has(backgroundFailurePath(entry, "GET ") || ""));
  signals.consoleErrors = signals.consoleErrors.filter((entry) => {
    const matched = entry.match(/^Failed to load resource: net::ERR_HTTP2_PROTOCOL_ERROR @ https?:\/\/[^/]+(\/api\/[^\s]+)$/);
    const path = matched?.[1]?.split("?", 1)[0];
    return !path || !consolePaths.has(path);
  });
  signals.recoveredBackgroundReads = recovered;
  return recovered;
}

async function waitForBoundedChunkRecoveryEvidence(
  page: Page,
  signals: BrowserSignals,
): Promise<string[]> {
  const deadline = Date.now() + BOUNDED_ROUTE_CHUNK_SETTLE_MS;
  while (true) {
    const recovered = await acknowledgeBoundedChunkRecovery(page, signals).catch(() => []);
    if (recovered.length === 1) return recovered;

    const independentSignal = signals.consoleErrors.some((entry) => !BOUNDED_ROUTE_CHUNK_TIMEOUT.test(entry))
      || signals.pageErrors.length > 0
      || signals.failedRequests.length > 0
      || signals.serverErrors.length > 0;
    if (independentSignal || Date.now() >= deadline) return [];

    // An automatic document reload can briefly destroy the execution context
    // after emitting the exact console signature but before the fresh
    // sessionStorage marker is readable. Wait only for those two pieces of
    // recovery evidence to converge; ordinary failures return immediately.
    await new Promise((resolve) => setTimeout(resolve, BOUNDED_ROUTE_CHUNK_POLL_MS));
  }
}

/**
 * Retry an idempotent browser operation only when the first failure coincides
 * with the one exact, marker-backed route recovery allowed by the production
 * contract. Ordinary errors, stale markers and any second recovery still fail.
 */
export async function retryOnceAfterBoundedChunkRecovery<T>(
  page: Page,
  signals: BrowserSignals,
  operation: (attempt: 0 | 1) => Promise<T>,
): Promise<T> {
  try {
    return await operation(0);
  } catch (error) {
    const recovered = await waitForBoundedChunkRecoveryEvidence(page, signals);
    if (recovered.length !== 1 || hasUnexpectedBrowserSignals(signals)) throw error;
    return operation(1);
  }
}

export function hasUnexpectedBrowserSignals(signals: BrowserSignals): boolean {
  const recoveredBackgroundReads = signals.recoveredBackgroundReads || [];
  return signals.recoveredChunkLoads.length > 1
    || recoveredBackgroundReads.length > RECOVERABLE_BACKGROUND_READ_PATHS.length
    || new Set(recoveredBackgroundReads).size !== recoveredBackgroundReads.length
    || [
    signals.consoleErrors,
    signals.pageErrors,
    signals.failedRequests,
    signals.serverErrors,
  ].some((entries) => entries.length > 0);
}
