import fs from "node:fs";
import { describe, expect, it } from "vitest";

const script = fs.readFileSync("scripts/production-search-browser-acceptance.ts", "utf8");
const workflow = fs.readFileSync(".github/workflows/production-browser-acceptance.yml", "utf8");
const verifyWorkflow = fs.readFileSync(".github/workflows/verify.yml", "utf8");
const packageJson = fs.readFileSync("package.json", "utf8");
const page = fs.readFileSync("client/src/pages/SearchPage.tsx", "utf8");
const route = fs.readFileSync("server/routes/search.ts", "utf8");

describe("production Search browser acceptance custody", () => {
  it("pins production runtime and reviewed harness identity without embedded real credentials", () => {
    expect(script).toContain('BASE_URL.origin === "https://lyfeos.net"');
    expect(script).toContain("LYFEOS_ACCEPTANCE_SOURCE");
    expect(script).toContain("LYFEOS_ACCEPTANCE_HARNESS_SOURCE");
    expect(script).toContain("release.body?.sourceRevision === SOURCE");
    expect(script).not.toMatch(/[a-z0-9._%+-]+@(?!example\.com)[a-z0-9.-]+\.[a-z]{2,}/i);
    expect(script).not.toContain("demo123456");
  });

  it("proves private rendered discovery across each canonical Search domain", () => {
    expect(script).toContain('"lyfeos.production-search-browser.v1"');
    expect(script).toContain('"lyfeos.isolated-search-browser.v1"');
    for (const invariant of [
      "shortcutOpenedAndFocused",
      "ownerIsolationReconciled",
      "secretOnlyFieldsExcluded",
      "resultDeepLinkRendered",
      "minimumQueryDisclosureRendered",
      "emptyStateRendered",
      "allSixKindsRendered",
      "resultCountsReconciled",
      "filtersReconciled",
      "queryDeepLinkPersisted",
      "reloadReconciled",
    ]) expect(script).toContain(invariant);
    for (const kind of ["mission", "document", "spreadsheet", "canvas", "database", "relationship"]) expect(script).toContain(`"${kind}"`);
    expect(script).toContain("account/session/identifier erasure");
    expect(script).toContain("does not prove consented search telemetry");
  });

  it("keeps stable nonvisual seams and a read-only owner-scoped Search authority", () => {
    for (const seam of [
      'data-testid="search-page"',
      'data-testid="workspace-search-input"',
      'data-testid="search-filter-all"',
      'data-testid={`search-filter-${value}`}',
      'data-testid={`search-result-${result.kind}-${result.id}`}',
      'data-testid="search-minimum-query"',
      'data-testid="search-empty"',
    ]) expect(page).toContain(seam);
    expect(page).toContain("aria-pressed={kind === value}");
    expect(route).toContain("eq(quests.userId, userId)");
    expect(route).toContain("eq(documents.userId, userId)");
    expect(route).toContain("eq(contacts.userId, userId)");
    expect(route).not.toContain('app.post("/api/search"');
  });

  it("runs inside isolated CI and the protected production chain with retained reports", () => {
    expect(packageJson).toContain('"acceptance:production-search": "tsx scripts/production-search-browser-acceptance.ts"');
    expect(packageJson).toContain('"acceptance:search": "tsx scripts/production-search-browser-acceptance.ts"');
    expect(workflow).toContain("Run disposable production Search acceptance");
    expect(workflow).toContain("LYFEOS_SEARCH_OUTPUT_DIR");
    expect(workflow).toContain("run: npm run acceptance:production-search");
    expect(verifyWorkflow).toContain("LYFEOS_SEARCH_ACCEPTANCE_MODE=isolated npm run acceptance:search");
    expect(verifyWorkflow).toContain("Upload isolated Search evidence");
  });
});
