import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

type Module = typeof import("../server/integration-provider-credentials");
let credentials: Module;

beforeAll(async () => {
  process.env.DATABASE_URL ||= "postgresql://unused:unused@127.0.0.1:5432/unused";
  credentials = await import("../server/integration-provider-credentials");
});

describe("general integration provider credential vault", () => {
  const key = crypto.randomBytes(32);
  const context = { userId: 3, integrationId: 9, provider: "google" };
  const payload = { accessToken: "test-access", refreshToken: "test-refresh", expiresAt: "2026-09-01T12:00:00.000Z", tokenType: "Bearer", grantedScopes: ["calendar", "drive"] };

  it("round-trips an authenticated provider envelope without plaintext", () => {
    const sealed = credentials.sealIntegrationCredential(payload, context, key);
    expect(sealed.keyVersion).toBe(credentials.integrationCredentialEnvelopeVersion);
    expect(JSON.stringify(sealed)).not.toContain("test-access");
    expect(JSON.stringify(sealed)).not.toContain("test-refresh");
    expect(credentials.openIntegrationCredential(sealed, context, key)).toEqual(payload);
  });

  it("binds the envelope to owner, integration, provider, and key", () => {
    const sealed = credentials.sealIntegrationCredential(payload, context, key);
    expect(() => credentials.openIntegrationCredential(sealed, { ...context, userId: 4 }, key)).toThrow();
    expect(() => credentials.openIntegrationCredential(sealed, { ...context, integrationId: 10 }, key)).toThrow();
    expect(() => credentials.openIntegrationCredential(sealed, { ...context, provider: "notion" }, key)).toThrow();
    expect(() => credentials.openIntegrationCredential(sealed, context, crypto.randomBytes(32))).toThrow();
  });

  it("removes browser token injection and keeps vault rows outside account export", () => {
    const migration = readFileSync(resolve(process.cwd(), "migrations/0131_integration_provider_credential_vault.sql"), "utf8");
    const google = readFileSync(resolve(process.cwd(), "server/routes/google.ts"), "utf8");
    const content = readFileSync(resolve(process.cwd(), "server/routes/content.ts"), "utf8");
    const profile = readFileSync(resolve(process.cwd(), "server/routes/profile.ts"), "utf8");
    const index = readFileSync(resolve(process.cwd(), "server/index.ts"), "utf8");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "integration_provider_credentials"');
    expect(migration).toContain('ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "credential_ref"');
    expect(google).toContain("writeIntegrationCredential");
    expect(google).toContain("deleteIntegrationCredential");
    expect(google).not.toContain("googleIntegration.accessToken");
    expect(google).toContain("resolveGoogleGrantedScopes");
    expect(google).toContain("Browser-submitted task");
    expect(google).toContain('providerRevocation: "confirmed" | "unconfirmed" | "not_needed"');
    expect(content).toContain("Provider credentials may only be created by a server-side authorization flow");
    expect(content).toContain("serverManagedIntegrationProviders");
    expect(content).toContain("Use the provider disconnect control");
    expect(index).toContain("migrateLegacyIntegrationCredentials");
    expect(profile).not.toContain('"integration_provider_credentials"');
  });
});
