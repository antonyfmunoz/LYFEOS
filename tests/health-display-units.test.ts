import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { energyFromKcal, energyToKcal, volumeFromMl, volumeToMl } from "../shared/health-display-units";

describe("Health display-unit preferences", () => {
  it("round-trips energy and hydration display conversions without rewriting canonical records", () => {
    expect(energyFromKcal(100, "kJ")).toBe(418.4);
    expect(energyToKcal(418.4, "kJ")).toBe(100);
    expect(volumeFromMl(236.588, "fl_oz")).toBe(8);
    expect(volumeToMl(8, "fl_oz")).toBe(237);
  });

  it("wires preferences into nutrition, hydration, and body capture", () => {
    const nutrition = readFileSync(resolve(process.cwd(), "client/src/components/health/NutritionDiary.tsx"), "utf8");
    const daily = readFileSync(resolve(process.cwd(), "client/src/components/health/DailyHealthLog.tsx"), "utf8");
    const body = readFileSync(resolve(process.cwd(), "client/src/components/health/BodyProgress.tsx"), "utf8");
    expect(nutrition).toContain("displayEnergy(meal.energyKcal)");
    expect(nutrition).toContain('kind === "energy_kcal"');
    expect(daily).toContain("volumeFromMl(hydration.consumedMl, volumeUnit)");
    expect(daily).toContain("volumeToMl(Number(hydrationTarget)");
    expect(body).toContain('profile.data?.profile?.weightUnit || "kg"');
    expect(body).toContain('profile.data?.profile?.heightUnit || "cm"');
  });
});
