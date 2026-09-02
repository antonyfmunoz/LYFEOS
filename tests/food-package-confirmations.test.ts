import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("food package confirmations", () => {
  it("keeps a visual package-review record versioned to a catalog product without storing a photo or asserting certification", () => {
    const migration = source("migrations/0149_food_package_confirmations.sql");
    const schema = source("shared/schema.ts");
    const release = source("server/release-migrate.ts");
    expect(migration).toContain('"catalog_item_version" text NOT NULL');
    expect(migration).toContain('"confirmation_method" text NOT NULL');
    expect(migration).not.toContain("photo");
    expect(schema).toContain('export const foodPackageConfirmations');
    expect(release).toContain('id: "0149_food_package_confirmations"');
  });

  it("requires a signed current lookup with a barcode and describes the record honestly", () => {
    const routes = source("server/routes/ingredient-scanner.ts");
    const scanner = source("client/src/components/health/IngredientScanner.tsx");
    expect(routes).toContain('app.post("/api/food-package-confirmations", isAuthenticated');
    expect(routes).toContain("verifyConfiguredFoodCatalogToken(parsed.data.catalogLookupToken)");
    expect(routes).toContain("needs a product barcode");
    expect(routes).toContain("not a certification");
    expect(scanner).toContain("I visually confirmed:");
    expect(scanner).toContain("catalog version changed—review again");
  });
});
