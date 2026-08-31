import crypto from "node:crypto";

export const GOOGLE_AUTH_LINK_INTENT_TTL_MS = 10 * 60 * 1000;

export interface GoogleAuthLinkIntent {
  id: string;
  localUserId: number;
  issuedAt: number;
  expiresAt: number;
}

export function createGoogleAuthLinkIntent(
  localUserId: number,
  now = Date.now(),
  id = crypto.randomUUID(),
): GoogleAuthLinkIntent {
  return {
    id,
    localUserId,
    issuedAt: now,
    expiresAt: now + GOOGLE_AUTH_LINK_INTENT_TTL_MS,
  };
}

export function isValidGoogleAuthLinkIntent(
  intent: GoogleAuthLinkIntent,
  sessionUserId: number | undefined,
  now = Date.now(),
): boolean {
  return Number.isInteger(intent.localUserId)
    && intent.localUserId > 0
    && intent.localUserId === sessionUserId
    && now >= intent.issuedAt
    && now <= intent.expiresAt;
}
