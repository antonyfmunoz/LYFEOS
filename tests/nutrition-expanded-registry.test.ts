import { describe, expect, it } from "vitest";
import { nutrientDefinitions, nutrientKeys, nutritionContributions, nutritionDailyReport } from "../server/nutrition";
import { healthTargetKinds } from "../server/health-fitness";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("expanded nutrition registry", () => {
  it("governs 76 distinct nutrient fields including amino acids and nutrient forms", () => {
    expect(nutrientKeys).toHaveLength(76);
    expect(new Set(nutrientKeys).size).toBe(76);
    for (const key of ["leucine_g", "tryptophan_g", "docosahexaenoic_acid_g", "vitamin_d3_ug", "food_folate_ug", "caffeine_mg"] as const) {
      expect(nutrientDefinitions[key].label.length).toBeGreaterThan(2);
      expect(nutrientDefinitions[key].unit.length).toBeGreaterThan(0);
    }
  });

  it("keeps newly supported absent fields unknown rather than zero", () => {
    const contributions = nutritionContributions([{ entryId: 1, foodId: 1, foodName: "Recorded food", servingGrams: 100, nutrients: [{ nutrientKey: "leucine_g", amountPer100g: 2, unit: "g" }] }]);
    expect(contributions.find((item) => item.nutrientKey === "leucine_g")).toMatchObject({ total: 2, recordedEntries: 1, totalEntries: 1 });
    expect(contributions.find((item) => item.nutrientKey === "tryptophan_g")).toMatchObject({ total: null, recordedEntries: 0, totalEntries: 1 });
    const report = nutritionDailyReport([{ entryId: 1, occurredAt: new Date("2026-08-23T12:00:00Z"), servingGrams: 100, nutrients: [] }], "2026-08-23", 1);
    expect(report.find((item) => item.nutrientKey === "tryptophan_g")).toMatchObject({ value: null, valueState: "unknown" });
  });

  it("allows every governed nutrient to be an explicit user target with its exact unit", () => {
    for (const key of nutrientKeys) expect(healthTargetKinds).toContain(key);
    const client = readFileSync(resolve(process.cwd(), "client/src/components/health/NutritionDiary.tsx"), "utf8");
    expect(client).toContain("nutritionTargetUnit(targetKind)");
    expect(client).toContain("nutrient.nutrientKey === target.kind");
    expect(client).toContain("Optional user-set values only");
  });

  it("keeps unknown daily coverage distinct while comparing only recorded values to chosen targets", () => {
    const client = readFileSync(resolve(process.cwd(), "client/src/components/health/NutritionDiary.tsx"), "utf8");
    expect(client).toContain("Daily nutrient details and chosen targets");
    expect(client).toContain("Blank nutrient fields remain unknown");
    expect(client).toContain("recordedEntries");
    expect(client).toContain("Unit mismatch—review target");
    expect(client).toContain("they are not health or adherence judgments");
  });
});
