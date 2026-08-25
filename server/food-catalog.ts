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

type CatalogConfig = { baseUrl: string; token: string; signingSecret: string };

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
  if (!baseUrl || !token || !signingSecret || signingSecret.length < 32 || !validGatewayUrl(baseUrl)) return null;
  return { baseUrl, token, signingSecret };
}

export function foodCatalogAvailability(env: NodeJS.ProcessEnv = process.env) {
  const configured = Boolean(getFoodCatalogConfig(env));
  return {
    available: configured,
    reason: configured ? null : "A licensed food-catalog gateway, server token, and signing secret are not configured for this release.",
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

async function gatewayRequest(path: string, config: CatalogConfig, fetchImpl: typeof fetch = fetch): Promise<unknown> {
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

type FoodCatalogSearchInput = { query: string; territory: string; locale: string; limit: number } | { cursor: string };

export async function searchFoodCatalog(input: FoodCatalogSearchInput, env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch) {
  const config = getFoodCatalogConfig(env);
  if (!config) throw new FoodCatalogError("unavailable", foodCatalogAvailability(env).reason!);
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
