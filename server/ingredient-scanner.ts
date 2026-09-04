export type ParsedIngredient = {
  rawName: string;
  normalizedKey: string;
  sourceOrder: number;
};

export type IngredientEvidenceClassification = {
  classification: "unknown" | "declared_major_allergen_label_term" | "declared_color_additive" | "declared_sulfiting_agent" | "declared_non_nutritive_sweetener" | "declared_caffeine_source" | "declared_partially_hydrogenated_oil";
  reason: string | null;
  evidenceTitle: string | null;
  evidenceUrl: string | null;
  evidenceStrength: "unverified" | "regulatory_identity";
};

type IngredientEvidenceRule = IngredientEvidenceClassification & { matches: (normalizedKey: string) => boolean };

// This catalog deliberately classifies only the identity of explicitly named
// ingredients. It is not a universal safety or health ranking: formulation,
// amount, jurisdiction, dietary context and a user's own needs matter. The
// linked first-party sources let a person inspect why an item was surfaced.
const ingredientEvidenceRules: IngredientEvidenceRule[] = [
  {
    classification: "declared_major_allergen_label_term",
    reason: "This exact major-allergen term appears in the ingredient list. It does not replace reading the complete package, including any Contains or advisory statement, and it is not an allergy determination.",
    evidenceTitle: "FDA: Food Allergies",
    evidenceUrl: "https://www.fda.gov/food/nutrition-food-labeling-and-critical-foods/food-allergies",
    evidenceStrength: "regulatory_identity",
    matches: (key) => /^(?:milk|egg|eggs|fish|crustacean_shellfish|tree_nuts|peanut|peanuts|wheat|soy|soybean|soybeans|sesame)$/.test(key),
  },
  {
    classification: "declared_color_additive",
    reason: "This label names a color additive. It is surfaced for transparent label review, not as a health or safety verdict.",
    evidenceTitle: "FDA: Color Additives Information for Consumers",
    evidenceUrl: "https://www.fda.gov/food/food-ingredients-packaging/color-additives-information-consumers",
    evidenceStrength: "regulatory_identity",
    matches: (key) => /^(?:fd_c_)?(?:red|yellow|blue|green)_(?:no_)?\d+(?:_lake)?$/.test(key) || /^(?:tartrazine|allura_red|sunset_yellow|brilliant_blue|erythrosine)$/.test(key),
  },
  {
    classification: "declared_sulfiting_agent",
    reason: "This label names a sulfiting agent. Review the exact package and your own dietary or clinician guidance; this is not an allergy determination.",
    evidenceTitle: "FDA: Food Allergies",
    evidenceUrl: "https://www.fda.gov/food/nutrition-food-labeling-and-critical-foods/food-allergies",
    evidenceStrength: "regulatory_identity",
    matches: (key) => /^(?:sulfur_dioxide|sodium_sulfite|sodium_bisulfite|sodium_metabisulfite|potassium_bisulfite|potassium_metabisulfite)$/.test(key),
  },
  {
    classification: "declared_non_nutritive_sweetener",
    reason: "This label names a non-nutritive sweetener. It is surfaced for your own preference review, not scored as universally good or bad.",
    evidenceTitle: "FDA: Aspartame and Other Sweeteners in Food",
    evidenceUrl: "https://www.fda.gov/food/food-additives-petitions/aspartame-and-other-sweeteners-food",
    evidenceStrength: "regulatory_identity",
    matches: (key) => /^(?:aspartame|sucralose|saccharin|acesulfame(?:_potassium|_k)?|neotame|advantame|steviol_glycosides|stevia_extract|monk_fruit_extract|mogrosides)$/.test(key),
  },
  {
    classification: "declared_caffeine_source",
    reason: "This label names caffeine or a caffeine source. LyfeOS does not infer the amount from an ingredient list; consult the package for a stated amount.",
    evidenceTitle: "FDA: Spilling the Beans: How Much Caffeine is Too Much?",
    evidenceUrl: "https://www.fda.gov/consumers/consumer-updates/spilling-beans-how-much-caffeine-too-much",
    evidenceStrength: "regulatory_identity",
    matches: (key) => /^(?:caffeine|guarana|guarana_extract|yerba_mate|green_tea_extract|coffee_extract)$/.test(key),
  },
  {
    classification: "declared_partially_hydrogenated_oil",
    reason: "This label names partially hydrogenated oil. It is surfaced as a factual label-review flag, not a diagnosis or dietary prescription.",
    evidenceTitle: "FDA: Partially Hydrogenated Oils in Foods",
    evidenceUrl: "https://www.fda.gov/food/hfp-constituent-updates/fda-completes-final-administrative-actions-partially-hydrogenated-oils-foods",
    evidenceStrength: "regulatory_identity",
    matches: (key) => /\bpartially_hydrogenated(?:_[a-z]+)*_oil\b/.test(key),
  },
];

export function classifyIngredientEvidence(normalizedKey: string): IngredientEvidenceClassification {
  const matched = ingredientEvidenceRules.find((rule) => rule.matches(normalizedKey));
  if (!matched) return { classification: "unknown", reason: null, evidenceTitle: null, evidenceUrl: null, evidenceStrength: "unverified" };
  const { matches: _matches, ...classification } = matched;
  return classification;
}

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
