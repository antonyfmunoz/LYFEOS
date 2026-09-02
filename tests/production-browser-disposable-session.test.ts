import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("disposable browser acceptance session", () => {
  it("creates a completed-onboarding session and proves it is erased after the route audit", () => {
    const setup = readFileSync(resolve(process.cwd(), "scripts/production-browser-disposable-session.ts"), "utf8");
    const cleanup = readFileSync(resolve(process.cwd(), "scripts/production-browser-disposable-cleanup.ts"), "utf8");
    expect(setup).toContain('"/api/auth/complete-registration"');
    expect(setup).toContain('"/api/profile"');
    expect(setup).toContain("onboardingCompleted: true");
    expect(cleanup).toContain('"/api/account"');
    expect(cleanup).toContain('"DELETE MY ACCOUNT"');
    expect(cleanup).toContain('`/api/auth/check-email?email=${encodeURIComponent(session.email)}`');
    expect(cleanup).toContain('`/api/auth/check-display-name?displayName=${encodeURIComponent(session.displayName)}`');
    expect(cleanup).toContain("erased: true");
    expect(setup).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  });
});
