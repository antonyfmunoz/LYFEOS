import type { Express, Request, Response } from "express";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { healthDeletionReceipts, nutritionDiaryEntries, nutritionFoodNutrients, nutritionFoodPortions, nutritionFoods, nutritionRecipeIngredients, nutritionRecipeRevisions, nutritionRecipes } from "@shared/schema";
import { db } from "../db";
import { deletionReceiptExpiry, healthMutationId, healthMutationPayloadHash, newDeletionReceiptId } from "../health-mutation-integrity";
import { dateInTimeZone, dayBounds, localDate, requestTimeContext } from "../health-fitness";
import { nutrientDefinitions, nutrientKeys, nutritionContributions, nutritionDailyReport, nutritionDailyReportCsv, nutritionGramsFromInput, nutritionPeriodComparison, nutritionTotals, nutritionTrend } from "../nutrition";
import { parseExpectedResourceRevision } from "../revision-concurrency";
import { isAuthenticated } from "./middleware";
import { verifyConfiguredFoodCatalogToken } from "../food-catalog";

const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const nutritionReportDays = (value: unknown, fallback = 14) => {
  const requested = Number(value || fallback);
  return Number.isInteger(requested) && requested >= 7 && requested <= 365 ? requested : fallback;
};
const nutrientSchema = z.object({
  nutrientKey: z.enum(nutrientKeys as [string, ...string[]]),
  amountPer100g: z.number().min(0).max(1_000_000),
}).superRefine((value, context) => {
  const definition = nutrientDefinitions[value.nutrientKey as keyof typeof nutrientDefinitions];
  if (!definition) context.addIssue({ code: z.ZodIssueCode.custom, message: "Unsupported nutrient." });
});
const foodSchema = z.object({
  name: z.string().trim().min(1).max(160), brand: z.string().trim().max(120).nullable().optional(),
  barcode: z.string().trim().max(64).nullable().optional(), servingSizeGrams: z.number().positive().max(100_000).default(100),
  densityGramsPerMl: z.number().positive().max(100).nullable().optional(),
  favorite: z.boolean().optional(), note: z.string().trim().max(500).nullable().optional(), nutrients: z.array(nutrientSchema).min(1).max(nutrientKeys.length),
}).superRefine((value, context) => {
  const keys = value.nutrients.map((nutrient) => nutrient.nutrientKey);
  if (new Set(keys).size !== keys.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "Each nutrient can be supplied only once." });
  if (!keys.includes("energy_kcal")) context.addIssue({ code: z.ZodIssueCode.custom, message: "Energy (kcal) is required for a diary food." });
});
const catalogImportSchema = z.object({ lookupToken: z.string().min(80).max(100_000) }).strict();
const diarySchema = z.object({
  foodId: z.number().int().positive(), servingGrams: z.number().positive().max(100_000).optional(),
  quantity: z.number().positive().max(100_000).optional(), inputUnit: z.enum(["g", "serving", "ml", "portion"]).optional(),
  portionId: z.number().int().positive().nullable().optional(),
  mealSlot: z.enum(["breakfast", "lunch", "dinner", "snack", "other"]).default("other"),
  occurredAt: z.string().datetime().optional(), note: z.string().trim().max(500).nullable().optional(),
}).superRefine((value, context) => {
  if (value.servingGrams == null && value.quantity == null) context.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a quantity." });
  if (value.inputUnit === "portion" && !value.portionId) context.addIssue({ code: z.ZodIssueCode.custom, message: "Choose a saved portion." });
  if (value.inputUnit !== "portion" && value.portionId) context.addIssue({ code: z.ZodIssueCode.custom, message: "A portion can only accompany the portion unit." });
});
const diaryUpdateSchema = z.object({
  quantity: z.number().positive().max(100_000), inputUnit: z.enum(["g", "serving", "ml", "portion"]),
  portionId: z.number().int().positive().nullable().optional(),
  mealSlot: z.enum(["breakfast", "lunch", "dinner", "snack", "other"]),
  note: z.string().trim().max(500).nullable().optional(),
}).superRefine((value, context) => {
  if (value.inputUnit === "portion" && !value.portionId) context.addIssue({ code: z.ZodIssueCode.custom, message: "Choose a saved portion." });
  if (value.inputUnit !== "portion" && value.portionId) context.addIssue({ code: z.ZodIssueCode.custom, message: "A portion can only accompany the portion unit." });
});
const portionSchema = z.object({ label: z.string().trim().min(1).max(80), gramsPerUnit: z.number().positive().max(100_000) });
const copyDiaryDaySchema = z.object({
  sourceDate: daySchema,
  targetDate: daySchema,
});
const copyDiaryMealSchema = copyDiaryDaySchema.extend({
  sourceMealSlot: z.enum(["breakfast", "lunch", "dinner", "snack", "other"]),
  targetMealSlot: z.enum(["breakfast", "lunch", "dinner", "snack", "other"]),
});
const recipeSchema = z.object({
  name: z.string().trim().min(1).max(160), servings: z.number().positive().max(1000).default(1), folder: z.string().trim().max(80).nullable().optional(), note: z.string().trim().max(500).nullable().optional(),
  ingredients: z.array(z.object({ foodId: z.number().int().positive(), grams: z.number().positive().max(100_000) })).min(1).max(60),
}).superRefine((value, context) => {
  if (new Set(value.ingredients.map((ingredient) => ingredient.foodId)).size !== value.ingredients.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "Each food can appear only once in a recipe." });
});
const recipeRevisionIngredientsSchema = z.array(z.object({
  foodId: z.number().int().positive(), grams: z.number().positive().max(100_000), sortOrder: z.number().int().min(0).max(1000).default(0),
})).min(1).max(60);
const logRecipeSchema = z.object({ servings: z.number().positive().max(1000).default(1), mealSlot: z.enum(["breakfast", "lunch", "dinner", "snack", "other"]).default("other"), occurredAt: z.string().datetime().optional(), note: z.string().trim().max(500).nullable().optional() });
type NutrientSnapshot = { nutrientKey: string; amountPer100g: number; unit: string };

function asNutrientSnapshot(value: unknown): NutrientSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is NutrientSnapshot => !!item && typeof item === "object"
    && typeof (item as NutrientSnapshot).nutrientKey === "string"
    && typeof (item as NutrientSnapshot).amountPer100g === "number"
    && typeof (item as NutrientSnapshot).unit === "string");
}

async function nutrientSnapshots(foodIds: number[]): Promise<Map<number, NutrientSnapshot[]>> {
  if (!foodIds.length) return new Map();
  const rows = await db.select().from(nutritionFoodNutrients).where(inArray(nutritionFoodNutrients.foodId, foodIds));
  const snapshots = new Map<number, NutrientSnapshot[]>();
  for (const row of rows) snapshots.set(row.foodId, [...(snapshots.get(row.foodId) || []), { nutrientKey: row.nutrientKey, amountPer100g: row.amountPer100g, unit: row.unit }]);
  return snapshots;
}

async function foodsWithNutrients(userId: number, query?: string) {
  const conditions = [eq(nutritionFoods.userId, userId)];
  if (query) conditions.push(ilike(nutritionFoods.name, `%${query}%`));
  const foods = await db.select().from(nutritionFoods).where(and(...conditions)).orderBy(desc(nutritionFoods.favorite), asc(nutritionFoods.name)).limit(200);
  if (!foods.length) return [];
  const [nutrients, portions, recentEntries] = await Promise.all([
    db.select().from(nutritionFoodNutrients).where(inArray(nutritionFoodNutrients.foodId, foods.map((food) => food.id))),
    db.select().from(nutritionFoodPortions).where(and(eq(nutritionFoodPortions.userId, userId), inArray(nutritionFoodPortions.foodId, foods.map((food) => food.id)))),
    db.select({ foodId: nutritionDiaryEntries.foodId, occurredAt: nutritionDiaryEntries.occurredAt }).from(nutritionDiaryEntries)
      .where(and(eq(nutritionDiaryEntries.userId, userId), inArray(nutritionDiaryEntries.foodId, foods.map((food) => food.id))))
      .orderBy(desc(nutritionDiaryEntries.occurredAt)).limit(500),
  ]);
  const recency = new Map<number, { count: number; lastLoggedAt: Date }>();
  for (const entry of recentEntries) {
    const current = recency.get(entry.foodId);
    recency.set(entry.foodId, { count: (current?.count || 0) + 1, lastLoggedAt: current?.lastLoggedAt || entry.occurredAt });
  }
  return foods.map((food) => ({
    ...food, nutrients: nutrients.filter((nutrient) => nutrient.foodId === food.id), portions: portions.filter((portion) => portion.foodId === food.id),
    recentUseCount: recency.get(food.id)?.count || 0, lastLoggedAt: recency.get(food.id)?.lastLoggedAt || null,
  })).sort((left, right) => Number(right.favorite) - Number(left.favorite)
    || (right.lastLoggedAt?.getTime() || 0) - (left.lastLoggedAt?.getTime() || 0)
    || left.name.localeCompare(right.name)).slice(0, 50);
}

async function diaryForDate(userId: number, date: string, timeZone: string) {
  const { start, end } = dayBounds(date, timeZone);
  const entries = await db.select({
    id: nutritionDiaryEntries.id, foodId: nutritionDiaryEntries.foodId, servingGrams: nutritionDiaryEntries.servingGrams, inputQuantity: nutritionDiaryEntries.inputQuantity, inputUnit: nutritionDiaryEntries.inputUnit, inputPortionId: nutritionDiaryEntries.inputPortionId, inputUnitLabel: nutritionDiaryEntries.inputUnitLabel, inputGramsPerUnit: nutritionDiaryEntries.inputGramsPerUnit,
    mealSlot: nutritionDiaryEntries.mealSlot, occurredAt: nutritionDiaryEntries.occurredAt, note: nutritionDiaryEntries.note,
    nutrientSnapshot: nutritionDiaryEntries.nutrientSnapshot,
    foodName: nutritionFoods.name, foodBrand: nutritionFoods.brand,
  }).from(nutritionDiaryEntries).innerJoin(nutritionFoods, eq(nutritionDiaryEntries.foodId, nutritionFoods.id))
    .where(and(eq(nutritionDiaryEntries.userId, userId), gte(nutritionDiaryEntries.occurredAt, start), lt(nutritionDiaryEntries.occurredAt, end)))
    .orderBy(desc(nutritionDiaryEntries.occurredAt));
  if (!entries.length) return { entries: [], totals: {} };
  const nutrients = await db.select().from(nutritionFoodNutrients).where(inArray(nutritionFoodNutrients.foodId, entries.map((entry) => entry.foodId)));
  const nutrientsByFood = new Map<number, typeof nutrients>();
  for (const nutrient of nutrients) nutrientsByFood.set(nutrient.foodId, [...(nutrientsByFood.get(nutrient.foodId) || []), nutrient]);
  const detailedEntries = entries.map((entry) => {
    const snapshot = asNutrientSnapshot(entry.nutrientSnapshot);
    return { ...entry, nutrients: snapshot.length ? snapshot : (nutrientsByFood.get(entry.foodId) || []) };
  });
  return {
    entries: detailedEntries,
    totals: nutritionTotals(detailedEntries.flatMap((entry) => entry.nutrients.map((nutrient) => ({ ...nutrient, servingGrams: entry.servingGrams })))),
  };
}

function copyToDate(_occurredAt: Date, date: string, timeZone: string): Date {
  const { start, end } = dayBounds(date, timeZone);
  return new Date((start.getTime() + end.getTime()) / 2);
}

async function conversionEvidence(userId: number, food: { id: number; servingSizeGrams: number; densityGramsPerMl: number | null }, inputUnit: "g" | "serving" | "ml" | "portion", portionId?: number | null) {
  if (inputUnit === "g") return { label: "g", gramsPerUnit: 1 };
  if (inputUnit === "serving") return { label: "serving", gramsPerUnit: food.servingSizeGrams };
  if (inputUnit === "ml") return food.densityGramsPerMl ? { label: "ml", gramsPerUnit: food.densityGramsPerMl } : null;
  const [portion] = await db.select().from(nutritionFoodPortions).where(and(eq(nutritionFoodPortions.id, portionId!), eq(nutritionFoodPortions.foodId, food.id), eq(nutritionFoodPortions.userId, userId))).limit(1);
  return portion ? { label: portion.label, gramsPerUnit: portion.gramsPerUnit } : null;
}

export function registerNutritionRoutes(app: Express): void {
  app.get("/api/nutrition/nutrients", isAuthenticated, (_req: Request, res: Response) => res.json({
    nutrients: nutrientKeys.map((nutrientKey) => ({ nutrientKey, ...nutrientDefinitions[nutrientKey] })),
    disclosure: "The registry defines supported units only. Values remain user-entered or source-attributed; omitted nutrients remain unknown.",
  }));

  app.get("/api/nutrition/foods", isAuthenticated, async (req: Request, res: Response) => {
    const query = typeof req.query.query === "string" ? req.query.query.trim().slice(0, 100) : undefined;
    return res.json({ foods: await foodsWithNutrients(req.session.userId!, query) });
  });

  app.post("/api/nutrition/foods", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = foodSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid food record.", details: parsed.error.flatten() });
    const userId = req.session.userId!;
    const food = await db.transaction(async (tx) => {
      const [created] = await tx.insert(nutritionFoods).values({ userId, name: parsed.data.name, brand: parsed.data.brand || null, barcode: parsed.data.barcode || null, servingSizeGrams: parsed.data.servingSizeGrams, densityGramsPerMl: parsed.data.densityGramsPerMl || null, favorite: parsed.data.favorite ?? false, note: parsed.data.note || null, source: "manual" }).returning();
      const nutrients = await tx.insert(nutritionFoodNutrients).values(parsed.data.nutrients.map((nutrient) => ({ foodId: created.id, nutrientKey: nutrient.nutrientKey, amountPer100g: nutrient.amountPer100g, unit: nutrientDefinitions[nutrient.nutrientKey as keyof typeof nutrientDefinitions].unit, source: "manual" }))).returning();
      return { ...created, nutrients };
    });
    return res.status(201).json({ food });
  });

  app.post("/api/nutrition/foods/catalog-import", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = catalogImportSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid catalog lookup receipt." });
    const receipt = verifyConfiguredFoodCatalogToken(parsed.data.lookupToken);
    if (!receipt) return res.status(400).json({ error: "This catalog lookup is invalid or expired. Search again before saving." });
    const definitions = receipt.item.nutrients.map((nutrient) => ({ nutrient, definition: nutrientDefinitions[nutrient.nutrientKey as keyof typeof nutrientDefinitions] }));
    if (!definitions.length || definitions.some(({ nutrient, definition }) => !definition || definition.unit !== nutrient.unit) || !receipt.item.nutrients.some((nutrient) => nutrient.nutrientKey === "energy_kcal")) {
      return res.status(422).json({ error: "This catalog item does not provide a compatible, source-attributed LyfeOS nutrient set." });
    }
    const userId = req.session.userId!;
    const result = await db.transaction(async (tx) => {
      const [created] = await tx.insert(nutritionFoods).values({
        userId, name: receipt.item.name, brand: receipt.item.brand || null, barcode: receipt.item.barcode || null,
        source: "catalog", servingSizeGrams: receipt.item.servingSizeGrams || 100, favorite: false,
        catalogProviderId: receipt.provider.id, catalogExternalId: receipt.item.externalId,
        catalogDatasetVersion: receipt.provider.datasetVersion, catalogItemVersion: receipt.item.itemVersion,
        catalogAttributionText: receipt.provider.attributionText, catalogAttributionUrl: receipt.provider.attributionUrl || null,
        catalogTerritory: receipt.item.territory, catalogImportedAt: new Date(), catalogSourceModified: false,
      }).onConflictDoNothing().returning();
      if (!created) {
        const [existing] = await tx.select().from(nutritionFoods).where(and(
          eq(nutritionFoods.userId, userId), eq(nutritionFoods.catalogProviderId, receipt.provider.id), eq(nutritionFoods.catalogExternalId, receipt.item.externalId),
          eq(nutritionFoods.catalogDatasetVersion, receipt.provider.datasetVersion), eq(nutritionFoods.catalogItemVersion, receipt.item.itemVersion),
        )).limit(1);
        if (!existing) throw new Error("Catalog import conflict without an owned record.");
        const [nutrients, portions] = await Promise.all([
          tx.select().from(nutritionFoodNutrients).where(eq(nutritionFoodNutrients.foodId, existing.id)),
          tx.select().from(nutritionFoodPortions).where(and(eq(nutritionFoodPortions.userId, userId), eq(nutritionFoodPortions.foodId, existing.id))),
        ]);
        return { food: { ...existing, nutrients, portions }, replayed: true };
      }
      const source = `catalog:${receipt.provider.id}:${receipt.provider.datasetVersion}:${receipt.item.itemVersion}`;
      const nutrients = await tx.insert(nutritionFoodNutrients).values(receipt.item.nutrients.map((nutrient) => ({
        foodId: created.id, nutrientKey: nutrient.nutrientKey, amountPer100g: nutrient.amountPer100g, unit: nutrient.unit, source,
      }))).returning();
      const portions = receipt.item.portions.length ? await tx.insert(nutritionFoodPortions).values(receipt.item.portions.map((portion) => ({
        userId, foodId: created.id, label: portion.label, gramsPerUnit: portion.gramsPerUnit, source,
        catalogLabel: portion.label, catalogGramsPerUnit: portion.gramsPerUnit, sourceModified: false,
      }))).returning() : [];
      return { food: { ...created, nutrients, portions }, replayed: false };
    });
    return res.status(result.replayed ? 200 : 201).json(result);
  });

  app.patch("/api/nutrition/foods/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const parsed = foodSchema.safeParse(req.body);
    if (!Number.isInteger(id) || !parsed.success) return res.status(400).json({ error: "Invalid food record.", details: parsed.success ? undefined : parsed.error.flatten() });
    const food = await db.transaction(async (tx) => {
      const [updated] = await tx.update(nutritionFoods).set({
        name: parsed.data.name, brand: parsed.data.brand || null, barcode: parsed.data.barcode || null,
        servingSizeGrams: parsed.data.servingSizeGrams, densityGramsPerMl: parsed.data.densityGramsPerMl || null, favorite: parsed.data.favorite ?? false,
        note: parsed.data.note || null,
        catalogSourceModified: sql<boolean>`CASE WHEN ${nutritionFoods.catalogProviderId} IS NOT NULL THEN true ELSE ${nutritionFoods.catalogSourceModified} END`,
        updatedAt: new Date(),
      }).where(and(eq(nutritionFoods.id, id), eq(nutritionFoods.userId, req.session.userId!))).returning();
      if (!updated) return null;
      await tx.delete(nutritionFoodNutrients).where(eq(nutritionFoodNutrients.foodId, updated.id));
      const nutrients = await tx.insert(nutritionFoodNutrients).values(parsed.data.nutrients.map((nutrient) => ({
        foodId: updated.id, nutrientKey: nutrient.nutrientKey, amountPer100g: nutrient.amountPer100g,
        unit: nutrientDefinitions[nutrient.nutrientKey as keyof typeof nutrientDefinitions].unit, source: "manual",
      }))).returning();
      return { ...updated, nutrients };
    });
    return food ? res.json({ food }) : res.status(404).json({ error: "Food not found." });
  });

  app.patch("/api/nutrition/foods/:id/favorite", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const parsed = z.object({ favorite: z.boolean() }).safeParse(req.body);
    if (!Number.isInteger(id) || !parsed.success) return res.status(400).json({ error: "Invalid favorite preference." });
    const [food] = await db.update(nutritionFoods).set({ favorite: parsed.data.favorite, updatedAt: new Date() })
      .where(and(eq(nutritionFoods.id, id), eq(nutritionFoods.userId, req.session.userId!))).returning();
    return food ? res.json({ food }) : res.status(404).json({ error: "Food not found." });
  });

  app.post("/api/nutrition/foods/:foodId/portions", isAuthenticated, async (req: Request, res: Response) => {
    const foodId = Number(req.params.foodId); const parsed = portionSchema.safeParse(req.body); const userId = req.session.userId!;
    if (!Number.isInteger(foodId) || !parsed.success) return res.status(400).json({ error: "Invalid food portion." });
    const portion = await db.transaction(async (tx) => {
      const [food] = await tx.select({ id: nutritionFoods.id }).from(nutritionFoods).where(and(eq(nutritionFoods.id, foodId), eq(nutritionFoods.userId, userId))).limit(1);
      if (!food) return null;
      const [created] = await tx.insert(nutritionFoodPortions).values({ userId, foodId, ...parsed.data, source: "manual" }).returning();
      await tx.update(nutritionFoods).set({
        catalogSourceModified: sql<boolean>`CASE WHEN ${nutritionFoods.catalogProviderId} IS NOT NULL THEN true ELSE ${nutritionFoods.catalogSourceModified} END`, updatedAt: new Date(),
      }).where(and(eq(nutritionFoods.id, foodId), eq(nutritionFoods.userId, userId)));
      return created;
    });
    if (!portion) return res.status(404).json({ error: "Food not found." });
    return res.status(201).json({ portion });
  });

  app.patch("/api/nutrition/food-portions/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id); const parsed = portionSchema.safeParse(req.body);
    if (!Number.isInteger(id) || !parsed.success) return res.status(400).json({ error: "Invalid food portion." });
    const portion = await db.transaction(async (tx) => {
      const [updated] = await tx.update(nutritionFoodPortions).set({
        ...parsed.data,
        sourceModified: sql<boolean>`CASE WHEN ${nutritionFoodPortions.source} LIKE 'catalog:%' THEN true ELSE ${nutritionFoodPortions.sourceModified} END`,
        updatedAt: new Date(),
      }).where(and(eq(nutritionFoodPortions.id, id), eq(nutritionFoodPortions.userId, req.session.userId!))).returning();
      if (!updated) return null;
      await tx.update(nutritionFoods).set({
        catalogSourceModified: sql<boolean>`CASE WHEN ${nutritionFoods.catalogProviderId} IS NOT NULL THEN true ELSE ${nutritionFoods.catalogSourceModified} END`, updatedAt: new Date(),
      }).where(and(eq(nutritionFoods.id, updated.foodId), eq(nutritionFoods.userId, req.session.userId!)));
      return updated;
    });
    return portion ? res.json({ portion }) : res.status(404).json({ error: "Food portion not found." });
  });

  app.delete("/api/nutrition/food-portions/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid food portion." });
    const portion = await db.transaction(async (tx) => {
      const [deleted] = await tx.delete(nutritionFoodPortions).where(and(eq(nutritionFoodPortions.id, id), eq(nutritionFoodPortions.userId, req.session.userId!))).returning({ id: nutritionFoodPortions.id, foodId: nutritionFoodPortions.foodId });
      if (!deleted) return null;
      await tx.update(nutritionFoods).set({
        catalogSourceModified: sql<boolean>`CASE WHEN ${nutritionFoods.catalogProviderId} IS NOT NULL THEN true ELSE ${nutritionFoods.catalogSourceModified} END`, updatedAt: new Date(),
      }).where(and(eq(nutritionFoods.id, deleted.foodId), eq(nutritionFoods.userId, req.session.userId!)));
      return deleted;
    });
    return portion ? res.status(204).send() : res.status(404).json({ error: "Food portion not found." });
  });

  app.get("/api/nutrition/recipes", isAuthenticated, async (req: Request, res: Response) => {
    const userId = req.session.userId!;
    const recipes = await db.select().from(nutritionRecipes).where(eq(nutritionRecipes.userId, userId)).orderBy(asc(nutritionRecipes.name));
    if (!recipes.length) return res.json({ recipes: [] });
    const ingredients = await db.select().from(nutritionRecipeIngredients).where(inArray(nutritionRecipeIngredients.recipeId, recipes.map((recipe) => recipe.id)));
    const foods = await db.select({ id: nutritionFoods.id, name: nutritionFoods.name, brand: nutritionFoods.brand }).from(nutritionFoods).where(eq(nutritionFoods.userId, userId));
    const revisions = await db.select().from(nutritionRecipeRevisions).where(and(eq(nutritionRecipeRevisions.userId, userId), inArray(nutritionRecipeRevisions.recipeId, recipes.map((recipe) => recipe.id))));
    return res.json({ recipes: recipes.map((recipe) => { const recipeRevisions = revisions.filter((revision) => revision.recipeId === recipe.id); return { ...recipe, revisionCount: recipeRevisions.length, currentRevision: Math.max(0, ...recipeRevisions.map((revision) => revision.revisionNumber)), ingredients: ingredients.filter((ingredient) => ingredient.recipeId === recipe.id).map((ingredient) => ({ ...ingredient, food: foods.find((food) => food.id === ingredient.foodId) || null })) }; }) });
  });

  app.post("/api/nutrition/recipes", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = recipeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid recipe.", details: parsed.error.flatten() });
    const userId = req.session.userId!;
    const ownedFoods = await db.select({ id: nutritionFoods.id }).from(nutritionFoods).where(and(eq(nutritionFoods.userId, userId), inArray(nutritionFoods.id, parsed.data.ingredients.map((ingredient) => ingredient.foodId))));
    if (ownedFoods.length !== parsed.data.ingredients.length) return res.status(400).json({ error: "A recipe ingredient is unavailable." });
    const recipe = await db.transaction(async (tx) => {
      const [created] = await tx.insert(nutritionRecipes).values({ userId, name: parsed.data.name, servings: parsed.data.servings, folder: parsed.data.folder || null, note: parsed.data.note || null }).returning();
      const ingredients = await tx.insert(nutritionRecipeIngredients).values(parsed.data.ingredients.map((ingredient, sortOrder) => ({ ...ingredient, recipeId: created.id, sortOrder }))).returning();
      await tx.insert(nutritionRecipeRevisions).values({ userId, recipeId: created.id, revisionNumber: 1, name: created.name, servings: created.servings, folder: created.folder, note: created.note, ingredientsSnapshot: ingredients.map(({ foodId, grams, sortOrder }) => ({ foodId, grams, sortOrder })) });
      return { ...created, ingredients };
    });
    return res.status(201).json({ recipe });
  });

  app.patch("/api/nutrition/recipes/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const parsed = recipeSchema.safeParse(req.body);
    if (!Number.isInteger(id) || !parsed.success) return res.status(400).json({ error: "Invalid recipe.", details: parsed.success ? undefined : parsed.error.flatten() });
    const userId = req.session.userId!;
    const expectedRevision = parseExpectedResourceRevision(req.header("x-lyfeos-expected-revision"));
    if (!expectedRevision.ok) return res.status(expectedRevision.reason === "missing" ? 428 : 400).json({ error: expectedRevision.reason === "missing" ? "Reload this recipe before saving changes." : "Invalid expected recipe revision." });
    const ownedFoods = await db.select({ id: nutritionFoods.id }).from(nutritionFoods).where(and(eq(nutritionFoods.userId, userId), inArray(nutritionFoods.id, parsed.data.ingredients.map((ingredient) => ingredient.foodId))));
    if (ownedFoods.length !== parsed.data.ingredients.length) return res.status(400).json({ error: "A recipe ingredient is unavailable." });
    const outcome = await db.transaction(async (tx) => {
      const locked = await tx.execute(sql`SELECT id FROM nutrition_recipes WHERE id = ${id} AND user_id = ${userId} FOR UPDATE`);
      if (!locked.rows.length) return { kind: "missing" } as const;
      const [latest] = await tx.select({ revisionNumber: nutritionRecipeRevisions.revisionNumber }).from(nutritionRecipeRevisions).where(and(eq(nutritionRecipeRevisions.recipeId, id), eq(nutritionRecipeRevisions.userId, userId))).orderBy(desc(nutritionRecipeRevisions.revisionNumber)).limit(1);
      const currentRevision = latest?.revisionNumber || 0;
      if (expectedRevision.revision !== currentRevision) return { kind: "conflict", currentRevision } as const;
      const [updated] = await tx.update(nutritionRecipes).set({ name: parsed.data.name, servings: parsed.data.servings, folder: parsed.data.folder || null, note: parsed.data.note || null, updatedAt: new Date() })
        .where(and(eq(nutritionRecipes.id, id), eq(nutritionRecipes.userId, userId))).returning();
      if (!updated) return { kind: "missing" } as const;
      await tx.delete(nutritionRecipeIngredients).where(eq(nutritionRecipeIngredients.recipeId, updated.id));
      const ingredients = await tx.insert(nutritionRecipeIngredients).values(parsed.data.ingredients.map((ingredient, sortOrder) => ({ ...ingredient, recipeId: updated.id, sortOrder }))).returning();
      const nextRevision = currentRevision + 1;
      await tx.insert(nutritionRecipeRevisions).values({ userId, recipeId: updated.id, revisionNumber: nextRevision, name: updated.name, servings: updated.servings, folder: updated.folder, note: updated.note, ingredientsSnapshot: ingredients.map(({ foodId, grams, sortOrder }) => ({ foodId, grams, sortOrder })) });
      return { kind: "updated", recipe: { ...updated, currentRevision: nextRevision, ingredients } } as const;
    });
    if (outcome.kind === "missing") return res.status(404).json({ error: "Recipe not found." });
    if (outcome.kind === "conflict") return res.status(409).json({ error: "This recipe changed after you opened it. Reload it before saving another version.", currentRevision: outcome.currentRevision });
    return res.json({ recipe: outcome.recipe });
  });

  app.delete("/api/nutrition/recipes/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid recipe." });
    const [recipe] = await db.delete(nutritionRecipes).where(and(eq(nutritionRecipes.id, id), eq(nutritionRecipes.userId, req.session.userId!))).returning({ id: nutritionRecipes.id });
    return recipe ? res.status(204).send() : res.status(404).json({ error: "Recipe not found." });
  });

  app.get("/api/nutrition/recipes/:id/revisions", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id); const userId = req.session.userId!;
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid recipe." });
    const [recipe] = await db.select({ id: nutritionRecipes.id }).from(nutritionRecipes).where(and(eq(nutritionRecipes.id, id), eq(nutritionRecipes.userId, userId))).limit(1);
    if (!recipe) return res.status(404).json({ error: "Recipe not found." });
    const revisions = await db.select().from(nutritionRecipeRevisions).where(and(eq(nutritionRecipeRevisions.recipeId, id), eq(nutritionRecipeRevisions.userId, userId))).orderBy(desc(nutritionRecipeRevisions.revisionNumber));
    return res.json({ revisions, disclosure: "Revisions preserve prior planned recipe composition. Factual diary entries separately retain the nutrient snapshots recorded when logged." });
  });

  app.post("/api/nutrition/recipes/:id/revisions/:revisionNumber/restore", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const revisionNumber = Number(req.params.revisionNumber);
    if (!Number.isInteger(id) || !Number.isInteger(revisionNumber) || revisionNumber < 1) return res.status(400).json({ error: "Invalid recipe revision." });
    const userId = req.session.userId!;
    const expectedRevision = parseExpectedResourceRevision(req.header("x-lyfeos-expected-revision"));
    if (!expectedRevision.ok) return res.status(expectedRevision.reason === "missing" ? 428 : 400).json({ error: expectedRevision.reason === "missing" ? "Reload this recipe before restoring a version." : "Invalid expected recipe revision." });
    const outcome = await db.transaction(async (tx) => {
      const locked = await tx.execute(sql`SELECT id FROM nutrition_recipes WHERE id = ${id} AND user_id = ${userId} FOR UPDATE`);
      if (!locked.rows.length) return { state: "missing" as const };
      const [revision] = await tx.select().from(nutritionRecipeRevisions).where(and(eq(nutritionRecipeRevisions.recipeId, id), eq(nutritionRecipeRevisions.userId, userId), eq(nutritionRecipeRevisions.revisionNumber, revisionNumber))).limit(1);
      if (!revision) return { state: "missing" as const };
      const [latest] = await tx.select({ revisionNumber: nutritionRecipeRevisions.revisionNumber }).from(nutritionRecipeRevisions).where(and(eq(nutritionRecipeRevisions.recipeId, id), eq(nutritionRecipeRevisions.userId, userId))).orderBy(desc(nutritionRecipeRevisions.revisionNumber)).limit(1);
      const currentRevision = latest?.revisionNumber || 0;
      if (expectedRevision.revision !== currentRevision) return { state: "conflict" as const, currentRevision };
      const snapshot = recipeRevisionIngredientsSchema.safeParse(revision.ingredientsSnapshot);
      if (!snapshot.success) return { state: "invalid" as const };
      const foodIds = snapshot.data.map((ingredient) => ingredient.foodId);
      const ownedFoods = await tx.select({ id: nutritionFoods.id }).from(nutritionFoods).where(and(eq(nutritionFoods.userId, userId), inArray(nutritionFoods.id, foodIds)));
      if (new Set(ownedFoods.map((food) => food.id)).size !== new Set(foodIds).size) return { state: "unavailable" as const };
      const [updated] = await tx.update(nutritionRecipes).set({
        name: revision.name, servings: revision.servings, folder: revision.folder, note: revision.note, updatedAt: new Date(),
      }).where(and(eq(nutritionRecipes.id, id), eq(nutritionRecipes.userId, userId))).returning();
      await tx.delete(nutritionRecipeIngredients).where(eq(nutritionRecipeIngredients.recipeId, id));
      await tx.insert(nutritionRecipeIngredients).values(snapshot.data.map((ingredient) => ({ recipeId: id, ...ingredient })));
      const nextRevision = currentRevision + 1;
      const [restoredRevision] = await tx.insert(nutritionRecipeRevisions).values({
        userId, recipeId: id, revisionNumber: nextRevision, name: updated.name, servings: updated.servings,
        folder: updated.folder, note: updated.note, ingredientsSnapshot: snapshot.data,
      }).returning();
      return { state: "restored" as const, recipe: updated, restoredRevision };
    });
    if (outcome.state === "missing") return res.status(404).json({ error: "Recipe revision not found." });
    if (outcome.state === "conflict") return res.status(409).json({ error: "This recipe changed after you opened it. Reload it before restoring another version.", currentRevision: outcome.currentRevision });
    if (outcome.state === "unavailable") return res.status(409).json({ error: "This revision references a private food that no longer exists. Nothing was changed." });
    if (outcome.state === "invalid") return res.status(409).json({ error: "This historical revision cannot be safely restored. Nothing was changed." });
    return res.status(201).json({ ...outcome, disclosure: "The selected composition was restored as a new version. Prior revisions and factual diary snapshots were not rewritten." });
  });

  app.post("/api/nutrition/recipes/:id/log", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const parsed = logRecipeSchema.safeParse(req.body);
    if (!Number.isInteger(id) || !parsed.success) return res.status(400).json({ error: "Invalid recipe diary entry.", details: parsed.success ? undefined : parsed.error.flatten() });
    const userId = req.session.userId!;
    const [recipe] = await db.select().from(nutritionRecipes).where(and(eq(nutritionRecipes.id, id), eq(nutritionRecipes.userId, userId))).limit(1);
    if (!recipe) return res.status(404).json({ error: "Recipe not found." });
    const occurredAt = parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) return res.status(400).json({ error: "Invalid diary time." });
    const ingredients = await db.select().from(nutritionRecipeIngredients).where(eq(nutritionRecipeIngredients.recipeId, recipe.id));
    const snapshots = await nutrientSnapshots(ingredients.map((ingredient) => ingredient.foodId));
    const timeContext = requestTimeContext(req, occurredAt);
    const entries = await db.transaction(async (tx) => {
      const entries = await tx.insert(nutritionDiaryEntries).values(ingredients.map((ingredient) => ({ userId, foodId: ingredient.foodId, servingGrams: ingredient.grams * (parsed.data.servings / recipe.servings), inputQuantity: null, inputUnit: null, nutrientSnapshot: snapshots.get(ingredient.foodId) || [], mealSlot: parsed.data.mealSlot, occurredAt, note: parsed.data.note || `Recipe: ${recipe.name}`, recordedTimeZone: timeContext.timeZone, recordedUtcOffsetMinutes: timeContext.utcOffsetMinutes }))).returning();
      return entries;
    });
    return res.status(201).json({ entries });
  });

  app.get("/api/nutrition/diary", isAuthenticated, async (req: Request, res: Response) => {
    const { timeZone } = requestTimeContext(req);
    const date = localDate(req.query.date) || dateInTimeZone(new Date(), timeZone);
    return res.json({ date, timeZone, ...(await diaryForDate(req.session.userId!, date, timeZone)) });
  });

  app.get("/api/nutrition/trends", isAuthenticated, async (req: Request, res: Response) => {
    const days = nutritionReportDays(req.query.days);
    const { timeZone } = requestTimeContext(req);
    const endDate = dateInTimeZone(new Date(), timeZone);
    const startDay = new Date(`${endDate}T00:00:00.000Z`); startDay.setUTCDate(startDay.getUTCDate() - (days - 1));
    const startDate = startDay.toISOString().slice(0, 10);
    const previousStartDay = new Date(`${startDate}T00:00:00.000Z`); previousStartDay.setUTCDate(previousStartDay.getUTCDate() - days);
    const previousStartDate = previousStartDay.toISOString().slice(0, 10);
    const previousEndDay = new Date(`${startDate}T00:00:00.000Z`); previousEndDay.setUTCDate(previousEndDay.getUTCDate() - 1);
    const previousEndDate = previousEndDay.toISOString().slice(0, 10);
    const { start } = dayBounds(previousStartDate, timeZone);
    const { end } = dayBounds(endDate, timeZone);
    const entries = await db.select({
      id: nutritionDiaryEntries.id, foodId: nutritionDiaryEntries.foodId, occurredAt: nutritionDiaryEntries.occurredAt,
      servingGrams: nutritionDiaryEntries.servingGrams, nutrientSnapshot: nutritionDiaryEntries.nutrientSnapshot,
    }).from(nutritionDiaryEntries).where(and(eq(nutritionDiaryEntries.userId, req.session.userId!), gte(nutritionDiaryEntries.occurredAt, start), lt(nutritionDiaryEntries.occurredAt, end)));
    const fallbackSnapshots = await nutrientSnapshots(entries.filter((entry) => asNutrientSnapshot(entry.nutrientSnapshot).length === 0).map((entry) => entry.foodId));
    const rows = entries.flatMap((entry) => {
      const snapshot = asNutrientSnapshot(entry.nutrientSnapshot);
      return (snapshot.length ? snapshot : (fallbackSnapshots.get(entry.foodId) || [])).map((nutrient) => ({ entryId: entry.id, occurredAt: entry.occurredAt, servingGrams: entry.servingGrams, ...nutrient }));
    });
    const trend = nutritionTrend(rows, startDate, days, (value) => dateInTimeZone(value, timeZone));
    const previousTrend = nutritionTrend(rows, previousStartDate, days, (value) => dateInTimeZone(value, timeZone));
    return res.json({
      days, timeZone, trend,
      comparison: { periods: { current: { startDate, endDate }, previous: { startDate: previousStartDate, endDate: previousEndDate } }, ...nutritionPeriodComparison(trend, previousTrend) },
      disclosure: "This history summarizes only the food and nutrient values you recorded. A missing value means no recorded value, not zero intake. Period comparison shows separate recorded totals, recorded-day averages, diary days, and coverage; it does not infer adherence, health, benefit, or harm.",
    });
  });

  app.get("/api/nutrition/reports/daily.csv", isAuthenticated, async (req: Request, res: Response) => {
    const days = nutritionReportDays(req.query.days);
    const { timeZone } = requestTimeContext(req);
    const endDate = dateInTimeZone(new Date(), timeZone);
    const startDay = new Date(`${endDate}T00:00:00.000Z`); startDay.setUTCDate(startDay.getUTCDate() - (days - 1));
    const startDate = startDay.toISOString().slice(0, 10);
    const { start } = dayBounds(startDate, timeZone);
    const { end } = dayBounds(endDate, timeZone);
    const entries = await db.select({
      id: nutritionDiaryEntries.id,
      occurredAt: nutritionDiaryEntries.occurredAt,
      servingGrams: nutritionDiaryEntries.servingGrams,
      nutrientSnapshot: nutritionDiaryEntries.nutrientSnapshot,
    }).from(nutritionDiaryEntries).where(and(eq(nutritionDiaryEntries.userId, req.session.userId!), gte(nutritionDiaryEntries.occurredAt, start), lt(nutritionDiaryEntries.occurredAt, end)));
    const rows = nutritionDailyReport(entries.map((entry) => ({
      entryId: entry.id,
      occurredAt: entry.occurredAt,
      servingGrams: entry.servingGrams,
      nutrients: asNutrientSnapshot(entry.nutrientSnapshot),
    })), startDate, days, (value) => dateInTimeZone(value, timeZone));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="lyfeos-nutrition-${endDate}-${days}d.csv"`);
    res.setHeader("Cache-Control", "private, no-store");
    return res.send(nutritionDailyReportCsv(rows));
  });

  app.get("/api/nutrition/contributions", isAuthenticated, async (req: Request, res: Response) => {
    const days = nutritionReportDays(req.query.days);
    const { timeZone } = requestTimeContext(req);
    const endDate = dateInTimeZone(new Date(), timeZone);
    const startDay = new Date(`${endDate}T00:00:00.000Z`); startDay.setUTCDate(startDay.getUTCDate() - (days - 1));
    const { start } = dayBounds(startDay.toISOString().slice(0, 10), timeZone);
    const { end } = dayBounds(endDate, timeZone);
    const entries = await db.select({
      id: nutritionDiaryEntries.id, foodId: nutritionDiaryEntries.foodId, foodName: nutritionFoods.name,
      servingGrams: nutritionDiaryEntries.servingGrams, nutrientSnapshot: nutritionDiaryEntries.nutrientSnapshot,
    }).from(nutritionDiaryEntries).innerJoin(nutritionFoods, eq(nutritionDiaryEntries.foodId, nutritionFoods.id))
      .where(and(eq(nutritionDiaryEntries.userId, req.session.userId!), gte(nutritionDiaryEntries.occurredAt, start), lt(nutritionDiaryEntries.occurredAt, end)));
    const fallbackSnapshots = await nutrientSnapshots(entries.filter((entry) => asNutrientSnapshot(entry.nutrientSnapshot).length === 0).map((entry) => entry.foodId));
    return res.json({
      days, timeZone,
      totalEntries: entries.length,
      nutrients: nutritionContributions(entries.map((entry) => {
        const snapshot = asNutrientSnapshot(entry.nutrientSnapshot);
        return {
          entryId: entry.id,
          foodId: entry.foodId,
          foodName: entry.foodName,
          servingGrams: entry.servingGrams,
          nutrients: snapshot.length ? snapshot : (fallbackSnapshots.get(entry.foodId) || []),
        };
      })),
      disclosure: "Food contributions use only recorded diary nutrient values. Missing coverage means unknown data, not zero intake, deficiency, benefit, harm, or a health conclusion.",
    });
  });

  app.post("/api/nutrition/diary/copy-day", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = copyDiaryDaySchema.safeParse(req.body);
    if (!parsed.success || parsed.data.sourceDate === parsed.data.targetDate) return res.status(400).json({ error: "Choose two different valid calendar days." });
    const userId = req.session.userId!;
    const timeContext = requestTimeContext(req);
    const { start: sourceStart, end: sourceEnd } = dayBounds(parsed.data.sourceDate, timeContext.timeZone);
    const { start: targetStart, end: targetEnd } = dayBounds(parsed.data.targetDate, timeContext.timeZone);
    const [sourceEntries, targetEntries] = await Promise.all([
      db.select().from(nutritionDiaryEntries).where(and(eq(nutritionDiaryEntries.userId, userId), gte(nutritionDiaryEntries.occurredAt, sourceStart), lt(nutritionDiaryEntries.occurredAt, sourceEnd))),
      db.select({ id: nutritionDiaryEntries.id }).from(nutritionDiaryEntries).where(and(eq(nutritionDiaryEntries.userId, userId), gte(nutritionDiaryEntries.occurredAt, targetStart), lt(nutritionDiaryEntries.occurredAt, targetEnd))).limit(1),
    ]);
    if (!sourceEntries.length) return res.status(404).json({ error: "There are no diary entries to copy from that day." });
    if (targetEntries.length) return res.status(409).json({ error: "That day already has diary entries. Copying is intentionally blocked to prevent duplicates." });
    const copiedAt = copyToDate(sourceEntries[0].occurredAt, parsed.data.targetDate, timeContext.timeZone);
    const recordTimeContext = requestTimeContext(req, copiedAt);
    const entries = await db.insert(nutritionDiaryEntries).values(sourceEntries.map((entry) => ({
      userId, foodId: entry.foodId, servingGrams: entry.servingGrams, inputQuantity: entry.inputQuantity, inputUnit: entry.inputUnit, inputPortionId: entry.inputPortionId, inputUnitLabel: entry.inputUnitLabel, inputGramsPerUnit: entry.inputGramsPerUnit, nutrientSnapshot: entry.nutrientSnapshot, mealSlot: entry.mealSlot,
      occurredAt: copyToDate(entry.occurredAt, parsed.data.targetDate, timeContext.timeZone), note: entry.note, recordedTimeZone: recordTimeContext.timeZone, recordedUtcOffsetMinutes: recordTimeContext.utcOffsetMinutes,
    }))).returning();
    return res.status(201).json({ sourceDate: parsed.data.sourceDate, targetDate: parsed.data.targetDate, entries });
  });

  app.post("/api/nutrition/diary/copy-meal", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = copyDiaryMealSchema.safeParse(req.body);
    if (!parsed.success || (parsed.data.sourceDate === parsed.data.targetDate && parsed.data.sourceMealSlot === parsed.data.targetMealSlot)) return res.status(400).json({ error: "Choose a different source and target meal." });
    const userId = req.session.userId!;
    const timeContext = requestTimeContext(req);
    const { start: sourceStart, end: sourceEnd } = dayBounds(parsed.data.sourceDate, timeContext.timeZone);
    const { start: targetStart, end: targetEnd } = dayBounds(parsed.data.targetDate, timeContext.timeZone);
    const [sourceEntries, targetEntries] = await Promise.all([
      db.select().from(nutritionDiaryEntries).where(and(
        eq(nutritionDiaryEntries.userId, userId), eq(nutritionDiaryEntries.mealSlot, parsed.data.sourceMealSlot),
        gte(nutritionDiaryEntries.occurredAt, sourceStart), lt(nutritionDiaryEntries.occurredAt, sourceEnd),
      )),
      db.select({ id: nutritionDiaryEntries.id }).from(nutritionDiaryEntries).where(and(
        eq(nutritionDiaryEntries.userId, userId), eq(nutritionDiaryEntries.mealSlot, parsed.data.targetMealSlot),
        gte(nutritionDiaryEntries.occurredAt, targetStart), lt(nutritionDiaryEntries.occurredAt, targetEnd),
      )).limit(1),
    ]);
    if (!sourceEntries.length) return res.status(404).json({ error: "The source meal has no diary entries." });
    if (targetEntries.length) return res.status(409).json({ error: "The target meal already has entries. Copying is blocked to prevent duplicates." });
    const copiedAt = copyToDate(sourceEntries[0].occurredAt, parsed.data.targetDate, timeContext.timeZone);
    const recordTimeContext = requestTimeContext(req, copiedAt);
    const entries = await db.insert(nutritionDiaryEntries).values(sourceEntries.map((entry) => ({
      userId, foodId: entry.foodId, servingGrams: entry.servingGrams, inputQuantity: entry.inputQuantity, inputUnit: entry.inputUnit, inputPortionId: entry.inputPortionId, inputUnitLabel: entry.inputUnitLabel, inputGramsPerUnit: entry.inputGramsPerUnit,
      nutrientSnapshot: entry.nutrientSnapshot, mealSlot: parsed.data.targetMealSlot,
      occurredAt: copyToDate(entry.occurredAt, parsed.data.targetDate, timeContext.timeZone), note: entry.note, recordedTimeZone: recordTimeContext.timeZone, recordedUtcOffsetMinutes: recordTimeContext.utcOffsetMinutes,
    }))).returning();
    return res.status(201).json({ sourceDate: parsed.data.sourceDate, targetDate: parsed.data.targetDate, sourceMealSlot: parsed.data.sourceMealSlot, targetMealSlot: parsed.data.targetMealSlot, entries });
  });

  app.post("/api/nutrition/diary", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = diarySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid diary entry.", details: parsed.error.flatten() });
    const userId = req.session.userId!;
    const rawMutationId = req.header("x-lyfeos-mutation-id");
    const clientMutationId = healthMutationId(rawMutationId);
    if (rawMutationId && !clientMutationId) return res.status(400).json({ error: "Invalid mutation identity." });
    const mutationPayloadHash = clientMutationId ? healthMutationPayloadHash(parsed.data) : null;
    if (clientMutationId) {
      const [existing] = await db.select().from(nutritionDiaryEntries).where(and(eq(nutritionDiaryEntries.userId, userId), eq(nutritionDiaryEntries.clientMutationId, clientMutationId))).limit(1);
      if (existing) return existing.mutationPayloadHash === mutationPayloadHash
        ? res.json({ entry: existing, replayed: true })
        : res.status(409).json({ error: "This mutation identity was already used for a different diary entry." });
    }
    const [food] = await db.select({ id: nutritionFoods.id, servingSizeGrams: nutritionFoods.servingSizeGrams, densityGramsPerMl: nutritionFoods.densityGramsPerMl }).from(nutritionFoods).where(and(eq(nutritionFoods.id, parsed.data.foodId), eq(nutritionFoods.userId, userId))).limit(1);
    if (!food) return res.status(404).json({ error: "Food not found." });
    const occurredAt = parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) return res.status(400).json({ error: "Invalid diary time." });
    const inputUnit = parsed.data.inputUnit || "g";
    const inputQuantity = parsed.data.quantity ?? parsed.data.servingGrams!;
    const conversion = await conversionEvidence(userId, food, inputUnit, parsed.data.portionId);
    if (!conversion) return res.status(400).json({ error: "This food is missing the selected density or portion conversion." });
    const servingGrams = parsed.data.quantity != null ? nutritionGramsFromInput(parsed.data.quantity, inputUnit, food.servingSizeGrams, conversion.gramsPerUnit) : parsed.data.servingGrams!;
    const snapshot = (await nutrientSnapshots([food.id])).get(food.id) || [];
    try {
      const timeContext = requestTimeContext(req, occurredAt);
      const [entry] = await db.insert(nutritionDiaryEntries).values({ userId, foodId: food.id, servingGrams, inputQuantity, inputUnit, inputPortionId: parsed.data.portionId || null, inputUnitLabel: conversion.label, inputGramsPerUnit: conversion.gramsPerUnit, clientMutationId, mutationPayloadHash, nutrientSnapshot: snapshot, mealSlot: parsed.data.mealSlot, occurredAt, note: parsed.data.note || null, recordedTimeZone: timeContext.timeZone, recordedUtcOffsetMinutes: timeContext.utcOffsetMinutes }).returning();
      return res.status(201).json({ entry, replayed: false });
    } catch (error) {
      if (!clientMutationId) throw error;
      const [existing] = await db.select().from(nutritionDiaryEntries).where(and(eq(nutritionDiaryEntries.userId, userId), eq(nutritionDiaryEntries.clientMutationId, clientMutationId))).limit(1);
      if (!existing) throw error;
      return existing.mutationPayloadHash === mutationPayloadHash
        ? res.json({ entry: existing, replayed: true })
        : res.status(409).json({ error: "This mutation identity was already used for a different diary entry." });
    }
  });

  app.patch("/api/nutrition/diary/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const parsed = diaryUpdateSchema.safeParse(req.body);
    if (!Number.isInteger(id) || !parsed.success) return res.status(400).json({ error: "Invalid diary entry.", details: parsed.success ? undefined : parsed.error.flatten() });
    const [owned] = await db.select({ id: nutritionDiaryEntries.id, foodId: nutritionFoods.id, servingSizeGrams: nutritionFoods.servingSizeGrams, densityGramsPerMl: nutritionFoods.densityGramsPerMl })
      .from(nutritionDiaryEntries).innerJoin(nutritionFoods, eq(nutritionDiaryEntries.foodId, nutritionFoods.id))
      .where(and(eq(nutritionDiaryEntries.id, id), eq(nutritionDiaryEntries.userId, req.session.userId!))).limit(1);
    if (!owned) return res.status(404).json({ error: "Diary entry not found." });
    const conversion = await conversionEvidence(req.session.userId!, owned, parsed.data.inputUnit, parsed.data.portionId);
    if (!conversion) return res.status(400).json({ error: "This food is missing the selected density or portion conversion." });
    const servingGrams = nutritionGramsFromInput(parsed.data.quantity, parsed.data.inputUnit, owned.servingSizeGrams, conversion.gramsPerUnit);
    const [entry] = await db.update(nutritionDiaryEntries).set({
      servingGrams, inputQuantity: parsed.data.quantity, inputUnit: parsed.data.inputUnit, inputPortionId: parsed.data.portionId || null, inputUnitLabel: conversion.label, inputGramsPerUnit: conversion.gramsPerUnit,
      mealSlot: parsed.data.mealSlot, note: parsed.data.note === undefined ? undefined : (parsed.data.note || null),
    }).where(and(eq(nutritionDiaryEntries.id, id), eq(nutritionDiaryEntries.userId, req.session.userId!))).returning();
    return res.json({ entry });
  });

  app.delete("/api/nutrition/diary/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid diary entry." });
    const userId = req.session.userId!;
    const deleted = await db.transaction(async (tx) => {
      const [entry] = await tx.select().from(nutritionDiaryEntries).where(and(eq(nutritionDiaryEntries.id, id), eq(nutritionDiaryEntries.userId, userId))).limit(1);
      if (!entry) return null;
      const receiptId = newDeletionReceiptId();
      const expiresAt = deletionReceiptExpiry();
      await tx.insert(healthDeletionReceipts).values({ id: receiptId, userId, resourceType: "nutrition_diary_entry", resourceSnapshot: entry, expiresAt });
      await tx.delete(nutritionDiaryEntries).where(and(eq(nutritionDiaryEntries.id, id), eq(nutritionDiaryEntries.userId, userId)));
      return { receiptId, expiresAt };
    });
    return deleted ? res.json(deleted) : res.status(404).json({ error: "Diary entry not found." });
  });

  app.post("/api/nutrition/diary/deletions/:receiptId/restore", isAuthenticated, async (req: Request, res: Response) => {
    const receiptId = String(req.params.receiptId || "");
    const userId = req.session.userId!;
    const restored = await db.transaction(async (tx) => {
      const [receipt] = await tx.select().from(healthDeletionReceipts).where(and(eq(healthDeletionReceipts.id, receiptId), eq(healthDeletionReceipts.userId, userId), eq(healthDeletionReceipts.resourceType, "nutrition_diary_entry"))).limit(1);
      if (!receipt || receipt.restoredAt || receipt.expiresAt.getTime() <= Date.now()) return null;
      const snapshot = receipt.resourceSnapshot as typeof nutritionDiaryEntries.$inferSelect;
      const [food] = await tx.select({ id: nutritionFoods.id }).from(nutritionFoods).where(and(eq(nutritionFoods.id, snapshot.foodId), eq(nutritionFoods.userId, userId))).limit(1);
      if (!food) return null;
      const [entry] = await tx.insert(nutritionDiaryEntries).values({
        userId, foodId: snapshot.foodId, servingGrams: snapshot.servingGrams, inputQuantity: snapshot.inputQuantity,
        inputUnit: snapshot.inputUnit, inputPortionId: snapshot.inputPortionId, inputUnitLabel: snapshot.inputUnitLabel,
        inputGramsPerUnit: snapshot.inputGramsPerUnit, clientMutationId: null, mutationPayloadHash: null,
        nutrientSnapshot: snapshot.nutrientSnapshot, mealSlot: snapshot.mealSlot, occurredAt: new Date(snapshot.occurredAt), note: snapshot.note, recordedTimeZone: snapshot.recordedTimeZone, recordedUtcOffsetMinutes: snapshot.recordedUtcOffsetMinutes,
      }).returning();
      const [claimed] = await tx.update(healthDeletionReceipts).set({ restoredAt: new Date() }).where(and(eq(healthDeletionReceipts.id, receiptId), eq(healthDeletionReceipts.userId, userId), isNull(healthDeletionReceipts.restoredAt))).returning({ id: healthDeletionReceipts.id });
      if (!claimed) throw new Error("Deletion receipt was already restored.");
      return entry;
    });
    return restored ? res.status(201).json({ entry: restored }) : res.status(410).json({ error: "This undo is unavailable, expired, or already used." });
  });
}
