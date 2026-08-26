import { createHash, createPublicKey, timingSafeEqual, verify } from "crypto";
import { z } from "zod";

export const EXTENSION_PERMISSIONS = [
  "projection.mission.summary.read",
  "projection.thread.summary.read",
  "projection.progression.summary.read",
  "draft.mission.create",
  "draft.reflection.create",
] as const;

export const extensionManifestSchema = z.object({
  schema: z.literal("lyfeos.extension.v1"),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{2,63}$/),
  version: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+$/),
  displayName: z.string().trim().min(2).max(100),
  description: z.string().trim().min(3).max(500),
  permissions: z.array(z.enum(EXTENSION_PERMISSIONS)).max(5).refine((values) => new Set(values).size === values.length, "Permissions must be unique."),
  capabilityContract: z.literal("projection_and_draft_only"),
}).strict();

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sortValue(item)]));
  return value;
}

export function canonicalExtensionManifest(manifest: unknown): string {
  return JSON.stringify(sortValue(extensionManifestSchema.parse(manifest)));
}

export function extensionManifestDigest(manifest: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalExtensionManifest(manifest)).digest("hex")}`;
}

export function validateExtensionPublicKey(publicKeyPem: string): boolean {
  try { return createPublicKey(publicKeyPem).asymmetricKeyType === "ed25519"; } catch { return false; }
}

export function verifyExtensionManifest(manifest: unknown, signature: string, publicKeyPem: string): boolean {
  try {
    if (!validateExtensionPublicKey(publicKeyPem)) return false;
    const signatureBytes = Buffer.from(signature, "base64");
    if (signatureBytes.length !== 64) return false;
    return verify(null, Buffer.from(canonicalExtensionManifest(manifest)), publicKeyPem, signatureBytes);
  } catch { return false; }
}

export function hasExtensionRegistryAuthority(header: string | undefined): boolean {
  const configured = process.env.LYFEOS_EXTENSION_REGISTRY_ADMIN_TOKEN?.trim();
  const supplied = header?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!configured || configured.length < 32 || !supplied) return false;
  const expected = Buffer.from(configured);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
