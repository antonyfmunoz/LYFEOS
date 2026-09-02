import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ownershipScore, parseReceiptText } from "../server/grocery-intelligence";

describe("grocery intelligence", () => {
  it("keeps receipt parsing reviewable and excludes payment totals", () => {
    expect(parseReceiptText("OAT MILK 4.99\n2 X ORGANIC OATS 7.98\nSUBTOTAL 12.97\nTAX 1.00\nTOTAL 13.97")).toEqual([
      expect.objectContaining({ name: "OAT MILK", quantity: 1, reorderAt: 0 }),
      expect.objectContaining({ name: "ORGANIC OATS", quantity: 2, reorderAt: 0 }),
    ]);
  });

  it("calculates a transparent documented ownership-concentration snapshot", () => {
    const result = ownershipScore([{ brand: "Burt's Bees" }, { brand: "Bob's Red Mill" }, { brand: "Unknown Brand" }]);
    expect(result).toMatchObject({ matchedItems: 2, unmatchedItems: 1, corporateOwnedItems: 1, confidence: "preliminary" });
    expect(result.score).toBe(50);
    expect(result.formula).toContain("not a health");
  });

  it("keeps every new grocery route private and wires the health workspace", () => {
    const routes = readFileSync(resolve(process.cwd(), "server/routes/grocery-intelligence.ts"), "utf8");
    const appRoutes = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
    const healthPage = readFileSync(resolve(process.cwd(), "client/src/pages/HealthDetailPage.tsx"), "utf8");
    const component = readFileSync(resolve(process.cwd(), "client/src/components/health/GroceryIntelligence.tsx"), "utf8");
    expect(routes).toContain('app.get("/api/grocery-intelligence/overview", isAuthenticated');
    expect(routes).toContain('receipt-drafts/:id/apply');
    expect(routes).toContain('app.post("/api/grocery-intelligence/pantry-recall-review", isAuthenticated');
    expect(routes).toContain("Results are not stored by LyfeOS");
    expect(appRoutes).toContain('"/api/grocery-intelligence"');
    expect(healthPage).toContain("<GroceryIntelligence />");
    expect(component).toContain("Corporate concentration");
    expect(component).toContain("Add reviewed items to pantry");
    expect(component).toContain("Check FDA recalls");
    expect(component).toContain("No product-description text match. This is not a safety finding.");
  });
});
