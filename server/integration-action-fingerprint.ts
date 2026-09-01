import crypto from "crypto";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => key !== "approvalId" && key !== "approvalConfirmed")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => [key, canonicalize(child)]));
}

export function integrationActionFingerprint(input: {
  actionKey: string;
  method: string;
  body?: unknown;
  query?: unknown;
}): string {
  return crypto.createHash("sha256").update(JSON.stringify({
    actionKey: input.actionKey,
    method: input.method.toUpperCase(),
    body: canonicalize(input.body ?? null),
    query: canonicalize(input.query ?? null),
  })).digest("hex");
}
