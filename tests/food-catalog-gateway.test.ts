import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { foodCatalogSearchResponseSchema } from "@shared/food-catalog";
import {
  createFoodCatalogCursorToken,
  createFoodCatalogLookupToken,
  foodCatalogAvailability,
  getFoodCatalogConfig,
  getFoodCatalogConfigs,
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
  evidence: { sourceKind: "government_branded_database", measurementBasis: "catalog_or_label_reported", recordUpdatedAt: "2026-08-24T00:00:00.000Z", reportedNutrientCount: 1, reportedCoreNutrientKeys: ["energy_kcal"] },
};
const env = {
  FOOD_CATALOG_GATEWAY_URL: "https://catalog.example",
  FOOD_CATALOG_GATEWAY_TOKEN: "server-only-token",
  FOOD_CATALOG_LOOKUP_SIGNING_SECRET: "a-signing-secret-that-is-at-least-32-characters",
} as NodeJS.ProcessEnv;

const openFoodFactsEnv = {
  OPEN_FOOD_FACTS_ENABLED: "true",
  OPEN_FOOD_FACTS_USER_AGENT: "LyfeOS/1.0 (https://lyfeos.net; support@lyfeos.net)",
  FOOD_CATALOG_LOOKUP_SIGNING_SECRET: env.FOOD_CATALOG_LOOKUP_SIGNING_SECRET,
} as NodeJS.ProcessEnv;

const usdaFoodDataEnv = {
  USDA_FOODDATA_API_KEY: "dedicated-data-gov-key-not-for-client-use",
  FOOD_CATALOG_LOOKUP_SIGNING_SECRET: env.FOOD_CATALOG_LOOKUP_SIGNING_SECRET,
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

  it("supports an explicit Open Food Facts barcode and search adapter with attribution and no client provider secret", async () => {
    expect(getFoodCatalogConfig(openFoodFactsEnv)).toMatchObject({ kind: "open_food_facts" });
    expect(getFoodCatalogConfig({ ...openFoodFactsEnv, OPEN_FOOD_FACTS_USER_AGENT: "short" })).toBeNull();
    const product = {
      code: "3017620422003", product_name: "Nutella", brands: "Ferrero", ingredients_text: "Sugar, hazelnuts", serving_size: "15 g", last_modified_t: 1_700_000_000, labels_tags: ["en:kosher"],
      nutriments: { "energy-kcal_100g": 539, proteins_100g: 6.3, proteins_unit: "g", sodium_100g: 0.0428, sodium_unit: "g" },
    };
    let attempts = 0;
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toEqual(expect.objectContaining({ "User-Agent": openFoodFactsEnv.OPEN_FOOD_FACTS_USER_AGENT }));
      if (String(url).includes("/api/v3/product/")) return new Response(JSON.stringify({ status: 1, product }), { status: 200 });
      attempts += 1;
      if (attempts === 1) return new Response("busy", { status: 503 });
      return new Response(JSON.stringify({ hits: [product], page_count: "10" }), { status: 200 });
    });
    const search = await searchFoodCatalog({ query: "nutella", territory: "US", locale: "en-US", limit: 10 }, openFoodFactsEnv, fetchMock as typeof fetch);
    expect(search.provider.id).toBe("open_food_facts");
    expect(search.provider.attributionText).toContain("Open Database License");
    expect(search.nextCursor).toBeTruthy();
    expect(verifyFoodCatalogLookupToken(search.items[0].lookupToken, openFoodFactsEnv.FOOD_CATALOG_LOOKUP_SIGNING_SECRET!)?.item.externalId).toBe("3017620422003");
    expect(search.items[0].nutrients).toEqual(expect.arrayContaining([{ nutrientKey: "energy_kcal", amountPer100g: 539, unit: "kcal" }, { nutrientKey: "sodium_mg", amountPer100g: 42.8, unit: "mg" }]));
    expect(search.items[0].evidence).toMatchObject({ sourceKind: "community_catalog", measurementBasis: "catalog_or_label_reported", recordUpdatedAt: "2023-11-14T22:13:20.000Z" });
    const barcode = await (await import("../server/food-catalog")).lookupFoodCatalogBarcode("3017620422003", openFoodFactsEnv, fetchMock as typeof fetch);
    expect(barcode.item?.ingredientsText).toBe("Sugar, hazelnuts");
    expect(verifyFoodCatalogLookupToken(barcode.item?.lookupToken || "", openFoodFactsEnv.FOOD_CATALOG_LOOKUP_SIGNING_SECRET!)?.item.externalId).toBe("3017620422003");
    expect(barcode.item?.certifications).toEqual([{ kind: "kosher", status: "catalog_label_reported", label: "Kosher label reported by catalog" }]);
    expect(JSON.stringify(search)).not.toContain("FOOD_CATALOG_GATEWAY_TOKEN");
  });

  it("supports a separately selected USDA FoodData Central nutrient source and preserves its provenance", async () => {
    expect(getFoodCatalogConfigs({ ...openFoodFactsEnv, ...usdaFoodDataEnv })).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "open_food_facts" }), expect.objectContaining({ kind: "usda_fooddata_central" })]));
    const food = {
      fdcId: 12345, dataType: "Foundation", description: "Oats, raw", brandOwner: "USDA", gtinUpc: "012345678905", publishedDate: "2026-08-01", servingSize: 40, servingSizeUnit: "g", householdServingFullText: "1/2 cup",
      foodNutrients: [{ nutrientId: 1008, nutrientName: "Energy", unitName: "KCAL", value: 379 }, { nutrientId: 1003, nutrientName: "Protein", unitName: "G", value: 13.15 }, { nutrientId: 1093, nutrientName: "Sodium, Na", unitName: "MG", value: 6 }],
    };
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toContain("https://api.nal.usda.gov/fdc/v1/foods/search?");
      expect(String(url)).toContain("api_key=dedicated-data-gov-key-not-for-client-use");
      return new Response(JSON.stringify({ foods: [food], totalPages: 1 }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const search = await searchFoodCatalog({ query: "oats", territory: "US", locale: "en-US", limit: 10, providerId: "usda_fooddata_central" }, usdaFoodDataEnv, fetchMock as typeof fetch);
    expect(search.provider.id).toBe("usda_fooddata_central");
    expect(verifyFoodCatalogLookupToken(search.items[0].lookupToken, usdaFoodDataEnv.FOOD_CATALOG_LOOKUP_SIGNING_SECRET!)?.item.externalId).toBe("12345");
    expect(search.items[0].nutrients).toEqual(expect.arrayContaining([{ nutrientKey: "energy_kcal", amountPer100g: 379, unit: "kcal" }, { nutrientKey: "protein_g", amountPer100g: 13.15, unit: "g" }]));
    expect(search.items[0].evidence).toMatchObject({ sourceKind: "government_reference_database", measurementBasis: "government_reference", recordUpdatedAt: "2026-08-01T00:00:00.000Z" });
    const barcode = await (await import("../server/food-catalog")).lookupFoodCatalogBarcode("012345678905", "usda_fooddata_central", usdaFoodDataEnv, fetchMock as typeof fetch);
    expect(barcode.item?.barcode).toBe("012345678905");
    expect(verifyFoodCatalogLookupToken(barcode.item?.lookupToken || "", usdaFoodDataEnv.FOOD_CATALOG_LOOKUP_SIGNING_SECRET!)?.item.externalId).toBe("12345");
    expect(JSON.stringify(search)).not.toContain(usdaFoodDataEnv.USDA_FOODDATA_API_KEY!);
  });

  it("wires private routes, explicit import, provenance columns, and fail-closed UI", () => {
    const routes = readFileSync(resolve(process.cwd(), "server/routes/food-catalog.ts"), "utf8");
    const nutrition = readFileSync(resolve(process.cwd(), "server/routes/nutrition.ts"), "utf8");
    const scanner = readFileSync(resolve(process.cwd(), "server/routes/ingredient-scanner.ts"), "utf8");
    const ingredientScannerUi = readFileSync(resolve(process.cwd(), "client/src/components/health/IngredientScanner.tsx"), "utf8");
    const ui = readFileSync(resolve(process.cwd(), "client/src/components/health/FoodCatalogSearch.tsx"), "utf8");
    const migration = readFileSync(resolve(process.cwd(), "migrations/0104_food_catalog_gateway.sql"), "utf8");
    const portionMigration = readFileSync(resolve(process.cwd(), "migrations/0105_food_catalog_portions.sql"), "utf8");
    const release = readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8");
    expect(routes.match(/isAuthenticated/g)?.length).toBeGreaterThanOrEqual(3);
    expect(nutrition).toContain('"/api/nutrition/foods/catalog-import"');
    expect(nutrition).toContain("verifyConfiguredFoodCatalogToken");
    expect(scanner).toContain("catalogLookupToken");
    expect(ingredientScannerUi).toContain("Kosher: not verified by the selected catalog");
    expect(ingredientScannerUi).toContain("Confirm the current package certification mark");
    expect(ui).toContain("Save private copy");
    expect(ui).toContain("configured data provider");
    expect(ui).toContain("Manual foods remain available");
    expect(ui).toContain("Load more results");
    expect(ui).toContain("Food catalog data source");
    expect(migration).toContain('"catalog_attribution_text"');
    expect(portionMigration).toContain('"catalog_grams_per_unit"');
    expect(release).toContain('id: "0104_food_catalog_gateway"');
    expect(release).toContain('id: "0105_food_catalog_portions"');
    expect(release).toContain('id: "0150_nutrition_food_catalog_evidence"');
  });
});
