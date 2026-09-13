import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Health stat progress", () => {
  it("uses the existing private LyfeOS health-points field as a progress bar, without calling it a medical measurement", () => {
    const widget = readFileSync(resolve(process.cwd(), "client/src/components/dashboard/CompactStatsWidget.tsx"), "utf8");
    const profileRoutes = readFileSync(resolve(process.cwd(), "server/routes/profile.ts"), "utf8");

    expect(widget).toContain("const hpPercentage");
    expect(widget).toContain('className="progress-bar progress-hp h-1.5 mb-1"');
    expect(widget).toContain("Health Points (HP)");
    expect(widget).not.toContain("RECORDS");
    expect(profileRoutes).toContain("healthPointsCurrent");
    expect(profileRoutes).toContain("healthPointsMax");
  });
});
