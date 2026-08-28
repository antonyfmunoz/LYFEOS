import { describe, expect, it } from "vitest";
import fs from "node:fs";

const onboarding = fs.readFileSync("client/src/pages/OnboardingPage.tsx", "utf8");
const profile = fs.readFileSync("client/src/pages/ProfilePage.tsx", "utf8");
const app = fs.readFileSync("client/src/App.tsx", "utf8");

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
    expect(profile.match(/data-testid="account-delete-confirmation"/g)).toHaveLength(1);
    expect(profile).toMatch(/data-testid="account-delete-confirmation"[\s\S]*?value=\{deleteConfirmation\}[\s\S]*?aria-label="Confirm account deletion"/);
    expect(profile).toContain('data-testid="account-delete-submit"');
  });

  it("persists the exact in-progress Mission position before every rendered transition", () => {
    expect(onboarding).toContain('localStorage.setItem("lyfeos-onboarding-resume", JSON.stringify({ mission, step, missionComplete }))');
    expect(onboarding).toContain("persistOnboardingPosition(currentMission, currentStep + 1)");
    expect(onboarding).toContain("persistOnboardingPosition(currentMission, currentStep, true)");
    expect(onboarding).toContain("persistOnboardingPosition(currentMission + 1, 0)");
    expect(onboarding).toContain("setShowMissionComplete(missionComplete === true)");
    expect(onboarding).toContain("!restoredOnboardingPositionRef.current");
    expect(onboarding).toContain("await saveMissionData(currentMission)");
    expect(onboarding).toContain("await saveCompletedMission(currentMission)");
    expect(onboarding.indexOf("await saveCompletedMission(currentMission)")).toBeLessThan(onboarding.indexOf("persistOnboardingPosition(currentMission, currentStep, true)", onboarding.indexOf("await saveCompletedMission(currentMission)")));
    expect(onboarding).toContain("await activateOnboardingThread();");
    expect(onboarding).not.toContain('await activateOnboardingThread().catch');
  });

  it("reveals auth-aware routes after a cached-session reload", () => {
    expect(app).toMatch(/useEffect\(\(\) => \{\s*if \(!isLoading\) \{\s*hideOAuthPreloader\(\);[\s\S]*?hideAppPreloader\(\);\s*}\s*}, \[isLoading\]\);/);
    expect(app).toContain('<Route path="/onboarding" component={OnboardingPage} />');
  });
});
