import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("production Tables and Forms evidence custody", () => {
  const acceptance = source("scripts/production-tables-forms-browser-acceptance.ts");
  const workflow = source(".github/workflows/production-browser-acceptance.yml");
  const packageJson = source("package.json");
  const catalog = source("client/src/pages/TablesPage.tsx");
  const editor = source("client/src/pages/TableEditorPage.tsx");

  it("binds the production-only contract to immutable runtime and harness sources", () => {
    expect(acceptance).toContain('contract: "lyfeos.production-tables-forms-browser.v1"');
    expect(acceptance).toContain('BASE_URL.origin === "https://lyfeos.net"');
    expect(acceptance).toContain("release.body?.sourceRevision === SOURCE");
    expect(acceptance).toContain("HARNESS_SOURCE");
  });

  it("qualifies desktop and mobile owner, form, grant, isolation, deletion and cleanup boundaries", () => {
    expect(acceptance).toContain('name: "desktop-1440x900"');
    expect(acceptance).toContain('name: "mobile-390x844"');
    expect(acceptance).toContain("immutableHistoryReconciled");
    expect(acceptance).toContain("anonymousBrowserSubmissionReconciled");
    expect(acceptance).toContain("crossOwnerIsolationReconciled");
    expect(acceptance).toContain("revokedTokenRejected");
    expect(acceptance).toContain("deletionReconciled");
    expect(acceptance).toContain("otherAccountErased");
    expect(acceptance).toContain("registerDisposableAccount");
    expect(acceptance).toContain('response.headers.get("retry-after")');
    expect(acceptance).toContain("Object.assign(account");
    expect(acceptance).toContain('source === new URL("/api/auth/me", BASE_URL).toString()');
    expect(acceptance).toContain("acknowledgeReconciledBodylessMutation");
    expect(acceptance).toContain("human assistive-technology comprehension");

    const revocationProof = acceptance.indexOf('candidate.id === grant.id && candidate.revokedAt');
    const tokenProof = acceptance.indexOf('assert(revokedTokenRejected');
    const navigationProof = acceptance.indexOf("await page.waitForSelector('[data-testid=\"table-editor\"]'", tokenProof);
    const revocationAcknowledgement = acceptance.indexOf('acknowledgeReconciledBodylessMutation(signals, "POST", `/api/forms/${formId}/access-grants/${grant.id}/revoke`)');
    const signalAssertion = acceptance.indexOf('assert(Object.values(signals).every((items) => items.length === 0), `${viewport.name} private Table/Form journey');
    expect(revocationProof).toBeGreaterThan(-1);
    expect(tokenProof).toBeGreaterThan(revocationProof);
    expect(navigationProof).toBeGreaterThan(tokenProof);
    expect(revocationAcknowledgement).toBeGreaterThan(navigationProof);
    expect(signalAssertion).toBeGreaterThan(revocationAcknowledgement);
  });

  it("keeps stable hooks nonvisual and runs the contract in protected production acceptance", () => {
    expect(catalog).toContain('data-testid="tables-page"');
    expect(catalog).toContain('data-testid="tables-create"');
    expect(catalog).toContain("table-card-${table.id}");
    expect(editor).toContain('data-testid="table-editor"');
    expect(editor).toContain('data-testid="table-title"');
    expect(packageJson).toContain('"acceptance:production-tables-forms"');
    expect(workflow).toContain("npm run acceptance:production-tables-forms");
    expect(workflow).toContain("LYFEOS_TABLES_FORMS_OUTPUT_DIR");
  });
});
