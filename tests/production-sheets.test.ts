import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("production Sheets evidence custody", () => {
  const acceptance = source("scripts/production-sheets-browser-acceptance.ts");
  const workflow = source(".github/workflows/production-browser-acceptance.yml");
  const packageJson = source("package.json");
  const catalog = source("client/src/pages/SpreadsheetsPage.tsx");
  const editor = source("client/src/pages/SpreadsheetEditorPage.tsx");

  it("binds the production-only contract to immutable runtime and harness sources", () => {
    expect(acceptance).toContain('contract: "lyfeos.production-sheets-browser.v1"');
    expect(acceptance).toContain('BASE_URL.origin === "https://lyfeos.net"');
    expect(acceptance).toContain("release.body?.sourceRevision === SOURCE");
    expect(acceptance).toContain("HARNESS_SOURCE");
  });

  it("qualifies desktop/mobile calculations, local transfer, concurrency, history, isolation and cleanup", () => {
    expect(acceptance).toContain('name: "desktop-1440x900"');
    expect(acceptance).toContain('name: "mobile-390x844"');
    expect(acceptance).toContain("formulasCalculated");
    expect(acceptance).toContain("clipboardRoundTripReconciled");
    expect(acceptance).toContain("localImportReviewedAndPersisted");
    expect(acceptance).toContain("staleSaveStoppedAsConflict");
    expect(acceptance).toContain("largeGridWindowed");
    expect(acceptance).toContain("restoreCreatedNewImmutableRevision");
    expect(acceptance).toContain("crossOwnerIsolationReconciled");
    expect(acceptance).toContain("otherAccountErased");
    expect(acceptance).toContain("human assistive-technology comprehension");
  });

  it("uses stable nonvisual hooks and protected evidence custody", () => {
    expect(catalog).toContain('data-testid="sheets-page"');
    expect(catalog).toContain('data-testid="sheets-new"');
    expect(catalog).toContain("sheet-card-${sheet.id}");
    expect(editor).toContain('data-testid="sheet-editor"');
    expect(editor).toContain('data-testid="sheet-grid"');
    expect(editor).toContain('data-testid="sheet-history"');
    expect(packageJson).toContain('"acceptance:production-sheets"');
    expect(workflow).toContain("npm run acceptance:production-sheets");
    expect(workflow).toContain("LYFEOS_SHEETS_OUTPUT_DIR");
  });
});
