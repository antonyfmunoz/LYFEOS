import { describe, expect, it } from "vitest";
import fs from "node:fs";

const onboarding = fs.readFileSync("client/src/pages/OnboardingPage.tsx", "utf8");
const profile = fs.readFileSync("client/src/pages/ProfilePage.tsx", "utf8");

describe("rendered onboarding acceptance contract", () => {
  it("exposes stable, accessible controls without changing the visual flow", () => {
    for (const marker of [
      'data-testid="onboarding-display-name"',
      'data-testid="onboarding-first-name"',
      'data-testid="onboarding-last-name"',
      'data-testid="onboarding-birth-month"',
      'data-testid="onboarding-birth-day"',
      'data-testid="onboarding-birth-year"',
      'data-testid="onboarding-location"',
      'data-testid="onboarding-timezone"',
      'data-testid={`onboarding-theme-${color.label.toLowerCase()}`}',
      'data-testid="onboarding-step"',
      'data-testid="onboarding-next"',
      'data-testid="onboarding-continue"',
      'data-testid="onboarding-enter-system"',
    ]) expect(onboarding).toContain(marker);
    expect(onboarding).toContain('aria-label={`Use ${color.label} theme`}');
    expect(onboarding).toContain('aria-label="Archetype response"');
    expect(onboarding.match(/<main\b/g)?.length).toBeGreaterThanOrEqual(4);
    expect(profile).toContain('data-testid="account-delete-confirmation"');
    expect(profile).toContain('data-testid="account-delete-submit"');
  });

  it("persists the exact in-progress Mission position before every rendered transition", () => {
    expect(onboarding).toContain('localStorage.setItem("lyfeos-onboarding-resume", JSON.stringify({ mission, step, missionComplete }))');
    expect(onboarding).toContain("persistOnboardingPosition(currentMission, currentStep + 1)");
    expect(onboarding).toContain("persistOnboardingPosition(currentMission, currentStep, true)");
    expect(onboarding).toContain("persistOnboardingPosition(currentMission + 1, 0)");
    expect(onboarding).toContain("setShowMissionComplete(missionComplete === true)");
    expect(onboarding).toContain("!restoredOnboardingPositionRef.current");
  });
});
