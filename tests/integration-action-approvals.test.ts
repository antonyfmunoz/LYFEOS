import { describe, expect, it } from "vitest";
import { integrationActionFingerprint } from "../server/integration-action-fingerprint";

describe("integration action approval fingerprints", () => {
  it("is stable across key order and excludes only approval transport fields", () => {
    const first = integrationActionFingerprint({
      actionKey: "google.drive.push",
      method: "post",
      body: { includeLocal: false, nested: { b: 2, a: 1 } },
    });
    const retry = integrationActionFingerprint({
      actionKey: "google.drive.push",
      method: "POST",
      body: { approvalId: "one-time-id", nested: { a: 1, b: 2 }, includeLocal: false },
    });
    expect(retry).toBe(first);
  });

  it("rejects reuse when request intent changes", () => {
    const approved = integrationActionFingerprint({ actionKey: "google.drive.push", method: "POST", body: { includeLocal: false } });
    const changed = integrationActionFingerprint({ actionKey: "google.drive.push", method: "POST", body: { includeLocal: true } });
    const anotherAction = integrationActionFingerprint({ actionKey: "google.drive.sync", method: "POST", body: { includeLocal: false } });
    expect(changed).not.toBe(approved);
    expect(anotherAction).not.toBe(approved);
  });
});
