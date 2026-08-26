import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { healthCredentialEnvelopeVersion, healthCredentialReference, openHealthProviderCredential, sealHealthProviderCredential } from "../server/health-provider-credentials";

describe("health provider credential vault", () => {
  const key = crypto.randomBytes(32);
  const context = { userId: 7, connectionId: 11, provider: "oura" };
  const payload = { accessToken: "access-secret", refreshToken: "refresh-secret", expiresAt: "2026-08-27T12:00:00.000Z", tokenType: "Bearer", grantedScopes: ["daily", "heartrate"] };

  it("round-trips an authenticated envelope without exposing token text", () => {
    const sealed = sealHealthProviderCredential(payload, context, key);
    expect(sealed.keyVersion).toBe(healthCredentialEnvelopeVersion);
    expect(JSON.stringify(sealed)).not.toContain("access-secret");
    expect(JSON.stringify(sealed)).not.toContain("refresh-secret");
    expect(openHealthProviderCredential(sealed, context, key)).toEqual(payload);
    expect(healthCredentialReference(42)).toBe("health-vault:v1:42");
  });

  it("binds ciphertext to its owner, connection, provider, and key", () => {
    const sealed = sealHealthProviderCredential(payload, context, key);
    expect(() => openHealthProviderCredential(sealed, { ...context, userId: 8 }, key)).toThrow();
    expect(() => openHealthProviderCredential(sealed, { ...context, connectionId: 12 }, key)).toThrow();
    expect(() => openHealthProviderCredential(sealed, { ...context, provider: "whoop" }, key)).toThrow();
    expect(() => openHealthProviderCredential(sealed, context, crypto.randomBytes(32))).toThrow();
    expect(() => openHealthProviderCredential({ ...sealed, ciphertext: `A${sealed.ciphertext.slice(1)}` }, context, key)).toThrow();
  });

  it("keeps encrypted credentials outside export and destroys them on revoke", () => {
    const migration = readFileSync(resolve(process.cwd(), "migrations/0130_health_provider_credential_vault.sql"), "utf8");
    const routes = readFileSync(resolve(process.cwd(), "server/routes/health-connections.ts"), "utf8");
    const profile = readFileSync(resolve(process.cwd(), "server/routes/profile.ts"), "utf8");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "health_provider_credentials"');
    expect(migration).toContain('ON DELETE CASCADE');
    expect(routes).toContain('tx.delete(healthProviderCredentials)');
    expect(profile).not.toContain('"health_provider_credentials"');
  });
});
