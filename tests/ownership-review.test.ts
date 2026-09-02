import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("cited ownership-review workflow", () => {
  it("keeps report sharing explicit and never promotes a report automatically", () => {
    const groceryRoutes = source("server/routes/grocery-intelligence.ts");
    const groceryUi = source("client/src/components/health/GroceryIntelligence.tsx");
    expect(groceryRoutes).toContain("shareWithOwnershipReviewers: z.literal(true)");
    expect(groceryRoutes).toContain("reviewerAccessGranted: true");
    expect(groceryUi).toContain("Share this report with ownership reviewers");
    expect(groceryUi).toContain("!researchShare");
  });

  it("uses a narrow reviewer grant and exposes only opted-in queue fields", () => {
    const reviewRoutes = source("server/routes/ownership-review.ts");
    expect(reviewRoutes).toContain("ownershipReviewGrants");
    expect(reviewRoutes).not.toContain("installationAdminGrants");
    expect(reviewRoutes).toContain("reviewerAccessGranted, true");
    expect(reviewRoutes).toContain("brandOwnershipResearchReports.brand");
    expect(reviewRoutes).not.toContain("brandOwnershipResearchReports.userId");
    expect(reviewRoutes).toContain("pg_advisory_xact_lock");
  });

  it("ships the consent, narrow role, cited registry, and revision history through release migration", () => {
    const migration = source("migrations/0147_brand_ownership_review.sql");
    const release = source("server/release-migrate.ts");
    const schema = source("shared/schema.ts");
    expect(migration).toContain('"reviewer_access_granted" boolean NOT NULL DEFAULT false');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "ownership_review_grants"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "brand_ownership_registry_revisions"');
    expect(release).toContain('id: "0147_brand_ownership_review"');
    expect(schema).toContain("export const ownershipReviewGrants");
    expect(schema).toContain("export const brandOwnershipRegistryRevisions");
  });

  it("routes the protected console and resolves dynamic profiles before static fallback", () => {
    const app = source("client/src/App.tsx");
    const reviewUi = source("client/src/pages/OwnershipReviewPage.tsx");
    const ownership = source("server/brand-ownership.ts");
    expect(app).toContain('path="/ownership-review"');
    expect(reviewUi).toContain("Publish cited profile");
    expect(ownership).toContain("lookupReviewedBrandOwnership");
    expect(ownership).toContain("return lookupBrandOwnership(requestedBrand, now)");
  });
});
