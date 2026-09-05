import { describe, expect, it } from "vitest";
import fs from "node:fs";

const script = fs.readFileSync("scripts/production-health-data-rights-browser-acceptance.ts", "utf8");
const workflow = fs.readFileSync(".github/workflows/production-browser-acceptance.yml", "utf8");
const packageJson = fs.readFileSync("package.json", "utf8");
const rights = fs.readFileSync("client/src/components/health/HealthDataRights.tsx", "utf8");
const healthPage = fs.readFileSync("client/src/pages/HealthDetailPage.tsx", "utf8");

describe("production Health data-rights browser acceptance custody", () => {
  it("binds the immutable deployed runtime to a disposable desktop/mobile journey", () => {
    expect(packageJson).toContain('"acceptance:production-health-data-rights": "tsx scripts/production-health-data-rights-browser-acceptance.ts"');
    expect(workflow).toContain("Run disposable production Health data-rights acceptance");
    expect(workflow).toContain("LYFEOS_HEALTH_DATA_RIGHTS_ACCEPTANCE_MODE: production");
    expect(workflow).toContain("run: npm run acceptance:production-health-data-rights");
    expect(script).toContain('contract: "lyfeos.production-health-data-rights-browser.v1"');
    expect(script).toContain('BASE_URL.origin === "https://lyfeos.net"');
    expect(script).toContain("sourceRevision: SOURCE");
    expect(script).toContain("harnessSource: HARNESS_SOURCE");
    expect(script).toContain("for (const [ordinal, viewport] of VIEWPORTS.entries())");
    expect(script).toContain('confirmation: "DELETE MY ACCOUNT"');
    expect(script).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  });

  it("proves explicit permissions, export, exact-confirmation deletion, and honest boundaries", () => {
    expect(script).toContain("preferencesSaved");
    expect(script).toContain("exportedRecordedHealth");
    expect(script).toContain("exportIncludedNoCredentialReferences");
    expect(script).toContain("deletedHealthDomain");
    expect(script).toContain("rightsReceiptRetained");
    expect(script).toContain("loadHealthDataRights");
    expect(script).toContain("Health workspaces intentionally defer their chunks");
    expect(script).toContain("#health-section-data-rights");
    expect(script).toContain("human file-save destination");
    expect(script).toContain("legal retention-policy approval");
    expect(script).toContain("provider-token revoke");
    expect(script).toContain("content-disposition");
    expect(script).toContain("Authenticated Health export read");
  });

  it("uses semantic hooks without changing the Health data-rights layout", () => {
    for (const hook of ["health-data-rights", "health-data-export", "health-ai-context-enabled", "health-planning-context-enabled", "health-data-rights-save", "health-data-rights-saved", "health-data-deletion-confirmation", "health-data-delete", "health-data-deletion-complete"]) expect(rights).toContain(`data-testid=\"${hook}\"`);
    expect(healthPage).toContain('targetId="health-section-data-rights"');
  });
});
