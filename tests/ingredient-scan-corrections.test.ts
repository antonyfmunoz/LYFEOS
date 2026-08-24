import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("private ingredient label correction and reuse", () => {
  it("release-migrates revisions and barcode lookup support", () => {
    const migration = source("migrations/0077_ingredient_scan_corrections.sql");
    const release = source("server/release-migrate.ts");
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "revision"');
    expect(migration).toContain('"ingredient_scans_user_barcode_idx"');
    expect(release).toContain('id: "0077_ingredient_scan_corrections"');
  });

  it("searches only owner history and discloses the absence of an external catalog", () => {
    const routes = source("server/routes/ingredient-scanner.ts");
    const client = source("client/src/components/health/IngredientScanner.tsx");
    expect(routes).toContain('app.get("/api/ingredient-scans/lookup"');
    expect(routes).toContain("eq(ingredientScans.userId, req.session.userId!)");
    expect(routes).toContain("No licensed or external product catalog was queried");
    expect(client).toContain("Search my saved labels");
    expect(client).toContain("private saved-label history");
  });

  it("reparses a correction atomically and rejects stale writers", () => {
    const routes = source("server/routes/ingredient-scanner.ts");
    expect(routes).toContain('app.patch("/api/ingredient-scans/:id"');
    expect(routes).toContain('req.header("x-lyfeos-expected-revision")');
    expect(routes).toContain("FOR UPDATE");
    expect(routes).toContain("current.revision !== expectedRevision.revision");
    expect(routes).toContain("tx.delete(ingredientScanItems)");
    expect(routes).toContain("tx.insert(ingredientScanItems)");
    expect(routes).toContain("Your correction was not applied");
    expect(routes.match(/SELECT id FROM ingredient_scans[^`]+FOR UPDATE/g)?.length).toBe(2);
    expect(routes).toContain("It was not deleted");
    const client = source("client/src/components/health/IngredientScanner.tsx");
    expect(client).toContain('"x-lyfeos-expected-revision": String(scan.revision)');
  });
});
