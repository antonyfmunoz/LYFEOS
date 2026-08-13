import { describe, expect, it } from "vitest";
import { getProgressionRank, missionExperience } from "@shared/progression";
import {
  LYFEOS_COORDINATION_CONTEXT_UPDATED_EVENT,
  LYFEOS_WORK_ITEM_UPDATED_EVENT,
  umhEventEnvelopeSchema,
} from "@shared/umh";
import { signUMHProjectionEvent } from "../server/umh/crypto";

describe("LyfeOS progression contract", () => {
  it("uses one deterministic rank ladder", () => {
    expect(getProgressionRank(1).name).toBe("Novice");
    expect(getProgressionRank(5).name).toBe("Apprentice");
    expect(getProgressionRank(100).name).toBe("Monarch");
  });

  it("derives mission XP from reward and declared difficulty", () => {
    expect(missionExperience(20, "D")).toBe(20);
    expect(missionExperience(20, "B")).toBe(40);
    expect(missionExperience(20, "S")).toBe(100);
    expect(missionExperience(-20, "S")).toBe(0);
  });

  it("accepts a coarse, privacy-preserving coordination context event", () => {
    const event = {
      schemaVersion: "umh.v1",
      eventId: "f83e9f47-16f4-4f4e-835d-8d5df4b016a8",
      projectionId: "lyfeos",
      eventType: LYFEOS_COORDINATION_CONTEXT_UPDATED_EVENT,
      installationId: "installation-1",
      tenantId: "tenant-1",
      actorId: "user_123",
      aggregateType: "coordination_context",
      aggregateId: "7:2026-08-13",
      idempotencyKey: "capacity:7:2026-08-13:unique-event",
      traceId: "b72617c2-315a-48f3-a193-b365b3169a1a",
      correlationId: "31a67189-92c6-46d4-b4a6-c7b6ff4fbb23",
      occurredAt: "2026-08-13T18:00:00.000Z",
      payload: {
        contextDate: "2026-08-13",
        capacityBand: "steady",
        evidenceQuality: "combined",
        purpose: "correlation",
        allowedDestinations: ["entrepreneuros"],
      },
    };
    expect(umhEventEnvelopeSchema.safeParse(event).success).toBe(true);
    expect(umhEventEnvelopeSchema.safeParse({ ...event, payload: { ...event.payload, privateJournal: "do not send" } }).success).toBe(false);
  });

  it("accepts an explicitly linked work item but rejects an unscoped payload", () => {
    const event = {
      schemaVersion: "umh.v1", eventId: "f83e9f47-16f4-4f4e-835d-8d5df4b016a8", projectionId: "lyfeos",
      eventType: LYFEOS_WORK_ITEM_UPDATED_EVENT, installationId: "installation-1", tenantId: "tenant-1", actorId: "user_123",
      aggregateType: "work_item", aggregateId: "31a67189-92c6-46d4-b4a6-c7b6ff4fbb23", idempotencyKey: "work:31a67189-92c6-46d4-b4a6-c7b6ff4fbb23:completed",
      traceId: "b72617c2-315a-48f3-a193-b365b3169a1a", correlationId: "31a67189-92c6-46d4-b4a6-c7b6ff4fbb23", occurredAt: "2026-08-13T18:00:00.000Z",
      payload: { workItemId: "31a67189-92c6-46d4-b4a6-c7b6ff4fbb23", localMissionId: 7, sharedSummary: "Complete launch brief", state: "completed", purpose: "coordination", allowedDestinations: ["creativesos"] },
    };
    expect(umhEventEnvelopeSchema.safeParse(event).success).toBe(true);
    expect(umhEventEnvelopeSchema.safeParse({ ...event, payload: { ...event.payload, missionTitle: "Private title" } }).success).toBe(false);
  });

  it("signs the exact serialized event body required by UMH projection ingress", () => {
    const body = '{"schemaVersion":"umh.v1"}';
    expect(signUMHProjectionEvent("test-secret", "1700000000", "nonce-1", body))
      .toBe(signUMHProjectionEvent("test-secret", "1700000000", "nonce-1", body));
    expect(signUMHProjectionEvent("test-secret", "1700000000", "nonce-1", body))
      .not.toBe(signUMHProjectionEvent("test-secret", "1700000000", "nonce-1", `${body} `));
  });
});
