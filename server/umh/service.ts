import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import {
  LYFEOS_MISSION_CREATED_EVENT,
  validateUMHProjectionEvent,
  type UMHCommandEnvelope, type UMHProjectionEventEnvelope,
} from "@shared/umh";
import {
  quests,
  umhApprovalRequests,
  umhAuditRecords,
  umhInboundCommands,
  umhOutboxEvents,
  userActivityEvents,
  users,
} from "@shared/schema";
import { db } from "../db";
import { prepareMissionCreation } from "../mission-lifecycle";
import type { UMHFederationConfig } from "./config";
import { hashUMHPayload } from "./crypto";

export class FederationError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export interface CommandOutcome {
  commandId: string;
  status: "succeeded";
  replayed: boolean;
  missionId: number;
  eventId: string;
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && error.code === "23505") return true;
  if ("cause" in error && error.cause !== error) return isUniqueViolation(error.cause);
  return false;
}

async function existingIdempotentOutcome(command: UMHCommandEnvelope, payloadHash: string): Promise<CommandOutcome | undefined> {
  const [existing] = await db.select({ outcome: umhInboundCommands.outcome, payloadHash: umhInboundCommands.payloadHash })
    .from(umhInboundCommands)
    .where(and(
      eq(umhInboundCommands.installationId, command.installationId),
      eq(umhInboundCommands.localUserId, command.subject.localUserId),
      eq(umhInboundCommands.capability, command.capability),
      eq(umhInboundCommands.idempotencyKey, command.idempotencyKey),
    ))
    .limit(1);

  if (!existing) return undefined;
  if (existing.payloadHash !== payloadHash) {
    throw new FederationError(409, "Idempotency key was already used with a different command payload");
  }
  if (!existing.outcome) return undefined;
  return { ...(existing.outcome as Omit<CommandOutcome, "replayed">), replayed: true };
}

export async function executeMissionCreateCommand(
  command: UMHCommandEnvelope,
  nonce: string,
  config: UMHFederationConfig,
): Promise<CommandOutcome> {
  if (command.installationId !== config.installationId || command.tenantId !== config.tenantId) {
    throw new FederationError(403, "Command scope does not match this LyfeOS installation");
  }
  if (Date.parse(command.expiresAt) <= Date.now()) {
    throw new FederationError(400, "Command has expired");
  }
  if (Date.parse(command.issuedAt) > Date.now() + 60_000) {
    throw new FederationError(400, "Command issuance time is in the future");
  }

  const payloadHash = hashUMHPayload(command.payload);
  const replay = await existingIdempotentOutcome(command, payloadHash);
  if (replay) return replay;

  const [subject] = await db.select({ id: users.id })
    .from(users)
    .where(and(
      eq(users.id, command.subject.localUserId),
      eq(users.clerkId, command.subject.clerkUserId),
    ))
    .limit(1);
  if (!subject) throw new FederationError(403, "Command subject is not valid for this projection");

  const occurredAt = new Date();
  const missionInput = await prepareMissionCreation({
    userId: command.subject.localUserId,
    title: command.payload.title,
    description: command.payload.description,
    category: command.payload.category,
    difficulty: command.payload.difficulty,
    experienceReward: command.payload.experienceReward,
    energyCost: command.payload.energyCost,
    attentionCost: command.payload.attentionCost,
    timeCost: command.payload.timeCost,
    dueDate: command.payload.scheduledFor?.slice(0, 10),
    externalId: command.id,
    externalSource: "umh",
    missionStatus: "confirmed",
  }, { source: "umh" });

  try {
    return await db.transaction(async (tx) => {
      const [receipt] = await tx.insert(umhInboundCommands).values({
        commandId: command.id,
        nonce,
        installationId: command.installationId,
        tenantId: command.tenantId,
        localUserId: command.subject.localUserId,
        capability: command.capability,
        idempotencyKey: command.idempotencyKey,
        payloadHash,
        status: "received",
      }).returning();

      await tx.insert(umhApprovalRequests).values({
        commandId: receipt.commandId,
        risk: "low",
        state: "not_required",
        rationale: "Mission creation is the explicitly allow-listed, low-risk federation capability.",
      });

      const [mission] = await tx.insert(quests).values(missionInput).returning();
      await tx.insert(userActivityEvents).values({
        userId: mission.userId,
        eventType: "mission_created",
        metadata: { questId: mission.id, title: mission.title, source: "umh" },
      });

      const event: UMHProjectionEventEnvelope = {
        schemaVersion: "umh.v1",
        eventId: crypto.randomUUID(),
        projectionId: "lyfeos",
        eventType: LYFEOS_MISSION_CREATED_EVENT,
        installationId: command.installationId,
        tenantId: command.tenantId,
        actorId: command.subject.clerkUserId,
        aggregateType: "mission",
        aggregateId: String(mission.id),
        idempotencyKey: `mission:${mission.id}:created`,
        traceId: crypto.randomUUID(),
        correlationId: crypto.randomUUID(),
        occurredAt: occurredAt.toISOString(),
        payload: {
          missionId: mission.id,
          title: mission.title,
          category: mission.category ?? "general",
          difficulty: mission.difficulty ?? "D",
          status: "confirmed",
        },
      };

      const validatedEvent = validateUMHProjectionEvent(event);
      await tx.insert(umhOutboxEvents).values({
        eventId: validatedEvent.eventId,
        eventType: validatedEvent.eventType,
        aggregateType: "mission",
        aggregateId: String(mission.id),
        payload: validatedEvent,
      });

      const outcome: CommandOutcome = {
        commandId: command.id,
        status: "succeeded",
        replayed: false,
        missionId: mission.id,
        eventId: event.eventId,
      };

      await tx.update(umhInboundCommands)
        .set({ status: "succeeded", outcome, completedAt: occurredAt })
        .where(eq(umhInboundCommands.id, receipt.id));
      await tx.insert(umhAuditRecords).values({
        commandId: command.id,
        action: "lyfeos.mission.created",
        actorType: "umh_federation",
        actorId: command.installationId,
        localUserId: command.subject.localUserId,
        correlationId: command.correlationId,
        details: { capability: command.capability, missionId: mission.id, approval: "not_required" },
        occurredAt,
      });

      return outcome;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const idempotent = await existingIdempotentOutcome(command, payloadHash);
      if (idempotent) return idempotent;
      throw new FederationError(409, "Command or nonce has already been used");
    }
    throw error;
  }
}
