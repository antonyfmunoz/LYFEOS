import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = (file: string) => readFileSync(file, "utf8");

describe("Profile widget visual system", () => {
  it("uses the same compact card treatment for Profile health settings and other settings cards", () => {
    const profile = source("client/src/pages/ProfilePage.tsx");
    const preferences = source("client/src/components/health/HealthPreferences.tsx");
    const rights = source("client/src/components/health/HealthDataRights.tsx");

    expect(profile).toContain('className="p-4 border border-primary/10 rounded-lg bg-background/40 mb-4"');
    expect(profile).toContain('<HealthPreferences embedded section="preferences" />');
    expect(profile).toContain("<HealthDataRights embedded />");
    expect(preferences).toContain('embedded ? "mb-4 rounded-lg border border-primary/10 bg-background/40 p-4"');
    expect(rights).toContain('embedded ? "mb-4 rounded-lg border border-primary/10 bg-background/40 p-4"');
    expect(preferences).toContain('rounded-lg border border-primary/10 bg-card/50 p-3');
    expect(rights).toContain('rounded-lg border border-primary/10 bg-card/50 p-3');
  });
});
