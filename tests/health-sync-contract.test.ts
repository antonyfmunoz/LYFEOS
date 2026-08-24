import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { healthSyncCursorValueSchema, healthSyncErrorCodeSchema, healthSyncLeaseExpired, healthSyncLeaseMs, healthSyncLockKey, nextHealthSyncRetryAt } from "../server/health-sync";

const root = path.resolve(import.meta.dirname, "..");

describe("provider sync cursor contract", () => {
  it("uses deterministic per-resource locks and bounded retries", () => {
    expect(healthSyncLockKey(5, "sleep")).toBe("health-sync:5:sleep");
    expect(healthSyncLockKey(5, "sleep")).not.toBe(healthSyncLockKey(5, "activity"));
    expect(nextHealthSyncRetryAt(2, new Date("2026-08-22T10:00:00.000Z")).toISOString()).toBe("2026-08-22T10:02:00.000Z");
  });

  it("bounds opaque cursors and normalized non-sensitive error codes", () => {
    expect(healthSyncCursorValueSchema.safeParse("opaque-next-page").success).toBe(true);
    expect(healthSyncCursorValueSchema.safeParse("").success).toBe(false);
    expect(healthSyncErrorCodeSchema.safeParse("PROVIDER.RATE_LIMIT").success).toBe(true);
    expect(healthSyncErrorCodeSchema.safeParse("raw vendor message with user data").success).toBe(false);
  });

  it("expires abandoned sync leases without treating active work as stale", () => {
    const now = new Date("2026-08-22T10:15:00.000Z");
    expect(healthSyncLeaseMs).toBe(15 * 60 * 1000);
    expect(healthSyncLeaseExpired(new Date("2026-08-22T10:00:00.000Z"), now)).toBe(true);
    expect(healthSyncLeaseExpired(new Date("2026-08-22T10:00:01.000Z"), now)).toBe(false);
    expect(healthSyncLeaseExpired(null, now)).toBe(true);
  });

  it("advances a cursor only after durable records and preserves it on failure", () => {
    const service = fs.readFileSync(path.join(root, "server/health-sync-service.ts"), "utf8");
    expect(service).toContain("Call only after every record in the fetched page is durable");
    expect(service).toContain('eq(healthSyncCursors.status, "syncing")');
    expect(service).toContain("cursorValue: nextCursor");
    const failureSection = service.slice(service.indexOf("export async function failHealthSync"));
    expect(failureSection).not.toContain("cursorValue:");
    expect(service).toContain('status: "retry_wait"');
    expect(service).toContain('connection.status !== "active" || !connection.credentialRef');
    expect(service).toContain('errorCode: "SYNC.LEASE_EXPIRED"');
    expect(service).toContain("waiting for its bounded retry time");
  });
});
