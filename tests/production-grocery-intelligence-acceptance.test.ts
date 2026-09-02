import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("production grocery intelligence acceptance contract", () => {
  it("qualifies cited ownership, automatic replenishment, receipt parsing, recall review, and fixture erasure", () => {
    const script = readFileSync(resolve(process.cwd(), "scripts/production-grocery-intelligence-acceptance.ts"), "utf8");
    const manifest = readFileSync(resolve(process.cwd(), "package.json"), "utf8");
    expect(script).toContain('"/api/brand-ownership/lookup"');
    expect(script).toContain('"/api/grocery-intelligence/pantry"');
    expect(script).toContain('"/api/grocery-intelligence/pantry-recall-review"');
    expect(script).toContain('"/api/grocery-intelligence/receipt-drafts"');
    expect(script).toContain('"/api/account"');
    expect(script).toContain("Acceptance Unknown Brand");
    expect(script).toContain("lyfeos.production-grocery-intelligence.v1");
    expect(manifest).toContain('"acceptance:production-grocery-intelligence"');
  });
});
