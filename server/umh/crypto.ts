import crypto from "crypto";

export const UMH_MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`).join(",")}}`;
}

export function signingPayload(timestamp: string, nonce: string, body: unknown): string {
  return `${timestamp}.${nonce}.${canonicalize(body)}`;
}

export function signUMHMessage(secret: string, timestamp: string, nonce: string, body: unknown): string {
  return crypto.createHmac("sha256", secret).update(signingPayload(timestamp, nonce, body)).digest("hex");
}

export function verifyUMHSignature(secret: string, timestamp: string, nonce: string, signature: string, body: unknown): boolean {
  if (!/^\d{13}$/.test(timestamp) || !/^[a-zA-Z0-9_-]{16,256}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(signature)) return false;
  if (Math.abs(Date.now() - Number(timestamp)) > UMH_MAX_CLOCK_SKEW_MS) return false;
  const expected = signUMHMessage(secret, timestamp, nonce, body);
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}
