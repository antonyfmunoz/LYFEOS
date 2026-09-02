import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { lookupBrandOwnership } from "../server/brand-ownership";

describe("verified brand ownership registry", () => {
  it("returns an exact cited ownership chain and acquisition history for a registered brand", () => {
    const lookup = lookupBrandOwnership("Burt's Bees", new Date("2026-09-02T12:00:00.000Z"));
    expect(lookup).toMatchObject({ matched: true, matchMethod: "exact_registered_brand", profile: { status: "corporate_owned", statusLabel: "Corporate-owned" } });
    expect(lookup.profile?.ownershipChain.map((entry) => entry.name)).toEqual(["Burt's Bees", "The Clorox Company"]);
    expect(lookup.profile?.acquisition).toMatchObject({ announcedOn: "2007-10-31" });
    expect(lookup.profile?.evidence.every((evidence) => evidence.sourceUrl.startsWith("https://"))).toBe(true);
  });

  it("preserves distinct ownership forms without calling a cooperative or employee-owned company family-owned", () => {
    expect(lookupBrandOwnership("Bob's Red Mill").profile?.status).toBe("employee_owned_claim");
    expect(lookupBrandOwnership("Organic Valley").profile?.status).toBe("farmer_owned_cooperative_claim");
    expect(lookupBrandOwnership("Newman's Own").profile).toMatchObject({
      status: "nonprofit_owned_claim",
      ownershipChain: [{ name: "Newman's Own", role: "brand" }, { name: "Newman's Own Foundation", role: "nonprofit_owner" }],
    });
  });

  it("adds corporate matches only when the brand has linked portfolio and acquisition evidence", () => {
    for (const brand of ["Seventh Generation", "Tom's of Maine"]) {
      const profile = lookupBrandOwnership(brand).profile;
      expect(profile).toMatchObject({ status: "corporate_owned" });
      expect(profile?.evidence.map((entry) => entry.sourceType)).toContain("company_portfolio");
      expect(profile?.evidence.map((entry) => entry.sourceType)).toContain("acquisition_announcement");
    }
  });

  it("fails closed to unknown rather than inferring ownership from an unmatched name", () => {
    const lookup = lookupBrandOwnership("Definitely Not A Verified Brand");
    expect(lookup).toMatchObject({ matched: false, profile: null });
    expect(lookup.disclosure).toContain("does not infer");
  });

  it("wires the authenticated no-store route and transparent scanner UI", () => {
    const routes = readFileSync(resolve(process.cwd(), "server/routes/brand-ownership.ts"), "utf8");
    const appRoutes = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
    const scanner = readFileSync(resolve(process.cwd(), "client/src/components/health/IngredientScanner.tsx"), "utf8");
    expect(routes).toContain('app.post("/api/brand-ownership/lookup", isAuthenticated');
    expect(appRoutes).toContain('"/api/brand-ownership"');
    expect(scanner).toContain("Check brand ownership");
    expect(scanner).toContain("No match is intentionally shown as unknown");
  });
});
