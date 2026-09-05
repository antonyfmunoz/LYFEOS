import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("production food-catalog acceptance custody", () => {
  it("requires an immutable-release, disposable-account proof of attributed external catalog behavior", () => {
    const script = readFileSync(resolve(process.cwd(), "scripts/production-food-catalog-acceptance.ts"), "utf8");
    const manifest = readFileSync(resolve(process.cwd(), "package.json"), "utf8");
    const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/production-browser-acceptance.yml"), "utf8");
    expect(manifest).toContain('"acceptance:production-food-catalog": "tsx scripts/production-food-catalog-acceptance.ts"');
    expect(workflow).toContain("Run disposable production Food catalog acceptance");
    expect(workflow).toContain("run: npm run acceptance:production-food-catalog");
    expect(script).toContain('BASE_URL.origin === "https://lyfeos.net"');
    expect(script).toContain("sourceRevision === SOURCE");
    expect(script).toContain('"/api/food-catalog/status"');
    expect(script).toContain("/api/food-catalog/search?query=oats");
    expect(script).toContain('"/api/nutrition/foods/catalog-import"');
    expect(script).toContain("Tampered catalog receipt was not rejected");
    expect(script).toContain("Unknown barcode did not fail closed");
    expect(script).toContain('confirmation: "DELETE MY ACCOUNT"');
    expect(script).toContain('contract: "lyfeos.production-food-catalog.v1"');
    expect(script).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  });
});
