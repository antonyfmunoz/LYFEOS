import { afterEach, describe, expect, it, vi } from "vitest";
import {
  attemptRouteChunkRecovery,
  canAttemptChunkRecovery,
  CHUNK_RECOVERY_STORAGE_KEY,
  CHUNK_RECOVERY_COOLDOWN_MS,
  getRuntimeErrorMessage,
  isChunkLoadError,
  withChunkLoadTimeout,
  withRouteChunkRecovery,
} from "../client/src/lib/runtimeRecovery";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("runtime recovery", () => {
  it.each([
    new Error("Failed to fetch dynamically imported module: https://lyfeos.net/assets/Ceremony.js"),
    new Error("Loading chunk CeremonyPage failed"),
    { name: "ChunkLoadError", message: "Loading chunk 42 failed" },
    "Importing a module script failed",
    "Expected a JavaScript module script but the server responded with text/html",
  ])("recognizes stale deployment chunk errors", (error) => {
    expect(isChunkLoadError(error)).toBe(true);
  });

  it("does not classify an ordinary application exception as a chunk error", () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined"))).toBe(false);
  });

  it("formats error-like objects without throwing", () => {
    expect(getRuntimeErrorMessage({ name: "ChunkLoadError", message: "failed" })).toBe("ChunkLoadError: failed");
    expect(getRuntimeErrorMessage(null)).toBe("");
  });

  it("allows one recovery attempt per cooldown window", () => {
    const now = 1_000_000;
    expect(canAttemptChunkRecovery(null, now)).toBe(true);
    expect(canAttemptChunkRecovery("not-a-number", now)).toBe(true);
    expect(canAttemptChunkRecovery(String(now - 1), now)).toBe(false);
    expect(canAttemptChunkRecovery(String(now - CHUNK_RECOVERY_COOLDOWN_MS - 1), now)).toBe(true);
  });

  it("resolves a route chunk that settles inside the bounded window", async () => {
    await expect(withChunkLoadTimeout(async () => "loaded", 25)).resolves.toBe("loaded");
  });

  it("turns a stalled route chunk into a recoverable chunk-load error", async () => {
    const stalled = withChunkLoadTimeout(() => new Promise<string>(() => undefined), 5);
    await expect(stalled).rejects.toMatchObject({
      name: "ChunkLoadError",
      message: expect.stringContaining("route chunk timed out"),
    });
    await stalled.catch((error) => expect(isChunkLoadError(error)).toBe(true));
  });

  it("records and immediately reloads once when a route chunk times out", () => {
    const values = new Map<string, string>();
    const reload = vi.fn();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    vi.stubGlobal("window", { location: { reload } });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("Failed to fetch dynamically imported module: route chunk timed out after 15000ms");
    error.name = "ChunkLoadError";

    expect(attemptRouteChunkRecovery(error, 1_000_000)).toBe(true);
    expect(values.get(CHUNK_RECOVERY_STORAGE_KEY)).toBe("1000000");
    expect(consoleError).toHaveBeenCalledWith("ChunkLoadError: Failed to fetch dynamically imported module: route chunk timed out after 15000ms");
    expect(reload).toHaveBeenCalledOnce();

    expect(attemptRouteChunkRecovery(error, 1_000_001)).toBe(false);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("keeps the obsolete document pending after a timed-out route starts recovery", async () => {
    const values = new Map<string, string>();
    const reload = vi.fn();
    const settled = vi.fn();
    vi.useFakeTimers();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    vi.stubGlobal("window", { location: { reload } });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const staleDocumentLoad = withRouteChunkRecovery(
      () => new Promise<string>(() => undefined),
      5,
    );
    void staleDocumentLoad.then(settled, settled);

    await vi.advanceTimersByTimeAsync(5);
    await Promise.resolve();

    expect(reload).toHaveBeenCalledOnce();
    expect(values.has(CHUNK_RECOVERY_STORAGE_KEY)).toBe(true);
    expect(settled).not.toHaveBeenCalled();
  });
});
