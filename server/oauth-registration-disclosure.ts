import crypto from "node:crypto";
import { REGISTRATION_DISCLOSURE_VERSION } from "@shared/registration-disclosure";

export const OAUTH_REGISTRATION_INTENT_TTL_MS = 10 * 60 * 1000;

export interface OAuthRegistrationIntent {
  id: string;
  disclosureVersion: typeof REGISTRATION_DISCLOSURE_VERSION;
  issuedAt: number;
  expiresAt: number;
}

interface ClerkRegistrationIdentity {
  id: string;
  createdAt: number;
  unsafeMetadata: Record<string, unknown>;
}

interface LocalRegistrationIdentity {
  clerkId: string | null;
  authProvider: string | null;
  registrationDisclosureVersion: string | null;
  registrationDisclosureAcknowledgedAt: Date | null;
}

export function createOAuthRegistrationIntent(
  now = Date.now(),
  id = crypto.randomUUID(),
): OAuthRegistrationIntent {
  return {
    id,
    disclosureVersion: REGISTRATION_DISCLOSURE_VERSION,
    issuedAt: now,
    expiresAt: now + OAUTH_REGISTRATION_INTENT_TTL_MS,
  };
}

export function isSameOriginRegistrationRequest(
  origin: string | undefined,
  host: string | undefined,
  protocol: string,
): boolean {
  if (!origin || !host) return false;
  try {
    const parsedOrigin = new URL(origin);
    return parsedOrigin.host === host && parsedOrigin.protocol === `${protocol}:`;
  } catch {
    return false;
  }
}

export function canApplyOAuthRegistrationDisclosure(
  intent: OAuthRegistrationIntent,
  clerkUser: ClerkRegistrationIdentity,
  localUser: LocalRegistrationIdentity,
  now = Date.now(),
): boolean {
  if (intent.disclosureVersion !== REGISTRATION_DISCLOSURE_VERSION) return false;
  if (now < intent.issuedAt || now > intent.expiresAt) return false;
  if (clerkUser.id !== localUser.clerkId || localUser.authProvider !== "clerk") return false;
  if (localUser.registrationDisclosureVersion || localUser.registrationDisclosureAcknowledgedAt) return false;

  // An intent from the registration page must never retrofit an older Clerk
  // account. Clerk's account creation timestamp and the one-use metadata nonce
  // independently bind the returned identity to this exact registration flow.
  if (clerkUser.createdAt < intent.issuedAt || clerkUser.createdAt > intent.expiresAt) return false;
  return clerkUser.unsafeMetadata.lyfeosRegistrationIntentId === intent.id
    && clerkUser.unsafeMetadata.lyfeosRegistrationDisclosureVersion === intent.disclosureVersion;
}
