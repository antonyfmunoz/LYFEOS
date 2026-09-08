import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { classifyIngredientEvidence, normalizeIngredientKey, parseIngredientLabel } from "../server/ingredient-scanner";

describe("ingredient evidence catalog", () => {
  it("surfaces only explicitly named, evidence-linked ingredient identities", () => {
    const color = classifyIngredientEvidence(normalizeIngredientKey("FD&C Red No. 40"));
    const sweetener = classifyIngredientEvidence(normalizeIngredientKey("Sucralose"));
    const caffeine = classifyIngredientEvidence(normalizeIngredientKey("Guarana extract"));
    const allergenTerm = classifyIngredientEvidence(normalizeIngredientKey("Sesame"));

    expect(color).toMatchObject({ classification: "declared_color_additive", evidenceStrength: "regulatory_identity" });
    expect(sweetener).toMatchObject({ classification: "declared_non_nutritive_sweetener", evidenceStrength: "regulatory_identity" });
    expect(caffeine).toMatchObject({ classification: "declared_caffeine_source", evidenceStrength: "regulatory_identity" });
    expect(allergenTerm).toMatchObject({ classification: "declared_major_allergen_label_term", evidenceStrength: "regulatory_identity" });
    expect(color.evidenceUrl).toMatch(/^https:\/\/www\.fda\.gov\//);
  });

  it("does not convert ordinary or ambiguous label terms into a safety claim", () => {
    expect(classifyIngredientEvidence(normalizeIngredientKey("natural flavors"))).toEqual({
      classification: "unknown", reason: null, evidenceTitle: null, evidenceUrl: null, evidenceStrength: "unverified",
    });
    expect(classifyIngredientEvidence(normalizeIngredientKey("whey protein concentrate"))).toMatchObject({ classification: "unknown" });
    expect(parseIngredientLabel("Ingredients: oats, Red No. 40, natural flavors").map((entry) => entry.normalizedKey)).toEqual([
      "oats", "red_no_40", "natural_flavors",
    ]);
  });

  it("release-migrates every factual evidence identity emitted by the catalog", () => {
    const migration = readFileSync(resolve(process.cwd(), "migrations/0158_ingredient_evidence_classifications.sql"), "utf8");
    const release = readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8");
    for (const classification of [
      "declared_major_allergen_label_term",
      "declared_color_additive",
      "declared_sulfiting_agent",
      "declared_non_nutritive_sweetener",
      "declared_caffeine_source",
      "declared_partially_hydrogenated_oil",
      "regulatory_identity",
    ]) expect(migration).toContain(classification);
    expect(release).toContain('id: "0158_ingredient_evidence_classifications"');
  });
});
