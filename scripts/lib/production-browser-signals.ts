import type { Page } from "puppeteer-core";

export type BrowserSignals = {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  serverErrors: string[];
  recoveredChunkLoads: string[];
};

export const CHUNK_RECOVERY_STORAGE_KEY = "lyfeos-chunk-recovery";
export const CHUNK_RECOVERY_EVIDENCE_WINDOW_MS = 120_000;

const BOUNDED_ROUTE_CHUNK_TIMEOUT = /^ChunkLoadError: Failed to fetch dynamically imported module: route chunk timed out after 15000ms(?: @ https?:\/\/[^\s]+\/assets\/[^\s]+\.js)?$/;
const SENTRY_BROWSER_INGEST = /https:\/\/o\d+\.ingest(?:\.[a-z0-9-]+)?\.sentry\.io\/api\/\d+\/envelope\//i;
const POSTHOG_BROWSER_INGEST = /https:\/\/(?:[a-z0-9-]+\.)?i\.posthog\.com\/(?:e|batch)\//i;

export function isExternalProviderTransportError(message: string, locationUrl = ""): boolean {
  const evidence = `${message} ${locationUrl}`;
  return SENTRY_BROWSER_INGEST.test(evidence) || POSTHOG_BROWSER_INGEST.test(evidence);
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

export function hasUnexpectedBrowserSignals(signals: BrowserSignals): boolean {
  return signals.recoveredChunkLoads.length > 1 || [
    signals.consoleErrors,
    signals.pageErrors,
    signals.failedRequests,
    signals.serverErrors,
  ].some((entries) => entries.length > 0);
}
