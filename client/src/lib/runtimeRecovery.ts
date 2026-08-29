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
export const ROUTE_CHUNK_TIMEOUT_MS = 15_000;

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
