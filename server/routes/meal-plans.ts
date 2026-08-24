import type { Express, Request, Response } from "express";
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import { nutritionDiaryEntries, nutritionFoodNutrients, nutritionFoods, nutritionMealPlanEntries, nutritionMealPlans, nutritionRecipeIngredients, nutritionRecipes } from "@shared/schema";
import { db } from "../db";
import { nutritionGramsFromInput } from "../nutrition";
import { isAuthenticated } from "./middleware";
import { dateInTimeZone, dayBounds, requestTimeContext, zonedDateTime } from "../health-fitness";
import { summarizeMealPlanActual } from "../meal-plan-report";

const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const mealSlotSchema = z.enum(["breakfast", "lunch", "dinner", "snack", "other"]);
const planSchema = z.object({
  name: z.string().trim().min(1).max(160), startDate: daySchema, endDate: daySchema,
  note: z.string().trim().max(1000).nullable().optional(),
}).refine((value) => value.endDate >= value.startDate, { message: "Plan end date cannot precede its start date." });
const duplicatePlanSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(), startDate: daySchema,
});
const entrySchema = z.object({
  scheduledDate: daySchema, mealSlot: mealSlotSchema,
  foodId: z.number().int().positive().nullable().optional(), recipeId: z.number().int().positive().nullable().optional(),
  quantity: z.number().positive().max(100_000), inputUnit: z.enum(["g", "serving", "recipe_serving"]),
  note: z.string().trim().max(500).nullable().optional(),
}).superRefine((value, context) => {
  if (Boolean(value.foodId) === Boolean(value.recipeId)) context.addIssue({ code: z.ZodIssueCode.custom, message: "Choose exactly one food or recipe." });
  if (value.foodId && value.inputUnit === "recipe_serving") context.addIssue({ code: z.ZodIssueCode.custom, message: "A food cannot use recipe servings." });
  if (value.recipeId && value.inputUnit !== "recipe_serving") context.addIssue({ code: z.ZodIssueCode.custom, message: "A recipe must use recipe servings." });
});

async function snapshots(foodIds: number[]) {
  if (!foodIds.length) return new Map<number, Array<{ nutrientKey: string; amountPer100g: number; unit: string }>>();
  const rows = await db.select().from(nutritionFoodNutrients).where(inArray(nutritionFoodNutrients.foodId, foodIds));
  const result = new Map<number, Array<{ nutrientKey: string; amountPer100g: number; unit: string }>>();
  for (const row of rows) result.set(row.foodId, [...(result.get(row.foodId) || []), { nutrientKey: row.nutrientKey, amountPer100g: row.amountPer100g, unit: row.unit }]);
  return result;
}

async function ownedEntry(userId: number, id: number) {
  const [entry] = await db.select().from(nutritionMealPlanEntries).where(and(eq(nutritionMealPlanEntries.id, id), eq(nutritionMealPlanEntries.userId, userId))).limit(1);
  return entry;
}

function calendarDayDifference(later: string, earlier: string): number {
  return Math.round((new Date(`${later}T00:00:00.000Z`).getTime() - new Date(`${earlier}T00:00:00.000Z`).getTime()) / 86_400_000);
}

function shiftedCalendarDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10);
}

export function registerMealPlanRoutes(app: Express): void {
  app.get("/api/nutrition/meal-plans", isAuthenticated, async (req: Request, res: Response) => {
    const userId = req.session.userId!;
    const plans = await db.select().from(nutritionMealPlans).where(eq(nutritionMealPlans.userId, userId)).orderBy(asc(nutritionMealPlans.startDate));
    const entries = plans.length ? await db.select({
      id: nutritionMealPlanEntries.id, userId: nutritionMealPlanEntries.userId, planId: nutritionMealPlanEntries.planId,
      scheduledDate: nutritionMealPlanEntries.scheduledDate, mealSlot: nutritionMealPlanEntries.mealSlot,
      foodId: nutritionMealPlanEntries.foodId, recipeId: nutritionMealPlanEntries.recipeId,
      quantity: nutritionMealPlanEntries.quantity, inputUnit: nutritionMealPlanEntries.inputUnit,
      status: nutritionMealPlanEntries.status, loggedDiaryEntryIds: nutritionMealPlanEntries.loggedDiaryEntryIds,
      note: nutritionMealPlanEntries.note, foodName: nutritionFoods.name, recipeName: nutritionRecipes.name,
    }).from(nutritionMealPlanEntries)
      .leftJoin(nutritionFoods, eq(nutritionMealPlanEntries.foodId, nutritionFoods.id))
      .leftJoin(nutritionRecipes, eq(nutritionMealPlanEntries.recipeId, nutritionRecipes.id))
      .where(and(eq(nutritionMealPlanEntries.userId, userId), inArray(nutritionMealPlanEntries.planId, plans.map((plan) => plan.id))))
      .orderBy(asc(nutritionMealPlanEntries.scheduledDate), asc(nutritionMealPlanEntries.mealSlot)) : [];
    return res.json({ plans: plans.map((plan) => ({ ...plan, entries: entries.filter((entry) => entry.planId === plan.id) })), disclosure: "Meal plans are editable intentions. Only an explicit Log meal action creates factual diary entries." });
  });

  app.post("/api/nutrition/meal-plans", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = planSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid meal plan.", details: parsed.error.flatten() });
    const [plan] = await db.insert(nutritionMealPlans).values({ userId: req.session.userId!, ...parsed.data, note: parsed.data.note || null }).returning();
    return res.status(201).json({ plan });
  });

  app.post("/api/nutrition/meal-plans/:id/duplicate", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id); const parsed = duplicatePlanSchema.safeParse(req.body); const userId = req.session.userId!;
    if (!Number.isInteger(id) || !parsed.success) return res.status(400).json({ error: "Invalid meal-plan duplication request." });
    const [source] = await db.select().from(nutritionMealPlans).where(and(eq(nutritionMealPlans.id, id), eq(nutritionMealPlans.userId, userId))).limit(1);
    if (!source) return res.status(404).json({ error: "Meal plan not found." });
    const sourceEntries = await db.select().from(nutritionMealPlanEntries).where(and(eq(nutritionMealPlanEntries.planId, id), eq(nutritionMealPlanEntries.userId, userId)));
    const durationDays = calendarDayDifference(source.endDate, source.startDate);
    const offsetDays = calendarDayDifference(parsed.data.startDate, source.startDate);
    const duplicated = await db.transaction(async (tx) => {
      const [plan] = await tx.insert(nutritionMealPlans).values({
        userId, name: parsed.data.name || `${source.name} copy`, startDate: parsed.data.startDate,
        endDate: shiftedCalendarDate(parsed.data.startDate, durationDays), note: source.note, status: "active",
      }).returning();
      const entries = sourceEntries.length ? await tx.insert(nutritionMealPlanEntries).values(sourceEntries.map((entry) => ({
        userId, planId: plan.id, scheduledDate: shiftedCalendarDate(entry.scheduledDate, offsetDays), mealSlot: entry.mealSlot,
        foodId: entry.foodId, recipeId: entry.recipeId, quantity: entry.quantity, inputUnit: entry.inputUnit,
        status: "planned", loggedDiaryEntryIds: [], note: entry.note,
      }))).returning() : [];
      return { plan, entries };
    });
    return res.status(201).json({ ...duplicated, disclosure: "The schedule was copied as editable planned intent. Logged or skipped source states and diary links were not copied." });
  });

  app.patch("/api/nutrition/meal-plans/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id); const parsed = planSchema.safeParse(req.body);
    if (!Number.isInteger(id) || !parsed.success) return res.status(400).json({ error: "Invalid meal plan." });
    const [plan] = await db.update(nutritionMealPlans).set({ ...parsed.data, note: parsed.data.note || null, updatedAt: new Date() })
      .where(and(eq(nutritionMealPlans.id, id), eq(nutritionMealPlans.userId, req.session.userId!))).returning();
    return plan ? res.json({ plan }) : res.status(404).json({ error: "Meal plan not found." });
  });

  app.patch("/api/nutrition/meal-plans/:id/archive", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id); const parsed = z.object({ archived: z.boolean() }).safeParse(req.body);
    if (!Number.isInteger(id) || !parsed.success) return res.status(400).json({ error: "Invalid archive state." });
    const [plan] = await db.update(nutritionMealPlans).set({ status: parsed.data.archived ? "archived" : "active", updatedAt: new Date() })
      .where(and(eq(nutritionMealPlans.id, id), eq(nutritionMealPlans.userId, req.session.userId!))).returning();
    return plan ? res.json({ plan }) : res.status(404).json({ error: "Meal plan not found." });
  });

  app.delete("/api/nutrition/meal-plans/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid meal plan." });
    const [plan] = await db.delete(nutritionMealPlans).where(and(eq(nutritionMealPlans.id, id), eq(nutritionMealPlans.userId, req.session.userId!))).returning({ id: nutritionMealPlans.id });
    return plan ? res.status(204).send() : res.status(404).json({ error: "Meal plan not found." });
  });

  app.post("/api/nutrition/meal-plans/:planId/entries", isAuthenticated, async (req: Request, res: Response) => {
    const planId = Number(req.params.planId); const parsed = entrySchema.safeParse(req.body); const userId = req.session.userId!;
    if (!Number.isInteger(planId) || !parsed.success) return res.status(400).json({ error: "Invalid planned meal.", details: parsed.success ? undefined : parsed.error.flatten() });
    const [plan] = await db.select().from(nutritionMealPlans).where(and(eq(nutritionMealPlans.id, planId), eq(nutritionMealPlans.userId, userId))).limit(1);
    if (!plan) return res.status(404).json({ error: "Meal plan not found." });
    if (parsed.data.scheduledDate < plan.startDate || parsed.data.scheduledDate > plan.endDate) return res.status(400).json({ error: "Planned meal must fall inside the plan date range." });
    if (parsed.data.foodId) {
      const [food] = await db.select({ id: nutritionFoods.id }).from(nutritionFoods).where(and(eq(nutritionFoods.id, parsed.data.foodId), eq(nutritionFoods.userId, userId))).limit(1);
      if (!food) return res.status(404).json({ error: "Food not found." });
    } else {
      const [recipe] = await db.select({ id: nutritionRecipes.id }).from(nutritionRecipes).where(and(eq(nutritionRecipes.id, parsed.data.recipeId!), eq(nutritionRecipes.userId, userId))).limit(1);
      if (!recipe) return res.status(404).json({ error: "Recipe not found." });
    }
    const [entry] = await db.insert(nutritionMealPlanEntries).values({ userId, planId, ...parsed.data, foodId: parsed.data.foodId || null, recipeId: parsed.data.recipeId || null, note: parsed.data.note || null }).returning();
    return res.status(201).json({ entry });
  });

  app.patch("/api/nutrition/meal-plan-entries/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id); const parsed = entrySchema.safeParse(req.body); const userId = req.session.userId!;
    if (!Number.isInteger(id) || !parsed.success) return res.status(400).json({ error: "Invalid planned meal." });
    const current = await ownedEntry(userId, id);
    if (!current || current.status === "logged") return res.status(current ? 409 : 404).json({ error: current ? "A logged plan entry is immutable; correct the factual diary instead." : "Planned meal not found." });
    const [entry] = await db.update(nutritionMealPlanEntries).set({ ...parsed.data, foodId: parsed.data.foodId || null, recipeId: parsed.data.recipeId || null, note: parsed.data.note || null, updatedAt: new Date() })
      .where(and(eq(nutritionMealPlanEntries.id, id), eq(nutritionMealPlanEntries.userId, userId))).returning();
    return res.json({ entry });
  });

  app.delete("/api/nutrition/meal-plan-entries/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid planned meal." });
    const current = await ownedEntry(req.session.userId!, id);
    if (!current) return res.status(404).json({ error: "Planned meal not found." });
    if (current.status === "logged") return res.status(409).json({ error: "Delete or correct the factual diary entries instead." });
    await db.delete(nutritionMealPlanEntries).where(and(eq(nutritionMealPlanEntries.id, id), eq(nutritionMealPlanEntries.userId, req.session.userId!)));
    return res.status(204).send();
  });

  app.get("/api/nutrition/meal-plans/:id/grocery", isAuthenticated, async (req: Request, res: Response) => {
    const planId = Number(req.params.id); const userId = req.session.userId!;
    if (!Number.isInteger(planId)) return res.status(400).json({ error: "Invalid meal plan." });
    const [plan] = await db.select().from(nutritionMealPlans).where(and(eq(nutritionMealPlans.id, planId), eq(nutritionMealPlans.userId, userId))).limit(1);
    if (!plan) return res.status(404).json({ error: "Meal plan not found." });
    const entries = await db.select().from(nutritionMealPlanEntries).where(and(eq(nutritionMealPlanEntries.planId, planId), eq(nutritionMealPlanEntries.userId, userId), eq(nutritionMealPlanEntries.status, "planned")));
    const foods = await db.select().from(nutritionFoods).where(eq(nutritionFoods.userId, userId));
    const recipes = await db.select().from(nutritionRecipes).where(eq(nutritionRecipes.userId, userId));
    const recipeIngredients = recipes.length ? await db.select().from(nutritionRecipeIngredients).where(inArray(nutritionRecipeIngredients.recipeId, recipes.map((recipe) => recipe.id))) : [];
    const grams = new Map<number, number>();
    for (const entry of entries) {
      if (entry.foodId) {
        const food = foods.find((item) => item.id === entry.foodId); if (!food) continue;
        const amount = entry.inputUnit === "serving" ? nutritionGramsFromInput(entry.quantity, "serving", food.servingSizeGrams) : entry.quantity;
        grams.set(food.id, (grams.get(food.id) || 0) + amount);
      } else if (entry.recipeId) {
        const recipe = recipes.find((item) => item.id === entry.recipeId); if (!recipe) continue;
        for (const ingredient of recipeIngredients.filter((item) => item.recipeId === recipe.id)) grams.set(ingredient.foodId, (grams.get(ingredient.foodId) || 0) + ingredient.grams * (entry.quantity / recipe.servings));
      }
    }
    return res.json({ planId, items: Array.from(grams, ([foodId, totalGrams]) => ({ foodId, foodName: foods.find((food) => food.id === foodId)?.name || "Unavailable food", totalGrams: Number(totalGrams.toFixed(2)) })).sort((a, b) => a.foodName.localeCompare(b.foodName)), disclosure: "This preparation list is derived from currently planned meals. It is not purchase, intake, or nutrition evidence." });
  });

  app.get("/api/nutrition/meal-plans/:id/report", isAuthenticated, async (req: Request, res: Response) => {
    const planId = Number(req.params.id); const userId = req.session.userId!;
    if (!Number.isInteger(planId)) return res.status(400).json({ error: "Invalid meal plan." });
    const [plan] = await db.select().from(nutritionMealPlans).where(and(eq(nutritionMealPlans.id, planId), eq(nutritionMealPlans.userId, userId))).limit(1);
    if (!plan) return res.status(404).json({ error: "Meal plan not found." });
    const entries = await db.select({ scheduledDate: nutritionMealPlanEntries.scheduledDate, status: nutritionMealPlanEntries.status, loggedDiaryEntryIds: nutritionMealPlanEntries.loggedDiaryEntryIds }).from(nutritionMealPlanEntries).where(and(eq(nutritionMealPlanEntries.planId, planId), eq(nutritionMealPlanEntries.userId, userId)));
    const { timeZone } = requestTimeContext(req);
    const start = dayBounds(plan.startDate, timeZone).start;
    const end = dayBounds(plan.endDate, timeZone).end;
    const diary = await db.select({ id: nutritionDiaryEntries.id, occurredAt: nutritionDiaryEntries.occurredAt }).from(nutritionDiaryEntries).where(and(eq(nutritionDiaryEntries.userId, userId), gte(nutritionDiaryEntries.occurredAt, start), lt(nutritionDiaryEntries.occurredAt, end)));
    const report = summarizeMealPlanActual(plan.startDate, plan.endDate, entries, diary.map((record) => ({ id: record.id, date: dateInTimeZone(record.occurredAt, timeZone) })));
    return res.json({ ...report, timeZone, disclosure: "This compares editable plan states with factual diary records. A recipe can create several linked food records, and other diary records are not labeled failures or non-adherence." });
  });

  app.post("/api/nutrition/meal-plan-entries/:id/log", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id); const userId = req.session.userId!;
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid planned meal." });
    const entry = await ownedEntry(userId, id);
    if (!entry) return res.status(404).json({ error: "Planned meal not found." });
    if (entry.status === "logged") return res.status(409).json({ error: "This planned meal was already logged." });
    if (entry.status === "skipped") return res.status(409).json({ error: "Restore the skipped plan before logging it." });
    const baseTimeContext = requestTimeContext(req);
    const occurredAt = zonedDateTime(entry.scheduledDate, baseTimeContext.timeZone, 12);
    const recordTimeContext = requestTimeContext(req, occurredAt);
    const result = await db.transaction(async (tx) => {
      let created;
      if (entry.foodId) {
        const [food] = await tx.select().from(nutritionFoods).where(and(eq(nutritionFoods.id, entry.foodId), eq(nutritionFoods.userId, userId))).limit(1);
        if (!food) return null;
        const nutrients = await snapshots([food.id]);
        const servingGrams = entry.inputUnit === "serving" ? nutritionGramsFromInput(entry.quantity, "serving", food.servingSizeGrams) : entry.quantity;
        created = await tx.insert(nutritionDiaryEntries).values({ userId, foodId: food.id, servingGrams, inputQuantity: entry.quantity, inputUnit: entry.inputUnit, nutrientSnapshot: nutrients.get(food.id) || [], mealSlot: entry.mealSlot, occurredAt, note: entry.note || `Meal plan: ${entry.planId}`, recordedTimeZone: recordTimeContext.timeZone, recordedUtcOffsetMinutes: recordTimeContext.utcOffsetMinutes }).returning();
      } else {
        const [recipe] = await tx.select().from(nutritionRecipes).where(and(eq(nutritionRecipes.id, entry.recipeId!), eq(nutritionRecipes.userId, userId))).limit(1);
        if (!recipe) return null;
        const ingredients = await tx.select().from(nutritionRecipeIngredients).where(eq(nutritionRecipeIngredients.recipeId, recipe.id));
        const nutrients = await snapshots(ingredients.map((ingredient) => ingredient.foodId));
        created = await tx.insert(nutritionDiaryEntries).values(ingredients.map((ingredient) => ({ userId, foodId: ingredient.foodId, servingGrams: ingredient.grams * (entry.quantity / recipe.servings), inputQuantity: null, inputUnit: null, nutrientSnapshot: nutrients.get(ingredient.foodId) || [], mealSlot: entry.mealSlot, occurredAt, note: entry.note || `Meal plan recipe: ${recipe.name}`, recordedTimeZone: recordTimeContext.timeZone, recordedUtcOffsetMinutes: recordTimeContext.utcOffsetMinutes }))).returning();
      }
      const [updated] = await tx.update(nutritionMealPlanEntries).set({ status: "logged", loggedDiaryEntryIds: created.map((item) => item.id), updatedAt: new Date() })
        .where(and(eq(nutritionMealPlanEntries.id, id), eq(nutritionMealPlanEntries.userId, userId), eq(nutritionMealPlanEntries.status, "planned"))).returning();
      if (!updated) throw new Error("MEAL_PLAN_CONVERSION_CONFLICT");
      return { created, updated };
    }).catch((error: unknown) => {
      if (error instanceof Error && error.message === "MEAL_PLAN_CONVERSION_CONFLICT") return "conflict" as const;
      throw error;
    });
    if (!result) return res.status(404).json({ error: "The planned food or recipe is no longer available." });
    if (result === "conflict") return res.status(409).json({ error: "The planned meal changed before it could be logged. The transaction was rolled back." });
    return res.status(201).json({ entry: result.updated, diaryEntries: result.created, disclosure: "The user-confirmed plan item is now factual diary evidence using nutrient snapshots captured at logging time." });
  });

  app.patch("/api/nutrition/meal-plan-entries/:id/status", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id); const parsed = z.object({ status: z.enum(["planned", "skipped"]) }).safeParse(req.body);
    if (!Number.isInteger(id) || !parsed.success) return res.status(400).json({ error: "Invalid planned-meal status." });
    const current = await ownedEntry(req.session.userId!, id);
    if (!current || current.status === "logged") return res.status(current ? 409 : 404).json({ error: current ? "A logged meal is factual diary evidence and cannot become planned or skipped." : "Planned meal not found." });
    const [entry] = await db.update(nutritionMealPlanEntries).set({ status: parsed.data.status, updatedAt: new Date() }).where(and(eq(nutritionMealPlanEntries.id, id), eq(nutritionMealPlanEntries.userId, req.session.userId!))).returning();
    return res.json({ entry });
  });
}
