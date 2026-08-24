import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import {
  LYFEOS_COORDINATION_CONTEXT_UPDATED_EVENT,
  LYFEOS_WORK_ITEM_UPDATED_EVENT,
  validateUMHProjectionEvent,
  type UMHProjectionEventEnvelope,
} from "@shared/umh";
import {
  crossProductSharingPreferences,
  crossProductWorkLinks,
  quests,
  userDailyLogs,
  userStats,
  umhAuditRecords,
  umhOutboxEvents,
  users,
} from "@shared/schema";
import { db } from "./db";
import { getUMHFederationConfig } from "./umh/config";

export const crossProductDestinations = ["entrepreneuros", "creativesos"] as const;
export const crossProductPurposes = ["coordination", "correlation"] as const;
export type CrossProductDestination = typeof crossProductDestinations[number];
export type CrossProductPurpose = typeof crossProductPurposes[number];

export type CrossProductSharingAvailability = {
  available: boolean;
  reason: string | null;
};

/**
 * Consent must not imply a working delivery channel. Local preferences are
 * never treated as enabled ecosystem sharing unless the signed UMH outbox has
 * a configured receiver.
 */
export function getCrossProductSharingAvailability(): CrossProductSharingAvailability {
  const config = getUMHFederationConfig();
  return config?.controlPlaneUrl
    ? { available: true, reason: null }
    : { available: false, reason: "Ecosystem delivery is not configured for this LyfeOS release." };
}

function selected<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is T => typeof item === "string" && (allowed as readonly string[]).includes(item));
}

async function sharingFor(userId: number) {
  const [sharing] = await db.select().from(crossProductSharingPreferences)
    .where(eq(crossProductSharingPreferences.userId, userId)).limit(1);
  return {
    enabled: sharing?.ecosystemSharingEnabled ?? false,
    destinations: selected(sharing?.allowedDestinations, crossProductDestinations),
    purposes: selected(sharing?.allowedPurposes, crossProductPurposes),
  };
}

async function queueEvent(userId: number, event: UMHProjectionEventEnvelope, action: string, details: Record<string, unknown>): Promise<boolean> {
  const config = getUMHFederationConfig();
  const [user] = config ? await db.select({ clerkId: users.clerkId }).from(users).where(eq(users.id, userId)).limit(1) : [];
  if (!config || !user?.clerkId) return false;
  const validatedEvent = validateUMHProjectionEvent(event);
  await db.transaction(async (tx) => {
    await tx.insert(umhOutboxEvents).values({
      eventId: validatedEvent.eventId,
      eventType: validatedEvent.eventType,
      aggregateType: validatedEvent.aggregateType,
      aggregateId: validatedEvent.aggregateId,
      payload: validatedEvent,
    });
    await tx.insert(umhAuditRecords).values({
      action,
      actorType: "lyfeos",
      actorId: String(userId),
      localUserId: userId,
      correlationId: validatedEvent.correlationId,
      details: { eventId: validatedEvent.eventId, ...details },
    });
  });
  return true;
}

function capacityBand(input: { mentalState: number | null; physicalState: number | null; emotionalState: number | null; energyCurrent: number | null; energyMax: number | null }) {
  const states = [input.mentalState, input.physicalState, input.emotionalState].filter((value): value is number => typeof value === "number");
  const average = states.length ? states.reduce((sum, value) => sum + value, 0) / states.length : null;
  const energyRatio = input.energyCurrent !== null && input.energyMax && input.energyMax > 0 ? input.energyCurrent / input.energyMax : null;
  if ((average !== null && average <= 4) || (energyRatio !== null && energyRatio <= 0.3)) return "low" as const;
  if ((average !== null && average >= 7) && (energyRatio === null || energyRatio >= 0.7)) return "high" as const;
  return "steady" as const;
}

/** Queues a coarse, opt-in daily context signal; raw health and journal data remain local. */
export async function queueCoordinationContext(userId: number, date: string): Promise<boolean> {
  const sharing = await sharingFor(userId);
  if (!sharing.enabled || !sharing.purposes.includes("correlation") || sharing.destinations.length === 0) return false;
  const config = getUMHFederationConfig();
  const [user, dailyLog, stats] = config ? await Promise.all([
    db.select({ clerkId: users.clerkId }).from(users).where(eq(users.id, userId)).limit(1),
    db.select({ mentalState: userDailyLogs.mentalState, physicalState: userDailyLogs.physicalState, emotionalState: userDailyLogs.emotionalState }).from(userDailyLogs)
      .where(and(eq(userDailyLogs.userId, userId), eq(userDailyLogs.date, date))).limit(1),
    db.select({ energyCurrent: userStats.energyPointsCurrent, energyMax: userStats.energyPointsMax }).from(userStats).where(eq(userStats.userId, userId)).limit(1),
  ]) : [[], [], []] as const;
  const clerkId = user[0]?.clerkId;
  if (!config || !clerkId) return false;
  const log = dailyLog[0];
  const userStat = stats[0];
  if (!log && !userStat) return false;
  const band = capacityBand({
    mentalState: log?.mentalState ?? null,
    physicalState: log?.physicalState ?? null,
    emotionalState: log?.emotionalState ?? null,
    energyCurrent: userStat?.energyCurrent ?? null,
    energyMax: userStat?.energyMax ?? null,
  });
  const evidenceQuality = log && userStat ? "combined" : log ? "self_reported" : "local_resource_state";
  const version = crypto.createHash("sha256").update(JSON.stringify({ date, band, evidenceQuality, destinations: sharing.destinations })).digest("hex").slice(0, 24);
  const event: UMHProjectionEventEnvelope = {
    schemaVersion: "umh.v1", eventId: crypto.randomUUID(), projectionId: "lyfeos",
    eventType: LYFEOS_COORDINATION_CONTEXT_UPDATED_EVENT, installationId: config.installationId, tenantId: config.tenantId,
    actorId: clerkId, aggregateType: "coordination_context", aggregateId: `${userId}:${date}`,
    idempotencyKey: `capacity:${userId}:${date}:${version}`, traceId: crypto.randomUUID(), correlationId: crypto.randomUUID(), occurredAt: new Date().toISOString(),
    payload: { contextDate: date, capacityBand: band, evidenceQuality, purpose: "correlation", allowedDestinations: sharing.destinations },
  };
  return queueEvent(userId, event, "lyfeos.coordination_context.updated", { contextDate: date, capacityBand: band, allowedDestinations: sharing.destinations });
}

/** Queues state for an explicitly linked work item, not for ordinary private missions. */
export async function queueLinkedWorkItemState(userId: number, questId: number): Promise<number> {
  const sharing = await sharingFor(userId);
  if (!sharing.enabled || !sharing.purposes.includes("coordination")) return 0;
  const config = getUMHFederationConfig();
  const [user, quest, links] = config ? await Promise.all([
    db.select({ clerkId: users.clerkId }).from(users).where(eq(users.id, userId)).limit(1),
    db.select({ id: quests.id, completed: quests.completed, completedAt: quests.completedAt }).from(quests).where(and(eq(quests.id, questId), eq(quests.userId, userId))).limit(1),
    db.select().from(crossProductWorkLinks).where(and(eq(crossProductWorkLinks.userId, userId), eq(crossProductWorkLinks.questId, questId))),
  ]) : [[], [], []] as const;
  const clerkId = user[0]?.clerkId;
  const localQuest = quest[0];
  if (!config || !clerkId || !localQuest) return 0;
  let queued = 0;
  for (const link of links) {
    const destinations = selected(link.destinations, crossProductDestinations).filter((destination) => sharing.destinations.includes(destination));
    if (!destinations.length) continue;
    const state = localQuest.completed ? "completed" as const : "open" as const;
    const event: UMHProjectionEventEnvelope = {
      schemaVersion: "umh.v1", eventId: crypto.randomUUID(), projectionId: "lyfeos",
      eventType: LYFEOS_WORK_ITEM_UPDATED_EVENT, installationId: config.installationId, tenantId: config.tenantId,
      actorId: clerkId, aggregateType: "work_item", aggregateId: link.workItemId,
      idempotencyKey: `work:${link.workItemId}:${state}:${localQuest.completedAt?.toISOString() || "open"}`,
      traceId: crypto.randomUUID(), correlationId: crypto.randomUUID(), occurredAt: new Date().toISOString(),
      payload: { workItemId: link.workItemId, localMissionId: questId, sharedSummary: link.sharedSummary, state, purpose: "coordination", allowedDestinations: destinations },
    };
    if (await queueEvent(userId, event, "lyfeos.work_item.updated", { workItemId: link.workItemId, state, allowedDestinations: destinations })) queued += 1;
  }
  return queued;
}

export async function getCrossProductSharing(userId: number) {
  return { ...(await sharingFor(userId)), availability: getCrossProductSharingAvailability() };
}
