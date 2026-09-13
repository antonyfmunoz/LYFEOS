import { nutrientDefinitions } from "./nutrition";

export const foodComparisonNutrientKeys = [
  "energy_kcal", "protein_g", "fiber_g", "sugar_g", "added_sugar_g", "sodium_mg", "saturated_fat_g", "potassium_mg",
] as const;

type ComparisonNutrientKey = (typeof foodComparisonNutrientKeys)[number];

export type ComparableFood = {
  id: number; name: string; brand: string | null; servingSizeGrams: number; source: string;
  catalogProviderId?: string | null; catalogDatasetVersion?: string | null;
  nutrients: Array<{ nutrientKey: string; amountPer100g: number; unit: string }>;
};

function finite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(3)) : null;
}

// A comparison is a transparent rendering of saved facts, never a health score
// or a recommendation inferred from incomplete labels and personal context.
export function compareFoods(leftFood: ComparableFood, rightFood: ComparableFood) {
  const values = (food: ComparableFood) => new Map(food.nutrients.map((nutrient) => [nutrient.nutrientKey, nutrient]));
  const leftValues = values(leftFood);
  const rightValues = values(rightFood);
  const rows = foodComparisonNutrientKeys.map((nutrientKey) => {
    const left = leftValues.get(nutrientKey);
    const right = rightValues.get(nutrientKey);
    const compatible = left && right && left.unit === right.unit;
    const leftAmount = finite(left?.amountPer100g);
    const rightAmount = finite(right?.amountPer100g);
    const delta = compatible && leftAmount !== null && rightAmount !== null ? finite(rightAmount - leftAmount) : null;
    return {
      nutrientKey: nutrientKey as ComparisonNutrientKey,
      label: nutrientDefinitions[nutrientKey].label,
      unit: nutrientDefinitions[nutrientKey].unit,
      left: leftAmount,
      right: rightAmount,
      delta,
      relation: delta === null ? "unknown" as const : delta === 0 ? "same" as const : delta > 0 ? "higher" as const : "lower" as const,
    };
  });
  const knownFacts = rows.filter((row) => row.left !== null && row.right !== null && row.delta !== null).length;
  return {
    basis: "per_100g" as const,
    foods: [leftFood, rightFood].map((food) => ({ id: food.id, name: food.name, brand: food.brand, servingSizeGrams: food.servingSizeGrams, source: food.source, catalogProviderId: food.catalogProviderId || null, catalogDatasetVersion: food.catalogDatasetVersion || null })),
    rows,
    coverage: { comparableFacts: knownFacts, totalFacts: rows.length },
    disclosure: "This is a side-by-side of facts recorded for your private foods per 100 g. A missing value means the food record did not supply that fact; it is not zero. Higher or lower is descriptive only, not a health rating, recommendation, or safety finding.",
  };
}
