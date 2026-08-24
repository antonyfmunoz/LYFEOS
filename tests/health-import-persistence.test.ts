import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { providerImportLockKey } from "../server/health-import";

const root = path.resolve(import.meta.dirname, "..");

describe("provider health import persistence boundary", () => {
  it("uses one deterministic transaction lock domain per user, provider, and source record", () => {
    expect(providerImportLockKey(8, "oura", "sleep-1")).toBe("health-import:8:oura:sleep-1");
    expect(providerImportLockKey(8, "oura", "sleep-1")).not.toBe(providerImportLockKey(8, "whoop", "sleep-1"));
  });

  it("keeps ingestion internal, authorized, immutable, idempotent, and correction-aware", () => {
    const service = fs.readFileSync(path.join(root, "server/health-import-service.ts"), "utf8");
    const routes = fs.readFileSync(path.join(root, "server/routes.ts"), "utf8");
    expect(routes).not.toContain("health-import-service");
    expect(service).toContain('connection.status !== "active" || !connection.credentialRef');
    expect(service).toContain("grantedScopes.includes(prepared.requiredScope)");
    expect(service).toContain("HealthProviderScopeError");
    expect(service).toContain("pg_advisory_xact_lock");
    expect(service).toContain("healthConnectionLockKey(input.connectionId)");
    expect(service).toContain("payloadFingerprint");
    expect(service).toContain('state: "superseded"');
    expect(service).toContain("replayed: true as const");
    expect(service).toContain("suppressed: true as const");
    expect(service).toContain("healthSourceRecordKeyHash");
    expect(service).toContain("source: input.provider");
  });

  it("stores correction fingerprints and adapter-normalized source envelopes", () => {
    const schema = fs.readFileSync(path.join(root, "shared/schema.ts"), "utf8");
    const migration = fs.readFileSync(path.join(root, "migrations/0066_health_connection_foundation.sql"), "utf8");
    expect(schema).toContain("health_source_records_user_provider_record_fingerprint_unique_idx");
    expect(migration).toContain('"source_payload" jsonb NOT NULL');
    expect(migration).toContain('("user_id", "provider", "source_record_id", "payload_fingerprint")');
    expect(migration).toContain("health_source_suppressions_user_provider_key_unique_idx");
  });

  it("makes a provider-row deletion durable without retaining its raw payload", () => {
    const routes = fs.readFileSync(path.join(root, "server/routes/health-observations.ts"), "utf8");
    expect(routes).toContain("healthSourceRecordKeyHash(provider.id, current.sourceRecordId!)");
    expect(routes).toContain("Pause or revoke this provider before deleting an imported observation");
    expect(routes).toContain("tx.delete(healthSourceRecords)");
    expect(routes).toContain("healthSourceSuppressions");
  });
});
