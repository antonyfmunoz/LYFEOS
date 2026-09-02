import crypto from "crypto";
import {
  foodCatalogBarcodeResponseSchema,
  foodCatalogCursorReceiptSchema,
  foodCatalogLookupReceiptSchema,
  foodCatalogSearchResponseSchema,
  type FoodCatalogCursorReceipt,
  type FoodCatalogItem,
  type FoodCatalogLookupReceipt,
  type FoodCatalogProvider,
} from "@shared/food-catalog";

const lookupLifetimeMs = 10 * 60 * 1000;

export class FoodCatalogError extends Error {
  constructor(public readonly code: "unavailable" | "provider_failure" | "invalid_response" | "invalid_cursor", message: string) {
    super(message);
  }
}

type GatewayCatalogConfig = { kind: "gateway"; baseUrl: string; token: string; signingSecret: string };
type OpenFoodFactsCatalogConfig = { kind: "open_food_facts"; signingSecret: string; userAgent: string };
type CatalogConfig = GatewayCatalogConfig | OpenFoodFactsCatalogConfig;

const openFoodFactsBaseUrl = "https://world.openfoodfacts.org";
const openFoodFactsSearchBaseUrl = "https://search.openfoodfacts.org";
const openFoodFactsProvider = {
  id: "open_food_facts",
  name: "Open Food Facts",
  datasetVersion: "api-v3.6",
  territories: ["US", "CA", "MX", "BR", "GB", "IE", "FR", "DE", "ES", "IT", "PT", "NL", "BE", "CH", "AT", "SE", "NO", "DK", "FI", "PL", "AU", "NZ", "JP", "KR", "IN"],
  attributionText: "Product data from Open Food Facts, available under the Open Database License (ODbL). Product information is community-contributed and may be incomplete or inaccurate.",
  attributionUrl: "https://world.openfoodfacts.org/data",
} as const;

const openFoodFactsNutrients: Array<{ sourceKey: string; nutrientKey: string; unit: string }> = [
  { sourceKey: "energy-kcal", nutrientKey: "energy_kcal", unit: "kcal" },
  { sourceKey: "proteins", nutrientKey: "protein_g", unit: "g" },
  { sourceKey: "carbohydrates", nutrientKey: "carbohydrate_g", unit: "g" },
  { sourceKey: "fat", nutrientKey: "fat_g", unit: "g" },
  { sourceKey: "fiber", nutrientKey: "fiber_g", unit: "g" },
  { sourceKey: "sugars", nutrientKey: "sugar_g", unit: "g" },
  { sourceKey: "added-sugars", nutrientKey: "added_sugar_g", unit: "g" },
  { sourceKey: "sodium", nutrientKey: "sodium_mg", unit: "mg" },
  { sourceKey: "water", nutrientKey: "water_g", unit: "g" },
  { sourceKey: "alcohol", nutrientKey: "alcohol_g", unit: "g" },
  { sourceKey: "starch", nutrientKey: "starch_g", unit: "g" },
  { sourceKey: "saturated-fat", nutrientKey: "saturated_fat_g", unit: "g" },
  { sourceKey: "monounsaturated-fat", nutrientKey: "monounsaturated_fat_g", unit: "g" },
  { sourceKey: "polyunsaturated-fat", nutrientKey: "polyunsaturated_fat_g", unit: "g" },
  { sourceKey: "trans-fat", nutrientKey: "trans_fat_g", unit: "g" },
  { sourceKey: "omega-3-fat", nutrientKey: "omega_3_g", unit: "g" },
  { sourceKey: "omega-6-fat", nutrientKey: "omega_6_g", unit: "g" },
  { sourceKey: "cholesterol", nutrientKey: "cholesterol_mg", unit: "mg" },
  { sourceKey: "calcium", nutrientKey: "calcium_mg", unit: "mg" },
  { sourceKey: "copper", nutrientKey: "copper_mg", unit: "mg" },
  { sourceKey: "iron", nutrientKey: "iron_mg", unit: "mg" },
  { sourceKey: "magnesium", nutrientKey: "magnesium_mg", unit: "mg" },
  { sourceKey: "manganese", nutrientKey: "manganese_mg", unit: "mg" },
  { sourceKey: "phosphorus", nutrientKey: "phosphorus_mg", unit: "mg" },
  { sourceKey: "potassium", nutrientKey: "potassium_mg", unit: "mg" },
  { sourceKey: "selenium", nutrientKey: "selenium_ug", unit: "µg" },
  { sourceKey: "zinc", nutrientKey: "zinc_mg", unit: "mg" },
  { sourceKey: "vitamin-a", nutrientKey: "vitamin_a_rae_ug", unit: "µg RAE" },
  { sourceKey: "vitamin-c", nutrientKey: "vitamin_c_mg", unit: "mg" },
  { sourceKey: "vitamin-d", nutrientKey: "vitamin_d_ug", unit: "µg" },
  { sourceKey: "vitamin-e", nutrientKey: "vitamin_e_mg", unit: "mg" },
  { sourceKey: "vitamin-k", nutrientKey: "vitamin_k_ug", unit: "µg" },
  { sourceKey: "vitamin-b1", nutrientKey: "thiamin_mg", unit: "mg" },
  { sourceKey: "vitamin-b2", nutrientKey: "riboflavin_mg", unit: "mg" },
  { sourceKey: "vitamin-pp", nutrientKey: "niacin_mg", unit: "mg" },
  { sourceKey: "vitamin-b6", nutrientKey: "vitamin_b6_mg", unit: "mg" },
  { sourceKey: "vitamin-b9", nutrientKey: "folate_dfe_ug", unit: "µg DFE" },
  { sourceKey: "vitamin-b12", nutrientKey: "vitamin_b12_ug", unit: "µg" },
];

function validGatewayUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname));
  } catch {
    return false;
  }
}

export function getFoodCatalogConfig(env: NodeJS.ProcessEnv = process.env): CatalogConfig | null {
  const baseUrl = env.FOOD_CATALOG_GATEWAY_URL?.trim().replace(/\/$/, "");
  const token = env.FOOD_CATALOG_GATEWAY_TOKEN?.trim();
  const signingSecret = env.FOOD_CATALOG_LOOKUP_SIGNING_SECRET?.trim() || env.SESSION_SECRET?.trim();
  if (!signingSecret || signingSecret.length < 32) return null;
  if (baseUrl && token && validGatewayUrl(baseUrl)) return { kind: "gateway", baseUrl, token, signingSecret };
  if (env.OPEN_FOOD_FACTS_ENABLED === "true") {
    const userAgent = env.OPEN_FOOD_FACTS_USER_AGENT?.trim();
    if (!userAgent || userAgent.length < 12 || userAgent.length > 300) return null;
    return { kind: "open_food_facts", signingSecret, userAgent };
  }
  return null;
}

export function foodCatalogAvailability(env: NodeJS.ProcessEnv = process.env) {
  const configured = Boolean(getFoodCatalogConfig(env));
  return {
    available: configured,
    reason: configured ? null : "A food-catalog provider and lookup signing secret are not configured for this release.",
    behavior: "Catalog results are source-attributed and never enter the private food diary until the user explicitly saves a copy.",
  };
}

function signature(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(`lyfeos.food-catalog.lookup.v1.${payload}`).digest("base64url");
}

function canonicalBase64url(value: string): Buffer | null {
  const decoded = Buffer.from(value, "base64url");
  return decoded.toString("base64url") === value ? decoded : null;
}

export function createFoodCatalogLookupToken(provider: FoodCatalogProvider, item: FoodCatalogItem, secret: string, now = Date.now()): string {
  const receipt: FoodCatalogLookupReceipt = { version: 1, expiresAt: now + lookupLifetimeMs, provider, item };
  const payload = Buffer.from(JSON.stringify(receipt), "utf8").toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

export function verifyFoodCatalogLookupToken(token: string, secret: string, now = Date.now()): FoodCatalogLookupReceipt | null {
  const [payload, supplied, extra] = token.split(".");
  if (!payload || !supplied || extra) return null;
  const expected = signature(payload, secret);
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  if (suppliedBytes.length !== expectedBytes.length || !crypto.timingSafeEqual(suppliedBytes, expectedBytes)) return null;
  try {
    const parsed = foodCatalogLookupReceiptSchema.safeParse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    return parsed.success && parsed.data.expiresAt > now ? parsed.data : null;
  } catch {
    return null;
  }
}

export function createFoodCatalogCursorToken(receipt: Omit<FoodCatalogCursorReceipt, "version" | "expiresAt">, secret: string, now = Date.now()): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", crypto.createHash("sha256").update(secret).digest(), iv);
  cipher.setAAD(Buffer.from("lyfeos.food-catalog.cursor.v1", "utf8"));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify({ version: 1, expiresAt: now + lookupLifetimeMs, ...receipt }), "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}`;
}

export function verifyFoodCatalogCursorToken(token: string, secret: string, now = Date.now()): FoodCatalogCursorReceipt | null {
  try {
    const [version, encodedIv, encodedCiphertext, encodedTag, extra] = token.split(".");
    if (version !== "v1" || !encodedIv || !encodedCiphertext || !encodedTag || extra) return null;
    const iv = canonicalBase64url(encodedIv);
    const ciphertext = canonicalBase64url(encodedCiphertext);
    const tag = canonicalBase64url(encodedTag);
    if (!iv || !ciphertext || !tag || iv.length !== 12 || tag.length !== 16) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", crypto.createHash("sha256").update(secret).digest(), iv);
    decipher.setAAD(Buffer.from("lyfeos.food-catalog.cursor.v1", "utf8"));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    const parsed = foodCatalogCursorReceiptSchema.safeParse(JSON.parse(plaintext));
    return parsed.success && parsed.data.expiresAt > now ? parsed.data : null;
  } catch {
    return null;
  }
}

async function gatewayRequest(path: string, config: GatewayCatalogConfig, fetchImpl: typeof fetch = fetch): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(`${config.baseUrl}${path}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${config.token}` },
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new FoodCatalogError("provider_failure", "The food catalog did not respond.");
  }
  if (!response.ok) throw new FoodCatalogError("provider_failure", "The food catalog could not complete this lookup.");
  try {
    return await response.json();
  } catch {
    throw new FoodCatalogError("invalid_response", "The food catalog returned an invalid response.");
  }
}

function openFoodFactsNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function convertOpenFoodFactsUnit(value: number, sourceUnit: unknown, targetUnit: string): number | null {
  const unit = typeof sourceUnit === "string" ? sourceUnit.trim().replace("μ", "µ") : "g";
  if (targetUnit === "kcal") return unit === "kcal" ? value : null;
  if (targetUnit === "g") {
    if (unit === "g") return value;
    if (unit === "mg") return value / 1_000;
    if (unit === "µg") return value / 1_000_000;
  }
  if (targetUnit === "mg") {
    if (unit === "mg") return value;
    if (unit === "g") return value * 1_000;
    if (unit === "µg") return value / 1_000;
  }
  if (targetUnit.startsWith("µg")) {
    if (unit === "µg") return value;
    if (unit === "mg") return value * 1_000;
    if (unit === "g") return value * 1_000_000;
  }
  return null;
}

function gramsFromServingSize(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d+(?:[.,]\d+)?)\s*(g|gram|grams)\b/i);
  if (!match) return null;
  const grams = Number(match[1].replace(",", "."));
  return Number.isFinite(grams) && grams > 0 && grams <= 100_000 ? grams : null;
}

function normalizedOpenFoodFactsItem(raw: unknown, territory: string, locale: string): FoodCatalogItem | null {
  if (!raw || typeof raw !== "object") return null;
  const product = raw as Record<string, unknown>;
  const externalId = typeof product.code === "string" ? product.code.trim() : "";
  const name = typeof product.product_name === "string" ? product.product_name.trim() : "";
  if (!/^\d{8,14}$/.test(externalId) || !name) return null;
  const nutriments = product.nutriments && typeof product.nutriments === "object" ? product.nutriments as Record<string, unknown> : {};
  const nutrients = openFoodFactsNutrients.flatMap(({ sourceKey, nutrientKey, unit }) => {
    const rawValue = openFoodFactsNumber(nutriments[`${sourceKey}_100g`] ?? nutriments[sourceKey]);
    if (rawValue === null) return [];
    const converted = convertOpenFoodFactsUnit(rawValue, nutriments[`${sourceKey}_unit`], unit);
    return converted === null ? [] : [{ nutrientKey, amountPer100g: Number(converted.toFixed(6)), unit }];
  });
  const servingSizeGrams = gramsFromServingSize(product.serving_size) || 100;
  const portions = gramsFromServingSize(product.serving_size) ? [{ label: typeof product.serving_size === "string" ? product.serving_size.trim().slice(0, 80) : "1 serving", gramsPerUnit: servingSizeGrams }] : [];
  const itemVersion = typeof product.last_modified_t === "number" && Number.isInteger(product.last_modified_t) && product.last_modified_t > 0 ? String(product.last_modified_t) : "unversioned";
  return {
    externalId,
    itemVersion,
    name: name.slice(0, 160),
    brand: typeof product.brands === "string" && product.brands.trim() ? product.brands.trim().slice(0, 120) : null,
    barcode: externalId,
    locale,
    territory,
    servingSizeGrams,
    ingredientsText: typeof product.ingredients_text === "string" && product.ingredients_text.trim() ? product.ingredients_text.trim().slice(0, 20_000) : null,
    portions,
    nutrients,
  };
}

async function openFoodFactsRequest(path: string, config: OpenFoodFactsCatalogConfig, fetchImpl: typeof fetch): Promise<unknown> {
  let response: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await fetchImpl(path.startsWith("https://") ? path : `${openFoodFactsBaseUrl}${path}`, {
        headers: { Accept: "application/json", "User-Agent": config.userAgent },
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      if (attempt === 0) continue;
      throw new FoodCatalogError("provider_failure", "The food catalog did not respond.");
    }
    if (response.ok || ![429, 502, 503, 504].includes(response.status) || attempt === 1) break;
  }
  if (!response) throw new FoodCatalogError("provider_failure", "The food catalog did not respond.");
  if (!response.ok) throw new FoodCatalogError("provider_failure", "The food catalog could not complete this lookup.");
  try { return await response.json(); } catch { throw new FoodCatalogError("invalid_response", "The food catalog returned an invalid response."); }
}

async function searchOpenFoodFacts(input: FoodCatalogSearchInput, config: OpenFoodFactsCatalogConfig, fetchImpl: typeof fetch) {
  const continuation = "cursor" in input ? verifyFoodCatalogCursorToken(input.cursor, config.signingSecret) : null;
  if ("cursor" in input && (!continuation || continuation.providerId !== openFoodFactsProvider.id || continuation.datasetVersion !== openFoodFactsProvider.datasetVersion)) throw new FoodCatalogError("invalid_cursor", "This catalog result page expired or is invalid. Start the search again.");
  const request = "cursor" in input ? continuation! : input;
  if (!openFoodFactsProvider.territories.includes(request.territory as never)) throw new FoodCatalogError("unavailable", "This food catalog is not configured for the selected territory.");
  const page = continuation ? Number(continuation.providerCursor) : 1;
  if (!Number.isInteger(page) || page < 1 || page > 500) throw new FoodCatalogError("invalid_cursor", "This catalog result page expired or is invalid. Start the search again.");
  const params = new URLSearchParams({ q: request.query, page: String(page), page_size: String(request.limit) });
  const response = await openFoodFactsRequest(`${openFoodFactsSearchBaseUrl}/search?${params}`, config, fetchImpl) as { hits?: unknown[]; page_count?: number | string };
  const items = Array.isArray(response.hits) ? response.hits.map((product) => normalizedOpenFoodFactsItem(product, request.territory, request.locale)).filter((item): item is FoodCatalogItem => Boolean(item)) : [];
  const pageCount = typeof response.page_count === "string" ? Number(response.page_count) : response.page_count;
  const nextCursor = Number.isFinite(pageCount) && pageCount! >= request.limit
    ? createFoodCatalogCursorToken({ query: request.query, territory: request.territory, locale: request.locale, limit: request.limit, providerId: openFoodFactsProvider.id, datasetVersion: openFoodFactsProvider.datasetVersion, providerCursor: String(page + 1) }, config.signingSecret)
    : null;
  return { provider: openFoodFactsProvider, items, nextCursor };
}

async function lookupOpenFoodFactsBarcode(barcode: string, config: OpenFoodFactsCatalogConfig, fetchImpl: typeof fetch) {
  const fields = "code,product_name,brands,nutriments,ingredients_text,serving_size,last_modified_t";
  const response = await openFoodFactsRequest(`/api/v3/product/${encodeURIComponent(barcode)}?fields=${fields}`, config, fetchImpl) as { status?: number | string; product?: unknown; result?: { id?: string } };
  const found = response.status === 1 || response.status === "success" || response.result?.id === "product_found";
  return { provider: openFoodFactsProvider, item: found ? normalizedOpenFoodFactsItem(response.product, "US", "en-US") : null };
}

type FoodCatalogSearchInput = { query: string; territory: string; locale: string; limit: number } | { cursor: string };

export async function searchFoodCatalog(input: FoodCatalogSearchInput, env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch) {
  const config = getFoodCatalogConfig(env);
  if (!config) throw new FoodCatalogError("unavailable", foodCatalogAvailability(env).reason!);
  if (config.kind === "open_food_facts") return searchOpenFoodFacts(input, config, fetchImpl);
  const continuation = "cursor" in input ? verifyFoodCatalogCursorToken(input.cursor, config.signingSecret) : null;
  if ("cursor" in input && !continuation) throw new FoodCatalogError("invalid_cursor", "This catalog result page expired or is invalid. Start the search again.");
  const request = "cursor" in input ? continuation! : input;
  const params = new URLSearchParams({ q: request.query, territory: request.territory, locale: request.locale, limit: String(request.limit) });
  if (continuation) params.set("cursor", continuation.providerCursor);
  const parsed = foodCatalogSearchResponseSchema.safeParse(await gatewayRequest(`/v1/foods/search?${params}`, config, fetchImpl));
  if (!parsed.success) throw new FoodCatalogError("invalid_response", "The food catalog response did not satisfy the LyfeOS attribution contract.");
  if (continuation && (parsed.data.provider.id !== continuation.providerId || parsed.data.provider.datasetVersion !== continuation.datasetVersion)) {
    throw new FoodCatalogError("invalid_response", "The food catalog changed source identity during pagination. Start the search again.");
  }
  return {
    provider: parsed.data.provider,
    items: parsed.data.items.map((item) => ({ ...item, lookupToken: createFoodCatalogLookupToken(parsed.data.provider, item, config.signingSecret) })),
    nextCursor: parsed.data.nextCursor ? createFoodCatalogCursorToken({
      query: request.query, territory: request.territory, locale: request.locale, limit: request.limit,
      providerId: parsed.data.provider.id, datasetVersion: parsed.data.provider.datasetVersion, providerCursor: parsed.data.nextCursor,
    }, config.signingSecret) : null,
  };
}

export async function lookupFoodCatalogBarcode(barcode: string, env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch) {
  const config = getFoodCatalogConfig(env);
  if (!config) throw new FoodCatalogError("unavailable", foodCatalogAvailability(env).reason!);
  if (config.kind === "open_food_facts") return lookupOpenFoodFactsBarcode(barcode, config, fetchImpl);
  const parsed = foodCatalogBarcodeResponseSchema.safeParse(await gatewayRequest(`/v1/foods/barcodes/${encodeURIComponent(barcode)}`, config, fetchImpl));
  if (!parsed.success) throw new FoodCatalogError("invalid_response", "The food catalog response did not satisfy the LyfeOS attribution contract.");
  return {
    ...parsed.data,
    item: parsed.data.item ? { ...parsed.data.item, lookupToken: createFoodCatalogLookupToken(parsed.data.provider, parsed.data.item, config.signingSecret) } : null,
  };
}

export function verifyConfiguredFoodCatalogToken(token: string, env: NodeJS.ProcessEnv = process.env) {
  const config = getFoodCatalogConfig(env);
  return config ? verifyFoodCatalogLookupToken(token, config.signingSecret) : null;
}
