import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { foodCatalogSearchResponseSchema } from "@shared/food-catalog";
import {
  createFoodCatalogCursorToken,
  createFoodCatalogLookupToken,
  foodCatalogAvailability,
  getFoodCatalogConfig,
  searchFoodCatalog,
  verifyFoodCatalogCursorToken,
  verifyFoodCatalogLookupToken,
} from "../server/food-catalog";

const provider = {
  id: "licensed_fixture", name: "Licensed Fixture", datasetVersion: "2026-08-24",
  territories: ["US"], attributionText: "Fixture attribution", attributionUrl: "https://catalog.example/terms",
};
const item = {
  externalId: "food-1", itemVersion: "revision-7", name: "Oat cup", brand: "Example", barcode: "12345678",
  locale: "en-US", territory: "US", servingSizeGrams: 42, ingredientsText: "Oats, water",
  portions: [{ label: "1 cup", gramsPerUnit: 84 }, { label: "1 package", gramsPerUnit: 42 }],
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
    expect(foodCatalogSearchResponseSchema.safeParse({ provider, items: [{ ...item, portions: [{ label: "Cup", gramsPerUnit: 80 }, { label: "cup", gramsPerUnit: 81 }] }] }).success).toBe(false);
  });

  it("signs opaque provider cursors, binds the source and search, and rejects tampering", async () => {
    const secret = env.FOOD_CATALOG_LOOKUP_SIGNING_SECRET!;
    const cursor = createFoodCatalogCursorToken({ query: "oats", territory: "US", locale: "en-US", limit: 10, providerId: provider.id, datasetVersion: provider.datasetVersion, providerCursor: "opaque:page/2" }, secret, 1_000);
    expect(cursor).not.toContain("opaque:page/2");
    expect(verifyFoodCatalogCursorToken(cursor, secret, 1_001)?.providerCursor).toBe("opaque:page/2");
    const tamperedCursor = `${cursor.slice(0, -1)}${cursor.endsWith("x") ? "y" : "x"}`;
    expect(verifyFoodCatalogCursorToken(tamperedCursor, secret, 1_001)).toBeNull();
    expect(verifyFoodCatalogCursorToken(cursor, secret, 1_000 + 10 * 60 * 1000)).toBeNull();
    const activeCursor = createFoodCatalogCursorToken({ query: "oats", territory: "US", locale: "en-US", limit: 10, providerId: provider.id, datasetVersion: provider.datasetVersion, providerCursor: "opaque:page/2" }, secret);
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toContain("q=oats&territory=US&locale=en-US&limit=10&cursor=opaque%3Apage%2F2");
      return new Response(JSON.stringify({ provider, items: [item], nextCursor: "opaque:page/3" }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const page = await searchFoodCatalog({ cursor: activeCursor }, env, fetchMock as typeof fetch);
    expect(verifyFoodCatalogCursorToken(page.nextCursor!, secret, Date.now())?.providerCursor).toBe("opaque:page/3");
  });

  it("signs bounded lookup receipts and rejects tampering and expiry", () => {
    const secret = env.FOOD_CATALOG_LOOKUP_SIGNING_SECRET!;
    const token = createFoodCatalogLookupToken(provider, item, secret, 1_000);
    expect(verifyFoodCatalogLookupToken(token, secret, 1_001)?.item.externalId).toBe("food-1");
    const tamperedToken = `${token.slice(0, -1)}${token.endsWith("x") ? "y" : "x"}`;
    expect(verifyFoodCatalogLookupToken(tamperedToken, secret, 1_001)).toBeNull();
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
    expect(result.items[0].portions).toEqual(item.portions);
    expect(JSON.stringify(result)).not.toContain("server-only-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("wires private routes, explicit import, provenance columns, and fail-closed UI", () => {
    const routes = readFileSync(resolve(process.cwd(), "server/routes/food-catalog.ts"), "utf8");
    const nutrition = readFileSync(resolve(process.cwd(), "server/routes/nutrition.ts"), "utf8");
    const scanner = readFileSync(resolve(process.cwd(), "server/routes/ingredient-scanner.ts"), "utf8");
    const ui = readFileSync(resolve(process.cwd(), "client/src/components/health/FoodCatalogSearch.tsx"), "utf8");
    const migration = readFileSync(resolve(process.cwd(), "migrations/0104_food_catalog_gateway.sql"), "utf8");
    const portionMigration = readFileSync(resolve(process.cwd(), "migrations/0105_food_catalog_portions.sql"), "utf8");
    const release = readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8");
    expect(routes.match(/isAuthenticated/g)?.length).toBeGreaterThanOrEqual(3);
    expect(nutrition).toContain('"/api/nutrition/foods/catalog-import"');
    expect(nutrition).toContain("verifyConfiguredFoodCatalogToken");
    expect(scanner).toContain("catalogLookupToken");
    expect(ui).toContain("Save private copy");
    expect(ui).toContain("Manual foods remain available");
    expect(ui).toContain("Load more results");
    expect(migration).toContain('"catalog_attribution_text"');
    expect(portionMigration).toContain('"catalog_grams_per_unit"');
    expect(release).toContain('id: "0104_food_catalog_gateway"');
    expect(release).toContain('id: "0105_food_catalog_portions"');
  });
});
