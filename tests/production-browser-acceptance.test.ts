import { describe, expect, it } from "vitest";
import fs from "node:fs";

const script = fs.readFileSync("scripts/production-browser-acceptance.ts", "utf8");
const workflow = fs.readFileSync(".github/workflows/production-browser-acceptance.yml", "utf8");

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
      '"/dashboard"',
      '"/missions"',
      '"/calendar"',
      '"/ai"',
      '"/health"',
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
    expect(script).toContain('response.headers.get("ratelimit-remaining")');
    expect(script).toContain("state.remaining <= 50");
    expect(script).toContain('element.closest("label")');
    expect(script).toContain('style.display !== "none"');
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
});
