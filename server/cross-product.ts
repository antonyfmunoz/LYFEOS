import crypto from "crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  LYFEOS_COORDINATION_CONTEXT_UPDATED_EVENT,
  LYFEOS_FEDERATION_CONSENT_UPDATED_EVENT,
  LYFEOS_WORK_ITEM_UPDATED_EVENT,
  validateUMHProjectionEvent,
  type UMHProjectionEventEnvelope,
} from "@shared/umh";
import {
  crossProductSharingRevisions,
  crossProductSharingPreferences,
  crossProductWorkLinks,
  integrations,
  quests,
  userIntegrations,
  userDailyLogs,
  userStats,
  umhAuditRecords,
  umhOutboxEvents,
} from "@shared/schema";
import {
  ECOSYSTEM_INTEGRATION_SERVICES,
  ecosystemIntegrationProvider,
  normalizeEcosystemIntegrationPermissions,
  type EcosystemIntegrationCapability,
  type EcosystemIntegrationService,
} from "@shared/ecosystem-integration-permissions";
import { normalizeGoogleAccountPermissionPreferences } from "@shared/google-integration-permissions";
import { db } from "./db";
import { getUMHFederationConfig } from "./umh/config";

export const crossProductDestinations = ["entrepreneuros", "creativesos"] as const;
export const crossProductPurposes = ["coordination", "correlation"] as const;
export const CROSS_PRODUCT_SHARING_POLICY_VERSION = "lyfeos.cross-product-sharing.v1" as const;
export type CrossProductDestination = typeof crossProductDestinations[number];
export type CrossProductPurpose = typeof crossProductPurposes[number];
type CrossProductTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type EcosystemIntegrationGrant = {
  service: EcosystemIntegrationService;
  connected: boolean;
  integrationId: number | null;
  permissions: ReturnType<typeof normalizeEcosystemIntegrationPermissions>;
};

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
  return allowed.filter((item) => value.includes(item));
}

function sameValues<T extends string>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function combined<T extends string>(left: readonly T[], right: readonly T[], allowed: readonly T[]): T[] {
  return allowed.filter((value) => left.includes(value) || right.includes(value));
}

function federationActorId(subjectId: string): string {
  return `lyfeos:${subjectId}`;
}

async function sharingFor(userId: number) {
  const [sharing] = await db.select().from(crossProductSharingPreferences)
    .where(eq(crossProductSharingPreferences.userId, userId)).limit(1);
  return {
    enabled: sharing?.ecosystemSharingEnabled ?? false,
    destinations: selected(sharing?.allowedDestinations, crossProductDestinations),
    purposes: selected(sharing?.allowedPurposes, crossProductPurposes),
    revision: sharing?.revision ?? 0,
    federationSubjectId: sharing?.federationSubjectId ?? null,
  };
}

/**
 * Product integrations are separate app records even though UMH is the secure
 * transport. A product can only receive a purpose that its own app record has
 * enabled; a global federation preference never broadens another app's grant.
 */
export async function getEcosystemIntegrationGrants(userId: number): Promise<EcosystemIntegrationGrant[]> {
  const [account, rows] = await Promise.all([
    db.select({ otherIntegrations: userIntegrations.otherIntegrations }).from(userIntegrations).where(eq(userIntegrations.userId, userId)).limit(1),
    db.select().from(integrations).where(and(
      eq(integrations.userId, userId),
      inArray(integrations.provider, ECOSYSTEM_INTEGRATION_SERVICES.map(ecosystemIntegrationProvider)),
    )),
  ]);
  const preferences = normalizeGoogleAccountPermissionPreferences(account[0]?.otherIntegrations);
  return ECOSYSTEM_INTEGRATION_SERVICES.map((service) => {
    const row = rows.find((candidate) => candidate.provider === ecosystemIntegrationProvider(service));
    return {
      service,
      connected: row?.status === "active",
      integrationId: row?.id ?? null,
      permissions: normalizeEcosystemIntegrationPermissions(row?.settings, preferences),
    };
  });
}

function enabledDestinationsForPurpose(grants: EcosystemIntegrationGrant[], purpose: CrossProductPurpose): CrossProductDestination[] {
  return grants
    .filter((grant) => grant.connected && grant.permissions.capabilities[purpose as EcosystemIntegrationCapability])
    .map((grant) => grant.service);
}

/** Rebuilds the legacy federation consent envelope from independent app grants. */
export async function reconcileEcosystemIntegrationConsent(userId: number) {
  const [sharing, grants] = await Promise.all([sharingFor(userId), getEcosystemIntegrationGrants(userId)]);
  const coordination = enabledDestinationsForPurpose(grants, "coordination");
  const correlation = enabledDestinationsForPurpose(grants, "correlation");
  const destinations = crossProductDestinations.filter((destination) => coordination.includes(destination) || correlation.includes(destination));
  const purposes = crossProductPurposes.filter((purpose) => (purpose === "coordination" ? coordination : correlation).length > 0);
  return updateCrossProductSharing({
    userId,
    enabled: destinations.length > 0,
    destinations,
    purposes,
    expectedRevision: sharing.revision,
  });
}

async function insertEvent(tx: CrossProductTransaction, userId: number, event: UMHProjectionEventEnvelope, action: string, details: Record<string, unknown>): Promise<void> {
  const validatedEvent = validateUMHProjectionEvent(event);
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
}

async function queueEvent(userId: number, event: UMHProjectionEventEnvelope, action: string, details: Record<string, unknown>): Promise<boolean> {
  if (!getUMHFederationConfig()?.controlPlaneUrl) return false;
  await db.transaction(async (tx) => insertEvent(tx, userId, event, action, details));
  return true;
}

export class CrossProductSharingConflictError extends Error {
  constructor(public readonly currentRevision: number) {
    super("Ecosystem sharing changed after it was opened.");
  }
}

export class CrossProductSharingUnavailableError extends Error {}

function buildFederationConsentEvent(input: {
  eventId: string;
  actorId: string;
  installationId: string;
  tenantId: string;
  state: "enabled" | "disabled";
  revision: number;
  allowedDestinations: CrossProductDestination[];
  allowedPurposes: CrossProductPurpose[];
  affectedDestinations: CrossProductDestination[];
  affectedPurposes: CrossProductPurpose[];
  occurredAt: Date;
}): UMHProjectionEventEnvelope {
  return {
    schemaVersion: "umh.v1", eventId: input.eventId, projectionId: "lyfeos",
    eventType: LYFEOS_FEDERATION_CONSENT_UPDATED_EVENT,
    installationId: input.installationId, tenantId: input.tenantId,
    actorId: input.actorId, aggregateType: "federation_consent", aggregateId: input.actorId,
    idempotencyKey: `federation-consent:${input.actorId}:${input.revision}`,
    traceId: crypto.randomUUID(), correlationId: crypto.randomUUID(), occurredAt: input.occurredAt.toISOString(),
    payload: {
      state: input.state,
      policyVersion: CROSS_PRODUCT_SHARING_POLICY_VERSION,
      revision: input.revision,
      allowedDestinations: input.allowedDestinations,
      allowedPurposes: input.allowedPurposes,
      affectedDestinations: input.affectedDestinations,
      affectedPurposes: input.affectedPurposes,
    },
  };
}

export async function updateCrossProductSharing(input: {
  userId: number;
  enabled: boolean;
  destinations: CrossProductDestination[];
  purposes: CrossProductPurpose[];
  expectedRevision: number;
}) {
  const normalizedDestinations = input.enabled ? selected(input.destinations, crossProductDestinations) : [];
  const normalizedPurposes = input.enabled ? selected(input.purposes, crossProductPurposes) : [];
  const config = getUMHFederationConfig();
  if (input.enabled && !config?.controlPlaneUrl) {
    throw new CrossProductSharingUnavailableError("Ecosystem delivery is not configured for this LyfeOS release.");
  }

  return db.transaction(async (tx) => {
    const lockedUser = await tx.execute(sql`SELECT "id" FROM "users" WHERE "id" = ${input.userId} FOR UPDATE`);
    if (!(lockedUser as { rows?: unknown[] }).rows?.length) throw new Error("User not found.");
    const [current] = await tx.select().from(crossProductSharingPreferences)
      .where(eq(crossProductSharingPreferences.userId, input.userId)).limit(1);
    const currentRevision = current?.revision ?? 0;
    if (input.expectedRevision !== currentRevision) throw new CrossProductSharingConflictError(currentRevision);

    const previousDestinations = selected(current?.allowedDestinations, crossProductDestinations);
    const previousPurposes = selected(current?.allowedPurposes, crossProductPurposes);
    const previousEnabled = current?.ecosystemSharingEnabled ?? false;
    if (previousEnabled === input.enabled
      && sameValues(previousDestinations, normalizedDestinations)
      && sameValues(previousPurposes, normalizedPurposes)) {
      return { revision: currentRevision, replayed: true, eventQueued: false };
    }

    const revision = currentRevision + 1;
    const now = new Date();
    const federationSubjectId = current?.federationSubjectId ?? crypto.randomUUID();
    const affectedDestinations = combined(previousDestinations, normalizedDestinations, crossProductDestinations);
    const affectedPurposes = combined(previousPurposes, normalizedPurposes, crossProductPurposes);
    const actorId = federationActorId(federationSubjectId);
    const eventQueued = Boolean(config?.controlPlaneUrl && affectedDestinations.length);
    const eventId = eventQueued ? crypto.randomUUID() : null;

    if (current) {
      await tx.update(crossProductSharingPreferences).set({
        ecosystemSharingEnabled: input.enabled,
        allowedDestinations: normalizedDestinations,
        allowedPurposes: normalizedPurposes,
        consentedAt: input.enabled ? now : current.consentedAt,
        revokedAt: input.enabled ? null : now,
        revision,
        updatedAt: now,
      }).where(and(eq(crossProductSharingPreferences.userId, input.userId), eq(crossProductSharingPreferences.revision, currentRevision)));
    } else {
      await tx.insert(crossProductSharingPreferences).values({
        userId: input.userId,
        federationSubjectId,
        ecosystemSharingEnabled: input.enabled,
        allowedDestinations: normalizedDestinations,
        allowedPurposes: normalizedPurposes,
        consentedAt: input.enabled ? now : null,
        revokedAt: input.enabled ? null : now,
        revision,
        updatedAt: now,
      });
    }

    await tx.insert(crossProductSharingRevisions).values({
      userId: input.userId,
      revision,
      state: input.enabled ? "enabled" : "disabled",
      allowedDestinations: normalizedDestinations,
      allowedPurposes: normalizedPurposes,
      affectedDestinations,
      affectedPurposes,
      policyVersion: CROSS_PRODUCT_SHARING_POLICY_VERSION,
      eventId,
      deliveryState: eventQueued ? "queued" : "not_configured",
      createdAt: now,
    });

    if (eventQueued && eventId && config) {
      const event = buildFederationConsentEvent({
        eventId,
        actorId,
        installationId: config.installationId,
        tenantId: config.tenantId,
        state: input.enabled ? "enabled" : "disabled",
        revision,
        allowedDestinations: normalizedDestinations,
        allowedPurposes: normalizedPurposes,
        affectedDestinations,
        affectedPurposes,
        occurredAt: now,
      });
      await insertEvent(tx, input.userId, event, "lyfeos.federation_consent.updated", {
        revision,
        state: input.enabled ? "enabled" : "disabled",
        affectedDestinations,
      });
    }

    return { revision, replayed: false, eventQueued };
  });
}

/**
 * If sharing was changed while the receiver configuration was absent, only the
 * latest complete state matters. Once delivery returns, atomically enqueue that
 * revision before claiming the normal outbox; superseded local-only revisions
 * remain historical receipts and are never replayed out of order.
 */
export async function reconcilePendingCrossProductConsentEvents(limit = 50): Promise<number> {
  const config = getUMHFederationConfig();
  if (!config?.controlPlaneUrl) return 0;
  const candidates = await db.select({
    id: crossProductSharingRevisions.id,
    userId: crossProductSharingRevisions.userId,
    revision: crossProductSharingRevisions.revision,
  }).from(crossProductSharingRevisions)
    .innerJoin(crossProductSharingPreferences, and(
      eq(crossProductSharingPreferences.userId, crossProductSharingRevisions.userId),
      eq(crossProductSharingPreferences.revision, crossProductSharingRevisions.revision),
    ))
    .where(and(
      eq(crossProductSharingRevisions.deliveryState, "not_configured"),
      isNull(crossProductSharingRevisions.eventId),
    ))
    .orderBy(crossProductSharingRevisions.id)
    .limit(Math.max(1, Math.min(100, Math.floor(limit))));

  let queued = 0;
  for (const candidate of candidates) {
    const inserted = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT "id" FROM "users" WHERE "id" = ${candidate.userId} FOR UPDATE`);
      const [revision] = await tx.select().from(crossProductSharingRevisions).where(and(
        eq(crossProductSharingRevisions.id, candidate.id),
        eq(crossProductSharingRevisions.userId, candidate.userId),
        eq(crossProductSharingRevisions.revision, candidate.revision),
        eq(crossProductSharingRevisions.deliveryState, "not_configured"),
        isNull(crossProductSharingRevisions.eventId),
      )).limit(1);
      const [preference] = await tx.select().from(crossProductSharingPreferences).where(and(
        eq(crossProductSharingPreferences.userId, candidate.userId),
        eq(crossProductSharingPreferences.revision, candidate.revision),
      )).limit(1);
      if (!revision || !preference) return false;
      const affectedDestinations = selected(revision.affectedDestinations, crossProductDestinations);
      if (!affectedDestinations.length) return false;
      const actorId = federationActorId(preference.federationSubjectId);
      const eventId = crypto.randomUUID();
      const [claimed] = await tx.update(crossProductSharingRevisions).set({ eventId, deliveryState: "queued" })
        .where(and(eq(crossProductSharingRevisions.id, revision.id), isNull(crossProductSharingRevisions.eventId)))
        .returning({ id: crossProductSharingRevisions.id });
      if (!claimed) return false;
      const event = buildFederationConsentEvent({
        eventId,
        actorId,
        installationId: config.installationId,
        tenantId: config.tenantId,
        state: revision.state === "enabled" ? "enabled" : "disabled",
        revision: revision.revision,
        allowedDestinations: selected(revision.allowedDestinations, crossProductDestinations),
        allowedPurposes: selected(revision.allowedPurposes, crossProductPurposes),
        affectedDestinations,
        affectedPurposes: selected(revision.affectedPurposes, crossProductPurposes),
        occurredAt: revision.createdAt,
      });
      await insertEvent(tx, candidate.userId, event, "lyfeos.federation_consent.reconciled", {
        revision: revision.revision,
        state: revision.state,
        affectedDestinations,
      });
      return true;
    });
    if (inserted) queued += 1;
  }
  return queued;
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
  const grants = await getEcosystemIntegrationGrants(userId);
  const destinations = enabledDestinationsForPurpose(grants, "correlation");
  if (!sharing.enabled || destinations.length === 0) return false;
  const config = getUMHFederationConfig();
  const [dailyLog, stats] = config ? await Promise.all([
    db.select({ mentalState: userDailyLogs.mentalState, physicalState: userDailyLogs.physicalState, emotionalState: userDailyLogs.emotionalState, wellnessReportedAt: userDailyLogs.wellnessReportedAt }).from(userDailyLogs)
      .where(and(eq(userDailyLogs.userId, userId), eq(userDailyLogs.date, date))).limit(1),
    db.select({ energyCurrent: userStats.energyPointsCurrent, energyMax: userStats.energyPointsMax }).from(userStats).where(eq(userStats.userId, userId)).limit(1),
  ]) : [[], []] as const;
  if (!config || !sharing.federationSubjectId) return false;
  const actorId = federationActorId(sharing.federationSubjectId);
  const log = dailyLog[0];
  const userStat = stats[0];
  if (!log && !userStat) return false;
  const band = capacityBand({
    mentalState: log?.wellnessReportedAt ? log.mentalState : null,
    physicalState: log?.wellnessReportedAt ? log.physicalState : null,
    emotionalState: log?.wellnessReportedAt ? log.emotionalState : null,
    energyCurrent: userStat?.energyCurrent ?? null,
    energyMax: userStat?.energyMax ?? null,
  });
  const evidenceQuality = log?.wellnessReportedAt && userStat ? "combined" : log?.wellnessReportedAt ? "self_reported" : "local_resource_state";
  const version = crypto.createHash("sha256").update(JSON.stringify({ date, band, evidenceQuality, destinations })).digest("hex").slice(0, 24);
  const event: UMHProjectionEventEnvelope = {
    schemaVersion: "umh.v1", eventId: crypto.randomUUID(), projectionId: "lyfeos",
    eventType: LYFEOS_COORDINATION_CONTEXT_UPDATED_EVENT, installationId: config.installationId, tenantId: config.tenantId,
    actorId, aggregateType: "coordination_context", aggregateId: `${actorId}:${date}`,
    idempotencyKey: `capacity:${actorId}:${date}:${version}`, traceId: crypto.randomUUID(), correlationId: crypto.randomUUID(), occurredAt: new Date().toISOString(),
    payload: { contextDate: date, capacityBand: band, evidenceQuality, purpose: "correlation", allowedDestinations: destinations },
  };
  return queueEvent(userId, event, "lyfeos.coordination_context.updated", { contextDate: date, capacityBand: band, allowedDestinations: destinations });
}

/** Queues state for an explicitly linked work item, not for ordinary private missions. */
export async function queueLinkedWorkItemState(userId: number, questId: number): Promise<number> {
  const sharing = await sharingFor(userId);
  const grants = await getEcosystemIntegrationGrants(userId);
  const coordinationDestinations = enabledDestinationsForPurpose(grants, "coordination");
  if (!sharing.enabled || coordinationDestinations.length === 0) return 0;
  const config = getUMHFederationConfig();
  const [quest, links] = config ? await Promise.all([
    db.select({ id: quests.id, completed: quests.completed, completedAt: quests.completedAt }).from(quests).where(and(eq(quests.id, questId), eq(quests.userId, userId))).limit(1),
    db.select().from(crossProductWorkLinks).where(and(eq(crossProductWorkLinks.userId, userId), eq(crossProductWorkLinks.questId, questId))),
  ]) : [[], []] as const;
  const actorId = sharing.federationSubjectId ? federationActorId(sharing.federationSubjectId) : null;
  const localQuest = quest[0];
  if (!config || !actorId || !localQuest) return 0;
  let queued = 0;
  for (const link of links) {
    const destinations = selected(link.destinations, crossProductDestinations).filter((destination) => coordinationDestinations.includes(destination));
    if (!destinations.length) continue;
    const state = localQuest.completed ? "completed" as const : "open" as const;
    const event: UMHProjectionEventEnvelope = {
      schemaVersion: "umh.v1", eventId: crypto.randomUUID(), projectionId: "lyfeos",
      eventType: LYFEOS_WORK_ITEM_UPDATED_EVENT, installationId: config.installationId, tenantId: config.tenantId,
      actorId, aggregateType: "work_item", aggregateId: link.workItemId,
      idempotencyKey: `work:${link.workItemId}:${state}:${localQuest.completedAt?.toISOString() || "open"}`,
      traceId: crypto.randomUUID(), correlationId: crypto.randomUUID(), occurredAt: new Date().toISOString(),
      payload: { workItemId: link.workItemId, localMissionId: questId, sharedSummary: link.sharedSummary, state, purpose: "coordination", allowedDestinations: destinations },
    };
    if (await queueEvent(userId, event, "lyfeos.work_item.updated", { workItemId: link.workItemId, state, allowedDestinations: destinations })) queued += 1;
  }
  return queued;
}

export async function getCrossProductSharing(userId: number) {
  const [sharing, grants, revisions] = await Promise.all([
    sharingFor(userId),
    getEcosystemIntegrationGrants(userId),
    db.select({
      id: crossProductSharingRevisions.id,
      revision: crossProductSharingRevisions.revision,
      state: crossProductSharingRevisions.state,
      allowedDestinations: crossProductSharingRevisions.allowedDestinations,
      allowedPurposes: crossProductSharingRevisions.allowedPurposes,
      affectedDestinations: crossProductSharingRevisions.affectedDestinations,
      affectedPurposes: crossProductSharingRevisions.affectedPurposes,
      policyVersion: crossProductSharingRevisions.policyVersion,
      eventId: crossProductSharingRevisions.eventId,
      deliveryState: crossProductSharingRevisions.deliveryState,
      transportStatus: umhOutboxEvents.status,
      deliveredAt: umhOutboxEvents.deliveredAt,
      createdAt: crossProductSharingRevisions.createdAt,
    }).from(crossProductSharingRevisions)
      .leftJoin(umhOutboxEvents, eq(umhOutboxEvents.eventId, crossProductSharingRevisions.eventId))
      .where(eq(crossProductSharingRevisions.userId, userId))
      .orderBy(desc(crossProductSharingRevisions.revision)).limit(10),
  ]);
  return {
    enabled: sharing.enabled,
    destinations: sharing.destinations,
    purposes: sharing.purposes,
    revision: sharing.revision,
    availability: getCrossProductSharingAvailability(),
    integrations: grants.map((grant) => ({
      service: grant.service,
      connected: grant.connected,
      integrationId: grant.integrationId,
      permissions: grant.permissions,
    })),
    revisions: revisions.map((revision) => ({
      ...revision,
      allowedDestinations: selected(revision.allowedDestinations, crossProductDestinations),
      allowedPurposes: selected(revision.allowedPurposes, crossProductPurposes),
      affectedDestinations: selected(revision.affectedDestinations, crossProductDestinations),
      affectedPurposes: selected(revision.affectedPurposes, crossProductPurposes),
    })),
  };
}
