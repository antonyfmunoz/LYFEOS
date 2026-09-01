import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LYFEOS_CAPABILITY_MANIFEST, umhEventEnvelopeSchema } from "../shared/umh";
import { signUMHProjectionEvent } from "../server/umh/crypto";
import { validateSignedUMHEventReceipt } from "../server/umh/receipt";

const now = Date.parse("2026-08-30T05:00:00.000Z");
const timestamp = String(Math.floor(now / 1_000));
const nonce = "receiptNonce_1234567890";
const config = {
  installationId: "installation-1",
  tenantId: "tenant-1",
  keyId: "key-1",
  sharedSecret: "test-receipt-secret",
};
const event = umhEventEnvelopeSchema.parse({
  schemaVersion: "umh.v1",
  eventId: "7f4e216d-0641-444f-b0fe-9d96f3d67593",
  projectionId: "lyfeos",
  eventType: "lyfeos.coordination-context.updated.v1",
  installationId: config.installationId,
  tenantId: config.tenantId,
  actorId: "lyfeos:subject-1",
  aggregateType: "coordination_context",
  aggregateId: "lyfeos:subject-1:2026-08-30",
  idempotencyKey: "coordination-context:subject-1:2026-08-30",
  traceId: "197e4076-d823-4b58-b461-ea615f4bb91e",
  correlationId: "57c82cac-d3df-4659-a8ec-dce45bc8e518",
  occurredAt: "2026-08-30T04:59:00.000Z",
  payload: {
    contextDate: "2026-08-30",
    capacityBand: "steady",
    evidenceQuality: "self_reported",
    purpose: "correlation",
    allowedDestinations: ["entrepreneuros"],
  },
});

function signedReceipt(overrides: Record<string, unknown> = {}) {
  const body = JSON.stringify({
    schemaVersion: "umh.event-receipt.v1",
    kind: "event_receipt",
    eventId: event.eventId,
    projectionId: "lyfeos",
    installationId: config.installationId,
    tenantId: config.tenantId,
    status: "accepted",
    receivedAt: "2026-08-30T05:00:00.000Z",
    ...overrides,
  });
  return {
    serializedBody: body,
    keyId: config.keyId,
    timestamp,
    nonce,
    signature: signUMHProjectionEvent(config.sharedSecret, timestamp, nonce, body),
    event,
    config,
  };
}

describe("UMH signed delivery receipt", () => {
  afterEach(() => vi.restoreAllMocks());

  it("publishes the required receipt and authority semantics in the public manifest", () => {
    expect(LYFEOS_CAPABILITY_MANIFEST.manifestVersion).toBe("lyfeos.umh-capability-manifest.v2");
    expect(LYFEOS_CAPABILITY_MANIFEST.deliveryReceipt).toEqual({
      schemaVersion: "umh.event-receipt.v1",
      required: true,
      statuses: ["accepted", "duplicate"],
      correlation: "event_id",
      signature: "hmac_sha256_exact_body",
    });
    expect(LYFEOS_CAPABILITY_MANIFEST.events.every((item) => item.authority === "lyfeos" && item.semantics === "at_least_once")).toBe(true);
  });

  it("requires a validated receipt before the outbox can settle delivery", () => {
    const outbox = readFileSync(resolve(process.cwd(), "server/umh/outbox.ts"), "utf8").replace(/\r\n/g, "\n");
    expect(outbox).toContain('"x-umh-key-id": config.keyId');
    expect(outbox).toContain("validateSignedUMHEventReceipt({");
    expect(outbox).toContain('receipt.accepted\n          ? { ...entry, outcome: "delivered" }');
    expect(outbox).not.toContain('if (response.ok) {\n        await settleUMHOutboxEvent({ ...entry, outcome: "delivered" });');
  });

  it.each(["accepted", "duplicate"])("accepts a signed, exactly scoped %s receipt", (status) => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    expect(validateSignedUMHEventReceipt(signedReceipt({ status }))).toMatchObject({ accepted: true, receipt: { status, eventId: event.eventId } });
  });

  it("refuses an unsigned, wrong-key, stale, malformed, or changed receipt", () => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    expect(validateSignedUMHEventReceipt({ ...signedReceipt(), signature: null })).toEqual({ accepted: false, errorCode: "RECEIPT_SIGNATURE_INVALID" });
    expect(validateSignedUMHEventReceipt({ ...signedReceipt(), keyId: "retired-key" })).toEqual({ accepted: false, errorCode: "RECEIPT_KEY_MISMATCH" });
    expect(validateSignedUMHEventReceipt({ ...signedReceipt(), timestamp: String(Number(timestamp) - 301) })).toEqual({ accepted: false, errorCode: "RECEIPT_SIGNATURE_INVALID" });
    expect(validateSignedUMHEventReceipt({ ...signedReceipt(), serializedBody: "not-json" })).toEqual({ accepted: false, errorCode: "RECEIPT_SIGNATURE_INVALID" });

    const mismatched = signedReceipt({ eventId: "1e0f0834-a2a0-4331-a257-2ded41bc629b" });
    expect(validateSignedUMHEventReceipt(mismatched)).toEqual({ accepted: false, errorCode: "RECEIPT_SCOPE_MISMATCH" });
  });

  it("refuses a correctly signed private-field expansion and oversized response", () => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    const expanded = signedReceipt({ userEmail: "private@example.com" });
    expect(validateSignedUMHEventReceipt(expanded)).toEqual({ accepted: false, errorCode: "RECEIPT_SCHEMA_INVALID" });

    const oversizedBody = JSON.stringify({ padding: "x".repeat(17 * 1024) });
    expect(validateSignedUMHEventReceipt({
      ...signedReceipt(),
      serializedBody: oversizedBody,
      signature: signUMHProjectionEvent(config.sharedSecret, timestamp, nonce, oversizedBody),
    })).toEqual({ accepted: false, errorCode: "RECEIPT_TOO_LARGE" });
  });
});
