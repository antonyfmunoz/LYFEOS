import { z } from "zod";

export const foodCatalogProviderSchema = z.object({
  id: z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9_-]*$/),
  name: z.string().trim().min(1).max(120),
  datasetVersion: z.string().trim().min(1).max(120),
  territories: z.array(z.string().trim().min(2).max(16)).min(1).max(100),
  attributionText: z.string().trim().min(1).max(500),
  attributionUrl: z.string().url().max(500).nullable().optional(),
}).strict();

export const foodCatalogNutrientSchema = z.object({
  nutrientKey: z.string().trim().min(1).max(80).regex(/^[a-z][a-z0-9_]*$/),
  amountPer100g: z.number().finite().min(0).max(1_000_000),
  unit: z.string().trim().min(1).max(24),
}).strict();

export const foodCatalogPortionSchema = z.object({
  label: z.string().trim().min(1).max(80),
  gramsPerUnit: z.number().finite().positive().max(100_000),
}).strict();

export const foodCatalogItemSchema = z.object({
  externalId: z.string().trim().min(1).max(200),
  itemVersion: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(160),
  brand: z.string().trim().max(120).nullable().optional(),
  barcode: z.string().trim().regex(/^\d{8,14}$/).nullable().optional(),
  locale: z.string().trim().min(2).max(35),
  territory: z.string().trim().min(2).max(16),
  servingSizeGrams: z.number().finite().positive().max(100_000).nullable().optional(),
  ingredientsText: z.string().trim().max(20_000).nullable().optional(),
  portions: z.array(foodCatalogPortionSchema).max(25).default([]),
  nutrients: z.array(foodCatalogNutrientSchema).max(100),
}).strict().superRefine((value, context) => {
  const keys = value.nutrients.map((nutrient) => nutrient.nutrientKey);
  if (new Set(keys).size !== keys.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "Catalog nutrients must be unique." });
  const portionLabels = value.portions.map((portion) => portion.label.toLocaleLowerCase());
  if (new Set(portionLabels).size !== portionLabels.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "Catalog portion labels must be unique." });
});

export const foodCatalogSearchResponseSchema = z.object({
  provider: foodCatalogProviderSchema,
  items: z.array(foodCatalogItemSchema).max(25),
  nextCursor: z.string().min(1).max(500).nullable().optional(),
}).strict().superRefine((value, context) => {
  value.items.forEach((item, index) => {
    if (!value.provider.territories.includes(item.territory)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["items", index, "territory"], message: "Item territory must be declared by the provider." });
    }
  });
});

export const foodCatalogBarcodeResponseSchema = z.object({
  provider: foodCatalogProviderSchema,
  item: foodCatalogItemSchema.nullable(),
}).strict().superRefine((value, context) => {
  if (value.item && !value.provider.territories.includes(value.item.territory)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["item", "territory"], message: "Item territory must be declared by the provider." });
  }
});

export const foodCatalogLookupReceiptSchema = z.object({
  version: z.literal(1),
  expiresAt: z.number().int().positive(),
  provider: foodCatalogProviderSchema,
  item: foodCatalogItemSchema,
}).strict();

export const foodCatalogCursorReceiptSchema = z.object({
  version: z.literal(1),
  expiresAt: z.number().int().positive(),
  query: z.string().trim().min(2).max(80),
  territory: z.string().trim().min(2).max(16),
  locale: z.string().trim().min(2).max(35),
  limit: z.number().int().min(1).max(20),
  providerId: z.string().trim().min(1).max(80),
  datasetVersion: z.string().trim().min(1).max(120),
  providerCursor: z.string().min(1).max(500),
}).strict();

export type FoodCatalogProvider = z.infer<typeof foodCatalogProviderSchema>;
export type FoodCatalogItem = z.infer<typeof foodCatalogItemSchema>;
export type FoodCatalogLookupReceipt = z.infer<typeof foodCatalogLookupReceiptSchema>;
export type FoodCatalogCursorReceipt = z.infer<typeof foodCatalogCursorReceiptSchema>;
