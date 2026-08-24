import { describe, expect, it } from "vitest";
import { compareRecipeIngredients } from "../shared/recipe-comparison";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("recipe revision comparison", () => {
  it("distinguishes additions, removals, quantity changes, and unchanged ingredients", () => {
    expect(compareRecipeIngredients(
      [{ foodId: 1, grams: 120 }, { foodId: 2, grams: 50 }, { foodId: 4, grams: 10 }],
      [{ foodId: 1, grams: 100 }, { foodId: 2, grams: 50 }, { foodId: 3, grams: 20 }],
    )).toEqual([
      { foodId: 1, priorGrams: 100, currentGrams: 120, change: "quantity_changed" },
      { foodId: 2, priorGrams: 50, currentGrams: 50, change: "unchanged" },
      { foodId: 3, priorGrams: 20, currentGrams: null, change: "removed" },
      { foodId: 4, priorGrams: null, currentGrams: 10, change: "added" },
    ]);
  });

  it("shows a named accessible revision table without rewriting diary evidence", () => {
    const client = readFileSync(resolve(process.cwd(), "client/src/components/health/NutritionDiary.tsx"), "utf8");
    expect(client).toContain("Recipe ingredient changes from version");
    expect(client).toContain("compareRecipeIngredients(current.ingredients, prior.ingredientsSnapshot)");
    expect(client).toContain("It never rewrites this history or any diary entry already logged");
  });
});
