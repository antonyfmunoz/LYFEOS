import crypto from "node:crypto";
import { z } from "zod";

export const healthCredentialEnvelopeVersion = "health-credential-aes256gcm-v1" as const;

export const healthCredentialPayloadSchema = z.object({
  accessToken: z.string().min(1).max(16_384),
  refreshToken: z.string().min(1).max(16_384).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  tokenType: z.string().trim().min(1).max(40).default("Bearer"),
  grantedScopes: z.array(z.string().trim().min(1).max(80)).max(24).default([]),
}).strict();

export type HealthCredentialPayload = z.infer<typeof healthCredentialPayloadSchema>;
export type HealthCredentialContext = { userId: number; connectionId: number; provider: string };
export type SealedHealthCredential = { ciphertext: string; iv: string; authTag: string; keyVersion: typeof healthCredentialEnvelopeVersion };

function aad(context: HealthCredentialContext): Buffer {
  if (!Number.isInteger(context.userId) || context.userId <= 0 || !Number.isInteger(context.connectionId) || context.connectionId <= 0 || !/^[a-z][a-z0-9_]{0,59}$/.test(context.provider)) throw new Error("Invalid health credential context.");
  return Buffer.from(`${healthCredentialEnvelopeVersion}\0${context.userId}\0${context.connectionId}\0${context.provider}`, "utf8");
}

export function configuredHealthCredentialKey(encoded = process.env.HEALTH_PROVIDER_CREDENTIAL_KEY): Buffer {
  if (!encoded) throw new Error("Health provider credential encryption is not configured.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("Health provider credential key must decode to exactly 32 bytes.");
  return key;
}

export function sealHealthProviderCredential(payload: unknown, context: HealthCredentialContext, key = configuredHealthCredentialKey()): SealedHealthCredential {
  if (key.length !== 32) throw new Error("Health provider credential key must be exactly 32 bytes.");
  const parsed = healthCredentialPayloadSchema.parse(payload); const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv); cipher.setAAD(aad(context));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(parsed), "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64url"), iv: iv.toString("base64url"), authTag: cipher.getAuthTag().toString("base64url"), keyVersion: healthCredentialEnvelopeVersion };
}

export function openHealthProviderCredential(sealed: SealedHealthCredential, context: HealthCredentialContext, key = configuredHealthCredentialKey()): HealthCredentialPayload {
  if (key.length !== 32 || sealed.keyVersion !== healthCredentialEnvelopeVersion) throw new Error("Unsupported health credential envelope.");
  const iv = Buffer.from(sealed.iv, "base64url"); const tag = Buffer.from(sealed.authTag, "base64url"); const ciphertext = Buffer.from(sealed.ciphertext, "base64url");
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length < 1) throw new Error("Invalid health credential envelope.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv); decipher.setAAD(aad(context)); decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  return healthCredentialPayloadSchema.parse(JSON.parse(plaintext));
}

export function healthCredentialReference(id: number): string {
  if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid health credential identifier.");
  return `health-vault:v1:${id}`;
}
