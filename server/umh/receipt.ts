import { umhEventReceiptSchema, type UMHEventEnvelope, type UMHEventReceipt } from "@shared/umh";
import type { UMHFederationConfig } from "./config";
import { verifyUMHProjectionReceipt } from "./crypto";

export const UMH_MAX_RECEIPT_BYTES = 16 * 1024;

export type UMHReceiptErrorCode =
  | "RECEIPT_TOO_LARGE"
  | "RECEIPT_KEY_MISMATCH"
  | "RECEIPT_SIGNATURE_INVALID"
  | "RECEIPT_SCHEMA_INVALID"
  | "RECEIPT_SCOPE_MISMATCH";

export type UMHReceiptValidation =
  | { accepted: true; receipt: UMHEventReceipt }
  | { accepted: false; errorCode: UMHReceiptErrorCode };

/**
 * Qualify a consumer receipt against the exact event LyfeOS attempted to
 * deliver. This function is deliberately pure so the receiver contract can be
 * tested without a configured control plane or database.
 */
export function validateSignedUMHEventReceipt(input: {
  serializedBody: string;
  keyId: string | null;
  timestamp: string | null;
  nonce: string | null;
  signature: string | null;
  event: UMHEventEnvelope;
  config: Pick<UMHFederationConfig, "installationId" | "tenantId" | "keyId" | "sharedSecret">;
}): UMHReceiptValidation {
  if (Buffer.byteLength(input.serializedBody, "utf8") > UMH_MAX_RECEIPT_BYTES) {
    return { accepted: false, errorCode: "RECEIPT_TOO_LARGE" };
  }
  if (input.keyId !== input.config.keyId) {
    return { accepted: false, errorCode: "RECEIPT_KEY_MISMATCH" };
  }
  if (!input.timestamp || !input.nonce || !input.signature || !verifyUMHProjectionReceipt(
    input.config.sharedSecret,
    input.timestamp,
    input.nonce,
    input.signature,
    input.serializedBody,
  )) {
    return { accepted: false, errorCode: "RECEIPT_SIGNATURE_INVALID" };
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(input.serializedBody);
  } catch {
    return { accepted: false, errorCode: "RECEIPT_SCHEMA_INVALID" };
  }
  const parsed = umhEventReceiptSchema.safeParse(parsedBody);
  if (!parsed.success) return { accepted: false, errorCode: "RECEIPT_SCHEMA_INVALID" };
  if (
    parsed.data.eventId !== input.event.eventId
    || parsed.data.projectionId !== input.event.projectionId
    || parsed.data.installationId !== input.event.installationId
    || parsed.data.tenantId !== input.event.tenantId
    || parsed.data.installationId !== input.config.installationId
    || parsed.data.tenantId !== input.config.tenantId
  ) {
    return { accepted: false, errorCode: "RECEIPT_SCOPE_MISMATCH" };
  }
  return { accepted: true, receipt: parsed.data };
}
