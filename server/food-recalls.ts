import { foodRecallLookupSchema, type FoodRecallLookup, type FoodRecallMatch } from "@shared/food-recalls";

const openFdaBaseUrl = "https://api.fda.gov/food/enforcement.json";
const provider = {
  id: "openfda_food_enforcement" as const,
  name: "FDA Food Enforcement Reports" as const,
  datasetVersion: "live-api",
  attributionText: "Recall information is from FDA Food Enforcement Reports via openFDA. A text match is not confirmation that your package, lot, or location is included.",
  attributionUrl: "https://open.fda.gov/apis/food/enforcement/",
};

export class FoodRecallError extends Error {
  constructor(public readonly code: "unavailable" | "provider_failure" | "invalid_response", message: string) {
    super(message);
  }
}

function cleanText(value: unknown, maximum: number): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim().slice(0, maximum) : null;
}

function cleanDate(value: unknown): string | null {
  const date = cleanText(value, 8);
  return date && /^\d{8}$/.test(date) ? date : null;
}

function escapedPhrase(value: string): string {
  return value.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim();
}

function sourceUrl(recallNumber: string): string {
  const params = new URLSearchParams({ search: `recall_number:"${escapedPhrase(recallNumber)}"`, limit: "1" });
  return `${openFdaBaseUrl}?${params.toString()}`;
}

function comparablePackageCode(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeMatch(value: unknown, packageCode: string | null): FoodRecallMatch | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const recallNumber = cleanText(record.recall_number, 80);
  const productDescription = cleanText(record.product_description, 4_000);
  if (!recallNumber || !productDescription) return null;
  return {
    recallNumber,
    classification: cleanText(record.classification, 80),
    status: cleanText(record.status, 80),
    productDescription,
    reasonForRecall: cleanText(record.reason_for_recall, 4_000),
    recallingFirm: cleanText(record.recalling_firm, 300),
    distributionPattern: cleanText(record.distribution_pattern, 4_000),
    codeInfo: cleanText(record.code_info, 4_000),
    packageCodeTextMatch: Boolean(packageCode && cleanText(record.code_info, 4_000) && comparablePackageCode(cleanText(record.code_info, 4_000)!).includes(comparablePackageCode(packageCode))),
    recallInitiationDate: cleanDate(record.recall_initiation_date),
    reportDate: cleanDate(record.report_date),
    terminationDate: cleanDate(record.termination_date),
    sourceUrl: sourceUrl(recallNumber),
  };
}

export function foodRecallAvailability(env: NodeJS.ProcessEnv = process.env) {
  const disabled = env.OPENFDA_FOOD_RECALLS_ENABLED === "false";
  return {
    available: !disabled,
    reason: disabled ? "FDA food recall lookups are disabled for this release." : null,
    behavior: "LyfeOS checks the public FDA Food Enforcement Reports feed when you request a review. It does not store the lookup or treat no text match as a safety finding.",
    provider,
  };
}

export async function lookupFoodRecalls(
  input: { productName: string; brand?: string | null; packageCode?: string | null },
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<FoodRecallLookup> {
  const availability = foodRecallAvailability(env);
  if (!availability.available) throw new FoodRecallError("unavailable", availability.reason!);

  const productName = input.productName.trim().slice(0, 160);
  const brand = input.brand?.trim().slice(0, 120) || null;
  const packageCode = input.packageCode?.trim().slice(0, 120) || null;
  if (productName.length < 2) throw new FoodRecallError("invalid_response", "Enter a product name before checking recall reports.");

  const phrase = escapedPhrase([brand, productName].filter(Boolean).join(" ")) || escapedPhrase(productName);
  const params = new URLSearchParams({ search: `product_description:"${phrase}"`, limit: "10" });
  const apiKey = env.OPENFDA_API_KEY?.trim();
  if (apiKey) params.set("api_key", apiKey);

  let response: Response;
  try {
    response = await fetchImpl(`${openFdaBaseUrl}?${params.toString()}`, {
      headers: {
        Accept: "application/json",
        ...(env.OPENFDA_USER_AGENT?.trim() ? { "User-Agent": env.OPENFDA_USER_AGENT.trim() } : {}),
      },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new FoodRecallError("provider_failure", "The FDA recall service could not be reached.");
  }

  if (response.status === 404) {
    return foodRecallLookupSchema.parse({
      provider,
      query: { productName, brand, packageCode, matchMethod: "product_description_text" },
      checkedAt: new Date().toISOString(),
      matches: [],
      disclosure: "No FDA enforcement-report product-description text matched this search. That is not a finding that the product is safe or not recalled; verify current package codes and official recall notices.",
    });
  }
  if (!response.ok) throw new FoodRecallError("provider_failure", "The FDA recall service did not complete this lookup.");

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new FoodRecallError("invalid_response", "The FDA recall service returned an unreadable response.");
  }
  const rawResults = body && typeof body === "object" && Array.isArray((body as { results?: unknown[] }).results) ? (body as { results: unknown[] }).results : null;
  if (!rawResults) throw new FoodRecallError("invalid_response", "The FDA recall service returned an unexpected response.");
  const matches = rawResults.map((match) => normalizeMatch(match, packageCode)).filter((match): match is FoodRecallMatch => Boolean(match));
  return foodRecallLookupSchema.parse({
    provider,
    query: { productName, brand, packageCode, matchMethod: "product_description_text" },
    checkedAt: new Date().toISOString(),
    matches,
    disclosure: packageCode ? "These are possible product-description text matches from FDA Food Enforcement Reports. A package-code text match means your entered code appears in the FDA record, not that LyfeOS has determined your package is included. Compare the full code, dates, distribution, and official recall notice before acting." : "These are possible product-description text matches from FDA Food Enforcement Reports. Compare the package code or lot, dates, distribution, and recall number before acting. A search cannot determine whether your specific package is included.",
  });
}
