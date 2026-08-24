import type { Express, Request, Response } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { ingredientPreferenceRules, ingredientScanItems, ingredientScans } from "@shared/schema";
import { db } from "../db";
import { normalizeIngredientKey, parseIngredientLabel } from "../ingredient-scanner";
import { isAuthenticated } from "./middleware";
import { parseExpectedResourceRevision } from "../revision-concurrency";
import { verifyConfiguredFoodCatalogToken } from "../food-catalog";

const scanSchema = z.object({
  captureMethod: z.literal("manual_label").default("manual_label"),
  productName: z.string().trim().min(1).max(160).nullable().optional(),
  barcode: z.string().trim().regex(/^[A-Za-z0-9-]{4,64}$/).nullable().optional(),
  rawIngredientsText: z.string().trim().min(1).max(20_000),
  catalogLookupToken: z.string().min(80).max(100_000).optional(),
});
const preferenceSchema = z.object({
  displayName: z.string().trim().min(1).max(160),
  preferenceType: z.enum(["avoid", "limit", "watch"]),
  note: z.string().trim().max(500).nullable().optional(),
});

export function registerIngredientScannerRoutes(app: Express): void {
  app.get("/api/ingredient-scans", isAuthenticated, async (req: Request, res: Response) => {
    const userId = req.session.userId!;
    const [scans, preferences] = await Promise.all([
      db.select().from(ingredientScans)
      .where(eq(ingredientScans.userId, req.session.userId!))
      .orderBy(desc(ingredientScans.createdAt)).limit(50),
      db.select().from(ingredientPreferenceRules).where(eq(ingredientPreferenceRules.userId, userId)),
    ]);
    const ids = scans.map((scan) => scan.id);
    const items = ids.length
      ? await db.select().from(ingredientScanItems).where(and(eq(ingredientScanItems.userId, userId), inArray(ingredientScanItems.scanId, ids))).orderBy(ingredientScanItems.scanId, ingredientScanItems.sourceOrder)
      : [];
    const itemsByScan = new Map<number, typeof items>();
    for (const item of items) itemsByScan.set(item.scanId, [...(itemsByScan.get(item.scanId) || []), item]);
    const preferenceByKey = new Map(preferences.map((preference) => [preference.normalizedKey, preference]));
    return res.json({
      scans: scans.map((scan) => ({ ...scan, items: (itemsByScan.get(scan.id) || []).map((item) => ({ ...item, preference: preferenceByKey.get(item.normalizedKey) || null })) })),
      disclosure: "Ingredient review preserves label text. LyfeOS does not make a universal harmfulness, safety, allergy, diagnosis, or treatment claim. Items remain unclassified until backed by an explicit evidence policy or your own preference rule.",
    });
  });

  app.get("/api/ingredient-preferences", isAuthenticated, async (req: Request, res: Response) => {
    const preferences = await db.select().from(ingredientPreferenceRules)
      .where(eq(ingredientPreferenceRules.userId, req.session.userId!))
      .orderBy(desc(ingredientPreferenceRules.createdAt));
    return res.json({ preferences, disclosure: "These are your label-review preferences. A match is not a medical, allergy, treatment, or universal safety claim." });
  });

  app.get("/api/ingredient-scans/lookup", isAuthenticated, async (req: Request, res: Response) => {
    const barcode = z.string().trim().regex(/^[A-Za-z0-9-]{4,64}$/).safeParse(req.query.barcode);
    if (!barcode.success) return res.status(400).json({ error: "Enter a valid barcode." });
    const [scan] = await db.select().from(ingredientScans).where(and(
      eq(ingredientScans.userId, req.session.userId!), eq(ingredientScans.barcode, barcode.data),
    )).orderBy(desc(ingredientScans.updatedAt)).limit(1);
    return res.json({ scan: scan || null, source: scan ? "your_private_history" : "not_found", disclosure: "This lookup searches only your own saved labels. No licensed or external product catalog was queried." });
  });

  app.post("/api/ingredient-preferences", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = preferenceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter a valid ingredient preference.", details: parsed.error.flatten() });
    const normalizedKey = normalizeIngredientKey(parsed.data.displayName);
    if (!normalizedKey) return res.status(400).json({ error: "Enter a recognizable ingredient preference." });
    const [preference] = await db.insert(ingredientPreferenceRules).values({
      userId: req.session.userId!, displayName: parsed.data.displayName, normalizedKey,
      preferenceType: parsed.data.preferenceType, note: parsed.data.note || null,
    }).onConflictDoUpdate({
      target: [ingredientPreferenceRules.userId, ingredientPreferenceRules.normalizedKey],
      set: { displayName: parsed.data.displayName, preferenceType: parsed.data.preferenceType, note: parsed.data.note || null },
    }).returning();
    return res.status(201).json({ preference });
  });

  app.delete("/api/ingredient-preferences/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid ingredient preference." });
    const [preference] = await db.delete(ingredientPreferenceRules).where(and(eq(ingredientPreferenceRules.id, id), eq(ingredientPreferenceRules.userId, req.session.userId!))).returning({ id: ingredientPreferenceRules.id });
    return preference ? res.status(204).send() : res.status(404).json({ error: "Ingredient preference not found." });
  });

  app.post("/api/ingredient-scans", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = scanSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter a valid ingredient label.", details: parsed.error.flatten() });
    const receipt = parsed.data.catalogLookupToken ? verifyConfiguredFoodCatalogToken(parsed.data.catalogLookupToken) : null;
    if (parsed.data.catalogLookupToken && !receipt) return res.status(400).json({ error: "This catalog lookup is invalid or expired. Look up the product again before saving." });
    if (receipt && !receipt.item.ingredientsText) return res.status(422).json({ error: "The catalog did not supply an ingredient label for this product. Enter the package label manually." });
    const rawIngredientsText = receipt?.item.ingredientsText || parsed.data.rawIngredientsText;
    const ingredients = parseIngredientLabel(rawIngredientsText);
    if (!ingredients.length) return res.status(400).json({ error: "No ingredients could be read from that label." });
    const userId = req.session.userId!;
    const scan = await db.transaction(async (tx) => {
      const [created] = await tx.insert(ingredientScans).values({
        userId, captureMethod: receipt ? "barcode" : parsed.data.captureMethod,
        productName: receipt?.item.name || parsed.data.productName || null,
        barcode: receipt?.item.barcode || parsed.data.barcode || null, rawIngredientsText,
        catalogProviderId: receipt?.provider.id || null, catalogExternalId: receipt?.item.externalId || null,
        catalogDatasetVersion: receipt?.provider.datasetVersion || null, catalogItemVersion: receipt?.item.itemVersion || null,
        catalogAttributionText: receipt?.provider.attributionText || null, catalogAttributionUrl: receipt?.provider.attributionUrl || null,
        catalogTerritory: receipt?.item.territory || null, catalogSourceModified: false,
        parseVersion: "v1", status: "reviewed",
      }).returning();
      const createdItems = await tx.insert(ingredientScanItems).values(ingredients.map((ingredient) => ({
        userId, scanId: created.id, rawName: ingredient.rawName, normalizedKey: ingredient.normalizedKey,
        sourceOrder: ingredient.sourceOrder, classification: "unknown", evidenceStrength: "unverified",
      }))).returning();
      return { ...created, items: createdItems };
    });
    return res.status(201).json({ scan });
  });

  app.patch("/api/ingredient-scans/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const parsed = scanSchema.safeParse(req.body);
    const expectedRevision = parseExpectedResourceRevision(req.header("x-lyfeos-expected-revision"));
    if (!Number.isInteger(id) || !parsed.success || (!expectedRevision.ok && expectedRevision.reason === "invalid")) return res.status(400).json({ error: "Enter a valid ingredient label correction.", details: parsed.success ? undefined : parsed.error.flatten() });
    if (!expectedRevision.ok) return res.status(428).json({ error: "Reload this saved label before correcting it." });
    const ingredients = parseIngredientLabel(parsed.data.rawIngredientsText);
    if (!ingredients.length) return res.status(400).json({ error: "No ingredients could be read from that label." });
    const userId = req.session.userId!;
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM ingredient_scans WHERE id = ${id} AND user_id = ${userId} FOR UPDATE`);
      const [current] = await tx.select().from(ingredientScans).where(and(eq(ingredientScans.id, id), eq(ingredientScans.userId, userId))).limit(1);
      if (!current) return { status: 404 as const };
      if (current.revision !== expectedRevision.revision) return { status: 409 as const, currentRevision: current.revision };
      const [scan] = await tx.update(ingredientScans).set({
        productName: parsed.data.productName || null, barcode: parsed.data.barcode || null, rawIngredientsText: parsed.data.rawIngredientsText,
        parseVersion: "v1", catalogSourceModified: Boolean(current.catalogProviderId), revision: current.revision + 1, updatedAt: new Date(),
      }).where(and(eq(ingredientScans.id, id), eq(ingredientScans.userId, userId))).returning();
      await tx.delete(ingredientScanItems).where(and(eq(ingredientScanItems.scanId, id), eq(ingredientScanItems.userId, userId)));
      const items = await tx.insert(ingredientScanItems).values(ingredients.map((ingredient) => ({
        userId, scanId: id, rawName: ingredient.rawName, normalizedKey: ingredient.normalizedKey,
        sourceOrder: ingredient.sourceOrder, classification: "unknown", evidenceStrength: "unverified",
      }))).returning();
      return { status: 200 as const, scan: { ...scan, items } };
    });
    if (result.status === 404) return res.status(404).json({ error: "Ingredient scan not found." });
    if (result.status === 409) return res.status(409).json({ error: "This saved label changed after you opened it. Your correction was not applied.", currentRevision: result.currentRevision });
    return res.json({ scan: result.scan });
  });

  app.delete("/api/ingredient-scans/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const expectedRevision = parseExpectedResourceRevision(req.header("x-lyfeos-expected-revision"));
    if (!Number.isInteger(id) || (!expectedRevision.ok && expectedRevision.reason === "invalid")) return res.status(400).json({ error: "Invalid ingredient scan." });
    if (!expectedRevision.ok) return res.status(428).json({ error: "Reload this saved label before deleting it." });
    const userId = req.session.userId!;
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM ingredient_scans WHERE id = ${id} AND user_id = ${userId} FOR UPDATE`);
      const [current] = await tx.select().from(ingredientScans).where(and(eq(ingredientScans.id, id), eq(ingredientScans.userId, userId))).limit(1);
      if (!current) return { status: 404 as const };
      if (current.revision !== expectedRevision.revision) return { status: 409 as const, currentRevision: current.revision };
      await tx.delete(ingredientScans).where(and(eq(ingredientScans.id, id), eq(ingredientScans.userId, userId)));
      return { status: 204 as const };
    });
    if (result.status === 404) return res.status(404).json({ error: "Ingredient scan not found." });
    if (result.status === 409) return res.status(409).json({ error: "This saved label changed after you opened it. It was not deleted.", currentRevision: result.currentRevision });
    return res.status(204).send();
  });
}
