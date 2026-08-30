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
    expect(acceptance).toContain('contract: "lyfeos.production-sheets-browser.v11"');
    expect(acceptance).toContain('BASE_URL.origin === "https://lyfeos.net"');
    expect(acceptance).toContain("release.body?.sourceRevision === SOURCE");
    expect(acceptance).toContain("HARNESS_SOURCE");
  });

  it("qualifies desktop/mobile calculations, local transfer, concurrency, history, isolation and cleanup", () => {
    expect(acceptance).toContain('name: "desktop-1440x900"');
    expect(acceptance).toContain('name: "mobile-390x844"');
    expect(acceptance).toContain("formulasCalculated");
    expect(acceptance).toContain("extendedFormulaCompatibility");
    expect(acceptance).toContain("absoluteReferencesReconciled");
    expect(acceptance).toContain('$A$1 stays text');
    expect(acceptance).toContain("crossSheetReferencesReconciled");
    expect(acceptance).toContain("='Reality'!$A$3+B2");
    expect(acceptance).toContain('=IF(A1<A2,ROUND(A2/A1,1),1/0)');
    expect(acceptance).toContain("COUNT, COUNTA, ROUND, ABS and lazy IF behavior");
    expect(acceptance).toContain("controlledClipboardAdapterRoundTrip");
    expect(acceptance).toContain("chartFamiliesRenderedFromCanonicalRanges");
    expect(acceptance).toContain("dualAxisCombinationReconciled");
    expect(acceptance).toContain("explicitSeriesRolesReconciled");
    expect(acceptance).toContain("chartDefinitionsPersisted");
    expect(acceptance).toContain("chartFamiliesReloadedAndRestored");
    expect(acceptance).toContain('["line", "bar", "stacked_bar", "area", "combo", "pie", "scatter"]');
    expect(acceptance).toContain("explicit per-series bar/line assignment");
    expect(acceptance).toContain("shared-versus-dual combination-axis choice");
    expect(acceptance).toContain("Dual axes can exaggerate visual relationships");
    expect(acceptance).toContain("complete numeric pairs");
    expect(acceptance).toContain("Missing values are never converted to zero");
    expect(acceptance).toContain("localImportReviewedAndPersisted");
    expect(acceptance).toContain("xlsxWorkbookReviewedAndPersisted");
    expect(acceptance).toContain("xlsxWorkbookExportGenerated");
    expect(acceptance).toContain("odsWorkbookReviewedAndPersisted");
    expect(acceptance).toContain("odsWorkbookExportGenerated");
    expect(acceptance).toContain("&apos;Sheet 1 (2)&apos;!B2");
    expect(acceptance).toContain("&apos;Sheet 1 (3)&apos;.B2");
    expect(acceptance).toContain("Detected but omitted: hidden sheet state");
    expect(acceptance).toContain("collision-safe cross-tab formula rewriting");
    expect(acceptance).toContain("staleSaveStoppedAsConflict");
    expect(acceptance).toContain("largeGridWindowed");
    expect(acceptance).toContain("restoreCreatedNewImmutableRevision");
    expect(acceptance).toContain("crossOwnerIsolationReconciled");
    expect(acceptance).toContain("otherAccountErased");
    expect(acceptance).toContain("registerDisposableAccount");
    expect(acceptance).toContain('response.headers.get("retry-after")');
    expect(acceptance).toContain("Object.assign(account");
    expect(acceptance).toContain("human assistive-technology comprehension");
    expect(acceptance).toContain("OS-native file-picker or download behavior");
    expect(acceptance).toContain("quoted-name cross-sheet references");
    expect(editor).toContain('aria-label="Rename active sheet"');
  });

  it("uses stable nonvisual hooks and protected evidence custody", () => {
    expect(catalog).toContain('data-testid="sheets-page"');
    expect(catalog).toContain('data-testid="sheets-new"');
    expect(catalog).toContain("sheet-card-${sheet.id}");
    expect(editor).toContain('data-testid="sheet-editor"');
    expect(editor).toContain('data-testid="sheet-grid"');
    expect(editor).toContain('data-testid="sheet-history"');
    expect(editor).toContain('data-testid="sheet-export-xlsx"');
    expect(editor).toContain('data-testid="sheet-export-ods"');
    expect(packageJson).toContain('"acceptance:production-sheets"');
    expect(workflow).toContain("npm run acceptance:production-sheets");
    expect(workflow).toContain("LYFEOS_SHEETS_OUTPUT_DIR");
  });
});
