import { describe, expect, it } from "vitest";
import { extractStructuredRecipeDraft } from "../server/recipe-import";

describe("structured recipe drafts", () => {
  it("extracts only publisher JSON-LD recipe lines without inventing portions or nutrition", () => {
    const draft = extractStructuredRecipeDraft(`<!doctype html><script type="application/ld+json">{
      "@context":"https://schema.org", "@graph":[{"@type":"BreadcrumbList","name":"Ignore"},{"@type":["Recipe","Thing"],"name":"Measured lentil stew","recipeYield":"4 servings","recipeIngredient":["2 cups cooked lentils","1 medium onion"]}]
    }</script>`, "https://recipes.example/lentils");
    expect(draft).toEqual({
      sourceUrl: "https://recipes.example/lentils",
      name: "Measured lentil stew",
      yieldText: "4 servings",
      ingredients: ["2 cups cooked lentils", "1 medium onion"],
      extractionMethod: "structured_recipe_json_ld",
    });
    expect(JSON.stringify(draft)).not.toMatch(/calorie|nutrient|gram/i);
  });

  it("refuses unstructured pages and malformed publisher metadata", () => {
    expect(extractStructuredRecipeDraft("<h1>Recipe</h1><p>one cup oats</p>", "https://recipes.example/plain")).toBeNull();
    expect(extractStructuredRecipeDraft("<script type='application/ld+json'>{not json}</script>", "https://recipes.example/bad")).toBeNull();
  });

  it("bounds ingredient lines to the recipe model limit", () => {
    const ingredients = Array.from({ length: 64 }, (_, index) => `Ingredient ${index + 1}`);
    const draft = extractStructuredRecipeDraft(`<script type="application/ld+json">${JSON.stringify({ "@type": "Recipe", name: "Batch", recipeIngredient: ingredients })}</script>`, "https://recipes.example/batch");
    expect(draft?.ingredients).toHaveLength(60);
  });
});
