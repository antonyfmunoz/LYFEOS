import { z } from "zod";

export const brandOwnershipStatusSchema = z.enum([
  "corporate_owned",
  "public_company",
  "family_owned_claim",
  "employee_owned_claim",
  "farmer_owned_cooperative_claim",
  "private_independent_claim",
]);

export const brandOwnershipEvidenceSchema = z.object({
  title: z.string().trim().min(1).max(240),
  publisher: z.string().trim().min(1).max(160),
  sourceType: z.enum(["company_portfolio", "company_statement", "acquisition_announcement", "regulatory_filing"]),
  sourceUrl: z.string().url().max(1_000),
  publishedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  accessedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  claim: z.string().trim().min(1).max(600),
}).strict();

export const brandOwnershipProfileSchema = z.object({
  brand: z.string().trim().min(1).max(160),
  aliases: z.array(z.string().trim().min(1).max(160)).max(20),
  status: brandOwnershipStatusSchema,
  statusLabel: z.string().trim().min(1).max(120),
  ownershipChain: z.array(z.object({
    name: z.string().trim().min(1).max(200),
    role: z.enum(["brand", "operating_company", "parent_company", "ultimate_parent", "cooperative"]),
  }).strict()).min(1).max(8),
  acquisition: z.object({
    announcedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    summary: z.string().trim().min(1).max(500),
  }).strict().nullable(),
  verifiedAsOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  evidence: z.array(brandOwnershipEvidenceSchema).min(1).max(8),
}).strict();

export const brandOwnershipLookupSchema = z.object({
  provider: z.object({
    id: z.literal("lyfeos_verified_brand_registry"),
    name: z.literal("LyfeOS verified brand registry"),
    datasetVersion: z.string().trim().min(1).max(120),
    attributionText: z.string().trim().min(1).max(600),
  }).strict(),
  requestedBrand: z.string().trim().min(1).max(160),
  matched: z.boolean(),
  matchMethod: z.literal("exact_registered_brand"),
  profile: brandOwnershipProfileSchema.nullable(),
  checkedAt: z.string().datetime(),
  disclosure: z.string().trim().min(1).max(1_000),
}).strict();

export type BrandOwnershipLookup = z.infer<typeof brandOwnershipLookupSchema>;
export type BrandOwnershipProfile = z.infer<typeof brandOwnershipProfileSchema>;
