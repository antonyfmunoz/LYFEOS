import { brandOwnershipLookupSchema, brandOwnershipProfileSchema, type BrandOwnershipLookup, type BrandOwnershipProfile } from "@shared/brand-ownership";

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
].map((profile) => brandOwnershipProfileSchema.parse(profile));

function normalized(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, " ").trim();
}

export function brandOwnershipAvailability() {
  return {
    available: true,
    behavior: "The registry returns only exact registered brand matches with source links and verification dates. It does not infer ownership from a product name, barcode prefix, or missing result.",
    provider,
  };
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
