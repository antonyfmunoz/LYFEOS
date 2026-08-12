import { z } from "zod";

/**
 * LyfeOS' projection-side contract for the UMH federation bridge.
 *
 * This intentionally has no dependency on UMH's runtime package: deployments
 * remain independent, while the `protocolVersion` and envelope fields provide
 * a stable integration seam for the control plane to implement.
 */
export const UMH_FEDERATION_PROTOCOL = "umh.federation.v1" as const;
export const LYFEOS_MISSION_CREATE_CAPABILITY = "lyfeos.mission.create.v1" as const;
export const LYFEOS_MISSION_CREATED_EVENT = "lyfeos.mission.created.v1" as const;

const isoTimestamp = z.string().datetime({ offset: true });

export const umhCommandEnvelopeSchema = z.object({
  protocolVersion: z.literal(UMH_FEDERATION_PROTOCOL),
  kind: z.literal("command"),
  id: z.string().min(1).max(128),
  capability: z.literal(LYFEOS_MISSION_CREATE_CAPABILITY),
  installationId: z.string().min(1).max(128),
  tenantId: z.string().min(1).max(128),
  subject: z.object({
    localUserId: z.number().int().positive(),
    clerkUserId: z.string().min(1).max(128),
  }),
  correlationId: z.string().min(1).max(128),
  idempotencyKey: z.string().min(16).max(256),
  issuedAt: isoTimestamp,
  expiresAt: isoTimestamp,
  payload: z.object({
    title: z.string().trim().min(1).max(500),
    description: z.string().max(10_000).default(""),
    category: z.string().trim().min(1).max(64).default("general"),
    difficulty: z.enum(["S", "A", "B", "C", "D", "E", "F"]).default("D"),
    experienceReward: z.number().int().min(0).max(100_000).default(50),
    energyCost: z.number().int().min(0).max(100).default(0),
    attentionCost: z.number().int().min(0).max(100).default(0),
    timeCost: z.number().int().min(0).max(10_080).default(0),
    scheduledFor: isoTimestamp.optional(),
  }).strict(),
}).strict();

export type UMHCommandEnvelope = z.infer<typeof umhCommandEnvelopeSchema>;

export const umhEventEnvelopeSchema = z.object({
  protocolVersion: z.literal(UMH_FEDERATION_PROTOCOL),
  kind: z.literal("event"),
  id: z.string().min(1).max(128),
  type: z.literal(LYFEOS_MISSION_CREATED_EVENT),
  installationId: z.string().min(1).max(128),
  tenantId: z.string().min(1).max(128),
  subject: z.object({
    localUserId: z.number().int().positive(),
    clerkUserId: z.string().min(1).max(128),
  }),
  correlationId: z.string().min(1).max(128),
  causationId: z.string().min(1).max(128),
  occurredAt: isoTimestamp,
  payload: z.object({
    missionId: z.number().int().positive(),
    title: z.string(),
    category: z.string(),
    difficulty: z.string(),
    status: z.literal("confirmed"),
  }).strict(),
}).strict();

export type UMHEventEnvelope = z.infer<typeof umhEventEnvelopeSchema>;

export interface UMHCapabilityManifest {
  protocolVersion: typeof UMH_FEDERATION_PROTOCOL;
  projection: { id: "lyfeos"; name: "LyfeOS"; version: string };
  status: "enabled" | "disabled";
  capabilities: Array<{
    id: typeof LYFEOS_MISSION_CREATE_CAPABILITY;
    risk: "low";
    approval: "automatic";
    idempotency: "required";
  }>;
  events: Array<{ id: typeof LYFEOS_MISSION_CREATED_EVENT; delivery: "outbox" }>;
}

export const LYFEOS_CAPABILITY_MANIFEST: Omit<UMHCapabilityManifest, "status"> = {
  protocolVersion: UMH_FEDERATION_PROTOCOL,
  projection: { id: "lyfeos", name: "LyfeOS", version: "1.0.0" },
  capabilities: [{
    id: LYFEOS_MISSION_CREATE_CAPABILITY,
    risk: "low",
    approval: "automatic",
    idempotency: "required",
  }],
  events: [{ id: LYFEOS_MISSION_CREATED_EVENT, delivery: "outbox" }],
};
