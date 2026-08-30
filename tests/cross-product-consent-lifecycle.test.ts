import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LYFEOS_FEDERATION_CONSENT_UPDATED_EVENT,
  umhEventEnvelopeSchema,
} from "../shared/umh";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("cross-product consent lifecycle contract", () => {
  it("accepts a complete bounded consent state and rejects private payload expansion", () => {
    const event = {
      schemaVersion: "umh.v1",
      eventId: "47f67858-ddc7-4769-bc34-f02e12f07817",
      projectionId: "lyfeos",
      eventType: LYFEOS_FEDERATION_CONSENT_UPDATED_EVENT,
      installationId: "installation-1",
      tenantId: "tenant-1",
      actorId: `lyfeos:${"a".repeat(64)}`,
      aggregateType: "federation_consent",
      aggregateId: `lyfeos:${"a".repeat(64)}`,
      idempotencyKey: `federation-consent:lyfeos:${"a".repeat(64)}:3`,
      traceId: "04d87422-5053-44da-8b59-860924047841",
      correlationId: "24da66bf-d487-4fa5-b9b9-006d29124040",
      occurredAt: "2026-08-30T04:00:00.000Z",
      payload: {
        state: "disabled",
        policyVersion: "lyfeos.cross-product-sharing.v1",
        revision: 3,
        allowedDestinations: [],
        allowedPurposes: [],
        affectedDestinations: ["entrepreneuros", "creativesos"],
        affectedPurposes: ["coordination", "correlation"],
      },
    } as const;
    expect(umhEventEnvelopeSchema.safeParse(event).success).toBe(true);
    expect(umhEventEnvelopeSchema.safeParse({ ...event, payload: { ...event.payload, healthData: { sleep: 4 } } }).success).toBe(false);
    expect(umhEventEnvelopeSchema.safeParse({ ...event, payload: { ...event.payload, affectedDestinations: [] } }).success).toBe(false);
  });

  it("persists an immutable revision ledger in both migration paths", () => {
    const migration = source("migrations/0143_cross_product_consent_lifecycle.sql");
    const release = source("server/release-migrate.ts");
    const schema = source("shared/schema.ts");
    for (const contract of [migration, release]) {
      expect(contract).toContain('"cross_product_sharing_revisions"');
      expect(contract).toContain('"cross_product_sharing_revisions_user_revision_unique"');
      expect(contract).toContain('"federation_subject_id" uuid NOT NULL DEFAULT gen_random_uuid()');
      expect(contract).toContain('"cross_product_sharing_preferences_federation_subject_id_unique"');
      expect(contract).toContain("lyfeos.cross-product-sharing.v1");
      expect(contract).toContain("'queued', 'not_configured'");
    }
    expect(release).toContain('id: "0143_cross_product_consent_lifecycle"');
    expect(schema).toContain("crossProductSharingRevisions");
    expect(schema).toContain('revision: integer("revision").notNull().default(1)');
  });

  it("binds stale-write protection, signed outbox state, pseudonymous identity, export, erasure, and a visible receipt", () => {
    const service = source("server/cross-product.ts");
    const routes = source("server/routes/cross-product-sharing.ts");
    const profile = source("server/routes/profile.ts");
    const ui = source("client/src/pages/ProfilePage.tsx");
    expect(service).toContain("CrossProductSharingConflictError");
    expect(service).toContain("current?.federationSubjectId ?? crypto.randomUUID()");
    expect(service).toContain("federationActorId(preference.federationSubjectId)");
    expect(service).toContain("enabled: sharing.enabled");
    expect(service).not.toContain("...sharing,");
    expect(service).toContain("affectedDestinations");
    expect(service).toContain("insertEvent(tx");
    expect(service).toContain("reconcilePendingCrossProductConsentEvents");
    expect(source("server/umh/outbox.ts")).toContain("await reconcilePendingCrossProductConsentEvents()");
    expect(routes).toContain("expectedRevision");
    expect(routes).toContain("currentRevision");
    expect(profile).toContain('"cross_product_sharing_revisions"');
    expect(profile).toContain(`audit."details"->>'eventId'`);
    expect(ui).toContain('data-testid="ecosystem-consent-receipt"');
    expect(ui).toContain("No mission title, XP, health, journal, relationship, or reflection content is in this receipt.");
  });
});
