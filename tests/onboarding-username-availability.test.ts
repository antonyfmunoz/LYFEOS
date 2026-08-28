import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("onboarding username availability", () => {
  it("release-migrates the complete user identity shape and case-insensitive uniqueness", () => {
    const migration = source("migrations/0122_user_identity_reconciliation.sql");
    const release = source("server/release-migrate.ts");
    for (const required of ["avatar_url", "users_display_name_lower_unique", 'lower("display_name")']) {
      expect(migration).toContain(required);
      expect(release).toContain(required);
    }
  });

  it("checks display names case-insensitively", () => {
    expect(source("server/storage.ts")).toContain("lower(${users.displayName}) = lower(${displayName})");
  });

  it("does not present server failures as username conflicts", () => {
    const onboarding = source("client/src/pages/OnboardingPage.tsx");
    expect(onboarding).toContain("if (!res.ok)");
    expect(onboarding).toContain("setUsernameAvailable(null)");
    expect(onboarding).toContain("We couldn't check that display name. Please try again.");
    expect(onboarding).toContain('role="alert"');
  });

  it("activates the onboarding-derived Thread after the final mission", () => {
    const onboarding = source("client/src/pages/OnboardingPage.tsx");
    expect(onboarding).toContain("const activateOnboardingThread = async () =>");
    expect(onboarding).toContain('"/api/transformation-thread/initialize"');
    expect(onboarding).toContain('`/api/transformation-thread/${thread.id}/activate`');
    expect(onboarding).toContain("if (missionId === MISSIONS.length - 1)");
    expect(onboarding).toContain("await activateOnboardingThread()");
  });
});
