import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = (relative: string) => fs.readFileSync(path.resolve(process.cwd(), relative), "utf8");

describe("UMH outbox leasing contract", () => {
  it("ships the same lease state machine through raw and release migrations", () => {
    const migration = source("migrations/0128_umh_outbox_leases.sql");
    const release = source("server/release-migrate.ts");
    const schema = source("shared/schema.ts");
    for (const contract of [migration, release]) {
      expect(contract).toContain('"lease_token"');
      expect(contract).toContain('"leased_until"');
      expect(contract).toContain("AT TIME ZONE 'UTC'");
      expect(contract).toContain("'processing'");
      expect(contract).toContain('"umh_outbox_events_delivery_due_idx"');
    }
    expect(release).toContain('id: "0128_umh_outbox_leases"');
    expect(schema).toContain('leaseToken: text("lease_token")');
    expect(schema).toContain('leasedUntil: timestamp("leased_until", { withTimezone: true })');
    expect(schema).toContain('nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })');
  });

  it("claims with database row locks and ownership-checks every settlement", () => {
    const worker = source("server/umh/outbox.ts");
    const service = source("server/umh/service.ts");
    expect(worker).toContain("FOR UPDATE SKIP LOCKED");
    expect(worker).toContain('"lease_token" = ${input.leaseToken}');
    expect(worker).toContain('"status" = \'processing\'');
    expect(worker).not.toContain("let isDelivering");
    expect(worker).not.toContain("error.message");
    expect(service).toContain('"cause" in error');
    expect(service).toContain("isUniqueViolation(error.cause)");
  });

  it("never exports an ephemeral lease token and uses the Node 24 monitor action", () => {
    const profile = source("server/routes/profile.ts");
    const monitor = source(".github/workflows/production-monitor.yml");
    const federationExport = profile.slice(profile.indexOf("async function selectFederationAuditRows"), profile.indexOf("async function deleteLocalAccountData"));
    expect(federationExport).not.toContain('SELECT * FROM "umh_outbox_events"');
    expect(federationExport).not.toContain('"lease_token"');
    expect(monitor).not.toContain("actions/github-script@v7");
    expect(monitor.match(/actions\/github-script@v8/g)).toHaveLength(2);
  });
});
