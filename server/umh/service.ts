import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import {
  LYFEOS_MISSION_CREATED_EVENT,
  type UMHCommandEnvelope,
  type UMHEventEnvelope,
} from "@shared/umh";
import {
  quests,
  umhApprovalRequests,
  umhAuditRecords,
  umhInboundCommands,
  umhOutboxEvents,
  users,
} from "@shared/schema";
import { db } from "../db";
import type { UMHFederationConfig } from "./config";

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
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "23505");
}

async function existingIdempotentOutcome(command: UMHCommandEnvelope): Promise<CommandOutcome | undefined> {
  const [existing] = await db.select({ outcome: umhInboundCommands.outcome })
    .from(umhInboundCommands)
    .where(and(
      eq(umhInboundCommands.installationId, command.installationId),
      eq(umhInboundCommands.localUserId, command.subject.localUserId),
      eq(umhInboundCommands.capability, command.capability),
      eq(umhInboundCommands.idempotencyKey, command.idempotencyKey),
    ))
    .limit(1);

  if (!existing?.outcome) return undefined;
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

  const replay = await existingIdempotentOutcome(command);
  if (replay) return replay;

  const [subject] = await db.select({ id: users.id })
    .from(users)
    .where(and(
      eq(users.id, command.subject.localUserId),
      eq(users.clerkId, command.subject.clerkUserId),
    ))
    .limit(1);
  if (!subject) throw new FederationError(403, "Command subject is not valid for this projection");

  const payloadHash = crypto.createHash("sha256").update(JSON.stringify(command.payload)).digest("hex");
  const occurredAt = new Date();

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

      const [mission] = await tx.insert(quests).values({
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
      }).returning();

      const event: UMHEventEnvelope = {
        protocolVersion: "umh.federation.v1",
        kind: "event",
        id: crypto.randomUUID(),
        type: LYFEOS_MISSION_CREATED_EVENT,
        installationId: command.installationId,
        tenantId: command.tenantId,
        subject: command.subject,
        correlationId: command.correlationId,
        causationId: command.id,
        occurredAt: occurredAt.toISOString(),
        payload: {
          missionId: mission.id,
          title: mission.title,
          category: mission.category ?? "general",
          difficulty: mission.difficulty ?? "D",
          status: "confirmed",
        },
      };

      await tx.insert(umhOutboxEvents).values({
        eventId: event.id,
        eventType: event.type,
        aggregateType: "mission",
        aggregateId: String(mission.id),
        payload: event,
      });

      const outcome: CommandOutcome = {
        commandId: command.id,
        status: "succeeded",
        replayed: false,
        missionId: mission.id,
        eventId: event.id,
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
      const idempotent = await existingIdempotentOutcome(command);
      if (idempotent) return idempotent;
      throw new FederationError(409, "Command or nonce has already been used");
    }
    throw error;
  }
}
