import type { Express, Request, Response } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { healthConnectionAudits, healthConnections, healthImportFailures, healthImportRuns, healthObservations, healthProviderCredentials, healthSourcePreferences, healthSourceRecords, healthSourceSuppressions, healthSyncCursors } from "@shared/schema";
import { db } from "../db";
import { healthConnectionLockKey, healthProviderCatalog, healthProviderDefinition, nextHealthConnectionState, type HealthConnectionAction, type HealthConnectionState } from "../health-connections";
import { isAuthenticated } from "./middleware";
import { canonicalHealthMetricRegistryVersion } from "../health-provider-metrics";
import { healthProviderSourceMap, reviewedProviderCanonicalMetrics } from "../health-provider-source-maps";

const consentVersion = "health-provider-consent-v2";
const intentSchema = z.object({ provider: z.string().trim().min(1).max(60), scopes: z.array(z.string().trim().min(1).max(60)).min(1).max(12) });
const actionSchema = z.object({ action: z.enum(["cancel", "pause", "resume", "retry", "revoke"]) });
const importedDeletionSchema = z.object({ confirmation: z.literal("DELETE IMPORTED DATA") });
const sourcePreferenceSchema = z.object({
  metricKey: z.string().trim().min(1).max(120).regex(/^[a-z0-9_.:-]+$/i),
  orderedSources: z.array(z.string().trim().min(1).max(60)).min(1).max(12),
});

const actionAudit: Record<HealthConnectionAction, string> = { cancel: "cancelled", pause: "paused", resume: "resumed", retry: "retry_requested", revoke: "revoked" };

export function registerHealthConnectionRoutes(app: Express): void {
  app.get("/api/health-connections", isAuthenticated, async (req: Request, res: Response) => {
    const userId = req.session.userId!;
    const [connections, cursors, preferences, audits, runs, failures] = await Promise.all([
      db.select({ id: healthConnections.id, provider: healthConnections.provider, providerName: healthConnections.providerName, status: healthConnections.status, scopes: healthConnections.scopes, consentVersion: healthConnections.consentVersion, consentedAt: healthConnections.consentedAt, lastSyncAt: healthConnections.lastSyncAt, lastErrorCode: healthConnections.lastErrorCode, revokedAt: healthConnections.revokedAt, updatedAt: healthConnections.updatedAt }).from(healthConnections).where(eq(healthConnections.userId, userId)).orderBy(desc(healthConnections.updatedAt)),
      db.select({ connectionId: healthSyncCursors.connectionId, resourceType: healthSyncCursors.resourceType, status: healthSyncCursors.status, consecutiveFailures: healthSyncCursors.consecutiveFailures, lastAttemptAt: healthSyncCursors.lastAttemptAt, lastSuccessAt: healthSyncCursors.lastSuccessAt, nextRetryAt: healthSyncCursors.nextRetryAt }).from(healthSyncCursors).where(eq(healthSyncCursors.userId, userId)),
      db.select().from(healthSourcePreferences).where(eq(healthSourcePreferences.userId, userId)),
      db.select({ id: healthConnectionAudits.id, connectionId: healthConnectionAudits.connectionId, provider: healthConnectionAudits.provider, action: healthConnectionAudits.action, details: healthConnectionAudits.details, createdAt: healthConnectionAudits.createdAt }).from(healthConnectionAudits).where(eq(healthConnectionAudits.userId, userId)).orderBy(desc(healthConnectionAudits.createdAt)).limit(50),
      db.select({ id: healthImportRuns.id, connectionId: healthImportRuns.connectionId, provider: healthImportRuns.provider, resourceType: healthImportRuns.resourceType, status: healthImportRuns.status, fetchedCount: healthImportRuns.fetchedCount, importedCount: healthImportRuns.importedCount, replayedCount: healthImportRuns.replayedCount, correctedCount: healthImportRuns.correctedCount, suppressedCount: healthImportRuns.suppressedCount, failedCount: healthImportRuns.failedCount, errorCode: healthImportRuns.errorCode, startedAt: healthImportRuns.startedAt, finishedAt: healthImportRuns.finishedAt }).from(healthImportRuns).where(eq(healthImportRuns.userId, userId)).orderBy(desc(healthImportRuns.startedAt)).limit(50),
      db.select({ id: healthImportFailures.id, connectionId: healthImportFailures.connectionId, runId: healthImportFailures.runId, provider: healthImportFailures.provider, resourceType: healthImportFailures.resourceType, errorCode: healthImportFailures.errorCode, retryable: healthImportFailures.retryable, status: healthImportFailures.status, nextRetryAt: healthImportFailures.nextRetryAt, createdAt: healthImportFailures.createdAt, resolvedAt: healthImportFailures.resolvedAt }).from(healthImportFailures).where(eq(healthImportFailures.userId, userId)).orderBy(desc(healthImportFailures.createdAt)).limit(50),
    ]);
    return res.json({
      catalog: healthProviderCatalog.map((provider) => ({
        ...provider,
        canonicalMetricRegistryVersion: canonicalHealthMetricRegistryVersion,
        providerSourceMapVersion: healthProviderSourceMap(provider.id)?.version || null,
        providerSourceMapReviewedAt: healthProviderSourceMap(provider.id)?.reviewedAt || null,
        canonicalMetrics: reviewedProviderCanonicalMetrics(provider.id),
        liveAuthorizationAvailable: false,
      })),
      connections: connections.map((connection) => ({ ...connection, cursors: cursors.filter((cursor) => cursor.connectionId === connection.id), importRuns: runs.filter((run) => run.connectionId === connection.id), importFailures: failures.filter((failure) => failure.connectionId === connection.id) })),
      sourcePreferences: preferences,
      audits,
      disclosure: "This connection foundation stores consent intent and lifecycle receipts, but no live provider adapter or credential is available in this build. A pending intent is not a connected or syncing account.",
    });
  });

  app.post("/api/health-connections/intents", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = intentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid connection intent.", details: parsed.error.flatten() });
    const definition = healthProviderDefinition(parsed.data.provider);
    if (!definition) return res.status(400).json({ error: "Unsupported health provider." });
    const scopes = Array.from(new Set(parsed.data.scopes));
    if (scopes.some((scope) => !(definition.scopes as readonly string[]).includes(scope))) return res.status(400).json({ error: "One or more scopes are not supported for that provider." });
    const userId = req.session.userId!;
    const [existing] = await db.select().from(healthConnections).where(and(eq(healthConnections.userId, userId), eq(healthConnections.provider, definition.id))).limit(1);
    if (existing && existing.status !== "pending" && existing.status !== "revoked") return res.status(409).json({ error: "Use the existing connection controls for this provider." });
    const [connection] = await db.insert(healthConnections).values({ userId, provider: definition.id, providerName: definition.name, status: "pending", scopes, consentVersion, consentedAt: new Date(), credentialRef: null, revokedAt: null, lastErrorCode: null, updatedAt: new Date() }).onConflictDoUpdate({ target: [healthConnections.userId, healthConnections.provider], set: { providerName: definition.name, status: "pending", scopes, consentVersion, consentedAt: new Date(), credentialRef: null, revokedAt: null, lastErrorCode: null, updatedAt: new Date() } }).returning({ id: healthConnections.id, provider: healthConnections.provider, providerName: healthConnections.providerName, status: healthConnections.status, scopes: healthConnections.scopes });
    await db.insert(healthConnectionAudits).values({ userId, connectionId: connection.id, provider: connection.provider, action: "consent_intent_created", details: { scopes, consentVersion, liveAuthorizationAvailable: false } });
    return res.status(201).json({ connection, disclosure: "Consent intent saved. No provider authorization, credential, sync, or imported record was created." });
  });

  app.patch("/api/health-connections/:id/state", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id); const parsed = actionSchema.safeParse(req.body); const userId = req.session.userId!;
    if (!Number.isInteger(id) || !parsed.success) return res.status(400).json({ error: "Invalid connection state request." });
    const outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${healthConnectionLockKey(id)}))`);
      const [current] = await tx.select().from(healthConnections).where(and(eq(healthConnections.id, id), eq(healthConnections.userId, userId))).limit(1);
      if (!current) return { kind: "missing" as const };
      const next = nextHealthConnectionState(current.status as HealthConnectionState, parsed.data.action, Boolean(current.credentialRef));
      if (!next) return { kind: "conflict" as const };
      const now = new Date();
      const [connection] = await tx.update(healthConnections).set({ status: next, credentialRef: next === "revoked" ? null : current.credentialRef, revokedAt: next === "revoked" ? now : null, lastErrorCode: parsed.data.action === "retry" ? null : current.lastErrorCode, updatedAt: now }).where(and(eq(healthConnections.id, id), eq(healthConnections.userId, userId), eq(healthConnections.status, current.status))).returning({ id: healthConnections.id, provider: healthConnections.provider, providerName: healthConnections.providerName, status: healthConnections.status, scopes: healthConnections.scopes, revokedAt: healthConnections.revokedAt });
      if (!connection) return { kind: "conflict" as const };
      if (next === "revoked") await tx.delete(healthProviderCredentials).where(and(eq(healthProviderCredentials.connectionId, id), eq(healthProviderCredentials.userId, userId)));
      const cursorStatus = next === "paused" ? "paused" : next === "revoked" ? "revoked" : "idle";
      await tx.update(healthSyncCursors).set({ status: cursorStatus, updatedAt: now }).where(and(eq(healthSyncCursors.connectionId, id), eq(healthSyncCursors.userId, userId)));
      await tx.insert(healthConnectionAudits).values({ userId, connectionId: id, provider: current.provider, action: actionAudit[parsed.data.action], details: { from: current.status, to: next } });
      return { kind: "updated" as const, connection, next };
    });
    if (outcome.kind === "missing") return res.status(404).json({ error: "Health connection not found." });
    if (outcome.kind === "conflict") return res.status(409).json({ error: "That state change is not available for this connection." });
    const { connection, next } = outcome;
    return res.json({ connection, disclosure: next === "revoked" ? "Authorization is revoked and the credential reference is cleared. Previously imported records remain until separately deleted." : "Connection lifecycle state updated. No provider data was inferred." });
  });

  app.delete("/api/health-connections/:id/imported-data", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id); const parsed = importedDeletionSchema.safeParse(req.body); const userId = req.session.userId!;
    if (!Number.isInteger(id) || !parsed.success) return res.status(400).json({ error: "Type DELETE IMPORTED DATA to confirm." });
    const deleted = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${healthConnectionLockKey(id)}))`);
      const [connection] = await tx.select().from(healthConnections).where(and(eq(healthConnections.id, id), eq(healthConnections.userId, userId))).limit(1);
      if (!connection) return { kind: "missing" as const };
      if (connection.status !== "revoked") return { kind: "active" as const };
      const records = await tx.select({ sourceRecordId: healthSourceRecords.sourceRecordId }).from(healthSourceRecords).where(and(eq(healthSourceRecords.connectionId, id), eq(healthSourceRecords.userId, userId)));
      const sourceIds = records.map((record) => record.sourceRecordId);
      const normalized = sourceIds.length ? await tx.delete(healthObservations).where(and(eq(healthObservations.userId, userId), eq(healthObservations.source, connection.provider), inArray(healthObservations.sourceRecordId, sourceIds))).returning({ id: healthObservations.id }) : [];
      const sources = await tx.delete(healthSourceRecords).where(and(eq(healthSourceRecords.connectionId, id), eq(healthSourceRecords.userId, userId))).returning({ id: healthSourceRecords.id });
      const suppressions = await tx.delete(healthSourceSuppressions).where(and(eq(healthSourceSuppressions.connectionId, id), eq(healthSourceSuppressions.userId, userId))).returning({ id: healthSourceSuppressions.id });
      const failures = await tx.delete(healthImportFailures).where(and(eq(healthImportFailures.connectionId, id), eq(healthImportFailures.userId, userId))).returning({ id: healthImportFailures.id });
      const runs = await tx.delete(healthImportRuns).where(and(eq(healthImportRuns.connectionId, id), eq(healthImportRuns.userId, userId))).returning({ id: healthImportRuns.id });
      const cursors = await tx.delete(healthSyncCursors).where(and(eq(healthSyncCursors.connectionId, id), eq(healthSyncCursors.userId, userId))).returning({ id: healthSyncCursors.id });
      await tx.insert(healthConnectionAudits).values({ userId, connectionId: id, provider: connection.provider, action: "imports_deleted", details: { sourceRecords: sources.length, sourceSuppressions: suppressions.length, importFailures: failures.length, importRuns: runs.length, normalizedObservations: normalized.length, syncCursors: cursors.length } });
      return { kind: "deleted" as const, sourceRecords: sources.length, sourceSuppressions: suppressions.length, importFailures: failures.length, importRuns: runs.length, normalizedObservations: normalized.length, syncCursors: cursors.length };
    });
    if (deleted.kind === "missing") return res.status(404).json({ error: "Health connection not found." });
    if (deleted.kind === "active") return res.status(409).json({ error: "Revoke this connection before deleting all imported data." });
    return res.json({ deleted, disclosure: "Imported source metadata, matching normalized provider observations, and sync cursors were deleted. Manual records and the connection lifecycle receipt were not deleted." });
  });

  app.put("/api/health-connections/source-preferences", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = sourcePreferenceSchema.safeParse(req.body); const userId = req.session.userId!;
    if (!parsed.success || new Set(parsed.data.orderedSources).size !== parsed.data.orderedSources.length) return res.status(400).json({ error: "Invalid source preference.", details: parsed.success ? undefined : parsed.error.flatten() });
    const allowedSources = new Set(["manual", ...healthProviderCatalog.map((provider) => provider.id)]);
    if (parsed.data.orderedSources.some((source) => !allowedSources.has(source))) return res.status(400).json({ error: "Unknown health source." });
    const [preference] = await db.insert(healthSourcePreferences).values({ userId, ...parsed.data, updatedAt: new Date() }).onConflictDoUpdate({ target: [healthSourcePreferences.userId, healthSourcePreferences.metricKey], set: { orderedSources: parsed.data.orderedSources, updatedAt: new Date() } }).returning();
    await db.insert(healthConnectionAudits).values({ userId, provider: "source_policy", action: "source_priority_updated", details: { metricKey: preference.metricKey, orderedSources: preference.orderedSources } });
    return res.json({ preference, disclosure: "This stores an explicit display priority. It does not merge, delete, or silently double-count source records." });
  });
}
