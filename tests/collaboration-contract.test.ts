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

  it("makes invitation, acceptance, sharing, expiry, and revocation visible in Profile", () => {
    const component = source("client/src/components/profile/CollaborationSettings.tsx");
    expect(component).toContain("Membership is coordination only");
    expect(component).toContain("Accept");
    expect(component).toContain("Share a bounded Mission or Thread view");
    expect(component).toContain("Revoke shared view");
    expect(source("client/src/pages/ProfilePage.tsx")).toContain("<CollaborationSettings />");
  });
});
