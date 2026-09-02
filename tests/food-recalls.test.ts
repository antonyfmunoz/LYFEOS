import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { foodRecallAvailability, lookupFoodRecalls } from "../server/food-recalls";

describe("FDA food recall lookup", () => {
  it("uses the official food enforcement endpoint, keeps the optional API key server-side, and normalizes bounded results", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toContain("https://api.fda.gov/food/enforcement.json?");
      expect(String(url)).toContain("product_description%3A%22Acme+Oat+Bites%22");
      expect(String(url)).toContain("api_key=server-only-data-gov-key");
      expect(init?.headers).toEqual(expect.objectContaining({ "User-Agent": "LyfeOS/1.0 (support@lyfeos.net)" }));
      return new Response(JSON.stringify({ results: [{
        recall_number: "F-1234-2026", classification: "Class II", status: "Ongoing", product_description: "ACME OAT BITES, 8 OZ",
        reason_for_recall: "Undeclared ingredient", recalling_firm: "Acme Foods", distribution_pattern: "Nationwide", code_info: "LOT 42",
        recall_initiation_date: "20260901", report_date: "20260902", termination_date: "",
      }] }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const result = await lookupFoodRecalls({ productName: "Oat Bites", brand: "Acme" }, {
      OPENFDA_API_KEY: "server-only-data-gov-key",
      OPENFDA_USER_AGENT: "LyfeOS/1.0 (support@lyfeos.net)",
    } as NodeJS.ProcessEnv, fetchMock as typeof fetch);
    expect(result.matches).toEqual([expect.objectContaining({ recallNumber: "F-1234-2026", codeInfo: "LOT 42", sourceUrl: expect.stringContaining("recall_number") })]);
    expect(result.disclosure).toContain("possible product-description text matches");
    expect(JSON.stringify(result)).not.toContain("server-only-data-gov-key");
  });

  it("treats FDA no-results responses as neither a safety claim nor an error", async () => {
    const noResults = vi.fn(async () => new Response(JSON.stringify({ error: { code: "NOT_FOUND" } }), { status: 404 }));
    const result = await lookupFoodRecalls({ productName: "Unlisted snack" }, {}, noResults as typeof fetch);
    expect(result.matches).toEqual([]);
    expect(result.disclosure).toContain("not a finding that the product is safe");
  });

  it("can be disabled explicitly and only exposes a private, no-store authenticated route", () => {
    expect(foodRecallAvailability({ OPENFDA_FOOD_RECALLS_ENABLED: "false" } as NodeJS.ProcessEnv)).toMatchObject({ available: false });
    const routes = readFileSync(resolve(process.cwd(), "server/routes/food-recalls.ts"), "utf8");
    const appRoutes = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
    const scanner = readFileSync(resolve(process.cwd(), "client/src/components/health/IngredientScanner.tsx"), "utf8");
    expect(routes).toContain('app.post("/api/food-recalls/lookup", isAuthenticated');
    expect(appRoutes).toContain('"/api/food-recalls"');
    expect(scanner).toContain("Check FDA recalls");
    expect(scanner).toContain("possible product-description matches");
  });
});
