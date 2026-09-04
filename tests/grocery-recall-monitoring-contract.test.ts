import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("grocery recall monitoring contract", () => {
  it("keeps monitoring opt-in, bounded, deduplicated, and non-diagnostic", () => {
    const monitor = readFileSync(resolve(process.cwd(), "server/grocery-recall-monitor.ts"), "utf8");
    const migration = readFileSync(resolve(process.cwd(), "migrations/0156_grocery_recall_monitoring.sql"), "utf8");
    const profile = readFileSync(resolve(process.cwd(), "server/routes/profile.ts"), "utf8");
    expect(monitor).toContain("minimumCheckIntervalMs");
    expect(monitor).toContain("itemLimit");
    expect(monitor).toContain("onConflictDoUpdate");
    expect(monitor).toContain("Do not advance the check cursor on failure");
    expect(migration).toContain('"grocery_recall_monitoring_preferences"');
    expect(migration).toContain('"grocery_recall_alerts"');
    expect(migration).toContain('"grocery_recall_alerts_pantry_recall_unique_idx"');
    expect(profile).toContain("grocery_recall_monitoring_preferences");
    expect(profile).toContain("grocery_recall_alerts");
  });
});
