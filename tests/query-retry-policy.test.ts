import { describe, expect, it } from "vitest";
import { queryRetryDelay, shouldRetryQuery } from "../client/src/lib/queryRetryPolicy";

describe("query retry policy", () => {
  it.each([
    [new TypeError("Failed to fetch"), true],
    [new Error("408: request timeout"), true],
    [new Error("425: too early"), true],
    [new Error("429: slow down"), true],
    [new Error("500: unavailable"), true],
    [new Error("503: unavailable"), true],
    [new Error("401: signed out"), false],
    [new Error("403: forbidden"), false],
    [new Error("404: missing"), false],
    [new Error("409: stale revision"), false],
    [new Error("422: invalid"), false],
    [new Error("ordinary application failure"), false],
  ])("classifies %s", (error, expected) => {
    expect(shouldRetryQuery(0, error)).toBe(expected);
  });

  it("stops after two retries even for a transient failure", () => {
    const error = new TypeError("Failed to fetch");
    expect(shouldRetryQuery(0, error)).toBe(true);
    expect(shouldRetryQuery(1, error)).toBe(true);
    expect(shouldRetryQuery(2, error)).toBe(false);
  });

  it("uses a short capped backoff", () => {
    expect([0, 1, 2, 3, 4].map(queryRetryDelay)).toEqual([750, 1_500, 3_000, 3_000, 3_000]);
  });
});
