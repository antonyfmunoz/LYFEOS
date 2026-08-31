import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  GOOGLE_AUTH_LINK_INTENT_TTL_MS,
  createGoogleAuthLinkIntent,
  isValidGoogleAuthLinkIntent,
} from "../server/google-auth-link-intent";

describe("Google sign-in account linking", () => {
  it("binds a short-lived intent to the exact local session user", () => {
    const now = Date.UTC(2026, 7, 31, 12, 0, 0);
    const intent = createGoogleAuthLinkIntent(42, now, "link-123");
    expect(intent.expiresAt - intent.issuedAt).toBe(GOOGLE_AUTH_LINK_INTENT_TTL_MS);
    expect(isValidGoogleAuthLinkIntent(intent, 42, now + 1_000)).toBe(true);
    expect(isValidGoogleAuthLinkIntent(intent, 43, now + 1_000)).toBe(false);
    expect(isValidGoogleAuthLinkIntent(intent, undefined, now + 1_000)).toBe(false);
    expect(isValidGoogleAuthLinkIntent(intent, 42, intent.expiresAt + 1)).toBe(false);
  });

  it("wires the one-time server intent and existing profile without moving the settings surface", () => {
    const authRoutes = fs.readFileSync(path.resolve("server/routes/auth.ts"), "utf8");
    const authContext = fs.readFileSync(path.resolve("client/src/lib/authContext.tsx"), "utf8");
    const profile = fs.readFileSync(path.resolve("client/src/pages/ProfilePage.tsx"), "utf8");
    expect(authRoutes).toContain('app.post("/api/auth/google-link-intent", requireAuth');
    expect(authRoutes).toContain("isValidGoogleAuthLinkIntent(googleLinkIntent, req.session.userId)");
    expect(authRoutes).toContain('account.provider === "google"');
    expect(authContext).toContain('redirectUrlComplete: "/profile?google-signin=linked"');
    expect(authContext).toContain("body: JSON.stringify({ currentPassword })");
    expect(profile).toContain("Add Google");
    expect(profile).toContain("Create Password");
    expect(profile).toContain("clerkUser.updatePassword(data)");
    expect(profile).toContain("useReverification");
  });
});
