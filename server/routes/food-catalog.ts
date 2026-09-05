import type { Express, Request, Response } from "express";
import { z } from "zod";
import { FoodCatalogError, foodCatalogAvailability, lookupFoodCatalogBarcode, searchFoodCatalog } from "../food-catalog";
import { isAuthenticated } from "./middleware";

const initialSearchSchema = z.object({
  query: z.string().trim().min(2).max(80),
  territory: z.string().trim().min(2).max(16).default("US"),
  locale: z.string().trim().min(2).max(35).default("en-US"),
  limit: z.coerce.number().int().min(1).max(20).default(10),
  providerId: z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9_-]*$/).optional(),
}).strict();
const searchSchema = z.union([initialSearchSchema, z.object({ cursor: z.string().min(80).max(4_000) }).strict()]);
function isValidGtin(value: string): boolean {
  if (!/^\d{8,14}$/.test(value)) return false;
  return value.split("").reverse().reduce((sum, digit, index) => sum + Number(digit) * (index % 2 === 0 ? 1 : 3), 0) % 10 === 0;
}

const barcodeSchema = z.string().trim().refine(isValidGtin, "Enter a valid 8–14 digit GTIN barcode.");
const barcodeProviderSchema = z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9_-]*$/).optional();

function catalogFailure(error: unknown, res: Response) {
  if (error instanceof FoodCatalogError) {
    const status = error.code === "unavailable" ? 503 : error.code === "invalid_cursor" ? 400 : 502;
    return res.status(status).json({ error: error.message, code: error.code });
  }
  return res.status(502).json({ error: "The food catalog lookup failed.", code: "provider_failure" });
}

export function registerFoodCatalogRoutes(app: Express): void {
  app.get("/api/food-catalog/status", isAuthenticated, (_req: Request, res: Response) => {
    return res.json(foodCatalogAvailability());
  });

  app.get("/api/food-catalog/search", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = searchSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Enter a valid food search, territory, locale, and result limit." });
    try {
      return res.json(await searchFoodCatalog(parsed.data));
    } catch (error) {
      return catalogFailure(error, res);
    }
  });

  app.get("/api/food-catalog/barcodes/:barcode", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = barcodeSchema.safeParse(req.params.barcode);
    if (!parsed.success) return res.status(400).json({ error: "Enter a valid 8–14 digit GTIN product barcode." });
    const provider = barcodeProviderSchema.safeParse(req.query.providerId);
    if (!provider.success) return res.status(400).json({ error: "Choose a valid food catalog provider." });
    try {
      const result = await lookupFoodCatalogBarcode(parsed.data, provider.data);
      return res.json({ ...result, found: Boolean(result.item), disclosure: result.item ? "Review the provider, dataset version, label, and nutrient coverage before saving a private copy." : "The configured catalog did not identify this barcode. Manual label entry remains available." });
    } catch (error) {
      return catalogFailure(error, res);
    }
  });
}
