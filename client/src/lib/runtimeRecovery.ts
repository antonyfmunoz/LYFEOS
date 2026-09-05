const CHUNK_LOAD_ERROR_PATTERNS = [
  /chunkloaderror/i,
  /loading chunk [\w-]+ failed/i,
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /expected a javascript(?:-module)? module script/i,
];

export const CHUNK_RECOVERY_STORAGE_KEY = "lyfeos-chunk-recovery";
export const CHUNK_RECOVERY_COOLDOWN_MS = 60_000;
// A production browser can legitimately be busy hydrating a second tab while it
// fetches a deferred route chunk. Keep this bounded so a genuinely unavailable
// release still recovers, but do not turn a transient slow asset fetch into a
// permanent workspace failure.
export const ROUTE_CHUNK_TIMEOUT_MS = 60_000;

export function attemptRouteChunkRecovery(error: unknown, now = Date.now()): boolean {
  if (!isChunkLoadError(error) || typeof window === "undefined" || typeof sessionStorage === "undefined") return false;
  try {
    const previousAttempt = sessionStorage.getItem(CHUNK_RECOVERY_STORAGE_KEY);
    if (!canAttemptChunkRecovery(previousAttempt, now)) return false;
    sessionStorage.setItem(CHUNK_RECOVERY_STORAGE_KEY, String(now));
    console.error(getRuntimeErrorMessage(error));
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}

export function withChunkLoadTimeout<T>(
  loader: () => Promise<T>,
  timeoutMs = ROUTE_CHUNK_TIMEOUT_MS,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(`Failed to fetch dynamically imported module: route chunk timed out after ${timeoutMs}ms`);
      error.name = "ChunkLoadError";
      reject(error);
    }, timeoutMs);
  });

  return Promise.race([loader(), timeout]).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  });
}

export function withRouteChunkRecovery<T>(
  loader: () => Promise<T>,
  timeoutMs = ROUTE_CHUNK_TIMEOUT_MS,
): Promise<T> {
  return withChunkLoadTimeout(loader, timeoutMs).catch((error) => {
    if (attemptRouteChunkRecovery(error)) return new Promise<T>(() => undefined);
    throw error;
  });
}

export function getRuntimeErrorMessage(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === "string") return error;

  if (error && typeof error === "object") {
    const candidate = error as { name?: unknown; message?: unknown };
    const name = typeof candidate.name === "string" ? candidate.name : "";
    const message = typeof candidate.message === "string" ? candidate.message : "";
    return `${name}: ${message}`;
  }

  return "";
}

export function isChunkLoadError(error: unknown): boolean {
  const message = getRuntimeErrorMessage(error);
  return CHUNK_LOAD_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export function canAttemptChunkRecovery(
  storedAt: string | null,
  now = Date.now(),
): boolean {
  if (!storedAt) return true;
  const previousAttempt = Number(storedAt);
  return !Number.isFinite(previousAttempt) || now - previousAttempt > CHUNK_RECOVERY_COOLDOWN_MS;
}
