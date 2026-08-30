import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("consent-bound collaboration contract", () => {
  it("keeps membership separate from expiring subject projections", () => {
    const migration = source("migrations/0136_consent_bound_collaboration.sql");
    expect(migration).toContain('"collaboration_memberships_role_valid"');
    expect(migration).toContain("'owner','coach','collaborator'");
    expect(migration).toContain('"collaboration_visibility_grants_not_self"');
    expect(migration).toContain("WHERE \"status\" = 'active'");
    expect(migration).toContain('REFERENCES "users"("id") ON DELETE CASCADE');
    expect(source("server/release-migrate.ts")).toContain('id: "0136_consent_bound_collaboration"');
  });

  it("exposes only Mission and Thread summary/status projections", () => {
    const routes = source("server/routes/collaboration.ts");
    expect(routes).toContain('z.enum(["mission", "thread"])');
    expect(routes).toContain('z.enum(["summary", "status"])');
    expect(routes).toContain('membership_grants_no_personal_record_access');
    for (const privateDomain of ["health", "finance", "relationships", "journal", "messages", "ai_memory", "evidence"]) expect(routes).toContain(`"${privateDomain}"`);
    expect(routes).not.toContain("healthObservations");
    expect(routes).not.toContain("financeTransactions");
    expect(routes).not.toContain("relationshipInteractions");
  });

  it("makes invitation, acceptance, sharing, expiry, member exit, and revocation visible in Profile", () => {
    const component = source("client/src/components/profile/CollaborationSettings.tsx");
    expect(component).toContain("Membership is coordination only");
    expect(component).toContain("Accept");
    expect(component).toContain("Share a bounded Mission or Thread view");
    expect(component).toContain("Revoke shared view");
    expect(component).toContain("Leave workspace");
    expect(component).toContain("from workspace");
    expect(component).toContain('aria-label="Shared view recipient"');
    expect(component).toContain('aria-label="Mission or Thread to share"');
    expect(source("client/src/pages/ProfilePage.tsx")).toContain("<CollaborationSettings />");
  });

  it("archives isolated and production rendered multi-account evidence", () => {
    const acceptance = source("scripts/collaboration-browser-acceptance.ts");
    const verify = source(".github/workflows/verify.yml");
    const production = source(".github/workflows/production-browser-acceptance.yml");
    const packageJson = source("package.json");
    expect(acceptance).toContain('"lyfeos.isolated-collaboration-browser.v1"');
    expect(acceptance).toContain('"lyfeos.production-collaboration-browser.v1"');
    expect(acceptance).toContain("noRecordAccessBeforeGrant");
    expect(acceptance).toContain("privateDescriptionExcluded");
    expect(acceptance).toContain("memberRevocationRetiredGrant");
    expect(acceptance).toContain("selfLeaveCompleted");
    expect(acceptance).toContain("isExternalProviderTransportError");
    expect(acceptance).toContain("externalProviderErrors");
    expect(acceptance).toContain("unexpected browser signals: ${JSON.stringify(unexpectedSignals)}");
    expect(acceptance).toContain("journeys.push(result.journey)");
    expect(acceptance).toContain("async function performAndWaitForResponse");
    expect(acceptance.match(/\.waitForResponse\(/g)).toHaveLength(1);
    expect(acceptance).toContain("void pending");
    expect(acceptance).toContain("desktop-1440x900");
    expect(acceptance).toContain("mobile-390x844");
    expect(packageJson).toContain('"acceptance:collaboration": "tsx scripts/collaboration-browser-acceptance.ts"');
    expect(verify).toContain("npm run acceptance:collaboration");
    expect(verify).toContain("lyfeos-isolated-collaboration-${{ github.sha }}");
    expect(production).toContain("LYFEOS_COLLABORATION_ACCEPTANCE_MODE: production");
    expect(production).toContain("Run disposable production collaboration acceptance");
  });
});
