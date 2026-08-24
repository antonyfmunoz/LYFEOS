export type ParsedIngredient = {
  rawName: string;
  normalizedKey: string;
  sourceOrder: number;
};

function stripIngredientHeading(value: string): string {
  return value.trim().replace(/^ingredients?\s*:\s*/i, "");
}

function splitTopLevel(value: string): string[] {
  const items: string[] = [];
  let current = "";
  let depth = 0;
  for (const character of value) {
    if (character === "(") depth += 1;
    if (character === ")" && depth > 0) depth -= 1;
    if ((character === "," || character === ";") && depth === 0) {
      if (current.trim()) items.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  if (current.trim()) items.push(current.trim());
  return items;
}

export function normalizeIngredientKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 160);
}

// Parsing is intentionally conservative: commas/semicolons inside a
// parenthetical remain part of the parent ingredient. This captures the label
// faithfully without pretending to decompose proprietary compound ingredients.
export function parseIngredientLabel(value: string): ParsedIngredient[] {
  const distinct = new Set<string>();
  return splitTopLevel(stripIngredientHeading(value))
    .map((rawName) => ({ rawName, normalizedKey: normalizeIngredientKey(rawName) }))
    .filter((item) => item.normalizedKey.length > 0)
    .filter((item) => {
      const key = `${item.normalizedKey}:${item.rawName.toLowerCase()}`;
      if (distinct.has(key)) return false;
      distinct.add(key);
      return true;
    })
    .slice(0, 300)
    .map((item, sourceOrder) => ({ ...item, sourceOrder }));
}
