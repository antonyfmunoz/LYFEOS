import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("release migration ledger", () => {
  it("keeps the raw history and runner entries aligned through the deployed Food Compass and scanner migrations", () => {
    const runner = read("server/release-migrate.ts");
    for (const migration of ["0159_food_compass", "0160_ingredient_scanner_parity", "0161_mission_evidence_corrections"]) {
      expect(existsSync(resolve(process.cwd(), `migrations/${migration}.sql`))).toBe(true);
      expect(runner).toContain(`id: "${migration}"`);
    }
  });
});
