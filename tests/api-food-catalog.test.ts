import { afterAll, describe, expect, it } from "vitest";
import { createFoodCatalogLookupToken } from "../server/food-catalog";

const BASE_URL = process.env.LYFEOS_TEST_API_URL;
const describeApi = BASE_URL && process.env.LYFEOS_TEST_ENV === "isolated" && process.env.FOOD_CATALOG_LOOKUP_SIGNING_SECRET ? describe : describe.skip;

async function request(method: string, path: string, body?: unknown, cookie = "") {
  const response = await fetch(`${BASE_URL}${path}`, { method, headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https", ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json().catch(() => ({})) as any, cookie: (response.headers.get("set-cookie") || "").split(";", 1)[0] };
}

const provider = { id: "licensed_fixture", name: "Licensed Fixture", datasetVersion: "2026-08-24", territories: ["US"], attributionText: "Fixture attribution", attributionUrl: "https://catalog.example/terms" };
const item = { externalId: "catalog-food-1", itemVersion: "rev-1", name: "Catalog oats", brand: "Fixture", barcode: "12345678", locale: "en-US", territory: "US", servingSizeGrams: 40, ingredientsText: "Whole grain oats, salt", portions: [{ label: "1 cup", gramsPerUnit: 80 }, { label: "1 packet", gramsPerUnit: 40 }], nutrients: [{ nutrientKey: "energy_kcal", amountPer100g: 375, unit: "kcal" }, { nutrientKey: "protein_g", amountPer100g: 12.5, unit: "g" }] };

describeApi("food catalog authenticated import contract", () => {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const token = createFoodCatalogLookupToken(provider, item, process.env.FOOD_CATALOG_LOOKUP_SIGNING_SECRET || "skipped-api-fixture-signing-secret-32-chars");
  let ownerCookie = "";
  let otherCookie = "";
  let foodId = 0;

  afterAll(async () => {
    if (ownerCookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, ownerCookie);
    if (otherCookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, otherCookie);
  });

  it("requires authentication and creates isolated accounts", async () => {
    expect((await request("GET", "/api/food-catalog/status")).status).toBe(401);
    const owner = await request("POST", "/api/auth/complete-registration", { email: `catalog_owner_${stamp}@example.com`, password: "TestPass123!", displayName: `catalog_owner_${stamp}`, termsAccepted: true });
    const other = await request("POST", "/api/auth/complete-registration", { email: `catalog_other_${stamp}@example.com`, password: "TestPass123!", displayName: `catalog_other_${stamp}`, termsAccepted: true });
    expect([owner.status, other.status]).toEqual([201, 201]);
    ownerCookie = owner.cookie; otherCookie = other.cookie;
  });

  it("rejects a forged receipt without creating a private food", async () => {
    const forged = `${token.slice(0, -1)}x`;
    expect((await request("POST", "/api/nutrition/foods/catalog-import", { lookupToken: forged }, ownerCookie)).status).toBe(400);
    expect((await request("GET", "/api/nutrition/foods", undefined, ownerCookie)).data.foods).toHaveLength(0);
  });

  it("imports once, replays idempotently, and keeps account copies isolated", async () => {
    const imported = await request("POST", "/api/nutrition/foods/catalog-import", { lookupToken: token }, ownerCookie);
    expect(imported.status).toBe(201); expect(imported.data.replayed).toBe(false); foodId = imported.data.food.id;
    const replay = await request("POST", "/api/nutrition/foods/catalog-import", { lookupToken: token }, ownerCookie);
    expect(replay.status).toBe(200); expect(replay.data.replayed).toBe(true); expect(replay.data.food.id).toBe(foodId);
    const revisedToken = createFoodCatalogLookupToken({ ...provider, datasetVersion: "2026-08-24.1" }, { ...item, itemVersion: "rev-2" }, process.env.FOOD_CATALOG_LOOKUP_SIGNING_SECRET!);
    const revisedImport = await request("POST", "/api/nutrition/foods/catalog-import", { lookupToken: revisedToken }, ownerCookie);
    expect(revisedImport.status).toBe(201); expect(revisedImport.data.replayed).toBe(false); expect(revisedImport.data.food.id).not.toBe(foodId);
    const otherImport = await request("POST", "/api/nutrition/foods/catalog-import", { lookupToken: token }, otherCookie);
    expect(otherImport.status).toBe(201); expect(otherImport.data.food.id).not.toBe(foodId);
    const ownerFoods = await request("GET", "/api/nutrition/foods", undefined, ownerCookie);
    expect(ownerFoods.data.foods).toHaveLength(2);
    expect(ownerFoods.data.foods).toEqual(expect.arrayContaining([expect.objectContaining({ source: "catalog", catalogProviderId: "licensed_fixture", catalogDatasetVersion: "2026-08-24", catalogSourceModified: false })]));
  });

  it("imports source-attributed portions and preserves their original values after private correction", async () => {
    const ownerFoods = await request("GET", "/api/nutrition/foods", undefined, ownerCookie);
    const imported = ownerFoods.data.foods.find((food: any) => food.id === foodId);
    expect(imported.portions).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "1 cup", gramsPerUnit: 80, catalogLabel: "1 cup", catalogGramsPerUnit: 80, sourceModified: false }),
      expect.objectContaining({ label: "1 packet", gramsPerUnit: 40, catalogLabel: "1 packet", catalogGramsPerUnit: 40, sourceModified: false }),
    ]));
    const cup = imported.portions.find((portion: any) => portion.label === "1 cup");
    const corrected = await request("PATCH", `/api/nutrition/food-portions/${cup.id}`, { label: "My cup", gramsPerUnit: 82 }, ownerCookie);
    expect(corrected.status).toBe(200);
    expect(corrected.data.portion).toMatchObject({ label: "My cup", gramsPerUnit: 82, catalogLabel: "1 cup", catalogGramsPerUnit: 80, sourceModified: true });
    const refreshed = await request("GET", "/api/nutrition/foods", undefined, ownerCookie);
    expect(refreshed.data.foods.find((food: any) => food.id === foodId)).toMatchObject({ catalogSourceModified: true });
  });

  it("does not mislabel a manually created food as a modified catalog source", async () => {
    const payload = { name: "Manual oats", servingSizeGrams: 40, favorite: false, nutrients: [{ nutrientKey: "energy_kcal", amountPer100g: 360 }] };
    const created = await request("POST", "/api/nutrition/foods", payload, ownerCookie);
    expect(created.status).toBe(201);
    expect(created.data.food).toMatchObject({ source: "manual", catalogProviderId: null, catalogSourceModified: false });
    const corrected = await request("PATCH", `/api/nutrition/foods/${created.data.food.id}`, { ...payload, name: "Corrected manual oats" }, ownerCookie);
    expect(corrected.status).toBe(200);
    expect(corrected.data.food).toMatchObject({ source: "manual", catalogProviderId: null, catalogSourceModified: false });
  });

  it("marks private corrections without rewriting catalog attribution", async () => {
    const corrected = await request("PATCH", `/api/nutrition/foods/${foodId}`, { name: "My corrected oats", brand: "Fixture", barcode: "12345678", servingSizeGrams: 40, favorite: false, nutrients: [{ nutrientKey: "energy_kcal", amountPer100g: 370 }, { nutrientKey: "protein_g", amountPer100g: 12 }] }, ownerCookie);
    expect(corrected.status).toBe(200);
    expect(corrected.data.food).toMatchObject({ name: "My corrected oats", catalogProviderId: "licensed_fixture", catalogDatasetVersion: "2026-08-24", catalogSourceModified: true });
  });

  it("saves an attributed ingredient label only through the signed receipt", async () => {
    const saved = await request("POST", "/api/ingredient-scans", { rawIngredientsText: "ignored client value", catalogLookupToken: token }, ownerCookie);
    expect(saved.status).toBe(201);
    expect(saved.data.scan).toMatchObject({ productName: "Catalog oats", rawIngredientsText: "Whole grain oats, salt", catalogProviderId: "licensed_fixture", catalogDatasetVersion: "2026-08-24", catalogSourceModified: false });
    expect(saved.data.scan.items.map((entry: any) => entry.rawName)).toEqual(["Whole grain oats", "salt"]);
  });

  it("stores reviewed on-device OCR text only after explicit save", async () => {
    const saved = await request("POST", "/api/ingredient-scans", { captureMethod: "photo_ocr", productName: "Reviewed package", rawIngredientsText: "Ingredients: oats, water, salt" }, ownerCookie);
    expect(saved.status).toBe(201);
    expect(saved.data.scan).toMatchObject({ captureMethod: "photo_ocr", productName: "Reviewed package", rawIngredientsText: "Ingredients: oats, water, salt", catalogProviderId: null });
    expect(saved.data.scan.items.map((entry: any) => entry.rawName)).toEqual(["oats", "water", "salt"]);
  });
});
