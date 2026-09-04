import { load } from "cheerio";
import { fetchPublicWebPage } from "./public-web";

const MAX_RECIPE_DOCUMENT_BYTES = 1_500_000;
const MAX_RECIPE_INGREDIENTS = 60;

export type RecipeImportDraft = {
  sourceUrl: string;
  name: string;
  yieldText: string | null;
  ingredients: string[];
  extractionMethod: "structured_recipe_json_ld";
};

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function recipeNodes(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(recipeNodes);
  if (!value || typeof value !== "object") return [];
  const node = value as Record<string, unknown>;
  const type = node["@type"];
  const types = Array.isArray(type) ? type : [type];
  const current = types.some((item) => typeof item === "string" && item.toLowerCase() === "recipe") ? [node] : [];
  return [...current, ...Object.values(node).flatMap(recipeNodes)];
}

export function extractStructuredRecipeDraft(html: string, sourceUrl: string): RecipeImportDraft | null {
  const $ = load(html);
  const candidates: Record<string, unknown>[] = [];
  $("script[type='application/ld+json']").each((_, element) => {
    const text = $(element).text().trim();
    if (!text || text.length > MAX_RECIPE_DOCUMENT_BYTES) return;
    try { candidates.push(...recipeNodes(JSON.parse(text))); } catch { /* Ignore malformed publisher metadata. */ }
  });
  const recipe = candidates.find((candidate) => {
    const name = cleanText(candidate.name, 160);
    const ingredients = candidate.recipeIngredient;
    return Boolean(name && Array.isArray(ingredients) && ingredients.some((item) => cleanText(item, 500)));
  });
  if (!recipe) return null;
  const name = cleanText(recipe.name, 160);
  const ingredients = Array.isArray(recipe.recipeIngredient)
    ? recipe.recipeIngredient.map((item) => cleanText(item, 500)).filter((item): item is string => Boolean(item)).slice(0, MAX_RECIPE_INGREDIENTS)
    : [];
  if (!name || !ingredients.length) return null;
  return {
    sourceUrl,
    name,
    yieldText: cleanText(recipe.recipeYield, 160),
    ingredients,
    extractionMethod: "structured_recipe_json_ld",
  };
}

async function readBoundedText(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RECIPE_DOCUMENT_BYTES) throw new Error("That recipe page is too large to import safely.");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_RECIPE_DOCUMENT_BYTES) {
        await reader.cancel();
        throw new Error("That recipe page is too large to import safely.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

export async function importStructuredRecipe(rawUrl: string): Promise<RecipeImportDraft> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetchPublicWebPage(rawUrl, {
      signal: controller.signal,
      headers: { accept: "text/html,application/xhtml+xml", "user-agent": "LyfeOS Recipe Import/1.0 (+https://lyfeos.net)" },
    });
    if (!response.ok) throw new Error("The recipe page could not be retrieved.");
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("text/html") && !contentType.toLowerCase().includes("application/xhtml+xml")) throw new Error("That URL did not return a recipe webpage.");
    const sourceUrl = response.url || rawUrl;
    const draft = extractStructuredRecipeDraft(await readBoundedText(response), sourceUrl);
    if (!draft) throw new Error("No structured recipe ingredients were found on that page. Add the ingredients from the recipe or its label manually.");
    return draft;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("The recipe page took too long to respond. Try again or add it manually.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
