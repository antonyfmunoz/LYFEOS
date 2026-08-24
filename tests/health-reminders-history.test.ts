import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("health reminders and long-range history", () => {
  it("stores only an opt-in in-app hydration cue interval", () => {
    const migration = source("migrations/0063_hydration_reminder_preferences.sql");
    const release = source("server/release-migrate.ts");
    const preferences = source("client/src/components/health/HealthPreferences.tsx");
    const daily = source("client/src/components/health/DailyHealthLog.tsx");
    expect(migration).toContain('"hydration_reminder_enabled" boolean NOT NULL DEFAULT false');
    expect(release).toContain('id: "0063_hydration_reminder_preferences"');
    expect(preferences).toContain("neutral in-app hydration logging cue");
    expect(preferences).toContain("not a hydration recommendation");
    expect(daily).toContain("Log only if you want to record something");
    expect(daily).toContain("Dismiss today");
  });

  it("supports owner-scoped fasting history up to ten years without health guidance", () => {
    const routes = source("server/routes/health-fitness.ts");
    const daily = source("client/src/components/health/DailyHealthLog.tsx");
    expect(routes).toContain("requestedDays >= 7 && requestedDays <= 3650");
    expect(routes).toContain("eq(fastingWindows.userId, userId)");
    expect(routes).toContain("does not provide fasting recommendations");
    expect(daily).toContain("View fasting timing history");
    expect(daily).toContain('aria-label="Fasting history period"');
  });
});
