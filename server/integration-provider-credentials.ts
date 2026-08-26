import crypto from "node:crypto";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { integrationProviderCredentials, integrations } from "@shared/schema";
import { db } from "./db";

export const integrationCredentialEnvelopeVersion = "integration-credential-aes256gcm-v1" as const;
export const integrationCredentialPayloadSchema = z.object({
  accessToken: z.string().min(1).max(16_384),
  refreshToken: z.string().min(1).max(16_384).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  tokenType: z.string().trim().min(1).max(40).default("Bearer"),
  grantedScopes: z.array(z.string().trim().min(1).max(300)).max(40).default([]),
}).strict();

export type IntegrationCredentialPayload = z.infer<typeof integrationCredentialPayloadSchema>;
type Context = { userId: number; integrationId: number; provider: string };
type Sealed = { ciphertext: string; iv: string; authTag: string; keyVersion: typeof integrationCredentialEnvelopeVersion };

function contextBytes(context: Context): Buffer {
  if (!Number.isInteger(context.userId) || context.userId <= 0 || !Number.isInteger(context.integrationId) || context.integrationId <= 0 || typeof context.provider !== "string" || !context.provider.trim() || context.provider.length > 80 || context.provider.includes("\0")) throw new Error("Invalid integration credential context.");
  return Buffer.from(`${integrationCredentialEnvelopeVersion}\0${context.userId}\0${context.integrationId}\0${context.provider}`, "utf8");
}

export function configuredIntegrationCredentialKey(encoded = process.env.INTEGRATION_PROVIDER_CREDENTIAL_KEY): Buffer {
  if (!encoded) throw new Error("Integration provider credential encryption is not configured.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("Integration provider credential key must decode to exactly 32 bytes.");
  return key;
}

export function sealIntegrationCredential(payload: unknown, context: Context, key = configuredIntegrationCredentialKey()): Sealed {
  if (key.length !== 32) throw new Error("Integration provider credential key must be exactly 32 bytes.");
  const parsed = integrationCredentialPayloadSchema.parse(payload); const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv); cipher.setAAD(contextBytes(context));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(parsed), "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64url"), iv: iv.toString("base64url"), authTag: cipher.getAuthTag().toString("base64url"), keyVersion: integrationCredentialEnvelopeVersion };
}

export function openIntegrationCredential(sealed: Sealed, context: Context, key = configuredIntegrationCredentialKey()): IntegrationCredentialPayload {
  if (sealed.keyVersion !== integrationCredentialEnvelopeVersion || key.length !== 32) throw new Error("Unsupported integration credential envelope.");
  const iv = Buffer.from(sealed.iv, "base64url"); const authTag = Buffer.from(sealed.authTag, "base64url"); const ciphertext = Buffer.from(sealed.ciphertext, "base64url");
  if (iv.length !== 12 || authTag.length !== 16 || ciphertext.length < 1) throw new Error("Invalid integration credential envelope.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv); decipher.setAAD(contextBytes(context)); decipher.setAuthTag(authTag);
  return integrationCredentialPayloadSchema.parse(JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")));
}

function reference(id: number): string { return `integration-vault:v1:${id}`; }
function lockKey(integrationId: number): string { return `integration-credential:${integrationId}`; }

export async function writeIntegrationCredential(context: Context, payload: unknown): Promise<void> {
  const parsed = integrationCredentialPayloadSchema.parse(payload);
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey(context.integrationId)}))`);
    const [integration] = await tx.select({ id: integrations.id }).from(integrations).where(and(eq(integrations.id, context.integrationId), eq(integrations.userId, context.userId), eq(integrations.provider, context.provider))).limit(1);
    if (!integration) throw new Error("Integration credential owner mismatch.");
    const sealed = sealIntegrationCredential(parsed, context);
    const [stored] = await tx.insert(integrationProviderCredentials).values({ userId: context.userId, integrationId: context.integrationId, provider: context.provider, ...sealed, updatedAt: new Date() }).onConflictDoUpdate({ target: integrationProviderCredentials.integrationId, set: { userId: context.userId, provider: context.provider, ciphertext: sealed.ciphertext, iv: sealed.iv, authTag: sealed.authTag, keyVersion: sealed.keyVersion, updatedAt: new Date() } }).returning({ id: integrationProviderCredentials.id });
    await tx.update(integrations).set({ accessToken: null, refreshToken: null, tokenExpiry: null, credentialRef: reference(stored.id) }).where(and(eq(integrations.id, context.integrationId), eq(integrations.userId, context.userId)));
  });
}

export async function readIntegrationCredential(context: Context): Promise<IntegrationCredentialPayload | null> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey(context.integrationId)}))`);
    const [integration] = await tx.select().from(integrations).where(and(eq(integrations.id, context.integrationId), eq(integrations.userId, context.userId), eq(integrations.provider, context.provider))).limit(1);
    if (!integration) return null;
    const [stored] = await tx.select().from(integrationProviderCredentials).where(and(eq(integrationProviderCredentials.integrationId, context.integrationId), eq(integrationProviderCredentials.userId, context.userId), eq(integrationProviderCredentials.provider, context.provider))).limit(1);
    if (stored) {
      if (stored.keyVersion !== integrationCredentialEnvelopeVersion) throw new Error("Unsupported integration credential envelope.");
      return openIntegrationCredential({ ...stored, keyVersion: stored.keyVersion }, context);
    }
    // One-time custody migration for legacy rows. The plaintext columns are
    // cleared in the same transaction that stores the authenticated envelope.
    if (!integration.accessToken) return null;
    const payload = integrationCredentialPayloadSchema.parse({ accessToken: integration.accessToken, refreshToken: integration.refreshToken, expiresAt: integration.tokenExpiry?.toISOString() || null, tokenType: "Bearer", grantedScopes: (integration.scope || "").split(/\s+/).filter(Boolean) });
    const sealed = sealIntegrationCredential(payload, context);
    const [migrated] = await tx.insert(integrationProviderCredentials).values({ userId: context.userId, integrationId: context.integrationId, provider: context.provider, ...sealed }).returning({ id: integrationProviderCredentials.id });
    await tx.update(integrations).set({ accessToken: null, refreshToken: null, tokenExpiry: null, credentialRef: reference(migrated.id) }).where(and(eq(integrations.id, context.integrationId), eq(integrations.userId, context.userId)));
    return payload;
  });
}

export async function deleteIntegrationCredential(context: Context): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey(context.integrationId)}))`);
    await tx.delete(integrationProviderCredentials).where(and(eq(integrationProviderCredentials.integrationId, context.integrationId), eq(integrationProviderCredentials.userId, context.userId), eq(integrationProviderCredentials.provider, context.provider)));
    await tx.update(integrations).set({ accessToken: null, refreshToken: null, tokenExpiry: null, credentialRef: null }).where(and(eq(integrations.id, context.integrationId), eq(integrations.userId, context.userId), eq(integrations.provider, context.provider)));
  });
}

export async function migrateLegacyIntegrationCredentials(batchSize = 100): Promise<number> {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) throw new Error("Invalid integration credential migration batch size.");
  let migrated = 0;
  while (true) {
    const legacy = await db.select({ id: integrations.id, userId: integrations.userId, provider: integrations.provider, accessToken: integrations.accessToken })
      .from(integrations)
      .where(isNotNull(integrations.accessToken))
      .limit(batchSize);
    if (legacy.length === 0) return migrated;
    for (const row of legacy) {
      if (!row.accessToken) {
        await db.update(integrations).set({ accessToken: null, refreshToken: null, tokenExpiry: null, credentialRef: null }).where(and(eq(integrations.id, row.id), eq(integrations.userId, row.userId)));
        continue;
      }
      const credential = await readIntegrationCredential({ userId: row.userId, integrationId: row.id, provider: row.provider });
      if (!credential) throw new Error("Legacy integration credential migration did not converge.");
      migrated += 1;
    }
  }
}
