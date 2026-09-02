import type { Express, Request, Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { brandOwnershipResearchReports, groceryPantryItems, groceryReceiptDrafts, groceryShoppingItems, ingredientPreferenceRules } from "@shared/schema";
import { db } from "../db";
import { listBrandSpotlights, lookupBrandOwnership } from "../brand-ownership";
import { FoodCatalogError, searchFoodCatalog } from "../food-catalog";
import { FoodRecallError, lookupFoodRecalls } from "../food-recalls";
import { ownershipScore, parseReceiptText } from "../grocery-intelligence";
import { parseIngredientLabel } from "../ingredient-scanner";
import { isAuthenticated } from "./middleware";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const itemId = (value: unknown) => z.coerce.number().int().positive().safeParse(value);

const pantryInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  brand: optionalText(160),
  barcode: z.string().trim().regex(/^\d{8,14}$/).nullable().optional(),
  quantity: z.number().finite().min(0).max(100_000).default(1),
  unit: z.string().trim().min(1).max(40).default("item"),
  reorderAt: z.number().finite().min(0).max(100_000).nullable().optional(),
  location: optionalText(100),
  expiresOn: dateSchema.nullable().optional(),
  purchasedOn: dateSchema.nullable().optional(),
  source: z.enum(["manual", "catalog", "receipt"]).default("manual"),
  catalogProviderId: optionalText(100),
  catalogExternalId: optionalText(200),
  catalogDatasetVersion: optionalText(120),
  catalogAttributionText: optionalText(600),
  catalogAttributionUrl: z.string().url().max(1_000).nullable().optional(),
}).strict();

const shoppingInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  brand: optionalText(160),
  quantity: z.number().finite().positive().max(100_000).default(1),
  unit: z.string().trim().min(1).max(40).default("item"),
  note: optionalText(500),
}).strict();

const receiptItemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  brand: optionalText(160),
  quantity: z.number().finite().positive().max(100_000).default(1),
  unit: z.string().trim().min(1).max(40).default("item"),
  location: optionalText(100),
  expiresOn: dateSchema.nullable().optional(),
  reorderAt: z.number().finite().min(0).max(100_000).nullable().optional(),
}).strict();

const receiptDraftSchema = z.object({ sourceText: z.string().trim().min(3).max(20_000) }).strict();
const receiptApplySchema = z.object({ items: z.array(receiptItemSchema).min(1).max(100) }).strict();
const reportSchema = z.object({
  brand: z.string().trim().min(1).max(160),
  barcode: z.string().trim().regex(/^\d{8,14}$/).nullable().optional(),
  reportType: z.enum(["missing_brand", "correction", "new_source"]),
  note: optionalText(2_000),
  evidenceUrl: z.string().url().max(1_000).nullable().optional(),
}).strict();

type PantryRecallReview = {
  pantryItemId: number;
  name: string;
  brand: string | null;
  checkedAt: string | null;
  matches: Array<{ recallNumber: string; classification: string | null; status: string | null; productDescription: string; reasonForRecall: string | null; codeInfo: string | null; sourceUrl: string }>;
  error: string | null;
};

async function reviewPantryRecalls(items: Array<{ id: number; name: string; brand: string | null }>): Promise<PantryRecallReview[]> {
  const results: PantryRecallReview[] = [];
  // The public FDA feed is requested only after an explicit user action. Keep
  // concurrency small so a pantry review does not become a burst against the
  // provider or retain external results in LyfeOS.
  for (let index = 0; index < items.length; index += 3) {
    const batch = await Promise.all(items.slice(index, index + 3).map(async (item): Promise<PantryRecallReview> => {
      try {
        const result = await lookupFoodRecalls({ productName: item.name, brand: item.brand });
        return {
          pantryItemId: item.id,
          name: item.name,
          brand: item.brand,
          checkedAt: result.checkedAt,
          matches: result.matches.slice(0, 3).map((match) => ({ recallNumber: match.recallNumber, classification: match.classification, status: match.status, productDescription: match.productDescription, reasonForRecall: match.reasonForRecall, codeInfo: match.codeInfo, sourceUrl: match.sourceUrl })),
          error: null,
        };
      } catch (error) {
        return {
          pantryItemId: item.id,
          name: item.name,
          brand: item.brand,
          checkedAt: null,
          matches: [],
          error: error instanceof FoodRecallError ? error.message : "The FDA recall service could not complete this item review.",
        };
      }
    }));
    results.push(...batch);
  }
  return results;
}

function preferenceReview(ingredientsText: string | null | undefined, preferences: Array<{ displayName: string; normalizedKey: string; preferenceType: string; note: string | null }>) {
  if (!ingredientsText) return { labelAvailable: false, matches: [] as Array<{ displayName: string; preferenceType: string; note: string | null }> };
  const ingredientKeys = new Set(parseIngredientLabel(ingredientsText).map((ingredient) => ingredient.normalizedKey));
  return {
    labelAvailable: true,
    matches: preferences.filter((preference) => ingredientKeys.has(preference.normalizedKey)).map((preference) => ({ displayName: preference.displayName, preferenceType: preference.preferenceType, note: preference.note })),
  };
}

async function createPendingShoppingItem(userId: number, pantry: { id: number; name: string; brand: string | null; unit: string }) {
  const [existing] = await db.select().from(groceryShoppingItems).where(and(eq(groceryShoppingItems.userId, userId), eq(groceryShoppingItems.pantryItemId, pantry.id), eq(groceryShoppingItems.status, "pending"))).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(groceryShoppingItems).values({ userId, pantryItemId: pantry.id, name: pantry.name, brand: pantry.brand, quantity: 1, unit: pantry.unit, generatedBy: "low_stock" }).returning();
  return created;
}

export function registerGroceryIntelligenceRoutes(app: Express): void {
  app.get("/api/grocery-intelligence/overview", isAuthenticated, async (req: Request, res: Response) => {
    const userId = req.session.userId!;
    const [pantry, shopping, receipts, reports] = await Promise.all([
      db.select().from(groceryPantryItems).where(and(eq(groceryPantryItems.userId, userId), eq(groceryPantryItems.status, "active"))).orderBy(desc(groceryPantryItems.updatedAt)).limit(250),
      db.select().from(groceryShoppingItems).where(and(eq(groceryShoppingItems.userId, userId), eq(groceryShoppingItems.status, "pending"))).orderBy(desc(groceryShoppingItems.updatedAt)).limit(100),
      db.select().from(groceryReceiptDrafts).where(eq(groceryReceiptDrafts.userId, userId)).orderBy(desc(groceryReceiptDrafts.createdAt)).limit(10),
      db.select().from(brandOwnershipResearchReports).where(eq(brandOwnershipResearchReports.userId, userId)).orderBy(desc(brandOwnershipResearchReports.createdAt)).limit(20),
    ]);
    const lowStock = pantry.filter((item) => item.reorderAt !== null && item.quantity <= item.reorderAt);
    return res.json({
      pantry: pantry.map((item) => ({ ...item, ownership: item.brand ? lookupBrandOwnership(item.brand).profile : null })),
      shopping,
      receipts,
      reports,
      lowStock: lowStock.map((item) => item.id),
      impact: ownershipScore(pantry),
      spotlights: listBrandSpotlights(),
      disclosure: "Pantry, receipt text, shopping items, and research reports are private to this account. Ownership results are shown only for exact, cited registry matches; missing coverage remains unknown.",
    });
  });

  app.post("/api/grocery-intelligence/pantry", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = pantryInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter valid pantry item details.", details: parsed.error.flatten() });
    const [item] = await db.insert(groceryPantryItems).values({
      userId: req.session.userId!,
      ...parsed.data,
      // Product scans naturally become replenishment-aware: once the last
      // unit is used, one pending shopping item is created. Manual and receipt
      // imports can explicitly disable or customize that threshold.
      reorderAt: parsed.data.reorderAt ?? (parsed.data.source === "catalog" ? 0 : null),
    }).returning();
    return res.status(201).json({ item });
  });

  app.patch("/api/grocery-intelligence/pantry/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = itemId(req.params.id);
    const parsed = pantryInputSchema.partial().safeParse(req.body);
    if (!id.success || !parsed.success || !Object.keys(parsed.data).length) return res.status(400).json({ error: "Enter a valid pantry update." });
    const [item] = await db.update(groceryPantryItems).set({ ...parsed.data, updatedAt: new Date() }).where(and(eq(groceryPantryItems.id, id.data), eq(groceryPantryItems.userId, req.session.userId!))).returning();
    return item ? res.json({ item }) : res.status(404).json({ error: "Pantry item not found." });
  });

  app.post("/api/grocery-intelligence/pantry/:id/use", isAuthenticated, async (req: Request, res: Response) => {
    const id = itemId(req.params.id);
    const amount = z.object({ quantity: z.number().finite().positive().max(100_000).default(1) }).strict().safeParse(req.body);
    if (!id.success || !amount.success) return res.status(400).json({ error: "Enter a valid quantity to use." });
    const userId = req.session.userId!;
    const [current] = await db.select().from(groceryPantryItems).where(and(eq(groceryPantryItems.id, id.data), eq(groceryPantryItems.userId, userId), eq(groceryPantryItems.status, "active"))).limit(1);
    if (!current) return res.status(404).json({ error: "Pantry item not found." });
    const quantity = Math.max(0, current.quantity - amount.data.quantity);
    const [item] = await db.update(groceryPantryItems).set({ quantity, updatedAt: new Date() }).where(eq(groceryPantryItems.id, current.id)).returning();
    const automaticallyAdded = item.reorderAt !== null && item.quantity <= item.reorderAt ? await createPendingShoppingItem(userId, item) : null;
    return res.json({ item, automaticallyAdded });
  });

  app.post("/api/grocery-intelligence/pantry-recall-review", isAuthenticated, async (req: Request, res: Response) => {
    const userId = req.session.userId!;
    const pantry = await db.select({ id: groceryPantryItems.id, name: groceryPantryItems.name, brand: groceryPantryItems.brand }).from(groceryPantryItems).where(and(eq(groceryPantryItems.userId, userId), eq(groceryPantryItems.status, "active"))).orderBy(desc(groceryPantryItems.updatedAt)).limit(25);
    const reviews = await reviewPantryRecalls(pantry);
    return res.json({
      reviews,
      disclosure: "This is a live FDA enforcement-report text review requested by you. A possible match does not establish that your package is recalled; compare lot or package codes, dates, distribution, and the official recall notice. Results are not stored by LyfeOS.",
    });
  });

  app.post("/api/grocery-intelligence/pantry/:id/replacements", isAuthenticated, async (req: Request, res: Response) => {
    const id = itemId(req.params.id);
    if (!id.success) return res.status(400).json({ error: "Invalid pantry item." });
    const userId = req.session.userId!;
    const [itemRows, preferences] = await Promise.all([
      db.select().from(groceryPantryItems).where(and(eq(groceryPantryItems.id, id.data), eq(groceryPantryItems.userId, userId), eq(groceryPantryItems.status, "active"))).limit(1),
      db.select().from(ingredientPreferenceRules).where(eq(ingredientPreferenceRules.userId, userId)),
    ]);
    const item = itemRows[0];
    if (!item) return res.status(404).json({ error: "Pantry item not found." });
    try {
      const page = await searchFoodCatalog({ query: item.name.slice(0, 80), territory: "US", locale: "en-US", limit: 10 });
      const candidates = page.items.filter((candidate) => candidate.externalId !== item.catalogExternalId).slice(0, 8).map((candidate) => ({
        externalId: candidate.externalId,
        name: candidate.name,
        brand: candidate.brand || null,
        barcode: candidate.barcode || null,
        ownership: candidate.brand ? lookupBrandOwnership(candidate.brand).profile : null,
        preferenceReview: preferenceReview(candidate.ingredientsText, preferences),
      }));
      return res.json({
        pantryItemId: item.id,
        query: item.name,
        provider: page.provider,
        candidates,
        disclosure: "These are catalog search candidates, not endorsements or guaranteed substitutes. LyfeOS only reports exact matches to your saved ingredient preferences when the provider supplied a label; missing labels and unmatched brands stay unknown. Review price, package size, availability, nutrition, ownership evidence, and the actual package before choosing.",
      });
    } catch (error) {
      if (error instanceof FoodCatalogError) return res.status(error.code === "unavailable" ? 503 : 502).json({ error: error.message, code: error.code });
      return res.status(502).json({ error: "The catalog could not find replacement candidates." });
    }
  });

  app.delete("/api/grocery-intelligence/pantry/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = itemId(req.params.id);
    if (!id.success) return res.status(400).json({ error: "Invalid pantry item." });
    const [deleted] = await db.delete(groceryPantryItems).where(and(eq(groceryPantryItems.id, id.data), eq(groceryPantryItems.userId, req.session.userId!))).returning({ id: groceryPantryItems.id });
    return deleted ? res.status(204).send() : res.status(404).json({ error: "Pantry item not found." });
  });

  app.post("/api/grocery-intelligence/shopping", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = shoppingInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter a valid shopping item." });
    const [item] = await db.insert(groceryShoppingItems).values({ userId: req.session.userId!, ...parsed.data }).returning();
    return res.status(201).json({ item });
  });

  app.patch("/api/grocery-intelligence/shopping/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = itemId(req.params.id);
    const parsed = z.object({ status: z.enum(["pending", "completed", "archived"]) }).strict().safeParse(req.body);
    if (!id.success || !parsed.success) return res.status(400).json({ error: "Enter a valid shopping item status." });
    const [item] = await db.update(groceryShoppingItems).set({ ...parsed.data, updatedAt: new Date() }).where(and(eq(groceryShoppingItems.id, id.data), eq(groceryShoppingItems.userId, req.session.userId!))).returning();
    return item ? res.json({ item }) : res.status(404).json({ error: "Shopping item not found." });
  });

  app.delete("/api/grocery-intelligence/shopping/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = itemId(req.params.id);
    if (!id.success) return res.status(400).json({ error: "Invalid shopping item." });
    const [deleted] = await db.delete(groceryShoppingItems).where(and(eq(groceryShoppingItems.id, id.data), eq(groceryShoppingItems.userId, req.session.userId!))).returning({ id: groceryShoppingItems.id });
    return deleted ? res.status(204).send() : res.status(404).json({ error: "Shopping item not found." });
  });

  app.post("/api/grocery-intelligence/receipt-drafts", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = receiptDraftSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Paste valid receipt text before preparing it for review." });
    const parsedItems = parseReceiptText(parsed.data.sourceText);
    const [draft] = await db.insert(groceryReceiptDrafts).values({ userId: req.session.userId!, sourceText: parsed.data.sourceText, parsedItems }).returning();
    return res.status(201).json({ draft, disclosure: "Review every suggested row before adding it to your pantry. Receipt parsing is a convenience aid, not a record of purchase accuracy." });
  });

  app.post("/api/grocery-intelligence/receipt-drafts/:id/apply", isAuthenticated, async (req: Request, res: Response) => {
    const id = itemId(req.params.id);
    const parsed = receiptApplySchema.safeParse(req.body);
    if (!id.success || !parsed.success) return res.status(400).json({ error: "Review at least one valid receipt item before adding it." });
    const userId = req.session.userId!;
    const [draft] = await db.select().from(groceryReceiptDrafts).where(and(eq(groceryReceiptDrafts.id, id.data), eq(groceryReceiptDrafts.userId, userId))).limit(1);
    if (!draft) return res.status(404).json({ error: "Receipt draft not found." });
    if (draft.status !== "draft") return res.status(409).json({ error: "This receipt draft was already applied or closed." });
    const items = await db.transaction(async (tx) => {
      const created = await tx.insert(groceryPantryItems).values(parsed.data.items.map((item) => ({ userId, ...item, source: "receipt" as const }))).returning();
      await tx.update(groceryReceiptDrafts).set({ status: "applied", appliedAt: new Date() }).where(eq(groceryReceiptDrafts.id, draft.id));
      return created;
    });
    return res.json({ items });
  });

  app.post("/api/grocery-intelligence/research-reports", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = reportSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter a valid ownership research report." });
    const [report] = await db.insert(brandOwnershipResearchReports).values({ userId: req.session.userId!, ...parsed.data }).returning();
    return res.status(201).json({ report, disclosure: "A report is research intake only. It cannot change the cited ownership registry automatically." });
  });
}
