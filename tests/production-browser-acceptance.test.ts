import { describe, expect, it } from "vitest";
import fs from "node:fs";

const script = fs.readFileSync("scripts/production-browser-acceptance.ts", "utf8");
const coreLoopScript = fs.readFileSync("scripts/production-core-loop-acceptance.ts", "utf8");
const workflow = fs.readFileSync(".github/workflows/production-browser-acceptance.yml", "utf8");
const packageJson = fs.readFileSync("package.json", "utf8");
const rootLayout = fs.readFileSync("client/src/components/layout/RootLayout.tsx", "utf8");
const automationsPage = fs.readFileSync("client/src/pages/AutomationsPage.tsx", "utf8");

describe("production browser acceptance custody", () => {
  it("has no embedded account credentials and fails closed when protected evidence is required", () => {
    expect(script).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    expect(script).not.toContain("demo123456");
    expect(script).toContain("LYFEOS_ACCEPTANCE_EMAIL");
    expect(script).toContain("LYFEOS_ACCEPTANCE_PASSWORD");
    expect(script).toContain("Authenticated acceptance was required but its email/password secrets were not configured.");
    expect(script).toContain("if (REQUIRE_AUTHENTICATED && !authenticatedExecuted)");
  });

  it("covers the critical public and protected product surfaces without mutating product records", () => {
    for (const route of [
      '"/"',
      '"/login"',
      '"/register"',
      '"/forgot-password"',
      '"/reset-password"',
      '"/waitlist"',
      '"/waitlist/thank-you"',
      '"/subscription"',
      '"/dashboard"',
      '"/missions"',
      '"/calendar"',
      '"/ai"',
      '"/chronilog"',
      '"/timeline"',
      '"/codex"',
      '"/kanban"',
      '"/attention"',
      '"/time"',
      '"/energy"',
      '"/health"',
      '"/wealth"',
      '"/experience"',
      '"/streak"',
      '"/efficiency"',
      '"/profile"',
      '"/journal-log"',
      '"/mission-log"',
      '"/rituals"',
      '"/knowledge-vault"',
      '"/goals-archive"',
      '"/tracker"',
      '"/subscription/manage"',
      '"/rolodex"',
      '"/document-vault"',
      '"/messages"',
      '"/projects"',
      '"/automations"',
      '"/spreadsheets"',
      '"/canvases"',
      '"/databases"',
      '"/finance"',
    ]) {
      expect(script).toContain(route);
    }
    expect(script).toContain("Every stable route that can be rendered without a one-time token");
    expect(script).not.toMatch(/fetch\([^)]*,\s*\{[^}]*method:\s*["'](?:POST|PUT|PATCH|DELETE)/s);
  });

  it("records explicit accessibility, responsive, failure, and lab-performance evidence", () => {
    expect(script).toContain('contract: "lyfeos.production-browser-acceptance.v1"');
    expect(script).toContain("duplicateIds");
    expect(script).toContain("unlabeledControls");
    expect(script).toContain("firstTabReachedControl");
    expect(script).toContain("horizontalOverflowPx");
    expect(script).toContain("largestContentfulPaintMs");
    expect(script).toContain("cumulativeLayoutShift");
    expect(script).toContain("failedRequests");
    expect(script).toContain("serverErrors");
    expect(script).toContain("consoleErrors");
    expect(script).toContain('new URL(locationUrl).pathname === "/api/auth/me"');
    expect(script).toContain("does not substitute for human screen-reader comprehension");
    expect(script).toContain('fetch("/api/profile"');
    expect(script).toContain("accountState.profile.onboardingCompleted");
    expect(script).toContain('pathName.startsWith("/login-success") || pathName.startsWith("/ceremony")');
    expect(script).toContain('"failure.json"');
    expect(script).toContain('contract: "lyfeos.production-browser-acceptance.failure.v1"');
    expect(script).toContain("auditRouteWithEvidence");
    expect(script).toContain("route audit failed:");
  });

  it("authenticates once and reuses the verified session across responsive viewports", () => {
    expect(script.match(/await login\(authenticatedPage\)/g)).toHaveLength(1);
    expect(script).toContain("for (const viewport of VIEWPORTS)");
    expect(script).toContain("await authenticatedPage.setViewport(viewport.value)");
    expect(script).toContain("Authenticate once. Reusing the verified session");
    expect(script).toContain('navigation: "document" | "spa"');
    expect(script).toContain('window.dispatchEvent(new PopStateEvent("popstate"))');
    expect(script).toContain('const navigation = viewport === desktop && routeIndex === 0 ? "document" : "spa"');
    expect(script).toContain("Do not misattribute the previous document's metrics");
    expect(script).toContain("respectApiRateLimit");
    expect(script).toContain('route === "/ai"');
    expect(script).toContain('path: "/api/ai/orchestration-runs", floor: 8');
    expect(script).toContain("await respectApiRateLimit(authenticatedPage, route)");
    expect(script).toContain('response.headers.get("ratelimit-remaining")');
    expect(script).toContain("state.remaining <= target.floor");
    expect(script).toContain('element.closest("label")');
    expect(script).toContain('style.display !== "none"');
    expect(script).not.toContain("const isRendered");
    expect(script).toContain('document.body.focus()');
    expect(script).toContain("element.getAttribute(\"placeholder\")");
    expect(script).toContain("lucide-");
  });

  it("binds the run to an immutable deployed source and preserves evidence on failure", () => {
    expect(workflow).toContain('cron: "30 6 * * *"');
    expect(workflow).toContain("Resolve deployed immutable source");
    expect(workflow).toContain("ref: ${{ github.sha }}");
    expect(workflow).toContain("Verify deployed immutable source");
    expect(workflow).toContain("value.sourceRevision");
    expect(workflow).toContain('test "$harness" = "$EXPECTED_HARNESS_SOURCE"');
    expect(workflow).toContain('test "$reported" = "$EXPECTED_SOURCE"');
    expect(workflow).toContain("github.event_name == 'workflow_dispatch' && inputs.require_authenticated || 'false'");
    expect(workflow).toContain("LYFEOS_ACCEPTANCE_SOURCE: ${{ steps.release.outputs.source }}");
    expect(workflow).toContain("LYFEOS_ACCEPTANCE_HARNESS_SOURCE: ${{ github.sha }}");
    expect(script).toContain("harnessSource: HARNESS_SOURCE");
    expect(coreLoopScript).toContain("harnessSource: HARNESS_SOURCE");
    expect(workflow).toContain("LYFEOS_ACCEPTANCE_EMAIL: ${{ secrets.LYFEOS_ACCEPTANCE_EMAIL }}");
    expect(workflow).toContain("LYFEOS_ACCEPTANCE_PASSWORD: ${{ secrets.LYFEOS_ACCEPTANCE_PASSWORD }}");
    expect(workflow).toContain("if: always()");
    expect(workflow).toContain("retention-days: 30");
  });

  it("qualifies the rendered truthful Mission loop separately and always archives its synthetic record", () => {
    expect(packageJson).toContain('"acceptance:core-loop": "tsx scripts/production-core-loop-acceptance.ts"');
    expect(coreLoopScript).toContain('contract: "lyfeos.production-core-loop-acceptance.v5"');
    expect(coreLoopScript).toContain("[AUTOMATED ACCEPTANCE]");
    expect(coreLoopScript).toContain("async function dismissBlockingTutorial");
    expect(coreLoopScript).toContain("async function activateRenderedControl");
    expect(coreLoopScript).toContain("async function browserApiRequest");
    expect(coreLoopScript).toContain("async function ensureAcceptanceThread");
    expect(coreLoopScript).toContain('browserApiRequest(page, "/api/transformation-thread/initialize", "POST", {})');
    expect(coreLoopScript).toContain('`/api/transformation-thread/${threadId}/activate`, "POST"');
    expect(coreLoopScript).toContain('Acceptance will not override a Transformation Thread in');
    expect(coreLoopScript).toContain('Acceptance fixture provisioning is limited to the dedicated completed-onboarding account.');
    expect(coreLoopScript).toContain('browserApiRequest(page, "/api/profile", "PATCH", { completedOnboardingMissions })');
    expect(coreLoopScript).toContain('name: "dedicated account fixture prerequisites"');
    expect(coreLoopScript).toContain("async function waitForApiBudget");
    expect(coreLoopScript).toContain("async function readStableProgression");
    expect(coreLoopScript).toContain("async function archiveStrandedSyntheticMissions");
    expect(coreLoopScript).toContain("async function deleteStrandedSyntheticAutomations");
    expect(coreLoopScript).toContain("async function exerciseNonMutatingAutomationControls");
    expect(coreLoopScript).toContain("async function cleanupAutomation");
    expect(coreLoopScript).toContain('page.keyboard.press("Backspace")');
    expect(coreLoopScript).toContain('page.type(selector, value, { delay: 15 })');
    expect(coreLoopScript).toContain("control?.value === expectedValue");
    expect(coreLoopScript).toContain('stage = "fill the bounded follow-up action"');
    expect(coreLoopScript).toContain("async function stabilizeRenderedFields");
    expect(coreLoopScript).toContain('stage = "stabilize the complete rendered automation draft"');
    expect(coreLoopScript).toContain("Rendered automation fields did not settle");
    expect(coreLoopScript).toContain("setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })");
    expect(coreLoopScript).not.toContain("isMobile:");
    expect(coreLoopScript).not.toContain("hasTouch:");
    expect(coreLoopScript).toContain("Refill before the first rendered state change");
    expect(coreLoopScript).toContain('await waitForApiBudget(page, 80)');
    expect(coreLoopScript).toContain('await waitForApiBudget(page, 60)');
    expect(coreLoopScript).toContain('response.headers.get("ratelimit-remaining")');
    expect(coreLoopScript).toContain('response.headers.get("retry-after")');
    expect(coreLoopScript).toContain('button[aria-label="Skip this tutorial"]');
    expect(coreLoopScript).toContain("button.click()");
    expect(coreLoopScript).toContain("const tutorialDismissed = await dismissBlockingTutorial(page)");
    expect(coreLoopScript).toContain('activateRenderedControl(page, \'[data-tour="create-mission"]\')');
    expect(coreLoopScript).toContain('page.click(\'[data-testid="mission-create-submit"]\')');
    expect(coreLoopScript).toContain('document.querySelector(\'[data-testid="proof-plan-edit"]\')');
    expect(coreLoopScript).toContain('activateRenderedControl(page, \'[data-testid="proof-plan-edit"]\')');
    expect(coreLoopScript).toContain('page.click(\'[data-testid="proof-plan-save"]\')');
    expect(coreLoopScript).toContain('page.click(\'[data-testid="mission-evidence-add"]\')');
    expect(coreLoopScript).toContain("progressionMatches(progressionBefore, progressionAfterEvidence)");
    expect(coreLoopScript).toContain('activateRenderedControl(page, \'[data-testid="automation-create"]\')');
    expect(coreLoopScript).toContain('Automation control journey could not ${stage}');
    expect(coreLoopScript).toContain('nameInput?.value === "New automation"');
    expect(coreLoopScript).toContain("value: AUTOMATION_NAME");
    expect(coreLoopScript).toContain('activateRenderedControl(page, \'[data-testid="automation-save"]\')');
    expect(coreLoopScript).toContain('activateRenderedControl(page, \'[data-testid="automation-preview"]\')');
    expect(coreLoopScript).toContain('previewBody.preview?.disclosure === "Preview only. No mission was changed and no follow-up was created."');
    expect(coreLoopScript).toContain('runs.length === 0');
    expect(coreLoopScript).toContain('!followUpCreated');
    expect(coreLoopScript).toContain('progressionMatches(progressionBefore, progressionAfterPreview)');
    expect(automationsPage).toContain('data-testid="automation-toggle"');
    expect(coreLoopScript).toContain('stage = "enable the saved manual rule through the rendered control"');
    expect(coreLoopScript).toContain('activateRenderedControl(page, \'[data-testid="automation-toggle"]\')');
    expect(coreLoopScript).toContain('runNowEnabledWhileRuleEnabled');
    expect(coreLoopScript).toContain('stage = "pause the enabled rule through the rendered control"');
    expect(coreLoopScript).toContain('runsAfterPause.length === 0');
    expect(coreLoopScript).toContain('!followUpCreatedAfterControls');
    expect(coreLoopScript).toContain('progressionMatches(progressionBefore, progressionAfterControls)');
    expect(coreLoopScript).toContain('activateRenderedControl(page, \'[data-testid="automation-delete"]\')');
    expect(coreLoopScript).toContain('name: "rendered non-mutating automation controls"');
    expect(coreLoopScript).toContain('[data-testid^="mission-skill-"]:not([disabled])');
    expect(coreLoopScript).toContain('activateMissionControl(page, "start")');
    expect(coreLoopScript).toContain('card.contains(control)');
    expect(coreLoopScript).toContain('control.scrollIntoView({ block: "center", inline: "nearest" })');
    expect(coreLoopScript).toContain('name: "settled progression baseline"');
    expect(coreLoopScript).toContain('activateRenderedControl(page, \'[data-testid="mission-timer-stop"]\')');
    expect(coreLoopScript).toContain('activateMissionControl(page, "done")');
    expect(coreLoopScript).toContain('page.click(\'[data-testid="mission-self-review-submit"]\')');
    expect(coreLoopScript).toContain('reviewBody.progression?.applied === true && reviewedSkillExperience > 0');
    expect(coreLoopScript).toContain('new URL("/experience", BASE_URL)');
    expect(coreLoopScript).toContain('[data-testid="activity-ledger-history"]');
    expect(coreLoopScript).toContain('renderedProgression.endingExperience === progressionAfterReview.activityExperience');
    expect(coreLoopScript).toContain('name: "rendered progression visualization"');
    expect(coreLoopScript).toContain("async function requireThreadContinuityView");
    expect(coreLoopScript).toContain('new URL("/dashboard", BASE_URL)');
    expect(coreLoopScript).toContain('[data-testid="thread-current-path"]');
    expect(coreLoopScript).toContain('[data-testid="capability-constellation"]');
    expect(coreLoopScript).toContain('`/api/capabilities/${capabilityId}/history`');
    expect(coreLoopScript).toContain('expectedEventType = phase === "reviewed" ? "mission_evidence_review" : "mission_evidence_reversal"');
    expect(coreLoopScript).toContain('reversedThreadContinuity.capability.reversesEventId === reviewedThreadContinuity.capability.eventId');
    expect(coreLoopScript).toContain('name: "rendered current path and durable capability history"');
    expect(coreLoopScript).toContain('name: "rendered capability-history reversal"');
    expect(coreLoopScript).not.toContain("const numberFrom =");
    expect(coreLoopScript).toContain("const renderedProgression = await page.evaluate(`");
    expect(coreLoopScript).toContain('activityExperience: Number((total || "").replace(/[^0-9-]/g, ""))');
    expect(coreLoopScript).toContain('await waitForApiBudget(page, 30)');
    expect(coreLoopScript).toContain('activateMissionControl(page, "undo")');
    expect(coreLoopScript).toContain('progressionMatches(progressionBefore, progressionAfterReopen)');
    expect(coreLoopScript).toContain('unlockResult?.state === "declared"');
    expect(coreLoopScript).toContain('browserApiRequest(page, `/api/quests/${id}`, "DELETE")');
    expect(coreLoopScript).toContain("await cleanupMission(page)");
    expect(coreLoopScript).toContain("await cleanupAutomation(page)");
    expect(coreLoopScript).toContain('boundary: "This journey proves one self-reviewed, skill-linked synthetic Mission plus a saved automation preview and explicit enable/pause control cycle');
    expect(workflow).toContain("Run truthful Mission core-loop acceptance");
    expect(workflow).toContain("github.event_name == 'workflow_dispatch' && inputs.require_authenticated");
    expect(workflow).toContain("run: npm run acceptance:core-loop");
  });

  it("mounts one responsive Mission timer so its state and controls stay unambiguous", () => {
    expect(rootLayout.match(/<MissionTimer\b/g)).toHaveLength(1);
    expect(rootLayout).toContain('className="z-30 flex justify-center px-4 lg:px-6 pt-2 pb-2"');
    expect(rootLayout).not.toContain("lg:hidden flex justify-center");
    expect(rootLayout).not.toContain("hidden lg:block");
  });
});
