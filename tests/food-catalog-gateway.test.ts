import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { foodCatalogSearchResponseSchema } from "@shared/food-catalog";
import {
  createFoodCatalogLookupToken,
  foodCatalogAvailability,
  getFoodCatalogConfig,
  searchFoodCatalog,
  verifyFoodCatalogLookupToken,
} from "../server/food-catalog";

const provider = {
  id: "licensed_fixture", name: "Licensed Fixture", datasetVersion: "2026-08-24",
  territories: ["US"], attributionText: "Fixture attribution", attributionUrl: "https://catalog.example/terms",
};
const item = {
  externalId: "food-1", itemVersion: "revision-7", name: "Oat cup", brand: "Example", barcode: "12345678",
  locale: "en-US", territory: "US", servingSizeGrams: 42, ingredientsText: "Oats, water",
  nutrients: [{ nutrientKey: "energy_kcal", amountPer100g: 120, unit: "kcal" }],
};
const env = {
  FOOD_CATALOG_GATEWAY_URL: "https://catalog.example",
  FOOD_CATALOG_GATEWAY_TOKEN: "server-only-token",
  FOOD_CATALOG_LOOKUP_SIGNING_SECRET: "a-signing-secret-that-is-at-least-32-characters",
} as NodeJS.ProcessEnv;

describe("food catalog gateway", () => {
  it("fails closed for partial, insecure, or short-secret configuration", () => {
    expect(getFoodCatalogConfig({})).toBeNull();
    expect(getFoodCatalogConfig({ ...env, FOOD_CATALOG_GATEWAY_TOKEN: "" })).toBeNull();
    expect(getFoodCatalogConfig({ ...env, FOOD_CATALOG_GATEWAY_URL: "http://catalog.example" })).toBeNull();
    expect(getFoodCatalogConfig({ ...env, FOOD_CATALOG_LOOKUP_SIGNING_SECRET: "short" })).toBeNull();
    expect(getFoodCatalogConfig({ ...env, FOOD_CATALOG_GATEWAY_URL: "http://localhost:4000" })).not.toBeNull();
    expect(foodCatalogAvailability({}).available).toBe(false);
  });

  it("validates strict, source-attributed normalized results", () => {
    expect(foodCatalogSearchResponseSchema.safeParse({ provider, items: [item] }).success).toBe(true);
    expect(foodCatalogSearchResponseSchema.safeParse({ provider, items: [{ ...item, unknownVendorField: "raw payload" }] }).success).toBe(false);
    expect(foodCatalogSearchResponseSchema.safeParse({ provider: { ...provider, attributionText: "" }, items: [item] }).success).toBe(false);
    expect(foodCatalogSearchResponseSchema.safeParse({ provider, items: [{ ...item, territory: "CA" }] }).success).toBe(false);
  });

  it("signs bounded lookup receipts and rejects tampering and expiry", () => {
    const secret = env.FOOD_CATALOG_LOOKUP_SIGNING_SECRET!;
    const token = createFoodCatalogLookupToken(provider, item, secret, 1_000);
    expect(verifyFoodCatalogLookupToken(token, secret, 1_001)?.item.externalId).toBe("food-1");
    expect(verifyFoodCatalogLookupToken(`${token.slice(0, -1)}x`, secret, 1_001)).toBeNull();
    expect(verifyFoodCatalogLookupToken(token, secret, 1_000 + 10 * 60 * 1000)).toBeNull();
  });

  it("keeps the gateway token server-side and returns signed import receipts", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toContain("/v1/foods/search?q=oats&territory=US&locale=en-US&limit=10");
      expect(init?.headers).toEqual(expect.objectContaining({ Authorization: "Bearer server-only-token" }));
      return new Response(JSON.stringify({ provider, items: [item], nextCursor: null }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const result = await searchFoodCatalog({ query: "oats", territory: "US", locale: "en-US", limit: 10 }, env, fetchMock as typeof fetch);
    expect(result.items[0].lookupToken).toBeTruthy();
    expect(JSON.stringify(result)).not.toContain("server-only-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("wires private routes, explicit import, provenance columns, and fail-closed UI", () => {
    const routes = readFileSync(resolve(process.cwd(), "server/routes/food-catalog.ts"), "utf8");
    const nutrition = readFileSync(resolve(process.cwd(), "server/routes/nutrition.ts"), "utf8");
    const scanner = readFileSync(resolve(process.cwd(), "server/routes/ingredient-scanner.ts"), "utf8");
    const ui = readFileSync(resolve(process.cwd(), "client/src/components/health/FoodCatalogSearch.tsx"), "utf8");
    const migration = readFileSync(resolve(process.cwd(), "migrations/0104_food_catalog_gateway.sql"), "utf8");
    const release = readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8");
    expect(routes.match(/isAuthenticated/g)?.length).toBeGreaterThanOrEqual(3);
    expect(nutrition).toContain('"/api/nutrition/foods/catalog-import"');
    expect(nutrition).toContain("verifyConfiguredFoodCatalogToken");
    expect(scanner).toContain("catalogLookupToken");
    expect(ui).toContain("Save private copy");
    expect(ui).toContain("Manual foods remain available");
    expect(migration).toContain('"catalog_attribution_text"');
    expect(release).toContain('id: "0104_food_catalog_gateway"');
  });
});
