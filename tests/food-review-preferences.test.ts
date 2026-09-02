import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("food-review preferences", () => {
  it("persists a package-confirmation standard without presenting it as certification", () => {
    const migration = source("migrations/0148_food_review_preferences.sql");
    const release = source("server/release-migrate.ts");
    const routes = source("server/routes/ingredient-scanner.ts");
    expect(migration).toContain('"kosher_package_confirmation" boolean NOT NULL DEFAULT false');
    expect(release).toContain('id: "0148_food_review_preferences"');
    expect(routes).toContain('app.put("/api/food-review-preferences", isAuthenticated');
    expect(routes).toContain("does not certify a product");
  });

  it("carries the personal requirement into replacement evidence without treating missing data as failure", () => {
    const routes = source("server/routes/grocery-intelligence.ts");
    const scanner = source("client/src/components/health/IngredientScanner.tsx");
    const grocery = source("client/src/components/health/GroceryIntelligence.tsx");
    expect(routes).toContain("packageConfirmationRequired");
    expect(scanner).toContain("Require package confirmation for kosher review");
    expect(grocery).toContain("this is not a non-kosher finding");
  });
});
