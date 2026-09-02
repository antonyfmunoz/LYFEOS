import { z } from "zod";

export const foodRecallMatchSchema = z.object({
  recallNumber: z.string().trim().min(1).max(80),
  classification: z.string().trim().min(1).max(80).nullable(),
  status: z.string().trim().min(1).max(80).nullable(),
  productDescription: z.string().trim().min(1).max(4_000),
  reasonForRecall: z.string().trim().min(1).max(4_000).nullable(),
  recallingFirm: z.string().trim().min(1).max(300).nullable(),
  distributionPattern: z.string().trim().min(1).max(4_000).nullable(),
  codeInfo: z.string().trim().min(1).max(4_000).nullable(),
  packageCodeTextMatch: z.boolean(),
  recallInitiationDate: z.string().regex(/^\d{8}$/).nullable(),
  reportDate: z.string().regex(/^\d{8}$/).nullable(),
  terminationDate: z.string().regex(/^\d{8}$/).nullable(),
  sourceUrl: z.string().url().max(2_000),
}).strict();

export const foodRecallProviderSchema = z.object({
  id: z.literal("openfda_food_enforcement"),
  name: z.literal("FDA Food Enforcement Reports"),
  datasetVersion: z.string().trim().min(1).max(120),
  attributionText: z.string().trim().min(1).max(600),
  attributionUrl: z.string().url().max(500),
}).strict();

export const foodRecallLookupSchema = z.object({
  provider: foodRecallProviderSchema,
  query: z.object({
    productName: z.string().trim().min(2).max(160),
    brand: z.string().trim().min(1).max(120).nullable(),
    packageCode: z.string().trim().min(3).max(120).nullable(),
    matchMethod: z.literal("product_description_text"),
  }).strict(),
  checkedAt: z.string().datetime(),
  matches: z.array(foodRecallMatchSchema).max(10),
  disclosure: z.string().trim().min(1).max(1_000),
}).strict();

export type FoodRecallMatch = z.infer<typeof foodRecallMatchSchema>;
export type FoodRecallLookup = z.infer<typeof foodRecallLookupSchema>;
