import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { REGISTRATION_DISCLOSURE_VERSION } from "../shared/registration-disclosure";
import {
  OAUTH_REGISTRATION_INTENT_TTL_MS,
  canApplyOAuthRegistrationDisclosure,
  createOAuthRegistrationIntent,
  isSameOriginRegistrationRequest,
} from "../server/oauth-registration-disclosure";

const now = Date.UTC(2026, 7, 29, 12, 0, 0);
const intent = createOAuthRegistrationIntent(now, "intent-123");
const clerkUser = {
  id: "user_clerk_new",
  createdAt: now + 1_000,
  unsafeMetadata: {
    lyfeosRegistrationIntentId: intent.id,
    lyfeosRegistrationDisclosureVersion: REGISTRATION_DISCLOSURE_VERSION,
  },
};
const localUser = {
  clerkId: clerkUser.id,
  authProvider: "clerk",
  registrationDisclosureVersion: null,
  registrationDisclosureAcknowledgedAt: null,
};

describe("OAuth registration disclosure provenance", () => {
  it("accepts only an exact same-origin registration request", () => {
    expect(isSameOriginRegistrationRequest("https://lyfeos.net", "lyfeos.net", "https")).toBe(true);
    expect(isSameOriginRegistrationRequest("https://accounts.lyfeos.net", "lyfeos.net", "https")).toBe(false);
    expect(isSameOriginRegistrationRequest("http://lyfeos.net", "lyfeos.net", "https")).toBe(false);
    expect(isSameOriginRegistrationRequest(undefined, "lyfeos.net", "https")).toBe(false);
  });

  it("accepts only the exact new Clerk identity returned inside the one-use window", () => {
    expect(intent.expiresAt - intent.issuedAt).toBe(OAUTH_REGISTRATION_INTENT_TTL_MS);
    expect(canApplyOAuthRegistrationDisclosure(intent, clerkUser, localUser, now + 2_000)).toBe(true);
  });

  it("rejects an existing account, expired intent, nonce mismatch, and non-Clerk local account", () => {
    expect(canApplyOAuthRegistrationDisclosure(intent, { ...clerkUser, createdAt: now - 1 }, localUser, now + 2_000)).toBe(false);
    expect(canApplyOAuthRegistrationDisclosure(intent, clerkUser, localUser, intent.expiresAt + 1)).toBe(false);
    expect(canApplyOAuthRegistrationDisclosure(intent, { ...clerkUser, id: "different-clerk-user" }, localUser, now + 2_000)).toBe(false);
    expect(canApplyOAuthRegistrationDisclosure(intent, {
      ...clerkUser,
      unsafeMetadata: { ...clerkUser.unsafeMetadata, lyfeosRegistrationIntentId: "other" },
    }, localUser, now + 2_000)).toBe(false);
    expect(canApplyOAuthRegistrationDisclosure(intent, clerkUser, { ...localUser, authProvider: "email" }, now + 2_000)).toBe(false);
  });

  it("rejects accounts that already carry disclosure provenance", () => {
    expect(canApplyOAuthRegistrationDisclosure(intent, clerkUser, {
      ...localUser,
      registrationDisclosureVersion: REGISTRATION_DISCLOSURE_VERSION,
      registrationDisclosureAcknowledgedAt: new Date(now),
    }, now + 2_000)).toBe(false);
  });

  it("wires a real Clerk callback and server-bound registration intent without changing the registration layout", () => {
    const authContext = fs.readFileSync(path.resolve("client/src/lib/authContext.tsx"), "utf8");
    const app = fs.readFileSync(path.resolve("client/src/App.tsx"), "utf8");
    const authRoutes = fs.readFileSync(path.resolve("server/routes/auth.ts"), "utf8");
    expect(authContext).toContain('fetch("/api/auth/oauth-registration-intent"');
    expect(authContext).toContain("signUp.authenticateWithRedirect");
    expect(authContext).toContain("lyfeosRegistrationIntentId: intent.intentId");
    expect(app).toContain('<Route path="/sso-callback">');
    expect(app).toContain("<AuthenticateWithRedirectCallback />");
    expect(authRoutes).toContain("delete req.session.oauthRegistrationIntent");
  });
});
