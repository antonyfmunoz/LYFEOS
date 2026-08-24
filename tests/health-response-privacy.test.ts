import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("private health response boundaries", () => {
  it("marks native health API responses private and non-cacheable", () => {
    const routes = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
    for (const prefix of ["/api/health-fitness", "/api/health-data", "/api/nutrition", "/api/workouts", "/api/recovery-activities", "/api/ingredient-scans"]) {
      expect(routes).toContain(`"${prefix}"`);
    }
    expect(routes).toContain('res.setHeader("Cache-Control", "private, no-store, max-age=0")');
    expect(routes).toContain('res.setHeader("Pragma", "no-cache")');
  });
});
