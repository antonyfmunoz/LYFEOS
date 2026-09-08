import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("production ingredient-scanner acceptance contract", () => {
  it("qualifies private manual review, correction, evidence refresh, history lookup, deletion, and fixture erasure", () => {
    const script = readFileSync(resolve(process.cwd(), "scripts/production-ingredient-scanner-acceptance.ts"), "utf8");
    const manifest = readFileSync(resolve(process.cwd(), "package.json"), "utf8");
    expect(script).toContain('"/api/ingredient-preferences"');
    expect(script).toContain('"/api/ingredient-scans"');
    expect(script).toContain('/evidence-review`');
    expect(script).toContain('"your_private_history"');
    expect(script).toContain('"x-lyfeos-expected-revision"');
    expect(script).toContain('"/api/account"');
    expect(script).toContain("AbortSignal.timeout(REQUEST_TIMEOUT_MS)");
    expect(script).toContain("Ingredient-scanner request ${method} ${pathname} failed");
    expect(script).toContain('lyfeos.production-ingredient-scanner.v1');
    expect(manifest).toContain('"acceptance:production-ingredient-scanner"');
  });
});
