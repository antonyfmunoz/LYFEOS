import { describe, expect, it, vi } from "vitest";
import { umhCommandEnvelopeSchema } from "../shared/umh";
import { hashUMHPayload, signUMHMessage, verifyUMHSignature } from "../server/umh/crypto";

const command = {
  protocolVersion: "umh.federation.v1",
  kind: "command",
  id: "command-123",
  capability: "lyfeos.mission.create.v1",
  installationId: "lyfeos-local",
  tenantId: "tenant-1",
  subject: { localUserId: 42, clerkUserId: "user_123" },
  correlationId: "correlation-123",
  idempotencyKey: "a-very-long-idempotency-key",
  issuedAt: "2026-08-03T12:00:00.000Z",
  expiresAt: "2026-08-03T12:05:00.000Z",
  payload: { title: "Schedule annual checkup" },
};

describe("LyfeOS UMH federation envelope", () => {
  it("applies explicit defaults to the low-risk mission-create capability", () => {
    const parsed = umhCommandEnvelopeSchema.parse(command);
    expect(parsed.payload).toMatchObject({
      description: "",
      category: "general",
      difficulty: "D",
      experienceReward: 50,
    });
  });

  it("rejects unexpected payload fields", () => {
    expect(() => umhCommandEnvelopeSchema.parse({ ...command, payload: { title: "x", unrestricted: true } })).toThrow();
  });

  it("uses the payload fingerprint to distinguish an idempotent replay from a conflicting request", () => {
    const parsed = umhCommandEnvelopeSchema.parse(command);
    expect(hashUMHPayload(parsed.payload)).toBe(hashUMHPayload({ ...parsed.payload }));
    expect(hashUMHPayload(parsed.payload)).not.toBe(hashUMHPayload({ ...parsed.payload, title: "Different mission" }));
  });

  it("verifies a signed canonical payload and rejects tampering", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_754_224_000_000);
    const timestamp = String(Date.now());
    const nonce = "abcdEFGHijklMNOPqrstUVWX";
    const signature = signUMHMessage("test-secret", timestamp, nonce, command);

    expect(verifyUMHSignature("test-secret", timestamp, nonce, signature, command)).toBe(true);
    expect(verifyUMHSignature("test-secret", timestamp, nonce, signature, { ...command, id: "modified" })).toBe(false);
    vi.restoreAllMocks();
  });
});
