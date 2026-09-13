import { describe, expect, it } from "vitest";
import { compareFoods } from "../server/food-comparison";

describe("food comparison", () => {
  it("compares only supplied compatible per-100g facts without inventing a score", () => {
    const result = compareFoods(
      { id: 1, name: "Left", brand: null, servingSizeGrams: 30, source: "manual", nutrients: [{ nutrientKey: "protein_g", amountPer100g: 10, unit: "g" }, { nutrientKey: "sodium_mg", amountPer100g: 30, unit: "mg" }] },
      { id: 2, name: "Right", brand: "Example", servingSizeGrams: 40, source: "catalog", nutrients: [{ nutrientKey: "protein_g", amountPer100g: 14, unit: "g" }, { nutrientKey: "sodium_mg", amountPer100g: 20, unit: "mg" }, { nutrientKey: "fiber_g", amountPer100g: 8, unit: "g" }] },
    );
    expect(result.basis).toBe("per_100g");
    expect(result.coverage).toEqual({ comparableFacts: 2, totalFacts: 8 });
    expect(result.rows.find((row) => row.nutrientKey === "protein_g")).toMatchObject({ left: 10, right: 14, delta: 4, relation: "higher" });
    expect(result.rows.find((row) => row.nutrientKey === "sodium_mg")).toMatchObject({ left: 30, right: 20, delta: -10, relation: "lower" });
    expect(result.rows.find((row) => row.nutrientKey === "fiber_g")).toMatchObject({ left: null, right: 8, delta: null, relation: "unknown" });
    expect(JSON.stringify(result)).not.toContain("score");
  });

  it("does not compare values carrying incompatible units", () => {
    const result = compareFoods(
      { id: 1, name: "Left", brand: null, servingSizeGrams: 100, source: "manual", nutrients: [{ nutrientKey: "sodium_mg", amountPer100g: 20, unit: "mg" }] },
      { id: 2, name: "Right", brand: null, servingSizeGrams: 100, source: "manual", nutrients: [{ nutrientKey: "sodium_mg", amountPer100g: 0.02, unit: "g" }] },
    );
    expect(result.rows.find((row) => row.nutrientKey === "sodium_mg")).toMatchObject({ delta: null, relation: "unknown" });
  });
});
