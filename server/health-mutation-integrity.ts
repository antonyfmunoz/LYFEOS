import { createHash, randomUUID } from "node:crypto";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalize(item)]));
  return value;
}

export function healthMutationPayloadHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

export function healthMutationId(header: unknown): string | null {
  if (typeof header !== "string") return null;
  const value = header.trim();
  return /^[A-Za-z0-9:_-]{16,160}$/.test(value) ? value : null;
}

export function deletionReceiptExpiry(now = new Date()): Date {
  return new Date(now.getTime() + 10 * 60 * 1000);
}

export function newDeletionReceiptId(): string { return randomUUID(); }
