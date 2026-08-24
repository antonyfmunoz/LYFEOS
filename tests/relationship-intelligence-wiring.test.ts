import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("personal relationship intelligence", () => {
  it("keeps private relationship records local and disables sharing in the API", () => {
    const routes = source("server/routes/relationships.ts");
    expect(routes).toContain("sharingEnabled: false");
    expect(routes).toContain('source: "self_report"');
    expect(routes).not.toContain("sendMessage");
    expect(source("client/src/pages/RolodexPage.tsx")).toContain("privacy-minimal ecosystem sharing");
  });

  it("adds structured assessments and guided check-ins without scoring the other person", () => {
    const routes = source("server/routes/relationships.ts");
    const page = source("client/src/pages/RolodexPage.tsx");
    expect(routes).toContain("relationshipAssessmentInput");
    expect(routes).toContain("structuredData: parsed.data.structuredData");
    expect(page).toContain("These are self-assessments, not objective scores of another person");
    expect(page).toContain("Check-in boundary alignment");
  });

  it("separates AI authorization from expiring ecosystem consent and audit", () => {
    const routes = source("server/routes/relationships.ts");
    expect(routes).toContain('"ai_recommendation"');
    expect(routes).toContain('"ecosystem_share"');
    expect(routes).toContain('action: "consent_granted"');
    expect(routes).toContain('action: "consent_revoked"');
    expect(routes).toContain("Grant active AI recommendation consent first");
    expect(routes).not.toContain("relationship.privateContext }; sourceManifest");
  });

  it("registers additive relationship storage in the production migration path", () => {
    const releaseMigration = source("server/release-migrate.ts");
    expect(releaseMigration).toContain('id: "0020_personal_relationship_intelligence"');
    expect(releaseMigration).toContain('CREATE TABLE IF NOT EXISTS "personal_relationships"');
  });

  it("keeps relationship commitments explicitly user-authored and optionally mission-linked", () => {
    const page = source("client/src/pages/RolodexPage.tsx");
    expect(page).toContain("relationshipCommitmentDueDate");
    expect(page).toContain("questId: relationshipCommitmentQuestId");
    expect(page).toContain("privateContext: relationshipPrivateContext || null");
  });

  it("shows due commitments on the daily surface without exposing private context", () => {
    const routes = source("server/routes/relationships.ts");
    const panel = source("client/src/components/dashboard/RelationshipCommitmentsPanel.tsx");
    expect(routes).toContain('"/api/relationship-commitments"');
    expect(routes).toContain('eq(relationshipCommitments.state, "open")');
    expect(panel).toContain("Private relationship notes remain in Rolodex");
  });

  it("uses linked mission evidence without treating a commitment click as proof", () => {
    const routes = source("server/routes/relationships.ts");
    const page = source("client/src/pages/RolodexPage.tsx");
    expect(routes).toContain("linkedMissionReviewState");
    expect(routes).toContain("Complete the linked mission first");
    expect(page).toContain("Mission proof:");
  });

  it("acknowledges an account export without claiming the download completed", () => {
    const profile = source("client/src/pages/ProfilePage.tsx");
    expect(profile).toContain("Preparing your export");
    expect(profile).toContain("when it is ready");
  });
});
