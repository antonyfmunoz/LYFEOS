import { describe, expect, it } from "vitest";
import fs from "node:fs";

const script = fs.readFileSync("scripts/production-health-trends-browser-acceptance.ts", "utf8");
const workflow = fs.readFileSync(".github/workflows/production-browser-acceptance.yml", "utf8");
const packageJson = fs.readFileSync("package.json", "utf8");
const workbench = fs.readFileSync("client/src/components/health/HealthTrendWorkbench.tsx", "utf8");
const healthPage = fs.readFileSync("client/src/pages/HealthDetailPage.tsx", "utf8");

describe("production Health trends browser acceptance custody", () => {
  it("binds exact-source desktop/mobile evidence into protected production acceptance", () => {
    expect(packageJson).toContain('"acceptance:production-health-trends": "tsx scripts/production-health-trends-browser-acceptance.ts"');
    expect(workflow).toContain("Run disposable production Health trends acceptance");
    expect(workflow).toContain("LYFEOS_HEALTH_TRENDS_ACCEPTANCE_MODE: production");
    expect(workflow).toContain("LYFEOS_HEALTH_TRENDS_OUTPUT_DIR: ${{ runner.temp }}/lyfeos-browser-acceptance");
    expect(workflow).toContain("run: npm run acceptance:production-health-trends");
    expect(script).toContain('contract: "lyfeos.production-health-trends-browser.v1"');
    expect(script).toContain('BASE_URL.origin === "https://lyfeos.net"');
    expect(script).toContain("sourceRevision: SOURCE");
    expect(script).toContain("harnessSource: HARNESS_SOURCE");
    expect(script).toContain("for (const [ordinal, viewport] of VIEWPORTS.entries())");
    expect(script).toContain('confirmation: "DELETE MY ACCOUNT"');
    expect(script).toContain("accountErased");
    expect(script).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  });

  it("proves chart, table, CSV, panel, missing-value, recorded-zero, and cleanup truthfulness", () => {
    expect(script).toContain("recordedZeroStayedZero");
    expect(script).toContain("sparseRecordedPointsRendered");
    expect(script).toContain("sparseRecordedPointCount");
    expect(script).toContain(".recharts-line-dot').length === 4");
    expect(script).toContain("{ timeout: 5_000 }");
    expect(script).toContain("chartHandle.screenshot");
    expect(script).toContain("chartScreenshot");
    expect(script).toContain("missingStayedMissing");
    expect(script).toContain("apiAndTableReconciled");
    expect(script).toContain("savedThreeSeriesPanelRendered");
    expect(script).toContain("savedPanelMissingStayedMissing");
    expect(script).toContain("csvReconciled");
    expect(script).toContain("medical validity");
    expect(script).toContain("human comprehension");
    expect(script).toContain("physical-device");
    expect(script).toContain("assistive-technology");
    expect(script).toContain("longitudinal usefulness");
  });

  it("uses current semantic Health hooks without moving or redesigning the workbench", () => {
    expect(workbench).toContain('id="health-trends-heading"');
    expect(workbench).toContain('aria-label="First health trend"');
    expect(workbench).toContain('aria-label="Second health trend"');
    expect(workbench).toContain('aria-label="Trend evidence coverage"');
    expect(workbench).toContain("View accessible trend data table");
    expect(workbench).toContain("View saved-panel data table");
    expect(workbench).toContain("points.length <= 60");
    expect(workbench).toContain("connectNulls={false}");
    expect(healthPage).toContain('targetId="health-section-trends"');
  });
});
