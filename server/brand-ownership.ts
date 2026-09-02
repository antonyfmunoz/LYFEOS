import { brandOwnershipLookupSchema, brandOwnershipProfileSchema, type BrandOwnershipLookup, type BrandOwnershipProfile } from "@shared/brand-ownership";
import { brandOwnershipRegistryEntries, brandOwnershipRegistryLookupKeys } from "@shared/schema";
import { and, eq } from "drizzle-orm";

const accessedAt = "2026-09-02";
const provider = {
  id: "lyfeos_verified_brand_registry" as const,
  name: "LyfeOS verified brand registry" as const,
  datasetVersion: "2026.09.02",
  attributionText: "LyfeOS records only exact brand matches supported by linked company, acquisition, or regulatory evidence. Missing coverage is shown as unknown, never as independent or family-owned.",
};

const profiles: BrandOwnershipProfile[] = [
  {
    brand: "Burt's Bees",
    aliases: ["Burts Bees"],
    status: "corporate_owned",
    statusLabel: "Corporate-owned",
    ownershipChain: [{ name: "Burt's Bees", role: "brand" }, { name: "The Clorox Company", role: "ultimate_parent" }],
    acquisition: { announcedOn: "2007-10-31", summary: "The Clorox Company announced its acquisition of Burt's Bees in 2007." },
    verifiedAsOf: accessedAt,
    evidence: [
      { title: "Clorox portfolio", publisher: "The Clorox Company", sourceType: "company_portfolio", sourceUrl: "https://investors.thecloroxcompany.com/company-information/portfolio/default.aspx", publishedAt: null, accessedAt, claim: "Clorox lists Burt's Bees in its current lifestyle-brand portfolio." },
      { title: "Clorox to Acquire Burt's Bees", publisher: "The Clorox Company", sourceType: "acquisition_announcement", sourceUrl: "https://investors.thecloroxcompany.com/news/news-details/2007/Clorox-to-Acquire-Burts-Bees-Expands-Into-Fast-Growing-Natural-Personal-Care/default.aspx", publishedAt: "2007-10-31", accessedAt, claim: "Clorox announced the Burt's Bees acquisition." },
    ],
  },
  {
    brand: "Annie's",
    aliases: ["Annies", "Annie's Homegrown", "Annies Homegrown"],
    status: "corporate_owned",
    statusLabel: "Corporate-owned",
    ownershipChain: [{ name: "Annie's", role: "brand" }, { name: "General Mills", role: "ultimate_parent" }],
    acquisition: { announcedOn: null, summary: "General Mills describes Annie's as having joined General Mills as a wholly owned subsidiary in 2014." },
    verifiedAsOf: accessedAt,
    evidence: [
      { title: "General Mills brands", publisher: "General Mills", sourceType: "company_portfolio", sourceUrl: "https://www.generalmills.com/our-food/brands", publishedAt: null, accessedAt, claim: "General Mills lists Annie's in its family of brands." },
      { title: "General Mills history", publisher: "General Mills", sourceType: "acquisition_announcement", sourceUrl: "https://www.generalmills.com/-/media/project/gmi/corporate/corporate-master/files/about-us/history/150-history-book.pdf", publishedAt: null, accessedAt, claim: "General Mills states that Annie's joined it as a wholly owned subsidiary in 2014." },
    ],
  },
  {
    brand: "Bob's Red Mill",
    aliases: ["Bobs Red Mill"],
    status: "employee_owned_claim",
    statusLabel: "Employee-owned (company statement)",
    ownershipChain: [{ name: "Bob's Red Mill", role: "brand" }, { name: "Bob's Red Mill Natural Foods", role: "operating_company" }],
    acquisition: null,
    verifiedAsOf: accessedAt,
    evidence: [
      { title: "Proudly employee owned since 2010", publisher: "Bob's Red Mill", sourceType: "company_statement", sourceUrl: "https://www.bobsredmill.com/employee-owned", publishedAt: null, accessedAt, claim: "Bob's Red Mill states it became 100% employee owned in 2020 through its ESOP." },
    ],
  },
  {
    brand: "Organic Valley",
    aliases: [],
    status: "farmer_owned_cooperative_claim",
    statusLabel: "Farmer-owned cooperative (company statement)",
    ownershipChain: [{ name: "Organic Valley", role: "brand" }, { name: "Organic Valley cooperative", role: "cooperative" }],
    acquisition: null,
    verifiedAsOf: accessedAt,
    evidence: [
      { title: "Organic Valley ownership", publisher: "Organic Valley", sourceType: "company_statement", sourceUrl: "https://www.organicvalley.coop/about/", publishedAt: null, accessedAt, claim: "Organic Valley states that it is owned and run by organic farmers working cooperatively." },
    ],
  },
  {
    brand: "Blue Buffalo",
    aliases: ["Blue Wilderness"],
    status: "corporate_owned",
    statusLabel: "Corporate-owned",
    ownershipChain: [{ name: "Blue Buffalo", role: "brand" }, { name: "General Mills", role: "ultimate_parent" }],
    acquisition: { announcedOn: "2018-02-23", summary: "General Mills announced its acquisition of Blue Buffalo in 2018." },
    verifiedAsOf: accessedAt,
    evidence: [
      { title: "General Mills brands", publisher: "General Mills", sourceType: "company_portfolio", sourceUrl: "https://www.generalmills.com/our-food/brands", publishedAt: null, accessedAt, claim: "General Mills lists Blue Buffalo in its brand portfolio." },
      { title: "General Mills acquisition of Blue Buffalo", publisher: "General Mills", sourceType: "acquisition_announcement", sourceUrl: "https://investors.generalmills.com/press-releases/press-release-details/2018/General-Mills-Accelerates-Portfolio-Reshaping-With-Acquisition-of-Blue-Buffalo-Pet-Products/", publishedAt: "2018-02-23", accessedAt, claim: "General Mills announced its acquisition of Blue Buffalo." },
    ],
  },
  {
    brand: "Seventh Generation",
    aliases: [],
    status: "corporate_owned",
    statusLabel: "Corporate-owned",
    ownershipChain: [{ name: "Seventh Generation", role: "brand" }, { name: "Unilever", role: "ultimate_parent" }],
    acquisition: { announcedOn: null, summary: "Unilever identifies Seventh Generation as a Home Care brand and records its acquisition in the company's 2016 history." },
    verifiedAsOf: accessedAt,
    evidence: [
      { title: "Unilever 2021 information memorandum", publisher: "Unilever", sourceType: "company_portfolio", sourceUrl: "https://www.unilever.com/files/origin/d5af07469eda9fbda99d222a2ad168f50a281b48.pdf/unilever-2021-information-memorandum.pdf", publishedAt: "2021-05-11", accessedAt, claim: "Unilever identifies Seventh Generation among its Home Care brands." },
      { title: "Unilever 2017 information memorandum", publisher: "Unilever", sourceType: "acquisition_announcement", sourceUrl: "https://www.unilever.com/files/2017-information-memorandum.pdf", publishedAt: "2017-05-09", accessedAt, claim: "Unilever records that it acquired Seventh Generation, Inc. in 2016." },
    ],
  },
  {
    brand: "Tom's of Maine",
    aliases: ["Toms of Maine"],
    status: "corporate_owned",
    statusLabel: "Corporate-owned",
    ownershipChain: [{ name: "Tom's of Maine", role: "brand" }, { name: "Colgate-Palmolive Company", role: "ultimate_parent" }],
    acquisition: { announcedOn: "2006-05-01", summary: "Colgate-Palmolive announced the completed purchase of Tom's of Maine in 2006 and currently lists the brand in its portfolio." },
    verifiedAsOf: accessedAt,
    evidence: [
      { title: "Colgate-Palmolive brands", publisher: "Colgate-Palmolive", sourceType: "company_portfolio", sourceUrl: "https://www.colgatepalmolive.com/en-us/brands", publishedAt: null, accessedAt, claim: "Colgate-Palmolive lists Tom's of Maine in its Oral Health brand portfolio." },
      { title: "Colgate completes purchase of Tom's of Maine", publisher: "Colgate-Palmolive", sourceType: "acquisition_announcement", sourceUrl: "https://investor.colgatepalmolive.com/news-releases/news-release-details/colgate-completes-purchase-toms-maine/", publishedAt: "2006-05-01", accessedAt, claim: "Colgate-Palmolive announced the completion of its purchase of Tom's of Maine." },
    ],
  },
  {
    brand: "Newman's Own",
    aliases: ["Newmans Own"],
    status: "nonprofit_owned_claim",
    statusLabel: "Nonprofit-owned (foundation statement)",
    ownershipChain: [{ name: "Newman's Own", role: "brand" }, { name: "Newman's Own Foundation", role: "nonprofit_owner" }],
    acquisition: null,
    verifiedAsOf: accessedAt,
    evidence: [
      { title: "The Newman's Own Model", publisher: "Newman's Own Foundation", sourceType: "company_statement", sourceUrl: "https://newmansown.org/the-newmans-own-model/", publishedAt: null, accessedAt, claim: "Newman's Own Foundation states that it owns the food company and that 100% of profits and royalties from Newman’s Own products support its mission." },
    ],
  },
].map((profile) => brandOwnershipProfileSchema.parse(profile));

export function normalizeBrandOwnershipKey(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, " ").trim();
}

function normalized(value: string): string { return normalizeBrandOwnershipKey(value); }

export function brandOwnershipAvailability() {
  return {
    available: true,
    behavior: "The registry returns only exact registered brand matches with source links and verification dates. It does not infer ownership from a product name, barcode prefix, or missing result.",
    provider,
  };
}

export function listBrandSpotlights(): BrandOwnershipProfile[] {
  return profiles.map((profile) => ({ ...profile, aliases: [...profile.aliases], ownershipChain: profile.ownershipChain.map((entry) => ({ ...entry })), evidence: profile.evidence.map((entry) => ({ ...entry })), acquisition: profile.acquisition ? { ...profile.acquisition } : null }));
}

export function lookupBrandOwnership(requestedBrand: string, now = new Date()): BrandOwnershipLookup {
  const cleanBrand = requestedBrand.trim().slice(0, 160);
  const candidate = normalized(cleanBrand);
  const profile = profiles.find((entry) => [entry.brand, ...entry.aliases].some((name) => normalized(name) === candidate)) || null;
  return brandOwnershipLookupSchema.parse({
    provider,
    requestedBrand: cleanBrand,
    matched: Boolean(profile),
    matchMethod: "exact_registered_brand",
    profile,
    checkedAt: now.toISOString(),
    disclosure: profile
      ? "Read the linked evidence and its verification date. Corporate ownership can change; this profile is not a rating, recommendation, or statement about product quality."
      : "No verified ownership profile is registered for this exact brand. LyfeOS does not infer that it is independent, family-owned, or corporate-owned from an unmatched name.",
  });
}

function lookupFromProfile(requestedBrand: string, profile: BrandOwnershipProfile, now: Date): BrandOwnershipLookup {
  const cleanBrand = requestedBrand.trim().slice(0, 160);
  return brandOwnershipLookupSchema.parse({
    provider,
    requestedBrand: cleanBrand,
    matched: true,
    matchMethod: "exact_registered_brand",
    profile,
    checkedAt: now.toISOString(),
    disclosure: "Read the linked evidence and its verification date. Corporate ownership can change; this profile is not a rating, recommendation, or statement about product quality.",
  });
}

// Dynamic entries are written only by the narrowly authorized reviewer path.
// If no reviewed database profile exists, fall back to the versioned built-in
// registry so deployed citations remain available during a database outage.
export async function lookupReviewedBrandOwnership(requestedBrand: string, now = new Date()): Promise<BrandOwnershipLookup> {
  const cleanBrand = requestedBrand.trim().slice(0, 160);
  const key = normalized(cleanBrand);
  if (!key) return lookupBrandOwnership(requestedBrand, now);
  try {
    // Keep the cited built-in registry usable in the browser-free test suite and
    // during database initialization failures. The database is only needed for
    // the optional reviewer-maintained overlay.
    const { db } = await import("./db");
    const [row] = await db.select({ profile: brandOwnershipRegistryEntries.profile })
      .from(brandOwnershipRegistryLookupKeys)
      .innerJoin(brandOwnershipRegistryEntries, eq(brandOwnershipRegistryLookupKeys.entryId, brandOwnershipRegistryEntries.id))
      .where(and(eq(brandOwnershipRegistryLookupKeys.normalizedKey, key), eq(brandOwnershipRegistryEntries.status, "active")))
      .limit(1);
    const parsed = row ? brandOwnershipProfileSchema.safeParse(row.profile) : null;
    if (parsed?.success) return lookupFromProfile(cleanBrand, parsed.data, now);
  } catch {
    // A lookup failure must never manufacture an ownership conclusion.
  }
  return lookupBrandOwnership(cleanBrand, now);
}

export async function listReviewedBrandSpotlights(): Promise<BrandOwnershipProfile[]> {
  try {
    const { db } = await import("./db");
    const rows = await db.select({ profile: brandOwnershipRegistryEntries.profile })
      .from(brandOwnershipRegistryEntries)
      .where(eq(brandOwnershipRegistryEntries.status, "active"))
      .orderBy(brandOwnershipRegistryEntries.updatedAt)
      .limit(100);
    const reviewed = rows.flatMap((row) => {
      const parsed = brandOwnershipProfileSchema.safeParse(row.profile);
      return parsed.success ? [parsed.data] : [];
    });
    const known = new Set(reviewed.map((profile) => normalized(profile.brand)));
    return [...reviewed, ...listBrandSpotlights().filter((profile) => !known.has(normalized(profile.brand)))];
  } catch {
    return listBrandSpotlights();
  }
}
