import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const source = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("revisioned plan concurrency", () => {
  it("serializes template updates and restores behind the shared expected-revision contract", () => {
    const routes = source("server/routes/workouts.ts");
    const ui = source("client/src/components/health/WorkoutLog.tsx");
    expect(routes.match(/SELECT id FROM workout_templates[^`]+FOR UPDATE/g)?.length).toBe(2);
    expect(routes.match(/expectedRevision\.revision !== currentRevision/g)?.length).toBeGreaterThanOrEqual(3);
    expect(routes).toContain("This template changed after you opened it");
    expect(ui).toContain('"x-lyfeos-expected-revision": String(currentRevision)');
    expect(ui).toContain("Your planned fields remain here");
  });

  it("serializes recipe updates and restores without rewriting newer composition", () => {
    const routes = source("server/routes/nutrition.ts");
    const ui = source("client/src/components/health/NutritionDiary.tsx");
    expect(routes.match(/SELECT id FROM nutrition_recipes[^`]+FOR UPDATE/g)?.length).toBe(2);
    expect(routes.match(/expectedRevision\.revision !== currentRevision/g)?.length).toBe(2);
    expect(routes).toContain("This recipe changed after you opened it");
    expect(routes).toContain("currentRevision: Math.max");
    expect(ui).toContain('"x-lyfeos-expected-revision": String(currentRevision)');
    expect(ui).toContain("Your unsaved ingredients remain here");
  });
});
