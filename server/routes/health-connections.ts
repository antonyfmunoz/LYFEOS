import type { Express, Request, Response } from "express";
import crypto from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { healthConnectionAudits, healthConnections, healthImportFailures, healthImportRuns, healthObservations, healthProviderCredentials, healthSourcePreferences, healthSourceRecords, healthSourceSuppressions, healthSyncCursors } from "@shared/schema";
import { db } from "../db";
import { healthConnectionLockKey, healthProviderCatalog, healthProviderDefinition, nextHealthConnectionState, type HealthConnectionAction, type HealthConnectionState } from "../health-connections";
import { isAuthenticated } from "./middleware";
import { canonicalHealthMetricRegistryVersion } from "../health-provider-metrics";
import { healthProviderSourceMap, reviewedProviderCanonicalMetrics } from "../health-provider-source-maps";
import { healthCredentialEnvelopeVersion, healthCredentialReference, openHealthProviderCredential, sealHealthProviderCredential } from "../health-provider-credentials";
import { buildOuraAuthorizationUrl, configuredOuraOAuth, exchangeOuraAuthorizationCode, normalizeOuraGrantedScopes, ouraAppScopesFromGrantedProviderScopes, ouraProviderScopesForAppScopes, revokeOuraAccessToken } from "../oura-oauth";
import { syncOuraResourcePage } from "../oura-sync";
import { ouraSyncResourceSchema, ouraSyncResourcesForScopes } from "../oura-sync-contract";

declare module "express-session" {
  interface SessionData {
    ouraOAuthState?: string;
    ouraOAuthUserId?: number;
    ouraOAuthConnectionId?: number;
    ouraOAuthRequestedScopes?: string[];
    ouraOAuthStartedAt?: number;
  }
}

const consentVersion = "health-provider-consent-v2";
const intentSchema = z.object({ provider: z.string().trim().min(1).max(60), scopes: z.array(z.string().trim().min(1).max(60)).min(1).max(12) });
const actionSchema = z.object({ action: z.enum(["cancel", "pause", "resume", "retry", "revoke"]) });
const importedDeletionSchema = z.object({ confirmation: z.literal("DELETE IMPORTED DATA") });
const sourcePreferenceSchema = z.object({
  metricKey: z.string().trim().min(1).max(120).regex(/^[a-z0-9_.:-]+$/i),
  orderedSources: z.array(z.string().trim().min(1).max(60)).min(1).max(12),
});
const ouraSyncSchema = z.object({ resource: ouraSyncResourceSchema });

const actionAudit: Record<HealthConnectionAction, string> = { cancel: "cancelled", pause: "paused", resume: "resumed", retry: "retry_requested", revoke: "revoked" };
const ouraOAuthStateLifetimeMs = 10 * 60 * 1_000;

function safeStateMatch(received: unknown, expected: unknown): boolean {
  if (typeof received !== "string" || typeof expected !== "string") return false;
  const receivedBytes = Buffer.from(received); const expectedBytes = Buffer.from(expected);
  return receivedBytes.length === expectedBytes.length && crypto.timingSafeEqual(receivedBytes, expectedBytes);
}

function clearOuraOAuthSession(req: Request): void {
  delete req.session.ouraOAuthState;
  delete req.session.ouraOAuthUserId;
  delete req.session.ouraOAuthConnectionId;
  delete req.session.ouraOAuthRequestedScopes;
  delete req.session.ouraOAuthStartedAt;
}

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
        liveAuthorizationAvailable: provider.id === "oura" && Boolean(configuredOuraOAuth()),
      })),
      connections: connections.map((connection) => ({ ...connection, cursors: cursors.filter((cursor) => cursor.connectionId === connection.id), importRuns: runs.filter((run) => run.connectionId === connection.id), importFailures: failures.filter((failure) => failure.connectionId === connection.id) })),
      sourcePreferences: preferences,
      audits,
      disclosure: configuredOuraOAuth()
        ? "Oura authorization is available after an explicit consent intent. Other providers remain preparation-only. Authorization alone does not claim that a first sync has succeeded."
        : "This environment stores consent intent and lifecycle receipts, but no live provider authorization is configured. A pending intent is not a connected or syncing account.",
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
    await db.insert(healthConnectionAudits).values({ userId, connectionId: connection.id, provider: connection.provider, action: "consent_intent_created", details: { scopes, consentVersion, liveAuthorizationAvailable: definition.id === "oura" && Boolean(configuredOuraOAuth()) } });
    return res.status(201).json({ connection, disclosure: "Consent intent saved. No provider authorization, credential, sync, or imported record was created." });
  });

  app.get("/api/health-connections/oura/auth-url", isAuthenticated, async (req: Request, res: Response) => {
    const config = configuredOuraOAuth(); const connectionId = Number(req.query.connectionId); const userId = req.session.userId!;
    if (!config) return res.status(503).json({ error: "Oura authorization is not configured for this environment." });
    if (!Number.isInteger(connectionId)) return res.status(400).json({ error: "A valid Oura connection is required." });
    const [connection] = await db.select({ id: healthConnections.id, provider: healthConnections.provider, status: healthConnections.status, scopes: healthConnections.scopes }).from(healthConnections).where(and(eq(healthConnections.id, connectionId), eq(healthConnections.userId, userId))).limit(1);
    if (!connection || connection.provider !== "oura") return res.status(404).json({ error: "Oura connection intent not found." });
    if (connection.status !== "pending") return res.status(409).json({ error: "Oura authorization requires a pending consent intent." });
    const requestedScopes = Array.isArray(connection.scopes) ? connection.scopes.filter((scope): scope is string => typeof scope === "string") : [];
    if (!ouraProviderScopesForAppScopes(requestedScopes).length) return res.status(409).json({ error: "The Oura consent intent has no supported scopes." });
    const state = crypto.randomBytes(32).toString("base64url");
    req.session.ouraOAuthState = state; req.session.ouraOAuthUserId = userId; req.session.ouraOAuthConnectionId = connection.id; req.session.ouraOAuthRequestedScopes = requestedScopes; req.session.ouraOAuthStartedAt = Date.now();
    return res.json({ url: buildOuraAuthorizationUrl(config, state, requestedScopes), expiresInSeconds: ouraOAuthStateLifetimeMs / 1_000 });
  });

  app.get("/api/health-connections/oura/callback", isAuthenticated, async (req: Request, res: Response) => {
    const config = configuredOuraOAuth();
    if (!config) { clearOuraOAuthSession(req); return res.redirect("/health?oura=error&reason=not_configured"); }
    const code = req.query.code; const state = req.query.state; const providerError = req.query.error; const callbackScope = typeof req.query.scope === "string" ? req.query.scope : undefined;
    const sessionUserId = req.session.ouraOAuthUserId; const connectionId = req.session.ouraOAuthConnectionId; const requestedScopes = req.session.ouraOAuthRequestedScopes || []; const startedAt = req.session.ouraOAuthStartedAt;
    const validSession = sessionUserId === req.session.userId && Number.isInteger(connectionId) && typeof startedAt === "number" && Date.now() - startedAt >= 0 && Date.now() - startedAt <= ouraOAuthStateLifetimeMs && safeStateMatch(state, req.session.ouraOAuthState);
    clearOuraOAuthSession(req);
    if (providerError || !validSession || typeof code !== "string") return res.redirect("/health?oura=error&reason=authorization_not_completed");
    try {
      const token = await exchangeOuraAuthorizationCode(code, config);
      const requestedProviderScopes = ouraProviderScopesForAppScopes(requestedScopes);
      const callbackGrantedScopes = normalizeOuraGrantedScopes(callbackScope);
      const providerReportedScopes = token.grantedProviderScopes.length && callbackGrantedScopes.length
        ? token.grantedProviderScopes.filter((scope) => callbackGrantedScopes.includes(scope))
        : token.grantedProviderScopes.length ? token.grantedProviderScopes : callbackGrantedScopes;
      const grantedProviderScopes = providerReportedScopes.filter((scope) => requestedProviderScopes.includes(scope));
      const grantedAppScopes = ouraAppScopesFromGrantedProviderScopes(grantedProviderScopes).filter((scope) => requestedScopes.includes(scope));
      if (!grantedAppScopes.length) return res.redirect("/health?oura=error&reason=no_supported_scope");
      token.credential.grantedScopes = grantedProviderScopes;
      const outcome = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${healthConnectionLockKey(connectionId!)}))`);
        const [connection] = await tx.select().from(healthConnections).where(and(eq(healthConnections.id, connectionId!), eq(healthConnections.userId, sessionUserId!), eq(healthConnections.provider, "oura"))).limit(1);
        if (!connection || connection.status !== "pending") return null;
        const sealed = sealHealthProviderCredential(token.credential, { userId: sessionUserId!, connectionId: connectionId!, provider: "oura" });
        const [credential] = await tx.insert(healthProviderCredentials).values({ userId: sessionUserId!, connectionId: connectionId!, provider: "oura", ...sealed, updatedAt: new Date() }).onConflictDoUpdate({ target: healthProviderCredentials.connectionId, set: { ciphertext: sealed.ciphertext, iv: sealed.iv, authTag: sealed.authTag, keyVersion: sealed.keyVersion, updatedAt: new Date() } }).returning({ id: healthProviderCredentials.id });
        const [updated] = await tx.update(healthConnections).set({ status: "active", scopes: grantedAppScopes, credentialRef: healthCredentialReference(credential.id), lastErrorCode: null, revokedAt: null, updatedAt: new Date() }).where(and(eq(healthConnections.id, connectionId!), eq(healthConnections.userId, sessionUserId!), eq(healthConnections.status, "pending"))).returning({ id: healthConnections.id });
        if (!updated) return null;
        await tx.insert(healthConnectionAudits).values({ userId: sessionUserId!, connectionId: connectionId!, provider: "oura", action: "authorized", details: { consentVersion: connection.consentVersion, appScopes: grantedAppScopes, providerScopes: grantedProviderScopes, credentialEnvelope: sealed.keyVersion } });
        return updated;
      });
      return outcome ? res.redirect("/health?oura=connected") : res.redirect("/health?oura=error&reason=connection_changed");
    } catch {
      return res.redirect("/health?oura=error&reason=token_exchange_failed");
    }
  });

  app.post("/api/health-connections/:id/oura-sync", isAuthenticated, async (req: Request, res: Response) => {
    const connectionId = Number(req.params.id); const parsed = ouraSyncSchema.safeParse(req.body); const userId = req.session.userId!;
    if (!Number.isInteger(connectionId) || !parsed.success) return res.status(400).json({ error: "A valid Oura sync resource is required." });
    const [connection] = await db.select({ provider: healthConnections.provider, status: healthConnections.status, scopes: healthConnections.scopes }).from(healthConnections).where(and(eq(healthConnections.id, connectionId), eq(healthConnections.userId, userId))).limit(1);
    if (!connection || connection.provider !== "oura") return res.status(404).json({ error: "Oura connection not found." });
    if (connection.status !== "active") return res.status(409).json({ error: "Oura must be actively authorized before syncing." });
    const scopes = Array.isArray(connection.scopes) ? connection.scopes.filter((scope): scope is string => typeof scope === "string") : [];
    if (!ouraSyncResourcesForScopes(scopes).includes(parsed.data.resource)) return res.status(403).json({ error: "That Oura resource was not authorized." });
    try {
      const receipt = await syncOuraResourcePage({ userId, connectionId, resource: parsed.data.resource });
      return res.json({ receipt, disclosure: "One bounded Oura page was imported. Only reviewed factual fields within your explicit LyfeOS scopes were retained; proprietary Oura scores were not imported." });
    } catch (error) {
      const code = error instanceof Error && /^[A-Z][A-Z0-9_.:-]+$/.test(error.message) ? error.message : "PROVIDER.SYNC_FAILED";
      const status = code === "PROVIDER.RATE_LIMIT" ? 429 : code === "OURA.AUTHORIZATION_REJECTED" ? 401 : code.includes("NOT_AUTHORIZED") || code.includes("SCOPE_NOT_GRANTED") ? 403 : 502;
      return res.status(status).json({ error: "Oura sync did not complete. A sanitized retry receipt was recorded.", code });
    }
  });

  app.patch("/api/health-connections/:id/state", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id); const parsed = actionSchema.safeParse(req.body); const userId = req.session.userId!;
    if (!Number.isInteger(id) || !parsed.success) return res.status(400).json({ error: "Invalid connection state request." });
    let providerRevokeAttempted = false; let providerRevokeSucceeded = false;
    if (parsed.data.action === "revoke") {
      const [stored] = await db.select({ connectionId: healthProviderCredentials.connectionId, provider: healthProviderCredentials.provider, ciphertext: healthProviderCredentials.ciphertext, iv: healthProviderCredentials.iv, authTag: healthProviderCredentials.authTag, keyVersion: healthProviderCredentials.keyVersion }).from(healthProviderCredentials).where(and(eq(healthProviderCredentials.connectionId, id), eq(healthProviderCredentials.userId, userId))).limit(1);
      if (stored?.provider === "oura") {
        providerRevokeAttempted = true;
        try {
          if (stored.keyVersion !== healthCredentialEnvelopeVersion) throw new Error("Unsupported credential envelope.");
          const credential = openHealthProviderCredential({ ...stored, keyVersion: stored.keyVersion }, { userId, connectionId: id, provider: "oura" });
          providerRevokeSucceeded = await revokeOuraAccessToken(credential.accessToken);
        } catch { providerRevokeSucceeded = false; }
      }
    }
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
      if (next === "revoked" && providerRevokeAttempted) await tx.insert(healthConnectionAudits).values({ userId, connectionId: id, provider: current.provider, action: "provider_revoke_attempted", details: { succeeded: providerRevokeSucceeded } });
      await tx.insert(healthConnectionAudits).values({ userId, connectionId: id, provider: current.provider, action: actionAudit[parsed.data.action], details: { from: current.status, to: next } });
      return { kind: "updated" as const, connection, next };
    });
    if (outcome.kind === "missing") return res.status(404).json({ error: "Health connection not found." });
    if (outcome.kind === "conflict") return res.status(409).json({ error: "That state change is not available for this connection." });
    const { connection, next } = outcome;
    return res.json({ connection, disclosure: next === "revoked" ? `The local encrypted credential was destroyed${providerRevokeAttempted ? providerRevokeSucceeded ? " and Oura accepted the provider revocation request" : "; Oura did not confirm the best-effort provider revocation request" : ""}. Previously imported records remain until separately deleted.` : "Connection lifecycle state updated. No provider data was inferred." });
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
