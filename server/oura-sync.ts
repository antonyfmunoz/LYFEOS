import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { healthConnectionAudits, healthConnections, healthProviderCredentials, healthSyncCursors, userProfile } from "@shared/schema";
import { db } from "./db";
import { dayBounds, validTimeZone } from "./health-fitness";
import { healthConnectionLockKey } from "./health-connections";
import { healthCredentialEnvelopeVersion, healthCredentialReference, openHealthProviderCredential, sealHealthProviderCredential, type HealthCredentialPayload } from "./health-provider-credentials";
import { ingestProviderHealthEnvelope } from "./health-import-service";
import { prepareProviderHealthImport } from "./health-import";
import { beginHealthSync, completeHealthSync, failHealthSync } from "./health-sync-service";
import { extractOuraDailyActivity, extractOuraDailyReadiness, extractOuraDailySpo2, extractOuraHeartRate, extractOuraSleep, extractOuraWorkout } from "./oura-adapter";
import { configuredOuraOAuth, refreshOuraCredential } from "./oura-oauth";
import { buildOuraCollectionRequest, ouraResourceDefinition, type OuraSyncResource } from "./oura-sync-contract";

const pageSchema = z.object({ data: z.array(z.unknown()), next_token: z.string().min(1).max(4_000).nullable().optional() }).passthrough();

async function currentOuraCredential(userId: number, connectionId: number): Promise<{ credential: HealthCredentialPayload; appScopes: string[] }> {
  const config = configuredOuraOAuth();
  if (!config) throw new Error("OURA.NOT_CONFIGURED");
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${healthConnectionLockKey(connectionId)}))`);
    const [connection] = await tx.select({ status: healthConnections.status, provider: healthConnections.provider, credentialRef: healthConnections.credentialRef, scopes: healthConnections.scopes }).from(healthConnections).where(and(eq(healthConnections.id, connectionId), eq(healthConnections.userId, userId))).limit(1);
    const [stored] = await tx.select().from(healthProviderCredentials).where(and(eq(healthProviderCredentials.connectionId, connectionId), eq(healthProviderCredentials.userId, userId), eq(healthProviderCredentials.provider, "oura"))).limit(1);
    if (!connection || connection.provider !== "oura" || connection.status !== "active" || !connection.credentialRef || !stored) throw new Error("OURA.NOT_AUTHORIZED");
    if (stored.keyVersion !== healthCredentialEnvelopeVersion) throw new Error("OURA.CREDENTIAL_ENVELOPE_UNSUPPORTED");
    let credential = openHealthProviderCredential({ ...stored, keyVersion: stored.keyVersion }, { userId, connectionId, provider: "oura" });
    const expiresAt = credential.expiresAt ? new Date(credential.expiresAt).getTime() : Number.POSITIVE_INFINITY;
    if (expiresAt <= Date.now() + 60_000) {
      if (!credential.refreshToken) throw new Error("OURA.REFRESH_UNAVAILABLE");
      const refreshed = await refreshOuraCredential(credential.refreshToken, config);
      if (!refreshed.grantedProviderScopes.length) refreshed.credential.grantedScopes = credential.grantedScopes;
      const sealed = sealHealthProviderCredential(refreshed.credential, { userId, connectionId, provider: "oura" });
      await tx.update(healthProviderCredentials).set({ ...sealed, updatedAt: new Date() }).where(and(eq(healthProviderCredentials.id, stored.id), eq(healthProviderCredentials.userId, userId)));
      await tx.update(healthConnections).set({ credentialRef: healthCredentialReference(stored.id), lastErrorCode: null, updatedAt: new Date() }).where(and(eq(healthConnections.id, connectionId), eq(healthConnections.userId, userId)));
      await tx.insert(healthConnectionAudits).values({ userId, connectionId, provider: "oura", action: "credential_rotated", details: { envelope: sealed.keyVersion, providerScopes: refreshed.credential.grantedScopes } });
      credential = refreshed.credential;
    }
    return { credential, appScopes: Array.isArray(connection.scopes) ? connection.scopes.filter((scope): scope is string => typeof scope === "string") : [] };
  });
}

async function fetchOuraPage(url: string, credential: HealthCredentialPayload, fetchImpl: typeof fetch): Promise<z.infer<typeof pageSchema>> {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetchImpl(url, { headers: { authorization: `${credential.tokenType || "Bearer"} ${credential.accessToken}`, accept: "application/json" }, signal: controller.signal });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error("OURA.AUTHORIZATION_REJECTED");
      if (response.status === 429) throw new Error("PROVIDER.RATE_LIMIT");
      if (response.status >= 500) throw new Error("PROVIDER.UNAVAILABLE");
      throw new Error("PROVIDER.REQUEST_REJECTED");
    }
    const parsed = pageSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error("PROVIDER.INVALID_RESPONSE");
    return parsed.data;
  } catch (error) {
    if (error instanceof Error && /^[A-Z][A-Z0-9_.:-]+$/.test(error.message)) throw error;
    throw new Error("PROVIDER.NETWORK_ERROR");
  } finally { clearTimeout(timeout); }
}

function extract(resource: OuraSyncResource, row: unknown, timeZone: string) {
  const resolveDay = (date: string) => { const bounds = dayBounds(date, timeZone); return { start: bounds.start.toISOString(), end: bounds.end.toISOString() }; };
  if (resource === "daily_activity") return extractOuraDailyActivity(row, resolveDay);
  if (resource === "workout") return extractOuraWorkout(row);
  if (resource === "sleep") return extractOuraSleep(row);
  if (resource === "heartrate") return extractOuraHeartRate(row);
  if (resource === "daily_spo2") return extractOuraDailySpo2(row, resolveDay);
  return extractOuraDailyReadiness(row, resolveDay);
}

export async function syncOuraResourcePage(input: { userId: number; connectionId: number; resource: OuraSyncResource; now?: Date; fetchImpl?: typeof fetch }) {
  const now = input.now || new Date(); const fetchImpl = input.fetchImpl || fetch;
  const [profile, cursor, resolved] = await Promise.all([
    db.select({ timezone: userProfile.timezone }).from(userProfile).where(eq(userProfile.userId, input.userId)).limit(1),
    db.select({ cursorValue: healthSyncCursors.cursorValue }).from(healthSyncCursors).where(and(eq(healthSyncCursors.connectionId, input.connectionId), eq(healthSyncCursors.resourceType, input.resource))).limit(1),
    currentOuraCredential(input.userId, input.connectionId),
  ]);
  const timeZone = validTimeZone(profile[0]?.timezone || "") ? profile[0]!.timezone! : "UTC";
  if (!resolved.appScopes.includes(ouraResourceDefinition[input.resource].appScope)) throw new Error("OURA.SCOPE_NOT_GRANTED");
  const request = buildOuraCollectionRequest(input.resource, cursor[0]?.cursorValue, timeZone, now);
  const started = await beginHealthSync({ userId: input.userId, connectionId: input.connectionId, resourceType: input.resource, attemptedAt: now });
  const counts = { fetchedCount: 0, importedCount: 0, replayedCount: 0, correctedCount: 0, suppressedCount: 0, failedCount: 0 };
  try {
    const page = await fetchOuraPage(request.url, resolved.credential, fetchImpl);
    const envelopes = page.data.flatMap((row) => extract(input.resource, row, timeZone)).filter((envelope) => resolved.appScopes.includes(prepareProviderHealthImport("oura", envelope, now).requiredScope));
    counts.fetchedCount = envelopes.length;
    for (const envelope of envelopes) {
      const outcome = await ingestProviderHealthEnvelope({ userId: input.userId, connectionId: input.connectionId, provider: "oura", envelope, receivedAt: now });
      if (outcome.suppressed) counts.suppressedCount += 1;
      else if (outcome.replayed) counts.replayedCount += 1;
      else { counts.importedCount += 1; if (outcome.corrected) counts.correctedCount += 1; }
    }
    const nextCursor = JSON.stringify({ v: 1, nextToken: page.next_token || null, windowStart: request.windowStart, windowEnd: request.windowEnd, completedAt: now.toISOString() });
    const completed = await completeHealthSync({ userId: input.userId, connectionId: input.connectionId, runId: started.run.id, resourceType: input.resource, nextCursor, counts, completedAt: now });
    return { resource: input.resource, counts, hasMore: Boolean(page.next_token), runId: completed.run.id, completedAt: completed.run.finishedAt };
  } catch (error) {
    counts.failedCount = 1;
    const code = error instanceof Error && /^[A-Z][A-Z0-9_.:-]+$/.test(error.message) ? error.message : "PROVIDER.SYNC_FAILED";
    await failHealthSync({ userId: input.userId, connectionId: input.connectionId, runId: started.run.id, resourceType: input.resource, errorCode: code, counts, retryable: code !== "OURA.AUTHORIZATION_REJECTED", attemptedAt: now });
    throw error;
  }
}
