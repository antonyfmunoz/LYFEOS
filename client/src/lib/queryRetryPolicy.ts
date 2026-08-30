const RETRYABLE_HTTP_STATUS = /^(?:408|425|429|5\d\d):/;

/**
 * Queries are reads, so one short bounded retry window is safe. Never retry
 * authorization, validation, ownership, conflict, or other deterministic 4xx
 * responses. Mutations retain their separate no-retry policy.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (error instanceof TypeError) return true;
  return error instanceof Error && RETRYABLE_HTTP_STATUS.test(error.message);
}

export function queryRetryDelay(attemptIndex: number): number {
  return Math.min(750 * (2 ** attemptIndex), 3_000);
}
