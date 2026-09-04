import { describe, expect, it } from "vitest";
import { classifyIngredientEvidence, normalizeIngredientKey, parseIngredientLabel } from "../server/ingredient-scanner";

describe("ingredient evidence catalog", () => {
  it("surfaces only explicitly named, evidence-linked ingredient identities", () => {
    const color = classifyIngredientEvidence(normalizeIngredientKey("FD&C Red No. 40"));
    const sweetener = classifyIngredientEvidence(normalizeIngredientKey("Sucralose"));
    const caffeine = classifyIngredientEvidence(normalizeIngredientKey("Guarana extract"));

    expect(color).toMatchObject({ classification: "declared_color_additive", evidenceStrength: "regulatory_identity" });
    expect(sweetener).toMatchObject({ classification: "declared_non_nutritive_sweetener", evidenceStrength: "regulatory_identity" });
    expect(caffeine).toMatchObject({ classification: "declared_caffeine_source", evidenceStrength: "regulatory_identity" });
    expect(color.evidenceUrl).toMatch(/^https:\/\/www\.fda\.gov\//);
  });

  it("does not convert ordinary or ambiguous label terms into a safety claim", () => {
    expect(classifyIngredientEvidence(normalizeIngredientKey("natural flavors"))).toEqual({
      classification: "unknown", reason: null, evidenceTitle: null, evidenceUrl: null, evidenceStrength: "unverified",
    });
    expect(parseIngredientLabel("Ingredients: oats, Red No. 40, natural flavors").map((entry) => entry.normalizedKey)).toEqual([
      "oats", "red_no_40", "natural_flavors",
    ]);
  });
});
