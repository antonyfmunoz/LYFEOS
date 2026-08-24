import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateUMHProjectionEvent } from "../shared/umh";

const root = path.resolve(import.meta.dirname, "..");
const coordinationEvent = {
  schemaVersion: "umh.v1", eventId: "76fc3350-c9c2-4a7c-b6d6-94fed3b40eba", projectionId: "lyfeos",
  eventType: "lyfeos.coordination-context.updated.v1", installationId: "lyfeos-local", tenantId: "tenant-1", actorId: "user-1",
  aggregateType: "coordination_context", aggregateId: "1:2026-08-22", idempotencyKey: "capacity:1:2026-08-22:v1",
  traceId: "4edc231c-9224-4406-b48e-e3b36904292b", correlationId: "532f9f11-8595-4e56-9847-13324ea9d642", occurredAt: "2026-08-22T10:00:00.000Z",
  payload: { contextDate: "2026-08-22", capacityBand: "steady", evidenceQuality: "combined", purpose: "correlation", allowedDestinations: ["entrepreneuros"] },
} as const;

function typescriptFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? typescriptFiles(target) : entry.name.endsWith(".ts") ? [target] : [];
  });
}

describe("private health federation boundary", () => {
  it("accepts only the coarse, strict coordination contract", () => {
    expect(validateUMHProjectionEvent(coordinationEvent).payload).toEqual(coordinationEvent.payload);
    expect(() => validateUMHProjectionEvent({ ...coordinationEvent, payload: { ...coordinationEvent.payload, sourcePayload: { sleep: 6.2 } } })).toThrow();
    expect(() => validateUMHProjectionEvent({ ...coordinationEvent, payload: { ...coordinationEvent.payload, healthObservation: { metricKey: "weight", value: 80 } } })).toThrow();
    expect(() => validateUMHProjectionEvent({ ...coordinationEvent, rawHealthData: [] })).toThrow();
  });

  it("runtime-validates every UMH outbox producer before persistence", () => {
    const producers = typescriptFiles(path.join(root, "server")).filter((file) => fs.readFileSync(file, "utf8").includes("insert(umhOutboxEvents)"));
    expect(producers.map((file) => path.relative(root, file).replaceAll("\\", "/")).sort()).toEqual(["server/cross-product.ts", "server/umh/service.ts"]);
    for (const producer of producers) expect(fs.readFileSync(producer, "utf8")).toContain("validateUMHProjectionEvent");
  });

  it("does not read provider source records or normalized health observations when building shared context", () => {
    const sharing = fs.readFileSync(path.join(root, "server/cross-product.ts"), "utf8");
    expect(sharing).not.toContain("healthSourceRecords");
    expect(sharing).not.toContain("healthObservations");
    expect(sharing).not.toContain("sourcePayload");
  });
});
