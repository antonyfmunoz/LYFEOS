import { describe, expect, it } from "vitest";
import fs from "node:fs";

const script = fs.readFileSync("scripts/production-browser-acceptance.ts", "utf8");
const coreLoopScript = fs.readFileSync("scripts/production-core-loop-acceptance.ts", "utf8");
const workflow = fs.readFileSync(".github/workflows/production-browser-acceptance.yml", "utf8");
const packageJson = fs.readFileSync("package.json", "utf8");

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
    expect(workflow).toContain("ref: ${{ steps.release.outputs.source }}");
    expect(workflow).toContain("Verify deployed immutable source");
    expect(workflow).toContain("value.sourceRevision");
    expect(workflow).toContain('test "$reported" = "$expected"');
    expect(workflow).toContain("github.event_name == 'workflow_dispatch' && inputs.require_authenticated || 'false'");
    expect(workflow).toContain("LYFEOS_ACCEPTANCE_SOURCE: ${{ steps.release.outputs.source }}");
    expect(workflow).toContain("LYFEOS_ACCEPTANCE_EMAIL: ${{ secrets.LYFEOS_ACCEPTANCE_EMAIL }}");
    expect(workflow).toContain("LYFEOS_ACCEPTANCE_PASSWORD: ${{ secrets.LYFEOS_ACCEPTANCE_PASSWORD }}");
    expect(workflow).toContain("if: always()");
    expect(workflow).toContain("retention-days: 30");
  });

  it("qualifies the rendered truthful Mission loop separately and always archives its synthetic record", () => {
    expect(packageJson).toContain('"acceptance:core-loop": "tsx scripts/production-core-loop-acceptance.ts"');
    expect(coreLoopScript).toContain('contract: "lyfeos.production-core-loop-acceptance.v2"');
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
    expect(coreLoopScript).toContain("async function archiveStrandedSyntheticMissions");
    expect(coreLoopScript).toContain('await waitForApiBudget(page, 80)');
    expect(coreLoopScript).toContain('await waitForApiBudget(page, 60)');
    expect(coreLoopScript).toContain('response.headers.get("ratelimit-remaining")');
    expect(coreLoopScript).toContain('response.headers.get("retry-after")');
    expect(coreLoopScript).toContain('button[aria-label="Skip this tutorial"]');
    expect(coreLoopScript).toContain("button.click()");
    expect(coreLoopScript).toContain("const tutorialDismissed = await dismissBlockingTutorial(page)");
    expect(coreLoopScript).toContain('activateRenderedControl(page, \'[data-tour="create-mission"]\')');
    expect(coreLoopScript).toContain('page.click(\'[data-testid="mission-create-submit"]\')');
    expect(coreLoopScript).toContain('page.click(\'[data-testid="proof-plan-save"]\')');
    expect(coreLoopScript).toContain('page.click(\'[data-testid="mission-evidence-add"]\')');
    expect(coreLoopScript).toContain("progressionMatches(progressionBefore, progressionAfterEvidence)");
    expect(coreLoopScript).toContain('[data-testid^="mission-skill-"]:not([disabled])');
    expect(coreLoopScript).toContain('activateMissionControl(page, "start")');
    expect(coreLoopScript).toContain('activateRenderedControl(page, \'[data-testid="mission-timer-stop"]\')');
    expect(coreLoopScript).toContain('activateMissionControl(page, "done")');
    expect(coreLoopScript).toContain('page.click(\'[data-testid="mission-self-review-submit"]\')');
    expect(coreLoopScript).toContain('reviewBody.progression?.applied === true && reviewedSkillExperience > 0');
    expect(coreLoopScript).toContain('activateMissionControl(page, "undo")');
    expect(coreLoopScript).toContain('progressionMatches(progressionBefore, progressionAfterReopen)');
    expect(coreLoopScript).toContain('unlockResult?.state === "declared"');
    expect(coreLoopScript).toContain('browserApiRequest(page, `/api/quests/${id}`, "DELETE")');
    expect(coreLoopScript).toContain("await cleanupMission(page)");
    expect(coreLoopScript).toContain('boundary: "This journey proves one self-reviewed, skill-linked synthetic Mission.');
    expect(workflow).toContain("Run truthful Mission core-loop acceptance");
    expect(workflow).toContain("github.event_name == 'workflow_dispatch' && inputs.require_authenticated");
    expect(workflow).toContain("run: npm run acceptance:core-loop");
  });
});
