import { describe, expect, it } from "vitest";
import {
  canAttemptChunkRecovery,
  CHUNK_RECOVERY_COOLDOWN_MS,
  getRuntimeErrorMessage,
  isChunkLoadError,
  withChunkLoadTimeout,
} from "../client/src/lib/runtimeRecovery";

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
});
