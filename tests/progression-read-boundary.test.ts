import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("progression read boundary", () => {
  it("keeps stats, streak, and progression GETs free of ledger reconciliation", () => {
    const profile = source("server/routes/profile.ts");
    const progression = source("server/progression.ts");

    const loadStats = profile.slice(
      profile.indexOf("async function loadFreshUserStats"),
      profile.indexOf("type FreshUserStats"),
    );
    const streakRoute = profile.slice(
      profile.indexOf('app.get("/api/streaks"'),
      profile.indexOf('app.get("/api/streaks"') + 500,
    );
    const summaryRead = progression.slice(
      progression.indexOf("export async function getProgressionSummary"),
      progression.indexOf("/** Explicitly repair"),
    );

    expect(loadStats).not.toContain("recalculateXP");
    expect(streakRoute).not.toContain("recalculateXP");
    expect(summaryRead).not.toContain("recalculateXP");
    expect(summaryRead).not.toContain("reconcileBadges");
  });

  it("preserves a private authenticated repair path with an endpoint limit", () => {
    const routes = source("server/routes/progression.ts");
    const server = source("server/index.ts");

    expect(routes).toContain('app.post("/api/progression/reconcile", isAuthenticated');
    expect(routes).toContain('res.setHeader("Cache-Control", "private, no-store")');
    expect(server).toContain('createRateLimiter("progression-reconcile", qualificationRequestLimit(2)');
  });
});
