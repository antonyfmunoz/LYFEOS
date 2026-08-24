import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { healthProviderCatalog, nextHealthConnectionState } from "../server/health-connections";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("provider-neutral health connections", () => {
  it("keeps lifecycle transitions explicit and credential-aware", () => {
    expect(nextHealthConnectionState("pending", "cancel", false)).toBe("revoked");
    expect(nextHealthConnectionState("active", "pause", true)).toBe("paused");
    expect(nextHealthConnectionState("paused", "resume", false)).toBeNull();
    expect(nextHealthConnectionState("paused", "resume", true)).toBe("active");
    expect(nextHealthConnectionState("error", "retry", true)).toBe("pending");
    expect(nextHealthConnectionState("active", "revoke", true)).toBe("revoked");
    expect(nextHealthConnectionState("revoked", "resume", true)).toBeNull();
  });

  it("marks every provider unavailable until its real authorization dependency exists", () => {
    expect(healthProviderCatalog.map((provider) => provider.id)).toEqual(["apple_health", "health_connect", "oura", "whoop", "strava", "garmin"]);
    expect(healthProviderCatalog.every((provider) => provider.availability.startsWith("requires_"))).toBe(true);
    const ui = source("client/src/components/health/HealthConnections.tsx");
    expect(ui).toContain("Preparing consent does not connect, sync, or import anything");
    expect(ui).toContain("Live authorization is unavailable");
    expect(ui).toContain("LyfeOS data map");
    expect(ui).toContain("Actual records still depend on source support and your authorization");
    expect(ui).toContain("No provider-native mapping has been reviewed yet");
    const routes = source("server/routes/health-connections.ts");
    expect(routes).toContain("reviewedProviderCanonicalMetrics(provider.id)");
    expect(routes).toContain("providerSourceMapVersion");
    expect(routes).toContain('health-provider-consent-v2');
  });

  it("adds consent, cursor, immutable-source, priority, and audit persistence", () => {
    const migration = source("migrations/0066_health_connection_foundation.sql");
    const release = source("server/release-migrate.ts");
    for (const table of ["health_connections", "health_sync_cursors", "health_import_runs", "health_import_failures", "health_source_records", "health_source_suppressions", "health_source_preferences", "health_connection_audits"]) expect(migration).toContain(`CREATE TABLE IF NOT EXISTS "${table}"`);
    expect(release).toContain('id: "0066_health_connection_foundation"');
    expect(migration).toContain("health_source_records_user_provider_record_fingerprint_unique_idx");
  });

  it("keeps authorization, revocation, and imported-data deletion separate", () => {
    const routes = source("server/routes/health-connections.ts");
    const ui = source("client/src/components/health/HealthConnections.tsx");
    expect(routes).toContain('app.post("/api/health-connections/intents", isAuthenticated');
    expect(routes).toContain("No provider authorization, credential, sync, or imported record was created");
    expect(routes).toContain('app.patch("/api/health-connections/:id/state", isAuthenticated');
    expect(routes).toContain('app.delete("/api/health-connections/:id/imported-data", isAuthenticated');
    expect(routes).toContain('z.literal("DELETE IMPORTED DATA")');
    expect(routes).toContain('connection.status !== "revoked"');
    expect(routes).toContain("healthSourceSuppressions");
    expect(routes).toContain("healthImportRuns");
    expect(ui).toContain("Import run receipts");
    expect(routes).toContain("pg_advisory_xact_lock");
    expect(routes).toContain('credentialRef: next === "revoked" ? null');
  });

  it("never includes credential or opaque cursor values in user exports", () => {
    const rights = source("server/routes/health-insights.ts");
    const profile = source("server/routes/profile.ts");
    expect(rights).toContain("tables.health_connections = await db.select({ id:");
    expect(rights).toContain("tables.health_sync_cursors = await db.select({ id:");
    expect(profile).toContain("selectSafeHealthConnectionRows");
    expect(rights).toContain('"health_source_suppressions"');
    const safeHelper = profile.slice(profile.indexOf("async function selectSafeHealthConnectionRows"), profile.indexOf("// Federation records"));
    expect(safeHelper).not.toContain("credential_ref");
    expect(safeHelper).not.toContain("cursor_value");
  });
});
