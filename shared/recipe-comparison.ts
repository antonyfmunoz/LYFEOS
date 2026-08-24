export type RecipeIngredientAmount = { foodId: number; grams: number };

export function compareRecipeIngredients(current: RecipeIngredientAmount[], prior: RecipeIngredientAmount[]) {
  const currentByFood = new Map(current.map((ingredient) => [ingredient.foodId, ingredient.grams]));
  const priorByFood = new Map(prior.map((ingredient) => [ingredient.foodId, ingredient.grams]));
  return Array.from(new Set([...Array.from(currentByFood.keys()), ...Array.from(priorByFood.keys())])).sort((left, right) => left - right).map((foodId) => {
    const currentGrams = currentByFood.get(foodId) ?? null;
    const priorGrams = priorByFood.get(foodId) ?? null;
    const change = priorGrams === null ? "added" : currentGrams === null ? "removed" : currentGrams === priorGrams ? "unchanged" : "quantity_changed";
    return { foodId, currentGrams, priorGrams, change } as const;
  });
}
