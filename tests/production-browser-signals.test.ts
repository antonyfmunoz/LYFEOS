import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CHUNK_RECOVERY_EVIDENCE_WINDOW_MS,
  hasUnexpectedBrowserSignals,
  installFixtureUserStorageSeed,
  isExternalProviderTransportError,
  reconcileBoundedChunkRecovery,
  retryOnceAfterBoundedChunkRecovery,
  type BrowserSignals,
} from "../scripts/lib/production-browser-signals";

function signals(consoleErrors: string[] = []): BrowserSignals {
  return {
    consoleErrors,
    pageErrors: [],
    failedRequests: [],
    serverErrors: [],
    recoveredChunkLoads: [],
  };
}

const exactTimeout = "ChunkLoadError: Failed to fetch dynamically imported module: route chunk timed out after 15000ms @ https://lyfeos.net/assets/index-ByYtYs3v.js";

describe("production browser signal reconciliation", () => {
  it("does not report fixture seeding as an application error in storage-ineligible documents", async () => {
    let seed: ((fixtureUser: { id: number; displayName: string }) => void) | null = null;
    let fixture: { id: number; displayName: string } | null = null;
    const page = {
      evaluateOnNewDocument: async (callback: typeof seed, value: typeof fixture) => {
        seed = callback;
        fixture = value;
      },
    };

    await installFixtureUserStorageSeed(page as never, { id: 42, displayName: "Fixture" });
    const priorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get: () => { throw new DOMException("Access is denied for this document.", "SecurityError"); },
    });
    try {
      expect(() => seed?.(fixture!)).not.toThrow();
    } finally {
      if (priorDescriptor) Object.defineProperty(globalThis, "localStorage", priorDescriptor);
      else Reflect.deleteProperty(globalThis, "localStorage");
    }
  });

  it("retries one idempotent operation after one exact marker-backed route recovery", async () => {
    const captured = signals([exactTimeout]);
    const page = { evaluate: async () => String(Date.now()) };
    const attempts: number[] = [];

    const result = await retryOnceAfterBoundedChunkRecovery(page as never, captured, async (attempt) => {
      attempts.push(attempt);
      if (attempt === 0) throw new Error("obsolete document");
      return "reopened";
    });

    expect(result).toBe("reopened");
    expect(attempts).toEqual([0, 1]);
    expect(captured.consoleErrors).toEqual([]);
    expect(captured.recoveredChunkLoads).toEqual([exactTimeout]);
  });

  it("does not retry an operation without exact recovery evidence", async () => {
    const captured = signals(["TypeError: application failure"]);
    const page = { evaluate: async () => String(Date.now()) };
    let attempts = 0;

    await expect(retryOnceAfterBoundedChunkRecovery(page as never, captured, async () => {
      attempts += 1;
      throw new Error("ordinary failure");
    })).rejects.toThrow("ordinary failure");
    expect(attempts).toBe(1);
    expect(captured.recoveredChunkLoads).toEqual([]);
  });

  it.each([
    ["Sentry CORS", "Access to fetch at 'https://o4511899686797312.ingest.us.sentry.io/api/4511899799977984/envelope/?sentry_version=7' has been blocked by CORS policy", "https://lyfeos.net/login"],
    ["Sentry resource", "Failed to load resource: net::ERR_FAILED", "https://o4511899686797312.ingest.us.sentry.io/api/4511899799977984/envelope/"],
    ["PostHog ingest", "Failed to load resource: net::ERR_FAILED", "https://us.i.posthog.com/e/"],
  ])("classifies an exact %s endpoint as external transport evidence", (_label, message, location) => {
    expect(isExternalProviderTransportError(message, location)).toBe(true);
  });

  it.each([
    ["ordinary app error", "TypeError: Cannot read properties of undefined", "https://lyfeos.net/assets/index.js"],
    ["loose provider word", "PostHog initialization threw", "https://lyfeos.net/assets/index.js"],
    ["lookalike host", "Failed", "https://sentry.io.example.com/api/1/envelope/"],
  ])("does not hide %s", (_label, message, location) => {
    expect(isExternalProviderTransportError(message, location)).toBe(false);
  });

  it("keeps every protected long-running journey on the bounded recovery contract", () => {
    const journeys = [
      "production-ai-memory-browser-acceptance.ts",
      "production-voice-browser-acceptance.ts",
      "production-pattern-explorer-browser-acceptance.ts",
      "production-personal-finance-browser-acceptance.ts",
      "production-tables-forms-browser-acceptance.ts",
      "production-calendar-browser-acceptance.ts",
      "production-sheets-browser-acceptance.ts",
      "production-canvas-browser-acceptance.ts",
      "production-search-browser-acceptance.ts",
      "messages-browser-acceptance.ts",
      "production-projects-browser-acceptance.ts",
      "mission-safety-browser-acceptance.ts",
    ];

    for (const journey of journeys) {
      const source = readFileSync(resolve(process.cwd(), "scripts", journey), "utf8");
      expect(source, journey).toContain("acknowledgeBoundedChunkRecovery");
      expect(source, journey).toContain("hasUnexpectedBrowserSignals");
      expect(source, journey).toContain("recoveredChunkLoads");
    }
  });

  it("retains one exact, recently marker-backed route recovery as evidence", () => {
    const captured = signals([exactTimeout]);
    expect(reconcileBoundedChunkRecovery(captured, "990000", 1_000_000)).toEqual([exactTimeout]);
    expect(captured.consoleErrors).toEqual([]);
    expect(captured.recoveredChunkLoads).toEqual([exactTimeout]);
    expect(hasUnexpectedBrowserSignals(captured)).toBe(false);
  });

  it.each([
    ["missing marker", null, 1_000_000],
    ["invalid marker", "not-a-number", 1_000_000],
    ["future marker", "1000001", 1_000_000],
    ["expired marker", String(1_000_000 - CHUNK_RECOVERY_EVIDENCE_WINDOW_MS - 1), 1_000_000],
  ])("does not excuse an exact timeout with a %s", (_label, storedAt, now) => {
    const captured = signals([exactTimeout]);
    expect(reconcileBoundedChunkRecovery(captured, storedAt, now)).toEqual([]);
    expect(hasUnexpectedBrowserSignals(captured)).toBe(true);
  });

  it("does not excuse repeated chunk timeouts", () => {
    const captured = signals([exactTimeout, exactTimeout]);
    expect(reconcileBoundedChunkRecovery(captured, "990000", 1_000_000)).toEqual([]);
    expect(captured.recoveredChunkLoads).toEqual([]);
    expect(captured.consoleErrors).toHaveLength(2);
  });

  it.each([
    "ChunkLoadError: Loading chunk 42 failed",
    "TypeError: Cannot read properties of undefined",
    "ChunkLoadError: Failed to fetch dynamically imported module: route chunk timed out after 30000ms",
  ])("does not excuse non-contract errors: %s", (error) => {
    const captured = signals([error]);
    expect(reconcileBoundedChunkRecovery(captured, "990000", 1_000_000)).toEqual([]);
    expect(hasUnexpectedBrowserSignals(captured)).toBe(true);
  });

  it("still fails when any independent browser or server signal remains", () => {
    const captured = signals([exactTimeout]);
    captured.serverErrors.push("500 GET /api/health");
    reconcileBoundedChunkRecovery(captured, "990000", 1_000_000);
    expect(hasUnexpectedBrowserSignals(captured)).toBe(true);
  });

  it("fails an aggregate journey that needed more than one recovery", () => {
    const captured = signals();
    captured.recoveredChunkLoads.push(exactTimeout, exactTimeout);
    expect(hasUnexpectedBrowserSignals(captured)).toBe(true);
  });
});
